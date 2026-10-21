import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { BoardState, Card } from '../shared/model';
import type { BoardArtifact, LibraryArtifactInput } from '../shared/artifacts';
import { ARTIFACT_LIMITS, isSafeRelPath } from '../shared/artifacts';
import { manifestOf } from '../shared/execution';
import type { ArtifactRepo } from './repositories/artifactRepo';
import type { ContextDraftResolution } from '../shared/contextDraftResolution';
import type { HeadlessInput } from './headless';
import type { AiRunConfig } from '../shared/log';
import { alwaysRefs, cardRefs } from './promptContext';
import { isSafeSegment } from './attachments';
import { ArtifactMirror } from './artifactMirror';

export interface RunArtifactRequest {
  directory: string;
  artifacts: Pick<BoardArtifact, 'id' | 'name' | 'kind' | 'path' | 'revision'>[];
}
export interface RunArtifactManifest {
  version: 1;
  boardId: string;
  runId: string;
  createdAt: number;
  /**
   * A configuração resolvida da execução (modelo, agente, skills e nomes dos servidores MCP), a mesma que
   * o log guarda: o snapshot se explica sozinho na auditoria. Sem corpos, definições MCP nem credenciais.
   */
  config?: RunArtifactConfig;
  /**
   * A configuração v1 resolvida antes do spawn, com o mesmo resolvedor da prévia. Só metadados (IDs, nomes,
   * origens e razões): editar a biblioteca ou o plano depois não muda uma execução já iniciada.
   */
  context?: ContextDraftResolution;
  artifacts: {
    id: string;
    name: string;
    kind: BoardArtifact['kind'];
    revision: number;
    files: { path: string; bytes: number; sha256: string }[];
  }[];
}
export type RunArtifactConfig = Omit<AiRunConfig, 'permission' | 'admission'>;
export interface FrozenRunArtifacts {
  directory: string;
  manifest: RunArtifactManifest;
  rewrite(input: HeadlessInput): HeadlessInput;
  validate(): void;
  catalog(): BoardArtifact[];
  artifact(id: string): LibraryArtifactInput;
  readFile(file: string): { content: string; readonly: true };
}

/** Congela as cópias do board efetivamente referenciadas: só elas entram em execução (ver `toolItemsOf`). */
export function runArtifactRequest(s: BoardState, card?: Card): RunArtifactRequest | undefined {
  const library = s.harness.library;
  if (!library) return undefined;
  const refs = [...alwaysRefs(s), ...(card ? cardRefs(s, card) : [])];
  const paths = new Set(refs.map((r) => r.path));
  const manifest = card ? manifestOf(s, card) : null;
  if (library.artifacts.some((a) => a.usage === 'always' && a.missing && a.kind !== 'mcp'))
    throw new Error('Artefato obrigatório Sempre está indisponível.');
  if (
    manifest &&
    (manifest.skills.some((name) => !refs.some((r) => r.kind === 'skill' && r.name === name)) ||
      manifest.rules.some((name) => !refs.some((r) => r.kind === 'rule' && r.name === name)))
  )
    throw new Error('Artefato obrigatório do card está indisponível.');
  const agents = new Set([manifest?.agent, ...(manifest?.delegates.map((a) => a.name) ?? [])]);
  return {
    directory: library.directory,
    artifacts: library.artifacts
      .filter((a) => paths.has(a.path) || (a.kind === 'agent' && agents.has(a.name)))
      .map(({ id, name, kind, path, revision }) => ({ id, name, kind, path, revision })),
  };
}

const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
function syncDirectory(dir: string): void {
  // O Windows não abre diretórios para fsync; os arquivos ainda são sincronizados antes do rename.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function plainDirectory(dir: string): void {
  if (!fs.lstatSync(dir).isDirectory()) throw new Error('Pasta de snapshot inválida.');
}
function plainFile(root: string, rel: string): string {
  if (!isSafeRelPath(rel)) throw new Error('Caminho de snapshot inválido.');
  let current = root;
  plainDirectory(current);
  const parts = rel.split('/');
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    plainDirectory(current);
  }
  const file = path.join(root, ...parts);
  if (!fs.lstatSync(file).isFile()) throw new Error('Arquivo de snapshot inválido.');
  return file;
}

/** Publicação por run, sem regravar diretórios publicados e sem coleta automática de runs ambíguos. */
export class RunArtifactSnapshots {
  constructor(
    private root: string,
    private repo: ArtifactRepo,
    private boardId: string,
  ) {}

  capture(
    runId: string,
    request: RunArtifactRequest = { directory: '', artifacts: [] },
    config?: RunArtifactConfig,
    context?: ContextDraftResolution,
  ): FrozenRunArtifacts {
    request = structuredClone(request);
    if (!isSafeSegment(runId) || !runId || !isSafeSegment(this.boardId)) throw new Error('Identidade de snapshot inválida.');
    if (new Set(request.artifacts.map((a) => a.id)).size !== request.artifacts.length) throw new Error('Artefato repetido no snapshot.');
    const boardRoot = path.join(this.root, this.boardId);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    plainDirectory(this.root);
    fs.mkdirSync(boardRoot, { recursive: true, mode: 0o700 });
    plainDirectory(boardRoot);
    const destination = path.join(boardRoot, runId);
    const lock = `${destination}.lock`;
    fs.mkdirSync(lock, { mode: 0o700 });
    const stage = path.join(boardRoot, `.preparing-${runId}-${randomUUID()}`);
    let published = false;
    try {
      if (fs.existsSync(destination)) throw new Error('O snapshot da execução já foi publicado.');
      fs.mkdirSync(stage, { mode: 0o700 });
      const known = new Map(this.repo.list(this.boardId).map((a) => [a.id, a]));
      const files = new Map<string, Buffer>();
      const catalog: BoardArtifact[] = [];
      const contents = new Map<string, LibraryArtifactInput>();
      const mirror = new ArtifactMirror(request.directory, this.repo, this.boardId);
      const manifest: RunArtifactManifest = {
        version: 1,
        boardId: this.boardId,
        runId,
        createdAt: Date.now(),
        ...(config ? { config: structuredClone(config) } : {}),
        ...(context ? { context: structuredClone(context) } : {}),
        artifacts: [],
      };
      for (const ref of request.artifacts) {
        const current = known.get(ref.id);
        if (
          !current ||
          current.missing ||
          current.skipped.length > 0 ||
          current.usage === 'off' ||
          current.kind !== ref.kind ||
          current.name !== ref.name ||
          !Number.isSafeInteger(ref.revision) ||
          (ref.revision ?? 0) < 1 ||
          current.revision !== ref.revision
        )
          throw new Error('Artefato obrigatório mudou ou está indisponível. Releia antes de executar.');
        if (ref.kind === 'mcp') throw new Error('Definições MCP não pertencem ao snapshot de arquivos.');
        if (ref.path !== mirror.pathOf(ref)) throw new Error('Caminho do artefato não corresponde à cópia do board.');
        const rel = path.relative(request.directory, ref.path).split(path.sep).join('/');
        if (!request.directory || !path.isAbsolute(request.directory) || !isSafeRelPath(rel))
          throw new Error('Origem de snapshot inválida.');
        const content = this.repo.content(ref.id);
        catalog.push({ ...structuredClone(current), path: path.join(destination, rel) });
        contents.set(ref.id, {
          id: ref.id,
          kind: ref.kind,
          name: ref.name,
          description: current.description,
          body: content.body,
          ...(current.agent ? { agent: structuredClone(current.agent) } : {}),
        });
        const body =
          ref.kind === 'agent'
            ? `---\nname: ${JSON.stringify(ref.name)}\ndescription: ${JSON.stringify(current.description.replace(/\r?\n/g, ' ').trim())}\n---\n\n${content.body.trim()}\n`
            : content.body;
        const entry: RunArtifactManifest['artifacts'][number] = {
          id: ref.id,
          name: ref.name,
          kind: ref.kind,
          revision: ref.revision!,
          files: [],
        };
        let totalBytes = 0;
        const add = (relative: string, data: Buffer) => {
          if (!isSafeRelPath(relative) || files.has(relative)) throw new Error('Arquivo inválido ou repetido no snapshot.');
          totalBytes += data.length;
          if (
            data.length > ARTIFACT_LIMITS.fileBytes ||
            totalBytes > ARTIFACT_LIMITS.totalBytes ||
            entry.files.length > ARTIFACT_LIMITS.files
          )
            throw new Error('Artefato obrigatório excede os limites de materialização.');
          files.set(relative, data);
          entry.files.push({ path: relative, bytes: data.length, sha256: hash(data) });
        };
        add(rel, Buffer.from(body));
        if (ref.kind === 'skill')
          for (const file of content.files) {
            if (!isSafeRelPath(file.path)) throw new Error('Arquivo de apoio obrigatório inválido.');
            if (file.encoding === 'base64' && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content))
              throw new Error('Conteúdo binário de apoio inválido.');
            const data = Buffer.from(file.content, file.encoding);
            if (data.length !== file.size) throw new Error('Tamanho de arquivo de apoio inconsistente.');
            add(path.posix.join(path.posix.dirname(rel), file.path), data);
          }
        manifest.artifacts.push(entry);
      }
      const manifestBytes = JSON.stringify(manifest);
      files.set('manifest.json', Buffer.from(manifestBytes));
      const expectedFiles = [...files].map(([relative, data]) => ({ relative, bytes: data.length, sha256: hash(data) }));
      const directories = new Set([stage]);
      for (const [rel, data] of files) {
        const file = path.join(stage, ...rel.split('/'));
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        let parent = path.dirname(file);
        while (parent !== stage) {
          directories.add(parent);
          parent = path.dirname(parent);
        }
        const fd = fs.openSync(file, 'wx', 0o400);
        try {
          fs.writeFileSync(fd, data);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
      }
      for (const dir of [...directories].sort((a, b) => b.length - a.length)) syncDirectory(dir);
      fs.renameSync(stage, destination);
      published = true;
      syncDirectory(boardRoot);
      const replace = (value: string) => {
        let result = value;
        for (const ref of request.artifacts) {
          const rel = path.relative(request.directory, ref.path);
          result = result.split(ref.path).join(path.join(destination, rel));
          if (ref.kind === 'skill')
            result = result.split(path.dirname(ref.path) + path.sep).join(path.dirname(path.join(destination, rel)) + path.sep);
        }
        return result;
      };
      const validate = () => {
        if (fs.readFileSync(plainFile(destination, 'manifest.json'), 'utf8') !== manifestBytes)
          throw new Error('Manifesto do snapshot alterado.');
        for (const expected of expectedFiles) {
          const file = plainFile(destination, expected.relative);
          if (fs.statSync(file).size !== expected.bytes || hash(fs.readFileSync(file)) !== expected.sha256)
            throw new Error('Integridade do snapshot inválida.');
        }
      };
      validate();
      return {
        directory: destination,
        manifest: structuredClone(manifest),
        validate,
        catalog: () => {
          validate();
          return structuredClone(catalog);
        },
        artifact: (id) => {
          validate();
          const item = contents.get(id);
          if (!item) throw new Error('Artefato fora do snapshot desta execução.');
          return structuredClone(item);
        },
        readFile: (file) => {
          validate();
          const rel = path.relative(destination, path.resolve(file)).split(path.sep).join('/');
          if (!expectedFiles.some((entry) => entry.relative === rel) || rel === 'manifest.json')
            throw new Error('Arquivo fora do snapshot desta execução.');
          return { content: fs.readFileSync(plainFile(destination, rel), 'utf8'), readonly: true };
        },
        rewrite: (input) => {
          const result = structuredClone(input);
          result.prompt = replace(result.prompt);
          if (result.exec?.agentDefinition) result.exec.agentDefinition.prompt = replace(result.exec.agentDefinition.prompt);
          if (result.exec) result.exec.delegates = result.exec.delegates.map((a) => ({ ...a, prompt: replace(a.prompt) }));
          if (request.artifacts.length)
            result.addDirs = [
              ...new Set([...(result.addDirs ?? []).map((dir) => (dir === request.directory ? destination : dir)), destination]),
            ];
          return result;
        },
      };
    } finally {
      if (!published) fs.rmSync(stage, { recursive: true, force: true });
      fs.rmdirSync(lock);
    }
  }
}
