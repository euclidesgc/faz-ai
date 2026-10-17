// Cópia de leitura dos artefatos do board (#615): grava skills, regras e agentes em
// <storage>/artifacts/<workspaceKey>/ para a IA ler pelo caminho. A pasta é toda do board: o que não
// corresponde a um artefato é apagado. O servidor MCP não é gravado (tem segredos).
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSafeRelPath, type BoardArtifact } from '../shared/artifacts';
import type { ArtifactRepo } from './repositories/artifactRepo';
import { isSafeSegment } from './attachments';

type Ref = Pick<BoardArtifact, 'id' | 'kind' | 'name'>;

const sha1 = (b: Buffer): string => crypto.createHash('sha1').update(b).digest('hex');
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** O agente na cópia: só `name` e `description` e as instruções, sem as chaves `faz-ai-*`. */
function agentText(a: { name: string; description: string }, body: string): string {
  const oneLine = a.description.replace(/\r?\n/g, ' ').trim();
  return `---\nname: ${JSON.stringify(a.name)}\ndescription: ${JSON.stringify(oneLine)}\n---\n\n${body.trim()}\n`;
}

export class ArtifactMirror {
  constructor(
    private dir: string,
    private repo: ArtifactRepo,
    private boardId: string,
    private log: (m: string) => void = () => {},
    private preserveUnknown = false,
    private protectedPaths: ReadonlySet<string> = new Set(),
  ) {}

  /** Caminho relativo à pasta (com `/`) ou '' quando o artefato não tem cópia ou o nome escapa dela. */
  private relOf(a: Ref): string {
    if (a.kind === 'skill') return isSafeSegment(a.name) ? `skills/${a.name}/SKILL.md` : '';
    if (a.kind === 'agent') return isSafeSegment(a.name) ? `agents/${a.name}.md` : '';
    if (a.kind === 'rule') {
      const base = path.posix.basename(a.name);
      return isSafeSegment(a.id) && isSafeSegment(base) ? `rules/${a.id}/${base}` : '';
    }
    return '';
  }

  /** Caminho de cada artefato, sem I/O. */
  pathOf(a: Ref): string {
    const rel = this.relOf(a);
    return rel ? path.join(this.dir, ...rel.split('/')) : '';
  }

  /** Grava o que falta ou mudou e apaga o que não é mais do board. Nunca lança: falha vai para o log. */
  ensure(): void {
    try {
      const want = this.desired();
      fs.mkdirSync(this.dir, { recursive: true });
      if (!this.preserveUnknown) this.sweep(this.dir, '', want);
      for (const [rel, data] of want) this.write(rel, data);
    } catch (e) {
      this.log(`Cópia de leitura dos artefatos: ${errText(e)}`);
    }
  }

  /** Caminho relativo → conteúdo, de tudo o que deve existir na pasta. */
  private desired(): Map<string, Buffer> {
    const want = new Map<string, Buffer>();
    for (const a of this.repo.list(this.boardId)) {
      if (a.missing || a.kind === 'mcp') continue;
      const rel = this.relOf(a);
      if (!rel) {
        this.log(`Cópia de leitura: "${a.name}" (${a.kind}) não é um nome seguro; não foi gravado`);
        continue;
      }
      try {
        const { body, files } = this.repo.content(a.id);
        if (a.kind === 'skill') {
          const root = rel.slice(0, rel.lastIndexOf('/'));
          for (const f of files) {
            if (!isSafeRelPath(f.path)) {
              this.log(`Cópia de leitura: caminho fora da pasta recusado em "${a.name}": ${f.path}`);
              continue;
            }
            want.set(`${root}/${f.path}`, Buffer.from(f.content, f.encoding === 'base64' ? 'base64' : 'utf8'));
          }
        }
        want.set(rel, Buffer.from(a.kind === 'agent' ? agentText(a, body) : body, 'utf8'));
      } catch (e) {
        this.log(`Cópia de leitura: não leu "${a.name}": ${errText(e)}`);
      }
    }
    return want;
  }

  /** Apaga o que não é um arquivo desejado nem pasta de um (inclusive pasta onde deveria haver arquivo). */
  private sweep(abs: string, rel: string, want: Map<string, Buffer>): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (e) {
      this.log(`Cópia de leitura: não leu ${abs}: ${errText(e)}`);
      return;
    }
    for (const e of entries) {
      if (!rel && e.name === '.faz-ai-library') continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = path.join(abs, e.name);
      try {
        if (e.isDirectory()) {
          const isParent = [...want.keys()].some((k) => k.startsWith(`${childRel}/`));
          if (isParent) this.sweep(childAbs, childRel, want);
          else fs.rmSync(childAbs, { recursive: true, force: true });
        } else if (!want.has(childRel)) fs.rmSync(childAbs, { force: true });
        else if (e.isSymbolicLink()) fs.rmSync(childAbs, { force: true });
      } catch (err) {
        this.log(`Cópia de leitura: não apagou ${childAbs}: ${errText(err)}`);
      }
    }
  }

  private write(rel: string, data: Buffer): void {
    const file = path.join(this.dir, ...rel.split('/'));
    try {
      if ([...this.protectedPaths].some((p) => file === p || file.startsWith(p + path.sep))) return;
      if (this.preserveUnknown) {
        let current = this.dir;
        for (const segment of rel.split('/')) {
          current = path.join(current, segment);
          if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Link simbólico na pasta da biblioteca.');
        }
      }
      const st = fs.statSync(file, { throwIfNoEntry: false });
      if (st?.isFile() && st.size === data.length && sha1(fs.readFileSync(file)) === sha1(data)) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
    } catch (e) {
      this.log(`Cópia de leitura: não gravou ${file}: ${errText(e)}`);
    }
  }
}
