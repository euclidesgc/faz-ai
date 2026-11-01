import { cardRef, type BoardState, type Card, type Id } from '../shared/model';
import { childrenOf, isLive } from '../shared/selectors';
import type { MessageRouter } from './panel/messageRouter';

// Um card "Em execução" sem execução de verdade: a sessão que o marcou caiu, acabou sem passar a vez
// ou era de outra janela. Fica assim para sempre se ninguém o devolver para a IA: o autopiloto e o
// heartbeat pulam a história (acham que ela está rodando), e a pessoa vê o card parado "em execução".

const AUTHOR = 'Faz AI';

/** Uma execução registrada pelo board (o executor desta janela) está em curso no card. */
const tracked = (s: BoardState, running: readonly Id[], id: Id): boolean => s.aiRuns.includes(id) || running.includes(id);

/**
 * Cards "Em execução" sem nenhuma execução do board em curso há mais tempo que o limite de uma
 * execução (`timeoutMinutes`): uma sessão fora do board (a pessoa, pela ponte MCP) pode marcar o card e
 * levar o tempo que uma execução leva; passado o limite, nada mais justifica o status. As sub-tarefas de
 * uma história em execução ficam de fora: é a sessão da história que as marca, e ela está viva.
 */
export function staleRunning(s: BoardState, running: readonly Id[], now: number): Card[] {
  const limit = s.board.runner.timeoutMinutes * 60_000;
  return s.cards.filter((c) => {
    if (!isLive(c) || c.status !== 'running' || tracked(s, running, c.id)) return false;
    if (c.parentId && tracked(s, running, c.parentId)) return false;
    return c.statusAt === null || now - c.statusAt >= limit;
  });
}

/** Devolve os cards para a IA ("Pronto"), explicando na conversa por quê. */
function release(router: MessageRouter, cards: Card[], why: string, log: (line: string) => void): void {
  for (const c of cards) {
    log(`${cardRef(c)} estava "Em execução" sem execução em curso (${why}); voltou para Pronto.`);
    router.handle({ type: 'card.status.set', cardId: c.id, status: 'ready' }, { author: AUTHOR, source: 'ai' });
    router.handle(
      {
        type: 'comment.add',
        cardId: c.id,
        body: `O card estava "Em execução" sem nenhuma sessão de IA em curso (${why}). Voltou para Pronto.`,
      },
      { author: AUTHOR, source: 'ai' },
    );
  }
}

/**
 * Varredura periódica (a cada minuto, pela janela dona do board): devolve para a IA os cards presos em
 * "Em execução". Devolve quantos foram liberados.
 */
export function sweepStaleRuns(router: MessageRouter, running: readonly Id[], now: number, log: (line: string) => void): number {
  const stale = staleRunning(router.snapshot(), running, now);
  release(router, stale, 'a sessão que o marcou não existe mais', log);
  return stale.length;
}

/**
 * Na abertura do board: os cards que as execuções da sessão anterior deixaram "Em execução" (a janela
 * fechou, a máquina desligou) voltam para a IA na hora, sem esperar o limite de tempo: a execução que os
 * marcou morreu com a sessão. `closedCardIds` são os cards das execuções que o log acabou de fechar como
 * inconclusivas; as sub-tarefas dessas histórias, marcadas pela sessão que morreu, voltam junto.
 */
export function recoverAfterRestart(
  router: MessageRouter,
  closedCardIds: readonly Id[],
  log: (line: string) => void,
  /** cards (e histórias) com unidade viva no orquestrador: quem os reconcilia é ele, na abertura */
  reconciled: ReadonlySet<Id> = new Set(),
): number {
  const s = router.snapshot();
  const ids = new Set(closedCardIds);
  const stale = s.cards.filter(
    (c) =>
      isLive(c) &&
      c.status === 'running' &&
      !reconciled.has(c.id) &&
      !(c.parentId !== null && reconciled.has(c.parentId)) &&
      (ids.has(c.id) || (c.parentId !== null && ids.has(c.parentId))),
  );
  for (const story of stale.filter((c) => !c.parentId))
    for (const kid of childrenOf(s, story.id))
      if (isLive(kid) && kid.status === 'running' && !stale.includes(kid) && !reconciled.has(kid.id)) stale.push(kid);
  release(router, stale, 'o editor foi fechado com a execução em andamento', log);
  return stale.length;
}
