import { cardRef, type BoardState, type Card } from '../shared/model';
import { childrenOf, columnOf, isAiWorking, isLive } from '../shared/selectors';
import { MAINTENANCE_LIMIT, mapLimit } from './concurrency';
import { isWorktree, listWorktrees, type Worktree } from './storyCleanup';

/** Uma branch que a sincronização pode avançar. */
export interface SyncTarget {
  branch: string;
  /** a história dona da branch; ausente nas bases do fluxo (develop, principal) */
  storyId?: string;
}

/**
 * Branches que o board conhece (RF8): a principal, a develop (gitflow ligado e nome diferente da
 * principal) e a branch de cada história viva (sem pai, viva, em coluna aberta, com branch). Sem
 * repetição, as bases primeiro. As branches pessoais nunca entram: não são do board. Pura.
 */
export function syncTargets(s: BoardState, main: string): SyncTarget[] {
  const out: SyncTarget[] = [];
  const seen = new Set<string>();
  const push = (t: SyncTarget) => {
    if (!t.branch || seen.has(t.branch)) return;
    seen.add(t.branch);
    out.push(t);
  };
  push({ branch: main });
  if (s.board.git.gitflow && s.board.git.developBranch !== main) push({ branch: s.board.git.developBranch });
  for (const c of s.cards)
    if (!c.parentId && isLive(c) && c.branch !== '' && columnOf(s, c)?.category === 'open') push({ branch: c.branch, storyId: c.id });
  return out;
}

/** Por que uma branch ficou como estava: a chave estável do "uma vez por motivo" (RF14). */
export type SkipKind = 'running' | 'busyFolder' | 'dirty' | 'ahead' | 'diverged' | 'failed';

export interface BranchSyncDeps {
  /** o `git` assíncrono do boardHost (mesmo contrato do `CleanupDeps.git`) */
  git(args: string[], cwd: string): Promise<string>;
  log(line: string): void;
  /** pasta do projeto */
  cwd: string;
  snapshot(): BoardState;
  /** a principal do repositório (o mesmo `mainBranch` do boardHost) */
  mainBranch(repo: string): string;
}

/** O que a medição de uma branch encontrou: só leitura, nada mudou ainda. */
type Measure =
  | { kind: 'missing' }
  | { kind: 'same' }
  | { kind: 'behind'; old: string; next: string; behind: number }
  | { kind: 'skip'; skip: SkipKind; reason: string };

/** A primeira linha da mensagem de erro do git: é o que vai para o log. */
const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim();
const short = (sha: string) => sha.slice(0, 7);

/**
 * A sincronização das branches locais que o board conhece, a cada rodada do heartbeat (#722): avança
 * uma branch só por **fast-forward**, e só quando ela está atrás do origin sem nenhum commit à frente,
 * nenhuma execução da IA está na história dela e a pasta em que está aberta está limpa. Fechada, só a
 * ref anda (`update-ref` com o valor antigo, que recusa se ela mudou); aberta numa pasta, `merge
 * --ff-only` dentro dela. Nenhum outro caminho escreve: nada de rebase, merge com commit, reset,
 * checkout ou força, então nenhum caminho perde trabalho. As medições vão em paralelo (com o teto da
 * manutenção); as escritas, em série, porque os locks do git colidiriam. O fetch é da `Maintenance`.
 * Não depende da API do VSCode.
 */
export class BranchSyncer {
  /** o último motivo de pulo que foi para o log, por branch: o mesmo não se repete a cada rodada (RF14) */
  private lastSkip = new Map<string, string>();

  constructor(private deps: BranchSyncDeps) {}

  /** Uma passada. Supõe as refs do origin já atualizadas. Nunca rejeita. */
  async sync(): Promise<void> {
    try {
      await this.pass();
    } catch (e) {
      this.deps.log(`Branches: falha inesperada na sincronização: ${firstLine(e)}`);
    }
  }

  private async pass(): Promise<void> {
    const s = this.deps.snapshot();
    if (s.board.git.mode === 'off') return;
    const targets = syncTargets(s, this.deps.mainBranch(this.deps.cwd));
    // o que saiu dos alvos esquece o motivo: se voltar e o motivo persistir, aparece de novo
    const names = new Set(targets.map((t) => t.branch));
    for (const b of [...this.lastSkip.keys()]) if (!names.has(b)) this.lastSkip.delete(b);

    const measures = await mapLimit(targets, MAINTENANCE_LIMIT, (t) => this.measure(t.branch));
    for (const [i, t] of targets.entries()) {
      const m = measures[i]!;
      if (m.kind === 'missing' || m.kind === 'same') this.lastSkip.delete(t.branch);
      else if (m.kind === 'skip') this.skipped(t.branch, m.skip, m.reason);
      else await this.advance(t, m.old, m.next, m.behind);
    }
  }

  /** Só leitura: as duas pontas e quantos commits cada uma tem que a outra não tem. */
  private async measure(branch: string): Promise<Measure> {
    const old = await this.ref(`refs/heads/${branch}`);
    const next = old && (await this.ref(`refs/remotes/origin/${branch}`));
    if (!old || !next) return { kind: 'missing' }; // RF10: sem log, não há o que comparar
    if (old === next) return { kind: 'same' };
    let ahead: number, behind: number;
    try {
      const out = await this.deps.git(['rev-list', '--left-right', '--count', `${old}...${next}`], this.deps.cwd);
      [ahead, behind] = out.trim().split(/\s+/).map(Number) as [number, number];
    } catch (e) {
      return { kind: 'skip', skip: 'failed', reason: firstLine(e) };
    }
    if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return { kind: 'skip', skip: 'failed', reason: 'resposta inesperada do git' };
    if (ahead > 0 && behind > 0)
      return { kind: 'skip', skip: 'diverged', reason: `divergiu do origin (${ahead} commit(s) só aqui, ${behind} só no origin)` };
    if (ahead > 0) return { kind: 'skip', skip: 'ahead', reason: `tem ${ahead} commit(s) que o origin não tem` };
    if (behind === 0) return { kind: 'same' };
    return { kind: 'behind', old, next, behind };
  }

  /** O commit da ref, ou '' quando ela não existe. */
  private async ref(name: string): Promise<string> {
    try {
      return (await this.deps.git(['rev-parse', '--verify', '--quiet', name], this.deps.cwd)).trim();
    } catch {
      return '';
    }
  }

  /**
   * Avança uma branch atrás do origin, conferindo tudo de novo agora (RF11): o board e as pastas podem
   * ter mudado enquanto as outras eram medidas.
   */
  private async advance(t: SyncTarget, old: string, next: string, behind: number): Promise<void> {
    const s = this.deps.snapshot();
    const story = t.storyId ? s.cards.find((c) => c.id === t.storyId) : undefined;
    if (story && working(s, story)) return this.skipped(t.branch, 'running', `há uma execução da IA na história ${cardRef(story)}`);
    try {
      const open = (await listWorktrees(this.deps)).find((w) => w.branch === t.branch);
      if (!open) {
        // fechada: só a ref anda, sem tocar em pasta nenhuma; o valor antigo faz o git recusar se ela mudou
        await this.deps.git(
          ['update-ref', '-m', 'faz-ai: sincronização (fast-forward)', `refs/heads/${t.branch}`, next, old],
          this.deps.cwd,
        );
      } else {
        if (busyFolders(s, this.deps.cwd).some((dir) => isWorktree(open, dir)))
          return this.skipped(t.branch, 'busyFolder', `a pasta ${open.path} está em uso por uma execução da IA`);
        if ((await this.deps.git(['status', '--porcelain'], open.path)).trim())
          return this.skipped(t.branch, 'dirty', `a pasta ${open.path} tem alterações ou arquivos não rastreados`);
        // a pasta ainda está na branch e no commit medidos: senão o fast-forward cairia em outra branch
        if (!(await this.stillAt(open, t.branch, old)))
          return this.skipped(t.branch, 'failed', `a pasta ${open.path} mudou durante a sincronização`);
        await this.deps.git(['merge', '--ff-only', '--quiet', next], open.path);
      }
    } catch (e) {
      // RF17: a branch fica como estava (o git não escreve nada quando recusa) e a próxima segue
      return this.skipped(t.branch, 'failed', firstLine(e));
    }
    this.lastSkip.delete(t.branch);
    this.deps.log(`Branches: ${t.branch} atualizada de ${short(old)} para ${short(next)} (${behind} commit(s) do origin).`);
  }

  private async stillAt(open: Worktree, branch: string, old: string): Promise<boolean> {
    const head = (await this.deps.git(['rev-parse', '--symbolic-full-name', 'HEAD'], open.path)).trim();
    const sha = (await this.deps.git(['rev-parse', 'HEAD'], open.path)).trim();
    return head === `refs/heads/${branch}` && sha === old;
  }

  /** Uma linha por (branch, motivo): a falha leva a mensagem na chave, para uma causa nova aparecer. */
  private skipped(branch: string, kind: SkipKind, reason: string): void {
    const key = kind === 'failed' ? `${kind}:${reason}` : kind;
    if (this.lastSkip.get(branch) === key) return;
    this.lastSkip.set(branch, key);
    this.deps.log(`Branches: ${branch} não foi atualizada: ${reason}.`);
  }
}

/** A IA está na história ou numa sub-tarefa viva dela. */
const working = (s: BoardState, story: Card): boolean =>
  isAiWorking(s, story) || childrenOf(s, story.id).some((k) => isLive(k) && isAiWorking(s, k));

/**
 * As pastas em que uma execução da IA está agora: a pasta de trabalho da história (ou da história da
 * sub-tarefa), que é a `worktreePath` dela ou, sem ela, a pasta do projeto. Cobre o modo branch e as
 * fases de texto, que rodam na pasta do projeto.
 */
function busyFolders(s: BoardState, projectDir: string): string[] {
  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const out = new Set<string>();
  for (const c of s.cards) {
    if (!isLive(c) || !isAiWorking(s, c)) continue;
    const story = c.parentId ? byId.get(c.parentId) : c;
    out.add(story?.worktreePath || projectDir);
  }
  return [...out];
}
