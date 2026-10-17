import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseAgentFile } from './agentFiles';
import { frontmatterOf, frontmatterValue } from './frontmatter';
import { scanLibraryFolder } from './libraryImport';
import type { LibraryArtifactInput, LibraryImportPreview } from '../shared/artifacts';
import { LibraryDisk } from './libraryDisk';
import { ArtifactMirror } from './artifactMirror';
import { readSource, readMcpByName } from './artifactSource';
import { ArtifactRepo, type ArtifactRow } from './repositories/artifactRepo';
import {
  kindOfSelectable,
  skillDocument,
  isSafeRelPath,
  ARTIFACT_LIMITS,
  type AgentMeta,
  type ArtifactDraft,
  type BoardArtifact,
} from '../shared/artifacts';
import { selectionKey, type HarnessUsage, type SelectableKind } from '../shared/harnessSelection';
import { aiToolInfo, type Harness, type HarnessItem } from '../shared/harness';
import type { BoardContext } from './panel/handlers/context';

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
    this.importDrafts = new Map(drafts.map((draft) => [randomUUID(), draft]));
    this.preview = {
      directory: dir,
      items: [...this.importDrafts].map(([key, a]) => ({ key, kind: a.kind, name: a.name, description: a.description, origin: a.origin })),
    };
  }

  importArtifacts(keys: string[]): void {
    if (!this.preview || !keys.length) throw new Error('Selecione os artefatos para importar.');
    const items = [...new Set(keys)].map((key) => {
      const draft = this.importDrafts.get(key);
      if (!draft) throw new Error('Releia a pasta antes de importar.');
      const existing = this.repo.get(this.ctx.boardId, draft.kind, draft.name);
      if (existing && existing.origin !== draft.origin)
        throw new Error(`Já existe "${draft.name}" neste tipo. Renomeie ou edite o artefato existente.`);
      return { draft, usage: existing?.usage ?? (draft.kind === 'rule' ? ('off' as const) : ('contextual' as const)) };
    });
    const identities = items.map(({ draft }) => `${draft.kind}:${draft.name}`);
    if (new Set(identities).size !== identities.length)
      throw new Error('Há nomes repetidos no mesmo tipo. Selecione apenas uma origem para cada nome.');
    this.repo.upsertMany(this.ctx.boardId, items);
    this.preview = undefined;
    this.importDrafts.clear();
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
      ...(row.kind === 'mcp' ? { server: (row.meta as { server: Record<string, unknown> }).server } : {}),
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
      const server = input.server;
      if (!server || typeof server !== 'object' || Array.isArray(server)) throw new Error('Definição MCP inválida.');
      if (typeof server.command === 'string' && server.command.trim()) {
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
      meta = { server };
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
    );
  }

  get directory(): string {
    return (
      this.ctx.boards.getMeta(`harness.library.${this.ctx.opts.workspaceKey}`) ||
      this.ctx.opts.libraryDir ||
      path.join(this.ctx.opts.attachmentsDir, 'artifacts', this.ctx.opts.workspaceKey)
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

  private source(sel: { kind: SelectableKind; location: string }, inventory: Harness['inventory']): ArtifactDraft {
    const owner = inventory.find((t) => t.items.some((i) => i.kind === sel.kind && selectionKey(i) === sel.location));
    return readSource(sel, this.dirs, owner?.tool ?? this.ctx.state().board.aiTool);
  }

  /** Preserva a marcação antiga na primeira abertura, inclusive origens que já estavam ausentes. */
  migrate(inventory: Harness['inventory']): void {
    const legacy = this.repo.legacySelection(this.ctx.boardId);
    if (!legacy.length) return;
    const drafts = legacy.map((selection) => ({ draft: this.source(selection, inventory), usage: selection.usage }));
    this.repo.importLegacy(
      this.ctx.boardId,
      legacy.map((selection) => {
        const draft = this.source(selection, inventory);
        // Uma marcação antiga nunca substitui uma cópia já personalizada na biblioteca.
        const existing = this.repo.get(this.ctx.boardId, draft.kind, draft.name);
        return { selection, draft: existing ? this.draftOf(existing) : draft };
      }),
    );
    const dependencies = this.withDependencies(drafts, inventory).slice(drafts.length);
    if (dependencies.length) this.repo.upsertMany(this.ctx.boardId, dependencies);
  }

  /** Um agente leva as dependências declaradas e encontradas, sem substituir artefatos já no board. */
  private withDependencies(items: { draft: ArtifactDraft; usage: HarnessUsage }[], inventory: Harness['inventory']) {
    const result = [...items];
    const present = new Set([
      ...this.repo.list(this.ctx.boardId).map((a) => `${a.kind}:${a.name}`),
      ...items.map(({ draft }) => `${draft.kind}:${draft.name}`),
    ]);
    for (const { draft } of items) {
      if (draft.kind !== 'agent' || draft.missing) continue;
      const meta = draft.meta as AgentMeta;
      const sources = inventory.find((t) => t.tool === draft.originTool)?.items ?? inventory.flatMap((t) => t.items);
      for (const name of meta.mcpServers) {
        if (present.has(`mcp:${name}`) || name === 'faz-ai') continue;
        const dependency = readMcpByName(name, sources, this.dirs);
        if (dependency) {
          result.push({ draft: dependency, usage: 'contextual' });
          present.add(`mcp:${name}`);
        }
      }
      for (const name of meta.skills) {
        if (present.has(`skill:${name}`)) continue;
        const item = sources.find((i) => i.kind === 'skill' && i.name === name);
        if (!item) continue;
        const dependency = readSource({ kind: 'skill', location: item.location }, this.dirs, draft.originTool);
        if (!dependency.missing) {
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

  select(items: { kind: SelectableKind; location: string }[], usage: HarnessUsage | null, inventory: Harness['inventory']): void {
    const drafts: { draft: ArtifactDraft; usage: HarnessUsage }[] = [];
    for (const item of items) {
      const existing = this.repo.findByLocation(this.ctx.boardId, kindOfSelectable(item.kind), item.location);
      if (existing) {
        if (usage) drafts.push({ draft: this.draftOf(existing), usage });
      } else if (usage) {
        const draft = this.source(item, inventory);
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
    this.repo.upsertMany(this.ctx.boardId, this.withDependencies(drafts, inventory));
    if (!usage)
      for (const item of items) {
        const existing = this.repo.findByLocation(this.ctx.boardId, kindOfSelectable(item.kind), item.location);
        if (existing) this.repo.remove(this.ctx.boardId, existing.id);
        this.ctx.boards.setSelection(this.ctx.boardId, [item], null);
      }
  }

  importSkills(root: string, paths: string[], known: { rel: string; valid: boolean }[]): void {
    const allowed = new Set(known.filter((k) => k.valid).map((k) => k.rel));
    const items = [...new Set(paths)].map((rel) => {
      if (!allowed.has(rel)) throw new Error('Skill não encontrada na origem selecionada.');
      return { kind: 'skill' as const, location: path.join(root, rel, 'SKILL.md') };
    });
    const inventory = [{ tool: this.ctx.state().board.aiTool, installed: true, items: [] as HarnessItem[] }];
    this.select(items, 'contextual', inventory);
  }

  update(id: string): void {
    const a = this.repo.list(this.ctx.boardId).find((x) => x.id === id);
    if (!a?.origin) throw new Error('Este artefato não tem uma origem para atualizar.');
    const kind = a.kind === 'rule' ? 'instructions' : a.kind;
    const draft = readSource({ kind, location: a.origin }, this.dirs, a.originTool);
    if (draft.missing) throw new Error('A origem não está disponível. A cópia do board foi preservada.');
    this.repo.upsertMany(this.ctx.boardId, this.withDependencies([{ draft, usage: a.usage }], this.ctx.harness.current.inventory));
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
        aiToolInfo(a.originTool || 'claude').agents,
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

  writeSkillFile(name: string, rel: string, content: string): string | null {
    const a = this.repo.get(this.ctx.boardId, 'skill', name);
    if (!a) return null;
    if (!isSafeRelPath(rel) || rel === 'SKILL.md') throw new Error('Caminho inválido dentro da skill.');
    const draft = this.draftOf(a);
    const size = Buffer.byteLength(content, 'utf8');
    const files = draft.files.filter((f) => f.path !== rel);
    if (
      size > ARTIFACT_LIMITS.fileBytes ||
      files.length >= ARTIFACT_LIMITS.files ||
      Buffer.byteLength(draft.body, 'utf8') + files.reduce((n, f) => n + f.size, 0) + size > ARTIFACT_LIMITS.totalBytes
    )
      throw new Error('O arquivo ultrapassa os limites da biblioteca.');
    draft.files = [...files, { path: rel, content, encoding: 'utf8', size }];
    this.repo.upsert(this.ctx.boardId, draft, a.usage);
    const mirror = new ArtifactMirror(this.directory, this.repo, this.ctx.boardId);
    return path.join(path.dirname(mirror.pathOf(a)), ...rel.split('/'));
  }

  /** Definições MCP ficam no host e nunca são expostas no estado enviado à interface. */
  mcpDefinitions(): Record<string, unknown> {
    return this.repo.mcpDefinitions(this.ctx.boardId);
  }
}
