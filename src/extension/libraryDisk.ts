import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ArtifactMirror } from './artifactMirror';
import { readSource } from './artifactSource';
import { findSkills } from './skillInstall';
import { ArtifactRepo } from './repositories/artifactRepo';
import { isSafeRelPath, type ArtifactDraft } from '../shared/artifacts';
import type { Harness, AiTool } from '../shared/harness';

type Warning = NonNullable<NonNullable<Harness['library']>['warnings']>[number];
interface DiskIndex {
  observed: Record<string, string>;
  owned: Record<string, string>;
}
const INDEX = '.faz-ai-library-index.json';
const digest = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
const fingerprint = (draft: Pick<ArtifactDraft, 'body' | 'files' | 'description'>) =>
  digest(
    JSON.stringify({
      body: draft.body,
      description: draft.description,
      files: [...draft.files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => [f.path, f.content, f.encoding]),
    }),
  );

/** Reconhece arquivos colados antes de escrever as cópias; só remove arquivos que o board gravou e ninguém editou. */
export class LibraryDisk {
  readonly warnings: Warning[] = [];
  readonly protectedPaths = new Set<string>();
  private index: DiskIndex;
  private mirror: ArtifactMirror;

  constructor(
    private dir: string,
    private repo: ArtifactRepo,
    private boardId: string,
    private tool: AiTool,
  ) {
    const file = path.join(dir, INDEX);
    this.index = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as DiskIndex) : { observed: {}, owned: {} };
    if (!this.index.observed || !this.index.owned) throw new Error('O índice da biblioteca está inválido. Os arquivos foram preservados.');
    this.mirror = new ArtifactMirror(dir, repo, boardId);
  }

  private rel(file: string): string {
    return path.relative(this.dir, file).split(path.sep).join('/');
  }

  private observation(file: string, content: string): string {
    const stat = fs.statSync(file);
    // Colar novamente o mesmo conteúdo é uma nova escolha, mesmo depois de removê-lo do board.
    return `${content}:${stat.mtimeMs}:${stat.ctimeMs}`;
  }

  private discover(): { kind: 'skill' | 'agent' | 'instructions'; file: string; valid: boolean }[] {
    const items = findSkills(this.dir).map((k) => ({
      kind: 'skill' as const,
      file: path.join(this.dir, k.rel, 'SKILL.md'),
      valid: k.valid,
    }));
    const texts: { kind: 'agent' | 'instructions'; file: string; valid: boolean }[] = [];
    const visit = (dir: string, kind: 'agent' | 'instructions', depth = 0) => {
      if (depth > 3 || !fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(file, kind, depth + 1);
        else if (entry.isFile() && /\.(md|mdc)$/i.test(entry.name)) texts.push({ kind, file, valid: true });
      }
    };
    visit(path.join(this.dir, 'agents'), 'agent');
    visit(path.join(this.dir, 'rules'), 'instructions');
    return [...items, ...texts];
  }

  readChanges(): void {
    for (const item of this.discover()) {
      const relative = this.rel(item.file);
      if (!item.valid) {
        this.warnings.push({ path: relative, reason: 'invalid' });
        continue;
      }
      const draft = readSource({ kind: item.kind, location: item.file }, { projectDir: this.dir, homeDir: '' }, this.tool, false);
      const entries = this.repo.list(this.boardId);
      const atPath = entries.find((a) => this.mirror.pathOf(a) === item.file);
      const sameName = atPath ? undefined : this.repo.get(this.boardId, draft.kind, draft.name);
      if (draft.missing) {
        this.warnings.push({ path: relative, reason: 'unreadable' });
        this.protectedPaths.add(item.kind === 'skill' ? path.dirname(item.file) : item.file);
        continue;
      }
      const signature = fingerprint(draft);
      // Uma remoção pelo board não deve reimportar a mesma pasta original a cada abertura.
      const observation = this.observation(item.file, signature);
      if (this.index.observed[relative] === observation) continue;
      const existing = atPath ? this.repo.get(this.boardId, atPath.kind, atPath.name) : sameName;
      if (existing && !atPath && existing.origin !== item.file) {
        const content = this.repo.content(existing.id);
        if (signature !== fingerprint({ ...content, description: existing.description })) {
          this.warnings.push({ path: relative, reason: 'duplicate' });
          continue;
        }
      } else {
        // O caminho e o modo dos cards permanecem estáveis quando a cópia é editada no disco.
        const imported: ArtifactDraft = existing
          ? {
              ...draft,
              name: existing.name,
              origin: existing.origin,
              originTool: existing.originTool,
              ...(draft.kind === 'agent' && atPath ? { meta: existing.meta } : {}),
            }
          : { ...draft, origin: this.mirror.pathOf({ ...draft, id: 'local' }) === item.file ? '' : item.file, originTool: '' };
        const unchanged = existing && signature === fingerprint({ ...this.repo.content(existing.id), description: existing.description });
        if (!unchanged) this.repo.upsert(this.boardId, imported, existing?.usage);
      }
      this.index.observed[relative] = observation;
    }
  }

  private wantedFiles(): string[] {
    return this.repo
      .list(this.boardId)
      .filter((a) => !a.missing)
      .flatMap((a) => {
        const main = this.mirror.pathOf(a);
        return !main ? [] : [main, ...(a.kind === 'skill' ? a.files.map((f) => path.join(path.dirname(main), ...f.split('/'))) : [])];
      });
  }

  removeObsolete(): void {
    const wanted = new Set(this.wantedFiles().map((file) => this.rel(file)));
    for (const [rel, hash] of Object.entries(this.index.owned)) {
      if (!isSafeRelPath(rel) || wanted.has(rel)) continue;
      const file = path.join(this.dir, ...rel.split('/'));
      if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) continue;
      const real = fs.realpathSync(file);
      if (!real.startsWith(fs.realpathSync(this.dir) + path.sep)) continue;
      if (digest(fs.readFileSync(file)) === hash) fs.unlinkSync(file);
    }
  }

  record(): void {
    const owned: Record<string, string> = {};
    for (const file of this.wantedFiles()) {
      if ([...this.protectedPaths].some((p) => file === p || file.startsWith(p + path.sep))) continue;
      if (fs.existsSync(file)) owned[this.rel(file)] = digest(fs.readFileSync(file));
    }
    for (const a of this.repo.list(this.boardId)) {
      const main = this.mirror.pathOf(a);
      if (!main || a.missing || this.warnings.some((w) => w.path === this.rel(main))) continue;
      const draft = readSource(
        { kind: a.kind === 'rule' ? 'instructions' : a.kind, location: main },
        { projectDir: this.dir, homeDir: '' },
        this.tool,
        false,
      );
      if (!draft.missing) this.index.observed[this.rel(main)] = this.observation(main, fingerprint(draft));
    }
    this.index.owned = owned;
    const file = path.join(this.dir, INDEX);
    fs.writeFileSync(file + '.tmp', JSON.stringify(this.index));
    fs.renameSync(file + '.tmp', file);
  }
}
