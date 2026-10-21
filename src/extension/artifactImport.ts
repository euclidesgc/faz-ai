import * as fs from 'node:fs';
import * as path from 'node:path';
import { ARTIFACT_LIMITS, isSafeRelPath, type ArtifactDraft, type ArtifactKind } from '../shared/artifacts';
import { importUsage, type ImportCandidate, type ImportPreview, type ImportSource, type OnConflict } from '../shared/artifactImport';
import { isAiBase, SKILL_NAME_PATTERN, type AiTool } from '../shared/harness';
import { selectionKey, type HarnessUsage } from '../shared/harnessSelection';
import { isSafeSegment } from './attachments';
import { readSource } from './artifactSource';
import { parseExportFile } from './db/boardExport';
import { FLOW_SKILLS } from './flowSkill';
import { scanInventory } from './harnessScan';
import { scanLibraryFolder } from './libraryImport';
import type { BoardContext } from './panel/handlers/context';
import { fetchSource, findSkills, parseSource, runGit, type GitRunner } from './skillInstall';

const KINDS: readonly string[] = ['rule', 'skill', 'agent', 'mcp'];
const TOOL_KINDS = ['instructions', 'skill', 'agent', 'mcp'] as const;
const RESERVED_MCP = 'faz-ai';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const parseJson = (text: unknown): unknown => {
  try {
    return JSON.parse(str(text));
  } catch {
    return undefined;
  }
};

/** Por que o item não pode entrar no board; undefined quando está tudo certo. */
function problemOf(d: ArtifactDraft): string | undefined {
  const { kind, name } = d;
  if (d.missing) {
    return d.skipped.some((s) => s.reason === 'size') ? 'Arquivo maior que 512 KB.' : 'Não foi possível ler o conteúdo.';
  }
  if (!name || name.length > 240 || name === '.' || name === '..') return 'Nome inválido.';
  if (kind === 'skill' && !SKILL_NAME_PATTERN.test(name)) return 'Nome de skill inválido: use letras minúsculas, números e hífens.';
  if (kind === 'agent' && !isSafeSegment(name)) return 'Nome de agente inválido.';
  if (kind === 'rule' && !/^[A-Za-z0-9_.-]+$/.test(name)) return 'Nome de regra inválido: use letras, números, ponto, hífen e sublinhado.';
  if (kind === 'mcp' && name === RESERVED_MCP) return 'O nome faz-ai é reservado ao servidor MCP do board.';
  if (Buffer.byteLength(d.body, 'utf8') > ARTIFACT_LIMITS.fileBytes) return 'Arquivo maior que 512 KB.';
  if (d.files.length > ARTIFACT_LIMITS.files) return 'Arquivos de apoio demais (limite de 100).';
  if (d.files.some((f) => !isSafeRelPath(f.path) || f.size > ARTIFACT_LIMITS.fileBytes))
    return 'Arquivo de apoio inválido ou acima de 512 KB.';
  if (d.files.reduce((n, f) => n + f.size, Buffer.byteLength(d.body, 'utf8')) > ARTIFACT_LIMITS.totalBytes) return 'Skill acima de 5 MB.';
  return undefined;
}

interface Entry {
  draft: ArtifactDraft;
  /** configuração de servidor que o export não traz: não substitui um servidor que já existe */
  needsLocalConfig?: boolean;
}

/**
 * Importar copia artefatos para o banco do board a partir de uma pasta, de um repositório git, de uma
 * ferramenta instalada ou de um arquivo exportado. Só lê as origens: nada é gravado nas pastas das
 * ferramentas, nada da origem é executado e servidor MCP importado fica pendente de revisão (nunca é
 * ativado nem iniciado aqui).
 */
export class ArtifactImporter {
  private entries = new Map<string, Entry>();
  private preview: ImportPreview | null = null;
  private cleanup: (() => void) | null = null;
  private readonly git: GitRunner;
  private readonly refresh: () => void;

  constructor(
    private ctx: BoardContext,
    deps: {
      git?: GitRunner;
      /** atualiza a cópia de leitura depois de gravar; o padrão é a da biblioteca do board */ refresh?: () => void;
    } = {},
  ) {
    this.git = deps.git ?? runGit;
    this.refresh = deps.refresh ?? (() => void this.ctx.library.materialize());
  }

  private get dirs() {
    return { projectDir: this.ctx.opts.workspaceDir ?? '', homeDir: this.ctx.home };
  }

  /** Prévia da origem. Uma prévia anterior é descartada e o clone temporário dela, apagado. */
  async scan(source: ImportSource): Promise<ImportPreview> {
    this.cancel();
    try {
      const { label, drafts } = await this.read(source);
      if (!drafts.length) throw new Error('Nenhum artefato encontrado.');
      const seen = new Set<string>();
      const candidates: ImportCandidate[] = [];
      for (const entry of drafts) {
        const d = entry.draft;
        let key = `${d.kind}:${d.origin || d.name}`;
        while (seen.has(key)) key += '+';
        seen.add(key);
        this.entries.set(key, entry);
        // servidor sem configuração vem `missing` de propósito: entra para ser configurado, não é erro de leitura
        const problem = problemOf(entry.needsLocalConfig ? { ...d, missing: false } : d);
        candidates.push({
          key,
          kind: d.kind,
          name: d.name,
          description: d.description,
          origin: d.origin,
          exists: !!this.ctx.library.repo.get(this.ctx.boardId, d.kind, d.name),
          ...(d.kind === 'skill' ? { files: d.files.length } : {}),
          ...(problem ? { problem } : {}),
        });
      }
      this.preview = { source, label, candidates };
      return this.preview;
    } catch (e) {
      this.cancel();
      throw e;
    }
  }

  /** Copia os escolhidos. Repetido: `replace` mantém o modo atual, `skip` não toca nele. */
  apply(keys: string[], onConflict: OnConflict): { imported: string[]; skipped: string[]; problems: string[]; mcpSecrets: string[] } {
    if (!this.preview) throw new Error('Leia a origem antes de importar.');
    const imported: string[] = [];
    const skipped: string[] = [];
    const problems: string[] = [];
    const mcpSecrets: string[] = [];
    const items: { key: string; draft: ArtifactDraft; usage?: HarnessUsage }[] = [];
    const chosen = new Set<string>();
    const byCandidate = new Map(this.preview.candidates.map((c) => [c.key, c]));
    for (const key of new Set(keys)) {
      const candidate = byCandidate.get(key);
      const entry = this.entries.get(key);
      if (!candidate || !entry) {
        problems.push(`Item não encontrado na prévia: ${key}`);
        continue;
      }
      const d = entry.draft;
      if (candidate.problem) {
        problems.push(`${d.name}: ${candidate.problem}`);
        continue;
      }
      const identity = `${d.kind}:${d.name}`;
      const existing = this.ctx.library.repo.get(this.ctx.boardId, d.kind, d.name);
      if (chosen.has(identity) || (existing && onConflict === 'skip')) {
        skipped.push(key);
        continue;
      }
      if (existing && entry.needsLocalConfig) {
        problems.push(`${d.name}: o export não traz a configuração do servidor; o servidor que já está no board foi mantido.`);
        skipped.push(key);
        continue;
      }
      chosen.add(identity);
      items.push({ key, draft: d, ...(existing ? {} : { usage: importUsage(d.kind) }) });
    }
    try {
      this.ctx.library.repo.upsertMany(
        this.ctx.boardId,
        items.map(({ draft, usage }) => ({ draft, ...(usage ? { usage } : {}) })),
      );
      for (const i of items) {
        imported.push(i.key);
        if (i.draft.kind === 'mcp') mcpSecrets.push(`${i.draft.name}: revisão da configuração local`);
      }
    } catch (e) {
      problems.push(`Não foi possível gravar no board: ${errText(e)}`);
    }
    try {
      this.refresh();
    } catch (e) {
      problems.push(`Cópia de leitura: ${errText(e)}`);
    }
    this.cancel();
    return { imported, skipped, problems, mcpSecrets };
  }

  /** Descarta a prévia e apaga o clone temporário. */
  cancel(): void {
    this.entries = new Map();
    this.preview = null;
    this.cleanup?.();
    this.cleanup = null;
  }

  private async read(source: ImportSource): Promise<{ label: string; drafts: Entry[] }> {
    if (source.from === 'tool') return { label: source.tool, drafts: this.fromTool(source.tool) };
    if (source.from === 'export') return { label: path.basename(source.path), drafts: this.fromExport(source.path) };
    return this.fromFolder(source);
  }

  private subdirOf(root: string, subdir?: string): string {
    const rel = (subdir ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!rel) return root;
    if (!isSafeRelPath(rel)) throw new Error('Subpasta inválida.');
    const dir = path.join(root, ...rel.split('/'));
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Subpasta não encontrada: ${rel}`);
    // um link simbólico na origem não leva a leitura para fora dela
    if (!fs.realpathSync(dir).startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Subpasta inválida.');
    return dir;
  }

  private async fromFolder(source: Extract<ImportSource, { from: 'folder' }>): Promise<{ label: string; drafts: Entry[] }> {
    const parsed = parseSource(source.path, this.ctx.home);
    if (parsed.kind === 'dir') {
      const root = this.subdirOf(parsed.dir, source.subdir);
      return { label: source.path.trim(), drafts: scanLibraryFolder(root).map((draft) => ({ draft })) };
    }
    const fetched = await fetchSource(parsed, this.git);
    this.cleanup = fetched.cleanup;
    const root = this.subdirOf(fetched.dir, source.subdir);
    const sub = (source.subdir ?? '').trim().replace(/^\/+|\/+$/g, '');
    const drafts: Entry[] = [];
    for (const skill of findSkills(root)) {
      const file = path.join(skill.rel === '.' ? root : path.join(root, ...skill.rel.split('/')), 'SKILL.md');
      // SKILL.md que é link simbólico apontaria para um arquivo fora do repositório
      if (fs.lstatSync(file).isSymbolicLink()) continue;
      const draft = readSource({ kind: 'skill', location: file }, { projectDir: root, homeDir: '' }, '', false);
      const where = [sub, skill.rel === '.' ? skill.name : skill.rel].filter(Boolean).join('/');
      drafts.push({ draft: { ...draft, origin: `${parsed.url}#${where}` } });
    }
    return { label: parsed.url, drafts };
  }

  private fromTool(tool: AiTool): Entry[] {
    if (!isAiBase(tool)) throw new Error('Ferramenta não reconhecida.');
    const flow = new Set(FLOW_SKILLS.map((k) => k.name));
    const out: Entry[] = [];
    for (const item of scanInventory(tool, this.dirs.projectDir, this.dirs.homeDir)) {
      if (!(TOOL_KINDS as readonly string[]).includes(item.kind)) continue;
      const draft = readSource({ kind: item.kind, location: selectionKey(item) }, this.dirs, tool, false);
      if (draft.kind === 'rule') draft.name = path.basename(item.path);
      // o servidor e a skill do fluxo são da própria extensão
      if ((draft.kind === 'skill' && flow.has(draft.name)) || (draft.kind === 'mcp' && draft.name === RESERVED_MCP)) continue;
      out.push({ draft });
    }
    return out;
  }

  private fromExport(file: string): Entry[] {
    if (!path.isAbsolute(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Arquivo não encontrado: ${file}`);
    const parsed = parseExportFile(fs.readFileSync(file, 'utf8'));
    const name = path.basename(file);
    const filesOf = new Map<string, ArtifactDraft['files']>();
    for (const f of parsed.tables.board_artifact_files ?? []) {
      const list = filesOf.get(str(f.artifact_id)) ?? [];
      list.push({
        path: str(f.path),
        content: str(f.content),
        encoding: f.encoding === 'base64' ? 'base64' : 'utf8',
        size: Number(f.size) || 0,
      });
      filesOf.set(str(f.artifact_id), list);
    }
    const out: Entry[] = [];
    for (const r of parsed.tables.board_artifacts ?? []) {
      const kind = str(r.kind);
      if (!KINDS.includes(kind)) continue;
      const rowName = str(r.name);
      let meta = obj(parseJson(r.meta_json)) as ArtifactDraft['meta'];
      let needsLocalConfig = false;
      if (kind === 'mcp') {
        // o export só leva a referência à credencial local da máquina de origem: não vale aqui
        const server = obj(obj(meta).server);
        if (typeof server.secretRef === 'string') {
          needsLocalConfig = true;
          meta = { server: {}, transport: obj(meta).transport as 'stdio' | 'http' | 'sse' | '' };
        }
      }
      const tool = str(r.origin_tool);
      const skipped = parseJson(r.skipped_json);
      out.push({
        needsLocalConfig,
        draft: {
          kind: kind as ArtifactKind,
          name: rowName,
          description: str(r.description),
          body: str(r.body),
          meta,
          origin: `${name}#${rowName}`,
          originTool: isAiBase(tool) ? (tool as AiTool) : '',
          // servidor sem configuração fica fora das execuções até a pessoa preencher
          missing: Number(r.missing) === 1 || needsLocalConfig,
          skipped: Array.isArray(skipped) ? (skipped as ArtifactDraft['skipped']) : [],
          files: filesOf.get(str(r.id)) ?? [],
        },
      });
    }
    return out;
  }
}
