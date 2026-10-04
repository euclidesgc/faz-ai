import { cardRef, type BoardState, type Card, type Column } from '../shared/model';
import { columnOf, columnsOf, openChildren } from '../shared/selectors';
import { isDelivered } from '../shared/story';
import { removeWorktree } from './git';
import type { MessageRouter } from './panel/messageRouter';

export interface MergeDeps {
  /** roda o `gh` na pasta do projeto; rejeita com a mensagem de erro do comando */
  gh(args: string[], cwd: string): Promise<string>;
  log(line: string): void;
  cwd: string;
  /** remove a pasta de trabalho da história depois do merge */
  removeWorktree?: (projectDir: string, worktreePath: string) => void;
}

const AUTHOR = 'Faz AI';

/**
 * Conclui a história: comenta, move para a coluna de conclusão e, no modo `worktree`, remove a
 * pasta de trabalho. Se a remoção falhar, o motivo vai para o log e a conclusão permanece.
 *
 * `extra`, quando presente, acrescenta um aviso ao corpo do comentário — é o gancho que o `MergeWatcher`
 * usa para o aviso de sub-tarefas em aberto; `allowOpenChildren` deixa o `card.move` concluir a história
 * mesmo com elas (o merge já aconteceu). O `AutoMerger` não usa nenhum dos dois.
 */
export function concludeStory(
  router: MessageRouter,
  deps: MergeDeps,
  card: Card,
  done: Column,
  body: string,
  extra?: string,
  allowOpenChildren = false,
): void {
  const ref = cardRef(card);
  router.handle({ type: 'comment.add', cardId: card.id, body: extra ? `${body} ${extra}` : body }, { author: AUTHOR, source: 'ai' });
  router.handle(
    { type: 'card.move', cardId: card.id, columnId: done.id, position: Number.MAX_SAFE_INTEGER, allowOpenChildren },
    { author: AUTHOR },
  );

  if (router.snapshot().board.git.mode === 'worktree' && card.worktreePath) {
    try {
      (deps.removeWorktree ?? removeWorktree)(deps.cwd, card.worktreePath);
      router.handle({ type: 'card.workspace.clear', cardId: card.id });
    } catch (e) {
      // alterações não commitadas na worktree: fica para a pessoa decidir
      deps.log(`[${ref}] A pasta de trabalho ${card.worktreePath} não foi removida: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/**
 * Merge automático na homologação: quando uma pessoa aprova uma história cuja próxima coluna é a
 * de conclusão, faz o merge do PR dela e só então conclui o card. Se o merge falhar, o card fica
 * bloqueado com o erro, em vez de aparecer como concluído com o PR aberto.
 */
export class AutoMerger {
  private merging = new Set<string>();

  constructor(
    private router: MessageRouter,
    private deps: MergeDeps,
  ) {
    router.onDidApprove((cardId) => void this.onApproved(cardId));
  }

  /** Coluna de conclusão logo depois da coluna do card, se for o caso de fazer o merge ao aprovar. */
  private target(card: Card) {
    const s = this.router.snapshot();
    if (!s.board.git.autoMerge || card.parentId || !card.prUrl || this.merging.has(card.id)) return null;
    const columns = columnsOf(s, card.workflowId);
    const next = columns[columns.findIndex((c) => c.id === card.columnId) + 1];
    return next?.category === 'done' ? next : null;
  }

  async onApproved(cardId: string): Promise<void> {
    const state = this.router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    const done = card && this.target(card);
    if (!card || !done) return;
    const ref = cardRef(card);
    const block = (reason: string) =>
      this.router.handle({ type: 'card.status.set', cardId, status: 'blocked', note: reason }, { author: AUTHOR, source: 'ai' });

    const openKids = openChildren(state, cardId).length;
    if (openKids && state.board.rules.blockDoneWithOpenChildren)
      return void block(`O merge de ${card.prUrl} não foi feito: ${openKids} sub-tarefa(s) da história ainda em aberto.`);

    this.merging.add(cardId);
    // "Em execução" tira o card da fila da IA enquanto o merge acontece
    this.router.handle({ type: 'card.status.set', cardId, status: 'running' }, { author: AUTHOR, source: 'ai' });
    this.deps.log(`[${ref}] Merge de ${card.prUrl} (${state.board.git.mergeMethod}).`);
    try {
      await this.deps.gh(['pr', 'merge', card.prUrl, `--${state.board.git.mergeMethod}`], this.deps.cwd);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.deps.log(`[${ref}] Merge falhou: ${message}`);
      this.merging.delete(cardId);
      return void block(`O merge de ${card.prUrl} falhou: ${message}`);
    }
    this.merging.delete(cardId);
    this.deps.log(`[${ref}] Merge feito; card concluído.`);
    concludeStory(this.router, this.deps, card, done, `Merge de ${card.prUrl} feito.`);
  }
}

export interface MergeWatchDeps extends MergeDeps {
  now(): number;
  /** esta janela é a dona do board; padrão: sempre (RF15) */
  canRun?(): boolean;
  /**
   * Gancho do fim da rodada: é por aqui que a rodada de publicação (#49) acontece, na mesma rodada,
   * com o mesmo liga/desliga e o mesmo intervalo da detecção de merges. Um erro dele é descartado.
   */
  afterRound?: () => Promise<void>;
}

/** Histórias cujo pull request o watcher consulta: as entregues (`isDelivered`), sem regra nova. */
export const mergeWatchTargets = (s: BoardState): Card[] => s.cards.filter((c) => isDelivered(s, c));

/** O que o `gh pr view --json state,mergedAt,mergeCommit` devolve, no que interessa. */
interface PullRequestView {
  state: string;
  mergedAt: string | null;
  mergeCommit: { oid?: string } | null;
}

/** Converte a saída do `gh`; qualquer coisa fora do formato esperado é falha de consulta, não "aberto". */
function parsePullRequest(out: string): PullRequestView {
  let data: unknown;
  try {
    data = JSON.parse(out);
  } catch {
    throw new Error(`resposta inesperada do gh: ${out.trim().slice(0, 200) || '(vazia)'}`);
  }
  if (!data || typeof data !== 'object' || typeof (data as { state?: unknown }).state !== 'string')
    throw new Error(`resposta inesperada do gh: ${out.trim().slice(0, 200) || '(vazia)'}`);
  const d = data as { state: string; mergedAt?: unknown; mergeCommit?: unknown };
  const oid = d.mergeCommit && typeof d.mergeCommit === 'object' ? (d.mergeCommit as { oid?: unknown }).oid : undefined;
  return {
    state: d.state,
    mergedAt: typeof d.mergedAt === 'string' && d.mergedAt ? d.mergedAt : null,
    mergeCommit: typeof oid === 'string' ? { oid } : null,
  };
}

/** Coluna de conclusão logo depois da coluna da história, se houver. */
function doneAfter(s: BoardState, card: Card): Column | null {
  const columns = columnsOf(s, card.workflowId);
  const next = columns[columns.findIndex((c) => c.id === card.columnId) + 1];
  return next?.category === 'done' ? next : null;
}

/**
 * Parte estável da frase do aviso de pull request fechado. O "já avisei" é verificado na própria
 * conversa (URL + este trecho), não em memória: sobrevive a fechar e reabrir o board. Mudar a frase
 * faz o aviso aparecer de novo nos cards antigos.
 */
const CLOSED_MARK = 'foi fechado sem merge';

/**
 * Rotina periódica: para cada história entregue (modo autônomo, na última coluna da IA, com pull
 * request), pergunta ao `gh` o estado do pull request. Mergeado: grava o commit e conclui a história;
 * fechado sem merge: avisa na conversa uma vez; aberto: nada. Falhas do `gh` vão para o log, sem
 * repetir enquanto a causa for a mesma. Nenhum caminho bloqueia card nem lança para fora de `tick()`.
 * Não depende da API do VSCode.
 */
export class MergeWatcher {
  private lastRoundAt: number;
  /** histórias em conclusão nesta rodada (RF11) */
  private checking = new Set<string>();
  /** última falha registrada no log (RF10) */
  private lastFailure: string | null = null;
  private busy = false;

  constructor(
    private router: MessageRouter,
    private deps: MergeWatchDeps,
  ) {
    // a primeira rodada acontece um intervalo depois de o board abrir, não na abertura (como o Heartbeat)
    this.lastRoundAt = deps.now();
  }

  /** Chamado de tempos em tempos (ex.: a cada minuto): começa uma rodada se o intervalo já passou. */
  tick(): void {
    if (this.deps.canRun && !this.deps.canRun()) return;
    const { git } = this.router.snapshot().board;
    if (!git.watchMerges || this.busy) return;
    if (this.deps.now() - this.lastRoundAt >= git.watchMergeMinutes * 60_000) void this.round();
  }

  /** Uma rodada agora, mesmo com o watcher desligado. Devolve quantas histórias foram consultadas. */
  runNow(): Promise<number> {
    return this.round();
  }

  private async round(): Promise<number> {
    this.busy = true;
    this.lastRoundAt = this.deps.now();
    try {
      // uma a uma, não em paralelo: ordem previsível no log e sem rajada de processos gh
      const targets = mergeWatchTargets(this.router.snapshot());
      for (const card of targets) await this.check(card);
      // depois do laço, não antes: uma história cujo merge é detectado agora e cuja versão já saiu é
      // concluída e arquivada na mesma rodada. O `catch` é a rede de segurança — quem está no gancho
      // trata as próprias falhas, e nada daqui pode fazer o `tick()` rejeitar.
      if (this.deps.afterRound) {
        try {
          await this.deps.afterRound();
        } catch {
          /* o gancho é responsável pelo próprio log */
        }
      }
      return targets.length;
    } finally {
      this.busy = false;
    }
  }

  private async check(card: Card): Promise<void> {
    if (this.checking.has(card.id)) return;
    let pr: PullRequestView;
    try {
      pr = parsePullRequest(await this.deps.gh(['pr', 'view', card.prUrl, '--json', 'state,mergedAt,mergeCommit'], this.deps.cwd));
    } catch (e) {
      return this.noteFailure(e instanceof Error ? e.message : String(e));
    }
    this.lastFailure = null;
    try {
      if (pr.state === 'MERGED' || pr.mergedAt) this.finish(card, pr.mergeCommit?.oid ?? '');
      else if (pr.state === 'CLOSED') this.announceClosed(card);
    } catch (e) {
      this.noteFailure(`[${cardRef(card)}] ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Grava o commit do merge e conclui a história. O commit vai antes do movimento: nunca falta numa história já concluída. */
  private finish(card: Card, oid: string): void {
    const s = this.router.snapshot();
    const live = s.cards.find((c) => c.id === card.id);
    // a situação pode ter mudado enquanto o gh respondia (outra rodada concluiu, a pessoa moveu)
    if (!live || this.checking.has(live.id) || !isDelivered(s, live)) return;
    const done = doneAfter(s, live);
    if (!done) return; // sem coluna de conclusão depois: nada a fazer (RF4)
    const ref = cardRef(live);
    this.checking.add(live.id);
    try {
      this.router.handle({ type: 'card.merge.set', cardId: live.id, commit: oid }, { author: AUTHOR });
      const openKids = openChildren(s, live.id).length;
      const extra = openKids ? `Havia ${openKids} sub-tarefa(s) em aberto no momento do merge.` : undefined;
      concludeStory(
        this.router,
        this.deps,
        live,
        done,
        `Pull request ${live.prUrl} mergeado (commit ${oid || 'não informado'}). História concluída pelo board.`,
        extra,
        openKids > 0,
      );
      this.deps.log(`[${ref}] Pull request ${live.prUrl} mergeado (${oid || 'sem commit'}); história concluída.`);
    } finally {
      this.checking.delete(live.id);
    }
  }

  /** Registra na conversa, uma única vez, que o pull request foi fechado sem merge; não move nada (RF7). */
  private announceClosed(card: Card): void {
    const s = this.router.snapshot();
    const told = s.comments.some((c) => c.cardId === card.id && c.body.includes(card.prUrl) && c.body.includes(CLOSED_MARK));
    if (told) return;
    const column = columnOf(s, card)?.name ?? '';
    this.router.handle(
      { type: 'comment.add', cardId: card.id, body: `Pull request ${card.prUrl} ${CLOSED_MARK}. A história continua em ${column}.` },
      { author: AUTHOR, source: 'ai' },
    );
    this.deps.log(`[${cardRef(card)}] Pull request ${card.prUrl} fechado sem merge; a história fica onde está.`);
  }

  /** Uma linha de log por causa: a mesma falha em dez histórias e dez rodadas aparece uma vez (RF10). */
  private noteFailure(message: string): void {
    if (message === this.lastFailure) return;
    this.lastFailure = message;
    this.deps.log(`Merges: ${message}`);
  }
}
