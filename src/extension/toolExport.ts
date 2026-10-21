// "Exportar para a ferramenta" (#901, parte 1b da #623): monta a prévia e grava os artefatos do board no
// formato da ferramenta. Lê só o `ArtifactRepo` (nunca definições MCP nem credenciais) e o disco; o board não muda.
import * as fs from 'fs';
import * as path from 'path';
import { isSafeRelPath } from '../shared/artifacts';
import type { AiTool } from '../shared/harness';
import {
  itemOutcome,
  type ExportFile,
  type ExportItem,
  type ExportKind,
  type ExportOutcome,
  type ExportPlan,
  type ExportResult,
  type ExportTarget,
  type RefuseReason,
} from '../shared/toolExport';
import type { ArtifactRepo } from './repositories/artifactRepo';
import { TOOL_ADAPTERS } from './toolAdapters';
import type { ExportSource, ToolAdapter } from './toolAdapters/types';

export interface ExportDirs {
  projectDir?: string;
  homeDir: string;
}

const KINDS: readonly ExportKind[] = ['rule', 'skill', 'agent'];
const EXTRAS_LIMIT = 200;

const within = (parent: string, child: string): boolean => child === parent || child.startsWith(parent + path.sep);

/** O caminho real do ancestral existente mais próximo, com o resto (que ainda não existe) acrescentado. */
function realOfNearest(p: string): string | undefined {
  const rest: string[] = [];
  let cur = p;
  for (;;) {
    try {
      fs.lstatSync(cur);
      return path.join(fs.realpathSync(cur), ...rest);
    } catch (e) {
      // link quebrado: existe, mas não resolve
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
      const up = path.dirname(cur);
      if (up === cur) return undefined;
      rest.unshift(path.basename(cur));
      cur = up;
    }
  }
}

/** Confere o caminho de um arquivo sem gravar nada (a prévia e a gravação usam a mesma conferência). */
export function checkPath(base: string, root: string, rel: string): RefuseReason | undefined {
  if (!isSafeRelPath(rel) || !rel.startsWith(`${root}/`)) return 'unsafe-path';
  const abs = path.join(base, ...rel.split('/'));
  const rootReal = realOfNearest(path.join(base, root));
  const dirReal = realOfNearest(path.dirname(abs));
  if (!rootReal || !dirReal || !within(rootReal, dirReal)) return 'outside-root';
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) return 'symlink';
    if (st.isDirectory()) return 'not-file';
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return 'outside-root';
  }
  return undefined;
}

/** Confere o caminho e grava um arquivo; nunca apaga e nunca segue link. */
export function writeInside(
  base: string,
  root: string,
  rel: string,
  data: Buffer,
  replace: boolean,
): { outcome: ExportOutcome; reason?: RefuseReason; error?: string } {
  const reason = checkPath(base, root, rel);
  if (reason) return { outcome: 'refused', reason };
  const abs = path.join(base, ...rel.split('/'));
  try {
    const existed = fs.existsSync(abs);
    if (existed && !replace) return { outcome: 'skipped' };
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (existed) fs.writeFileSync(abs, data);
    else fs.writeFileSync(abs, data, { flag: 'wx' });
    return { outcome: existed ? 'replaced' : 'written' };
  } catch (e) {
    // o arquivo apareceu depois da prévia: nunca sobrescreve sem a opção
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return { outcome: 'skipped' };
    return { outcome: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/** Arquivos que já estão na pasta da skill no destino e que o board não tem (relativos à pasta). */
function extrasOf(dir: string, own: Set<string>): string[] {
  const out: string[] = [];
  const walk = (d: string, prefix: string): void => {
    let names: string[];
    try {
      names = fs.readdirSync(d).sort();
    } catch {
      return;
    }
    for (const n of names) {
      if (out.length >= EXTRAS_LIMIT) return;
      const abs = path.join(d, n);
      const rel = prefix ? `${prefix}/${n}` : n;
      let st: fs.Stats;
      try {
        st = fs.lstatSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(abs, rel);
      else if (!own.has(abs)) out.push(rel);
    }
  };
  walk(dir, '');
  return out;
}

export class ToolExporter {
  constructor(
    private repo: ArtifactRepo,
    private boardId: string,
    private dirs: ExportDirs,
    private defaultAgent: string,
    private adapters: Partial<Record<AiTool, ToolAdapter>> = TOOL_ADAPTERS,
  ) {}

  /** só lê o board e o disco: renderiza, confere cada caminho e diz o que já existe */
  plan(tool: AiTool, target: ExportTarget): ExportPlan {
    return this.build(tool, target);
  }

  /** refaz a prévia (o disco pode ter mudado), grava os escolhidos e devolve o resultado por arquivo */
  apply(tool: AiTool, target: ExportTarget, ids: string[], replace: boolean): ExportResult {
    const base = this.baseOf(target);
    if (!base) throw new Error('Não há pasta de projeto aberta para exportar.');
    const adapter = this.adapterOf(tool);
    const plan = this.build(tool, target, new Set(ids));
    const result: ExportResult = { tool, target, files: [] };
    const done = new Set<string>();
    for (const item of plan.items) {
      const decision = itemOutcome(item, replace);
      for (const f of item.files) {
        if (decision === 'refused') {
          result.files.push({ item: item.id, path: f.path, outcome: 'refused', reason: f.refused ?? item.blocked });
        } else if (decision === 'skip') {
          result.files.push({ item: item.id, path: f.path, outcome: 'skipped' });
        } else if (!done.has(f.path)) {
          done.add(f.path);
          const rel = path.relative(base, f.path).split(path.sep).join('/');
          const data = this.dataOf(f.path);
          const r = writeInside(base, adapter.root, rel, data ?? Buffer.alloc(0), replace);
          result.files.push({ item: item.id, path: f.path, ...r });
        }
      }
      if (!item.files.length && item.blocked) result.files.push({ item: item.id, path: '', outcome: 'refused', reason: item.blocked });
    }
    return result;
  }

  private rendered = new Map<string, Buffer>();
  private dataOf = (abs: string): Buffer | undefined => this.rendered.get(abs);

  private adapterOf(tool: AiTool): ToolAdapter {
    const a = this.adapters[tool];
    if (!a) throw new Error(`A ferramenta "${tool}" não tem formato de exportação.`);
    return a;
  }

  private baseOf(target: ExportTarget): string | null {
    return target === 'project' ? (this.dirs.projectDir ?? null) : this.dirs.homeDir;
  }

  private build(tool: AiTool, target: ExportTarget, only?: Set<string>): ExportPlan {
    const adapter = this.adapterOf(tool);
    const base = this.baseOf(target);
    const plan: ExportPlan = {
      tool,
      target,
      roots: {
        project: this.dirs.projectDir ? path.join(this.dirs.projectDir, adapter.root) : null,
        user: path.join(this.dirs.homeDir, adapter.root),
      },
      items: [],
      mcpCount: 0,
    };
    const all = this.repo.list(this.boardId);
    plan.mcpCount = all.filter((a) => a.kind === 'mcp').length;
    if (!base) return plan;
    this.rendered.clear();
    for (const kind of KINDS) {
      const rows = all.filter((a) => a.kind === kind && (!only || only.has(a.id)));
      const sources: ExportSource[] = [];
      const blocked = new Map<string, RefuseReason>();
      for (const r of rows) {
        const row = this.repo.get(this.boardId, kind, r.name);
        if (r.missing || !row) blocked.set(r.id, 'missing');
        else if (!adapter.supports(kind, target)) blocked.set(r.id, 'unsupported');
        else sources.push({ artifact: row, ...this.repo.content(r.id), isDefaultAgent: kind === 'agent' && r.name === this.defaultAgent });
      }
      const out = sources.length ? adapter.render(kind, sources, target) : { files: [], refused: [] };
      for (const x of out.refused) blocked.set(x.id, x.reason);
      const own = new Set(out.files.map((f) => path.join(base, ...f.rel.split('/'))));
      for (const r of rows) {
        const src = sources.find((s) => s.artifact.id === r.id);
        const files: ExportFile[] = out.files
          .filter((f) => f.from.includes(r.id))
          .map((f) => {
            const abs = path.join(base, ...f.rel.split('/'));
            this.rendered.set(abs, f.data);
            return {
              path: abs,
              exists: fs.existsSync(abs) || isLink(abs),
              refused: checkPath(base, adapter.root, f.rel),
              ...(f.from.length > 1 ? { shared: true } : {}),
            };
          });
        plan.items.push({
          id: r.id,
          kind,
          name: r.name,
          description: r.description,
          usage: r.usage,
          flowSkill: !!r.generated,
          ...(blocked.has(r.id) ? { blocked: blocked.get(r.id) } : {}),
          files: blocked.has(r.id) ? [] : files,
          losses: src ? adapter.losses(src) : [],
          extras:
            kind === 'skill' && src && !blocked.has(r.id) ? extrasOf(path.join(base, ...adapter.skillDir(r.name).split('/')), own) : [],
        } satisfies ExportItem);
      }
    }
    return plan;
  }
}

const isLink = (p: string): boolean => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};
