import { cardRef, type BoardState, type Card, type Column } from '../shared/model';
import { columnOf, columnsOf, openChildren } from '../shared/selectors';
import { isDelivered } from '../shared/story';
import { gitNotice } from '../shared/gitNotices';
import { removeWorktree } from './git';
import type { MessageRouter } from './panel/messageRouter';
import { cleanUpStory, parsePullRequestFacts, PR_FIELDS, type CleanupDeps, type PullRequestFacts } from './storyCleanup';

/**
 * O que o merge precisa além da limpeza (#464): o `gh`, o `git` assíncrono e o detector da principal
 * vêm de `CleanupDeps`, com o `git` obrigatório como no `ReleaseDeps`.
 */
export type MergeDeps = CleanupDeps;

const AUTHOR = 'Faz AI';

/** A limpeza depois do merge (#464) só existe com o gitflow ligado e o git do board em uso. */
const cleanupOn = (s: BoardState): boolean => s.board.git.gitflow && s.board.git.mode !== 'off';

/**
 * Conclui a história: comenta, move para a coluna de conclusão e, no modo `worktree` com o gitflow
 * desligado, remove a pasta de trabalho (com o gitflow ligado a worktree é da `cleanUpStory`, que
 * antes confere o que está pendente). Se a remoção falhar, o motivo vai para o log e a conclusão permanece.
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

  const s = router.snapshot();
  if (s.board.git.mode === 'worktree' && !cleanupOn(s) && card.worktreePath) {
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
 * Conclui a história e, com o gitflow ligado, limpa o que o merge deixou para trás (worktree, branches,
 * `develop`). Sem `pr` (o `gh pr view` falhou), a limpeza não apaga nada e avisa na conversa: apagar
 * uma branch sem confirmar o pull request é o risco que o RF8 proíbe. Nunca rejeita.
 */
export async function concludeAndCleanUp(
  router: MessageRouter,
  deps: MergeDeps,
  card: Card,
  done: Column,
  body: string,
  pr: PullRequestFacts | Error,
  extra?: string,
  allowOpenChildren = false,
): Promise<void> {
  concludeStory(router, deps, card, done, body, extra, allowOpenChildren);
  if (!cleanupOn(router.snapshot())) return;
  const ref = cardRef(card);
  try {
    if (pr instanceof Error) {
      router.handle(
        { type: 'comment.add', cardId: card.id, body: gitNotice('cleanup.noPullRequest', { pr: card.prUrl, error: pr.message }) },
        { author: AUTHOR, source: 'ai' },
      );
      deps.log(`[${ref}] Limpeza pulada: não deu para confirmar o pull request ${card.prUrl} (${pr.message}).`);
      return;
    }
    await cleanUpStory(router, deps, card, pr);
  } catch (e) {
    // a limpeza trata as próprias falhas; isto é só a rede de segurança da conclusão
    deps.log(`[${ref}] Falha inesperada na limpeza: ${e instanceof Error ? e.message : String(e)}`);
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
    // com o gitflow ligado, a limpeza precisa dos fatos do pull request (branch, sha); sem eles o
    // merge segue como sempre e a limpeza só avisa. Desligado, nenhuma chamada a mais ao gh.
    let pr: PullRequestFacts | Error = new Error('gitflow desligado');
    if (cleanupOn(state)) {
      try {
        pr = parsePullRequestFacts(await this.deps.gh(['pr', 'view', card.prUrl, '--json', PR_FIELDS], this.deps.cwd), card.prUrl);
      } catch (e) {
        pr = e instanceof Error ? e : new Error(String(e));
        this.deps.log(`[${ref}] Consulta de ${card.prUrl} falhou: ${pr.message}`);
      }
    }
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
    await concludeAndCleanUp(this.router, this.deps, card, done, `Merge de ${card.prUrl} feito.`, pr);
  }
}

export interface MergeWatchDeps extends MergeDeps {
  /**
   * Gancho do fim da rodada: é por aqui que a rodada de publicação (#49) acontece, na mesma rodada da
   * detecção de merges. Um erro dele é descartado.
   */
  afterRound?: () => Promise<void>;
}

/** Histórias cujo pull request o watcher consulta: as entregues (`isDelivered`), sem regra nova. */
export const mergeWatchTargets = (s: BoardState): Card[] => s.cards.filter((c) => isDelivered(s, c));

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
 * Detecção de merges, chamada a cada rodada do heartbeat (sem timer nem liga/desliga próprios): para cada história entregue (modo autônomo, na última coluna da IA, com pull
 * request), pergunta ao `gh` o estado do pull request. Mergeado: grava o commit e conclui a história;
 * fechado sem merge: avisa na conversa uma vez; aberto: nada. Falhas do `gh` vão para o log, sem
 * repetir enquanto a causa for a mesma. Nenhum caminho bloqueia card nem lança para fora de `runNow()`.
 * Não depende da API do VSCode.
 */
export class MergeWatcher {
  /** histórias em conclusão nesta rodada (RF11) */
  private checking = new Set<string>();
  /** última falha registrada no log (RF10) */
  private lastFailure: string | null = null;
  private busy = false;

  constructor(
    private router: MessageRouter,
    private deps: MergeWatchDeps,
  ) {}

  /**
   * Uma rodada agora. Devolve quantas histórias foram consultadas; com uma rodada ainda em andamento,
   * não começa outra e devolve 0. Nunca rejeita.
   */
  async runNow(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try {
      // uma a uma, não em paralelo: ordem previsível no log e sem rajada de processos gh
      const targets = mergeWatchTargets(this.router.snapshot());
      for (const card of targets) await this.check(card);
      // depois do laço, não antes: uma história cujo merge é detectado agora e cuja versão já saiu é
      // concluída e arquivada na mesma rodada. O `catch` é a rede de segurança — quem está no gancho
      // trata as próprias falhas, e nada daqui pode fazer a rodada rejeitar.
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
    let pr: PullRequestFacts;
    try {
      pr = parsePullRequestFacts(await this.deps.gh(['pr', 'view', card.prUrl, '--json', PR_FIELDS], this.deps.cwd), card.prUrl);
    } catch (e) {
      return this.noteFailure(e instanceof Error ? e.message : String(e));
    }
    this.lastFailure = null;
    try {
      // a limpeza roda em série, dentro da rodada: ordem previsível e sem dois gits na mesma branch
      if (pr.state === 'MERGED' || pr.mergedAt) await this.finish(card, pr);
      else if (pr.state === 'CLOSED') this.announceClosed(card);
    } catch (e) {
      this.noteFailure(`[${cardRef(card)}] ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Grava o commit do merge e conclui a história. O commit vai antes do movimento: nunca falta numa história já concluída. */
  private async finish(card: Card, pr: PullRequestFacts): Promise<void> {
    const oid = pr.mergeCommit;
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
      this.deps.log(`[${ref}] Pull request ${live.prUrl} mergeado (${oid || 'sem commit'}); história concluída.`);
      await concludeAndCleanUp(
        this.router,
        this.deps,
        live,
        done,
        `Pull request ${live.prUrl} mergeado (commit ${oid || 'não informado'}). História concluída pelo board.`,
        pr,
        extra,
        openKids > 0,
      );
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
