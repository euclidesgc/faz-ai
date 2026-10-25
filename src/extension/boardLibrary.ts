import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { frontmatterOf, frontmatterValue } from './frontmatter';
import { scanLibraryFolder } from './libraryImport';
import type { ArtifactKind, LibraryArtifactInput, LibraryImportPreview } from '../shared/artifacts';
import { LibraryDisk } from './libraryDisk';
import { ArtifactMirror } from './artifactMirror';
import { agentInputOf, parseAgentFile, readSource, mcpServerNames } from './artifactSource';
import { TOOL_ADAPTERS } from './toolAdapters';
import type { ToolAdapter } from './toolAdapters/types';
import { ArtifactRepo, type ArtifactRow } from './repositories/artifactRepo';
import {
  agentOfArtifact,
  kindOfSelectable,
  skillDocument,
  toolCategories,
  isSafeRelPath,
  ARTIFACT_LIMITS,
  type AgentMeta,
  type ArtifactDraft,
  type BoardArtifact,
} from '../shared/artifacts';
import { type HarnessUsage, type SelectableKind } from '../shared/harnessSelection';
import { baseInfo, SKILL_NAME_PATTERN, type AiTool, type Harness } from '../shared/harness';
import { MCP_NAME_PATTERN, type McpServerInput } from '../shared/harnessCatalog';
import { RULE_NAME_PATTERN, createUsage } from '../shared/artifactImport';
import type { AgentInput, McpServerView } from '../shared/messages';
import type { BoardContext } from './panel/handlers/context';

/** Como achar a dependência (skill ou servidor MCP) de um agente copiado: pelo nome, na ferramenta dele. */
interface DependencyResolver {
  mcp(name: string, tool: string): ArtifactDraft | null;
  skill(name: string, tool: string): ArtifactDraft | null;
}

/** Biblioteca do board: as fontes são lidas só na importação ou numa atualização explícita. */
export class BoardLibrary {
  readonly repo: ArtifactRepo;
  warnings: NonNullable<NonNullable<Harness['library']>['warnings']> = [];

  constructor(private ctx: BoardContext) {
    this.repo = new ArtifactRepo(ctx.dbHandle.db);
  }

  private importDrafts = new Map<string, ArtifactDraft>();
  preview?: LibraryImportPreview;

  scanFolder(root: string): void {
    const dir = path.resolve(root.startsWith('~/') ? path.join(this.ctx.home, root.slice(2)) : root);
    const drafts = scanLibraryFolder(dir);
    this.importResult = undefined;
    this.importDrafts = new Map(drafts.map((draft) => [randomUUID(), draft]));
    this.preview = {
      directory: dir,
      items: [...this.importDrafts].map(([key, a]) => ({ key, kind: a.kind, name: a.name, description: a.description, origin: a.origin })),
    };
  }

  importResult?: import('../shared/artifacts').LibraryImportResult;

  importArtifacts(keys: string[], overwrite = false): void {
    if (!this.preview || !keys.length) throw new Error('Selecione os artefatos para importar.');
    const allowed = new Set(this.importResult?.skipped.map((i) => i.key));
    const drafts = [...new Set(keys)].map((key) => {
      const draft = this.importDrafts.get(key);
      if (!draft || (overwrite && !allowed.has(key))) throw new Error('Releia a pasta antes de importar.');
      return { key, draft };
    });
    const seen = new Set<string>();
    const skipped: NonNullable<BoardLibrary['importResult']>['skipped'] = [];
    const items: { draft: ArtifactDraft; usage: HarnessUsage }[] = [];
    for (const { key, draft } of drafts) {
      const identity = `${draft.kind}:${draft.name}`;
      const existing = this.repo.get(this.ctx.boardId, draft.kind, draft.name);
      if (seen.has(identity) || (existing && !overwrite)) {
        skipped.push({ key, kind: draft.kind, name: draft.name });
        continue;
      }
      seen.add(identity);
      items.push({ draft, usage: existing?.usage ?? (draft.kind === 'rule' ? 'off' : 'contextual') });
    }
    this.repo.upsertMany(this.ctx.boardId, items);
    this.importResult = { imported: items.length, skipped };
    const pending = new Set(skipped.map((i) => i.key));
    this.importDrafts = new Map([...this.importDrafts].filter(([key]) => pending.has(key)));
    this.preview = skipped.length ? { ...this.preview, items: this.preview.items.filter((i) => pending.has(i.key)) } : undefined;
  }

  readArtifact(id: string): LibraryArtifactInput {
    const item = this.repo.list(this.ctx.boardId).find((a) => a.id === id);
    if (!item) throw new Error('Artefato não encontrado.');
    const row = this.repo.get(this.ctx.boardId, item.kind, item.name)!;
    return {
      id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      body: row.body,
      ...(row.agent ? { agent: row.agent } : {}),
      ...(row.kind === 'mcp' ? { mcpCredential: row.mcpCredential } : {}),
    };
  }

  saveArtifact(input: LibraryArtifactInput): void {
    if (!['rule', 'skill', 'agent', 'mcp'].includes(input.kind)) throw new Error('Tipo de artefato inválido.');
    const name = input.name.trim();
    if (!name || name === '.' || name === '..' || name.length > 240) throw new Error('Nome de artefato inválido.');
    const existing = this.repo.get(this.ctx.boardId, input.kind, name);
    if (!existing && !(input.kind === 'rule' ? /^[a-zA-Z0-9_.-]+$/.test(name) : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)))
      throw new Error('Nome inválido. Use letras minúsculas, números e hífens.');
    if (name === 'faz-ai' && input.kind === 'mcp') throw new Error('O nome faz-ai é reservado ao MCP do board.');
    if (existing && existing.id !== input.id)
      throw new Error('Já existe um artefato com este nome. Edite o existente ou escolha outro nome.');
    if (input.id && existing?.id !== input.id) throw new Error('O nome e o tipo de um artefato existente não podem mudar.');
    if (Buffer.byteLength(input.body, 'utf8') > ARTIFACT_LIMITS.fileBytes) throw new Error('Arquivo maior que 512 KB.');
    let meta: ArtifactDraft['meta'] = {};
    if (input.kind === 'mcp') {
      const server = input.server ?? (existing?.meta as { server?: Record<string, unknown> } | undefined)?.server;
      if (!server || typeof server !== 'object' || Array.isArray(server)) throw new Error('Definição MCP inválida.');
      if (input.server?.secretRef !== undefined) throw new Error('Referências salvas não podem ser substituídas pelo editor.');
      if (!input.server && existing) meta = existing.meta;
      else if (typeof server.command === 'string' && server.command.trim()) {
        if (server.args !== undefined && (!Array.isArray(server.args) || !server.args.every((a) => typeof a === 'string')))
          throw new Error('args deve ser uma lista de textos.');
      } else if (typeof server.url === 'string' && /^https?:\/\//.test(server.url)) {
        new URL(server.url);
      } else throw new Error('Informe command e args ou uma URL HTTP do servidor MCP.');
      for (const key of ['env', 'headers']) {
        const values = server[key];
        if (
          values !== undefined &&
          (!values || typeof values !== 'object' || Array.isArray(values) || !Object.values(values).every((v) => typeof v === 'string'))
        )
          throw new Error(`${key} deve conter pares de nome e texto.`);
      }
      if (input.server) meta = { server };
    } else if (input.kind === 'agent') {
      const agent = input.agent;
      if (
        agent &&
        (![agent.skills, agent.mcpServers, agent.tools?.categories, agent.tools?.native?.allow, agent.tools?.native?.deny].every(
          (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
        ) ||
          typeof agent.model !== 'string' ||
          !agent.tools.categories.every((c) => ['read', 'edit', 'run', 'net', 'agents'].includes(c)))
      )
        throw new Error('Configuração de subagente inválida.');
      meta = input.agent ?? { skills: [], mcpServers: [], model: '', tools: { categories: [], native: { tool: '', allow: [], deny: [] } } };
    }
    const body = input.kind === 'skill' ? skillDocument(input.body, name, input.description) : input.body;
    if (Buffer.byteLength(body, 'utf8') > ARTIFACT_LIMITS.fileBytes) throw new Error('Arquivo maior que 512 KB.');
    this.repo.upsert(
      this.ctx.boardId,
      {
        kind: input.kind,
        name,
        description: input.description,
        body,
        meta,
        origin: existing?.origin ?? '',
        originTool: existing?.originTool ?? '',
        missing: false,
        skipped: existing?.skipped ?? [],
        files: existing ? this.repo.content(existing.id).files : [],
      },
      existing?.usage,
      input.kind === 'mcp' && input.server !== undefined,
    );
  }

  get directory(): string {
    return (
      this.ctx.boards.getMeta(`harness.library.${this.ctx.opts.workspaceKey}`) ||
      this.ctx.opts.libraryDir ||
      (this.ctx.home
        ? path.join(this.ctx.home, 'faz-ai-library', this.ctx.opts.workspaceKey)
        : path.join(this.ctx.opts.attachmentsDir, 'artifacts', this.ctx.opts.workspaceKey))
    );
  }

  private get dirs() {
    return { projectDir: this.ctx.opts.workspaceDir ?? '', homeDir: this.ctx.home };
  }

  /** A pasta é exclusiva desta biblioteca: nunca varre nem limpa uma pasta de arquivos da pessoa. */
  private prepare(dir: string): void {
    const marker = path.join(dir, '.faz-ai-library');
    if (fs.existsSync(dir)) {
      if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('A pasta da biblioteca não pode ser um link simbólico.');
      const entries = fs.readdirSync(dir);
      if (
        entries.length &&
        (!fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink() || fs.readFileSync(marker, 'utf8') !== this.ctx.opts.workspaceKey)
      )
        throw new Error('Escolha uma pasta vazia ou a pasta desta biblioteca do board.');
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(marker, this.ctx.opts.workspaceKey);
  }

  materialize(dir = this.directory): BoardArtifact[] {
    this.prepare(dir);
    const disk = new LibraryDisk(dir, this.repo, this.ctx.boardId, this.ctx.state().board.aiTool);
    disk.readChanges();
    disk.removeObsolete();
    this.warnings = disk.warnings;
    let failure = '';
    const mirror = new ArtifactMirror(
      dir,
      this.repo,
      this.ctx.boardId,
      (message) => {
        failure ||= message;
      },
      true,
      disk.protectedPaths,
    );
    mirror.ensure();
    if (failure) throw new Error(failure);
    disk.record();
    return this.repo.list(this.ctx.boardId).map((a) => {
      const file = mirror.pathOf(a);
      return { ...a, path: file, ...(!a.missing && file ? { size: fs.statSync(file).size } : {}) };
    });
  }

  setDirectory(input: string): void {
    if (this.ctx.aiRuns.length) throw new Error('Espere as execuções de IA terminarem antes de mudar a pasta da biblioteca.');
    const text = input.trim();
    if (!text || (!path.isAbsolute(text) && !text.startsWith('~/'))) throw new Error('Informe o caminho completo da pasta da biblioteca.');
    const dir = path.resolve(text.startsWith('~/') ? path.join(this.ctx.home, text.slice(2)) : text);
    // Grava todas as cópias primeiro; uma falha mantém a configuração anterior.
    this.materialize(dir);
    this.ctx.boards.setMeta(`harness.library.${this.ctx.opts.workspaceKey}`, dir);
  }

  private source(sel: { kind: SelectableKind; location: string }): ArtifactDraft {
    return readSource(sel, this.dirs, this.ctx.state().board.aiTool);
  }

  /** A ferramenta dona da origem, pela pasta que o adaptador declara; sem pista, a do board. */
  private ownerOf(location: string): AiTool {
    const p = `/${location.replace(/\\/g, '/')}`;
    const adapters = Object.values(TOOL_ADAPTERS).filter((a): a is ToolAdapter => !!a);
    for (const adapter of adapters) {
      if (p.includes(`/${adapter.root}/`)) return adapter.tool;
      for (const [target, base] of [
        ['project', this.dirs.projectDir],
        ['user', this.dirs.homeDir],
      ] as const)
        if (base && adapter.mcpFiles(target, base).includes(location.split('#')[0]!)) return adapter.tool;
    }
    return this.ctx.state().board.aiTool;
  }

  /**
   * Preserva a marcação antiga na primeira abertura, inclusive origens que já estavam ausentes. Sem
   * varredura e sem gravar nada na pasta da ferramenta: cada origem é lida pelo caminho que a marcação
   * guardou, e as dependências de um agente são procuradas pelos adaptadores (projeto antes do usuário).
   */
  migrate(): void {
    const legacy = this.repo.legacySelection(this.ctx.boardId);
    if (!legacy.length) return;
    const read = (selection: { kind: SelectableKind; location: string }) =>
      readSource(selection, this.dirs, this.ownerOf(selection.location));
    const drafts = legacy.map((selection) => ({ draft: read(selection), usage: selection.usage }));
    this.repo.importLegacy(
      this.ctx.boardId,
      legacy.map((selection, i) => {
        // Uma marcação antiga nunca substitui uma cópia já personalizada na biblioteca.
        const draft = drafts[i]!.draft;
        const existing = this.repo.get(this.ctx.boardId, draft.kind, draft.name);
        return { selection, draft: existing ? this.draftOf(existing) : draft };
      }),
    );
    const dependencies = this.withDependencies(drafts, this.adapterResolver()).slice(drafts.length);
    if (dependencies.length) this.repo.upsertMany(this.ctx.boardId, dependencies);
  }

  /** Procura skills e servidores MCP pelo nome nas pastas das ferramentas, via adaptadores: projeto antes do usuário. */
  private adapterResolver(): DependencyResolver {
    const targets = [
      ['project', this.dirs.projectDir],
      ['user', this.dirs.homeDir],
    ] as const;
    const adapters = (tool: string) =>
      tool && TOOL_ADAPTERS[tool as AiTool]
        ? [TOOL_ADAPTERS[tool as AiTool]!]
        : Object.values(TOOL_ADAPTERS).filter((a): a is ToolAdapter => !!a);
    return {
      mcp: (name, tool) => {
        for (const adapter of adapters(tool))
          for (const [target, base] of targets) {
            if (!base) continue;
            for (const file of adapter.mcpFiles(target, base)) {
              if (!mcpServerNames(file, this.dirs).includes(name)) continue;
              const draft = readSource({ kind: 'mcp', location: `${file}#${name}` }, this.dirs, adapter.tool);
              if (!draft.missing) return draft;
            }
          }
        return null;
      },
      skill: (name, tool) => {
        for (const adapter of adapters(tool))
          for (const [target, base] of targets) {
            if (!base) continue;
            const found = adapter.list(target, base).find((l) => l.kind === 'skill' && path.basename(path.dirname(l.location)) === name);
            if (!found) continue;
            const draft = readSource({ kind: 'skill', location: found.location }, this.dirs, adapter.tool);
            if (!draft.missing) return draft;
          }
        return null;
      },
    };
  }

  /** Um agente leva as dependências declaradas e encontradas, sem substituir artefatos já no board. */
  private withDependencies(items: { draft: ArtifactDraft; usage: HarnessUsage }[], resolver: DependencyResolver) {
    const result = [...items];
    const present = new Set([
      ...this.repo.list(this.ctx.boardId).map((a) => `${a.kind}:${a.name}`),
      ...items.map(({ draft }) => `${draft.kind}:${draft.name}`),
    ]);
    for (const { draft } of items) {
      if (draft.kind !== 'agent' || draft.missing) continue;
      const meta = draft.meta as AgentMeta;
      for (const name of meta.mcpServers) {
        if (present.has(`mcp:${name}`) || name === 'faz-ai') continue;
        const dependency = resolver.mcp(name, draft.originTool);
        if (dependency) {
          result.push({ draft: dependency, usage: 'contextual' });
          present.add(`mcp:${name}`);
        }
      }
      for (const name of meta.skills) {
        if (present.has(`skill:${name}`)) continue;
        const dependency = resolver.skill(name, draft.originTool);
        if (dependency && !dependency.missing) {
          result.push({ draft: dependency, usage: 'contextual' });
          present.add(`skill:${name}`);
        }
      }
    }
    return result;
  }

  private draftOf(a: ArtifactRow): ArtifactDraft {
    const { body, files } = this.repo.content(a.id);
    return { ...a, body, files };
  }

  select(items: { kind: SelectableKind; location: string }[], usage: HarnessUsage | null): void {
    if (!usage) this.refuseRemoval(items);
    const drafts: { draft: ArtifactDraft; usage: HarnessUsage }[] = [];
    for (const item of items) {
      const existing = this.repo.findByLocation(this.ctx.boardId, kindOfSelectable(item.kind), item.location);
      if (existing) {
        if (usage) drafts.push({ draft: this.draftOf(existing), usage });
      } else if (usage) {
        const draft = this.source(item);
        if (draft.missing) throw new Error('Não foi possível ler o artefato de origem. Releia as pastas e tente novamente.');
        const collision = this.repo.get(this.ctx.boardId, draft.kind, draft.name);
        if (collision && collision.origin !== draft.origin)
          throw new Error(`Já existe um artefato "${draft.name}" na biblioteca. Remova a cópia anterior antes de importar outra origem.`);
        drafts.push({ draft, usage });
      }
    }
    const identities = new Map<string, string>();
    for (const { draft } of drafts) {
      const key = `${draft.kind}:${draft.name}`;
      if (identities.has(key) && identities.get(key) !== draft.origin)
        throw new Error(`Mais de uma origem para o artefato "${draft.name}". Importe uma origem por vez.`);
      identities.set(key, draft.origin);
    }
    this.repo.upsertMany(this.ctx.boardId, this.withDependencies(drafts, this.adapterResolver()));
    if (!usage)
      for (const item of items) {
        const existing = this.repo.findByLocation(this.ctx.boardId, kindOfSelectable(item.kind), item.location);
        if (existing) this.repo.remove(this.ctx.boardId, existing.id);
        this.ctx.boards.setSelection(this.ctx.boardId, [item], null);
      }
  }

  /** Apagar recusa o agente padrão e a skill do fluxo (só o modo dela muda); nada é apagado antes da recusa. */
  private refuseRemoval(items: { kind: SelectableKind; location: string }[]): void {
    const defaultAgent = this.ctx.state().board.runner.defaultAgent;
    for (const item of items) {
      const a = this.repo.findByLocation(this.ctx.boardId, kindOfSelectable(item.kind), item.location);
      if (a?.kind === 'agent' && defaultAgent && a.name === defaultAgent)
        throw new Error('Escolha outro agente padrão antes de apagar este.');
      if (a?.kind === 'skill' && (a.meta as { generated?: unknown }).generated === true)
        throw new Error('A skill do fluxo é da extensão: só o modo dela pode mudar.');
    }
  }

  // --- criar e editar direto no board (nada vai para o projeto nem para as pastas das ferramentas) ---

  /** Cópia de leitura em dia depois de uma gravação; falha dela não desfaz o que já está no banco. */
  private sync(): void {
    try {
      this.materialize();
    } catch {
      // a próxima abertura refaz a cópia
    }
  }

  /** Valida o nome novo (criar ou renomear) e devolve o artefato a editar, se houver. */
  /** Já existe um artefato com este nome: quem cria a partir de outro lugar recusa em vez de sobrescrever. */
  has(kind: ArtifactKind, name: string): boolean {
    return !!this.repo.get(this.ctx.boardId, kind, name);
  }

  private target(kind: ArtifactKind, name: string, previous: string | undefined, pattern: RegExp, invalid: string) {
    const existing = this.repo.get(this.ctx.boardId, kind, previous ?? name);
    if (previous !== undefined && !existing) throw new Error('Artefato não encontrado.');
    if ((!existing || name !== existing.name) && !pattern.test(name)) throw new Error(invalid);
    if (name !== existing?.name && this.repo.get(this.ctx.boardId, kind, name))
      throw new Error('Já existe um artefato com este nome. Edite o existente ou escolha outro nome.');
    return existing;
  }

  private store(existing: ArtifactRow | undefined, draft: ArtifactDraft, usage: HarnessUsage, reviewed = false): void {
    // renomear: o artefato antigo sai e o novo herda o modo
    if (existing && existing.name !== draft.name) {
      this.repo.remove(this.ctx.boardId, existing.id);
      this.repo.upsert(this.ctx.boardId, draft, existing.usage, reviewed);
    } else this.repo.upsert(this.ctx.boardId, draft, existing ? undefined : usage, reviewed);
  }

  private tooBig(text: string): void {
    if (Buffer.byteLength(text, 'utf8') > ARTIFACT_LIMITS.fileBytes) throw new Error('Arquivo maior que 512 KB.');
  }

  saveRule(name: string, body: string, opts: { previous?: string; via: 'manual' | 'wizard' | 'ai' }): void {
    const existing = this.target(
      'rule',
      name,
      opts.previous,
      RULE_NAME_PATTERN,
      'Nome de regra inválido: use letras minúsculas, números e hífens, com .md opcional.',
    );
    this.tooBig(body);
    this.store(
      existing,
      {
        kind: 'rule',
        name,
        description: '',
        body,
        meta: {},
        origin: existing?.origin ?? '',
        originTool: existing?.originTool ?? '',
        missing: false,
        skipped: [],
        files: [],
      },
      createUsage('rule', opts.via),
    );
    this.sync();
  }

  saveSkill(name: string, skillMd: string, opts: { previous?: string; via: 'manual' | 'wizard' | 'ai'; files?: string[] }): void {
    const existing = this.target(
      'skill',
      name,
      opts.previous,
      SKILL_NAME_PATTERN,
      'Nome de skill inválido: use letras minúsculas, números e hífens (ex.: "revisar-spec").',
    );
    if (existing && (existing.meta as { generated?: unknown }).generated === true)
      throw new Error('A skill do fluxo é da extensão: só o modo dela pode mudar.');
    this.tooBig(skillMd);
    const description = frontmatterValue(frontmatterOf(skillMd), 'description') ?? '';
    const body = frontmatterValue(frontmatterOf(skillMd), 'name') === name ? skillMd : skillDocument(skillMd, name, description);
    const kept = existing ? this.repo.content(existing.id).files.filter((f) => !opts.files || opts.files.includes(f.path)) : [];
    this.store(
      existing,
      {
        kind: 'skill',
        name,
        description,
        body,
        meta: {},
        origin: existing?.origin ?? '',
        originTool: existing?.originTool ?? '',
        missing: false,
        skipped: existing?.skipped ?? [],
        files: kept,
      },
      createUsage('skill', opts.via),
    );
    this.sync();
  }

  saveMcp(name: string, server: McpServerInput, opts: { previous?: string; keepSecrets: string[] }): void {
    const existing = this.target(
      'mcp',
      name,
      opts.previous,
      MCP_NAME_PATTERN,
      'Nome inválido: use letras, números, hífen, ponto ou sublinhado.',
    );
    if (name === 'faz-ai') throw new Error('O nome faz-ai é reservado ao MCP do board.');
    const saved = existing ? this.repo.mcpServer(this.ctx.boardId, existing.id) : undefined;
    const keep = (values: Record<string, string> | undefined, old: unknown): Record<string, string> => {
      const out: Record<string, string> = {};
      const prev = old && typeof old === 'object' ? (old as Record<string, unknown>) : {};
      for (const [k, v] of Object.entries(values ?? {})) {
        const kept = opts.keepSecrets.includes(k) && v === '' ? prev[k] : undefined;
        out[k] = typeof kept === 'string' ? kept : v;
      }
      return out;
    };
    let def: Record<string, unknown>;
    if (server.transport === 'http') {
      if (!/^https?:\/\//.test(server.url)) throw new Error('Informe uma URL HTTP do servidor MCP.');
      new URL(server.url);
      def = { type: 'http', url: server.url, headers: keep(server.headers, saved?.headers) };
    } else {
      if (!server.command.trim()) throw new Error('Informe o comando do servidor MCP.');
      def = { command: server.command.trim(), args: server.args ?? [], env: keep(server.env, saved?.env) };
    }
    this.store(
      existing,
      {
        kind: 'mcp',
        name,
        description: '',
        body: '',
        meta: { server: def },
        origin: existing?.origin ?? '',
        originTool: existing?.originTool ?? '',
        missing: false,
        skipped: [],
        files: [],
      },
      createUsage('mcp', 'manual'),
      true,
    );
    this.sync();
  }

  private skillWithFiles(skill: string) {
    const a = this.repo.get(this.ctx.boardId, 'skill', skill);
    if (!a) throw new Error(`Skill "${skill}" não está no board.`);
    if ((a.meta as { generated?: unknown }).generated === true)
      throw new Error('A skill do fluxo é da extensão: só o modo dela pode mudar.');
    return { a, draft: this.draftOf(a) };
  }

  /** Devolve o caminho do arquivo na cópia de leitura. */
  writeSkillFile(skill: string, file: string, content: string, encoding: 'utf8' | 'base64' = 'utf8'): string {
    const { a, draft } = this.skillWithFiles(skill);
    if (!isSafeRelPath(file) || file === 'SKILL.md') throw new Error('Caminho inválido dentro da skill.');
    const size = encoding === 'base64' ? Buffer.from(content, 'base64').length : Buffer.byteLength(content, 'utf8');
    const others = draft.files.filter((f) => f.path !== file);
    if (size > ARTIFACT_LIMITS.fileBytes) throw new Error('Arquivo maior que 512 KB.');
    if (others.length >= ARTIFACT_LIMITS.files) throw new Error('A skill já tem 100 arquivos de apoio.');
    if (Buffer.byteLength(draft.body, 'utf8') + others.reduce((n, f) => n + f.size, 0) + size > ARTIFACT_LIMITS.totalBytes)
      throw new Error('A skill passaria de 5 MB no total.');
    draft.files = [...others, { path: file, content, encoding, size }];
    this.repo.upsert(this.ctx.boardId, draft, a.usage);
    this.sync();
    const main = new ArtifactMirror(this.directory, this.repo, this.ctx.boardId).pathOf(a);
    return path.join(path.dirname(main), ...file.split('/'));
  }

  deleteSkillFile(skill: string, file: string): void {
    const { a, draft } = this.skillWithFiles(skill);
    if (!draft.files.some((f) => f.path === file)) throw new Error('Arquivo de apoio não encontrado.');
    draft.files = draft.files.filter((f) => f.path !== file);
    this.repo.upsert(this.ctx.boardId, draft, a.usage);
    this.sync();
  }

  /** O conteúdo para o editor: corpo da regra/skill/agente, um arquivo de apoio, ou o MCP com os segredos mascarados. */
  content(kind: ArtifactKind, name: string, file?: string): { text?: string; server?: McpServerView } {
    const a = this.repo.get(this.ctx.boardId, kind, name);
    if (!a) throw new Error('Artefato não encontrado.');
    if (kind === 'mcp') {
      const s = this.repo.mcpServer(this.ctx.boardId, a.id) ?? {};
      const mask = (v: unknown): Record<string, string> =>
        Object.fromEntries(Object.keys(v && typeof v === 'object' ? v : {}).map((k) => [k, '']));
      return {
        server: {
          name,
          transport: typeof s.command === 'string' ? 'stdio' : 'http',
          command: typeof s.command === 'string' ? s.command : '',
          args: Array.isArray(s.args) ? s.args.map(String) : [],
          env: mask(s.env),
          url: typeof s.url === 'string' ? s.url : '',
          headers: mask(s.headers),
        },
      };
    }
    if (file) {
      const f = this.repo.content(a.id).files.find((x) => x.path === file);
      if (!f) throw new Error('Arquivo de apoio não encontrado.');
      if (f.encoding === 'base64') throw new Error('Arquivo binário: não dá para editar como texto.');
      return { text: f.content };
    }
    return { text: a.body };
  }

  update(id: string): void {
    const a = this.repo.list(this.ctx.boardId).find((x) => x.id === id);
    if (!a?.origin) throw new Error('Este artefato não tem uma origem para atualizar.');
    const kind = a.kind === 'rule' ? 'instructions' : a.kind;
    const draft = readSource({ kind, location: a.origin }, this.dirs, a.originTool);
    if (draft.missing) throw new Error('A origem não está disponível. A cópia do board foi preservada.');
    this.repo.upsertMany(this.ctx.boardId, this.withDependencies([{ draft, usage: a.usage }], this.adapterResolver()));
  }

  /** Só os arquivos já conhecidos da biblioteca podem ser abertos no editor do board. */
  fileArtifact(file: string): { artifact: BoardArtifact; relative: string } | undefined {
    const mirror = new ArtifactMirror(this.directory, this.repo, this.ctx.boardId);
    for (const a of this.repo.list(this.ctx.boardId)) {
      const main = mirror.pathOf(a);
      const artifact = { ...a, path: main };
      if (main && file === main) return { artifact, relative: '' };
      if (a.kind === 'skill')
        for (const rel of a.files) {
          if (file === path.join(path.dirname(main), ...rel.split('/'))) return { artifact, relative: rel };
        }
    }
    return undefined;
  }

  writeFile(file: string, content: string): void {
    const match = this.fileArtifact(file);
    if (!match) throw new Error('Arquivo fora da biblioteca do board.');
    if (Buffer.byteLength(content, 'utf8') > 512 * 1024) throw new Error('Arquivo maior que 512 KB: abra no editor.');
    const a = this.repo.get(this.ctx.boardId, match.artifact.kind, match.artifact.name)!;
    const draft = this.draftOf(a);
    if (match.relative) {
      const f = draft.files.find((f) => f.path === match.relative)!;
      Object.assign(f, { content, encoding: 'utf8', size: Buffer.byteLength(content, 'utf8') });
    } else if (a.kind === 'agent') {
      const agent = parseAgentFile(
        baseInfo(a.originTool || 'claude').agents,
        { name: a.name, scope: 'project', path: file, location: a.origin },
        content,
      );
      draft.body = agent.body;
      draft.description = agent.description;
    } else {
      draft.body = content;
      if (a.kind === 'skill') draft.description = frontmatterValue(frontmatterOf(content), 'description') ?? '';
    }
    this.repo.upsert(this.ctx.boardId, draft, a.usage);
  }

  // Agentes do board: criados e editados pelo board ficam no banco, nunca na pasta da ferramenta. Uma
  // edição vale para as próximas execuções; as já iniciadas têm o próprio snapshot.

  hasAgent(name: string): boolean {
    return !!this.repo.get(this.ctx.boardId, 'agent', name);
  }

  /** O agente do board no formato do editor (ferramentas nos nomes da ferramenta em uso). */
  agentInput(name: string): AgentInput {
    const a = this.repo.get(this.ctx.boardId, 'agent', name);
    if (!a) throw new Error(`Agente "${name}" não está no board.`);
    // as instruções como estão guardadas (sem o aviso de escopo que a execução acrescenta)
    return {
      ...agentInputOf(agentOfArtifact({ ...a, agent: a.meta as AgentMeta, path: '' }, this.ctx.state().board.aiTool)),
      body: a.body,
    };
  }

  private saveAgent(input: AgentInput, existing: ArtifactRow | undefined, seed: boolean): void {
    if (!input.description.trim()) throw new Error('O agente precisa de uma descrição: é por ela que a IA decide quando delegar a ele.');
    const tool = this.ctx.state().board.aiTool;
    const meta: AgentMeta = {
      skills: input.skills,
      mcpServers: input.mcp,
      model: input.model,
      tools: { categories: toolCategories(tool, input.tools), native: { tool, allow: input.tools, deny: input.deniedTools } },
      ...(seed ? { seed: true } : {}),
      ...(input.readonly ? { readonly: true } : {}),
      ...(input.background ? { background: true } : {}),
    };
    this.repo.upsert(
      this.ctx.boardId,
      {
        kind: 'agent',
        name: input.name,
        description: input.description,
        body: input.body,
        meta,
        origin: existing?.origin ?? '',
        originTool: existing?.originTool ?? '',
        missing: false,
        skipped: [],
        files: [],
      },
      existing?.usage ?? 'contextual',
    );
  }

  /** Cria o agente no board, disponível ("Pelo card"): criar um agente é querer usá-lo. */
  createAgent(input: AgentInput, seed = false): void {
    if (!SKILL_NAME_PATTERN.test(input.name))
      throw new Error('Nome de agente inválido: use letras minúsculas, números e hífens (ex.: "revisor-de-spec").');
    if (this.hasAgent(input.name)) throw new Error(`Já existe um agente "${input.name}" no board.`);
    this.saveAgent(input, undefined, seed);
  }

  /** Regrava o que vier em `patch` e, se vier, as instruções; o resto fica como está. */
  updateAgent(name: string, patch: Partial<AgentInput>, body?: string): void {
    const existing = this.repo.get(this.ctx.boardId, 'agent', name);
    if (!existing) throw new Error(`Agente "${name}" não está no board.`);
    const input: AgentInput = { ...this.agentInput(name), ...patch, name, ...(body !== undefined ? { body } : {}) };
    this.saveAgent(input, existing, !!(existing.meta as AgentMeta).seed);
  }

  /** Substitui o agente pelo conteúdo do editor de texto (frontmatter + instruções, no formato da ferramenta em uso). */
  writeAgent(name: string, content: string): void {
    const existing = this.repo.get(this.ctx.boardId, 'agent', name);
    if (!existing) throw new Error(`Agente "${name}" não está no board.`);
    const parsed = parseAgentFile(
      baseInfo(this.ctx.state().board.aiTool).agents,
      { name, scope: 'project', path: '', location: existing.origin || `board:${name}` },
      content,
    );
    this.saveAgent({ ...agentInputOf(parsed), name }, existing, !!(existing.meta as AgentMeta).seed);
  }

  deleteAgent(name: string): void {
    const existing = this.repo.get(this.ctx.boardId, 'agent', name);
    if (!existing) throw new Error(`Agente "${name}" não está no board.`);
    if (name === this.ctx.state().board.runner.defaultAgent) throw new Error('Escolha outro agente padrão antes de apagar este.');
    this.repo.remove(this.ctx.boardId, existing.id);
  }

  /** Definições MCP ficam no host e nunca são expostas no estado enviado à interface. */
  mcpDefinitions(): Record<string, unknown> {
    return this.repo.mcpDefinitions(this.ctx.boardId);
  }
}
