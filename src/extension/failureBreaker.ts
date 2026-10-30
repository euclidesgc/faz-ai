import type { BoardState } from '../shared/model';
import type { AiRunMode } from '../shared/runner';
import { breakerNote, breakerTrip, isBreakerNote } from '../shared/failureSignature';
import { cardRef } from '../shared/model';
import { childrenOf, columnOf, isLive } from '../shared/selectors';
import { isWithHuman, storyOf } from '../shared/story';
import type { AiRunRepo } from './log/aiRunRepo';
import type { WebviewToHost } from '../shared/messages';
import type { GateRepo } from './repositories/gateRepo';

const AUTHOR = 'Faz AI';

/**
 * Os modos que não avaliam (#1097): não são uma etapa da história. As falhas deles ficam gravadas e contam
 * na avaliação seguinte, de uma etapa que avalia.
 */
const IGNORED_MODES: readonly AiRunMode[] = ['refine', 'summarize', 'conflict', 'reply', 'unblock'];

/** O que o avaliador usa do router: o estado (comentários inclusos) e o `handle`, como o autopiloto. */
export interface FailureBreakerRouter {
  snapshot(): BoardState;
  handle(msg: WebviewToHost, origin: { author?: string; source?: 'ai' | 'human' }): unknown;
}

export interface FailureBreakerDeps {
  router: FailureBreakerRouter;
  runs: Pick<AiRunRepo, 'failureOccurrences'>;
  gates: Pick<GateRepo, 'failedOccurrences'>;
  /** lê o `RunnerConfig.failureLimit` na hora: o valor mudado em Configurações vale na próxima avaliação */
  limit: () => number;
  log: (line: string) => void;
}

/**
 * Disjuntor por assinatura de falha (#1097). No fim de cada execução e de cada checagem conta as ocorrências da
 * história (o card e as sub-tarefas) depois do último bloqueio do disjuntor; se uma mesma assinatura chegou ao
 * limite, bloqueia a história com a assinatura e o histórico. A contagem não depende do progresso: o sucesso de
 * outra etapa não a zera. O `MAX_RUNS_WITHOUT_PROGRESS` do autopiloto é outro freio e não muda.
 */
export class FailureBreaker {
  constructor(private readonly deps: FailureBreakerDeps) {}

  /** Chamado no fim de cada execução e de cada checagem. Nunca lança: o fim da execução não pode mudar por aqui. */
  check(cardId: string, mode?: AiRunMode): void {
    try {
      if (mode && IGNORED_MODES.includes(mode)) return;
      this.evaluate(cardId);
    } catch (e) {
      this.safeLog(`Disjuntor de falhas: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private evaluate(cardId: string): void {
    const { router } = this.deps;
    const state = router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return;
    const story = storyOf(state, card);
    // a pessoa já tem a vez (inclusive bloqueada pelo autopiloto): não bloqueia de novo nem por cima da pergunta dela
    if (!story || !isLive(story) || columnOf(state, story)?.category !== 'open' || isWithHuman(story)) return;

    const ids = [story.id, ...childrenOf(state, story.id).map((c) => c.id)];
    const since = state.comments
      .filter((m) => m.cardId === story.id && isBreakerNote(m))
      .reduce((latest, m) => Math.max(latest, m.createdAt), 0);
    const occurrences = [...this.deps.runs.failureOccurrences(ids, since), ...this.deps.gates.failedOccurrences(ids, since)].sort(
      (a, b) => a.at - b.at,
    );
    const limit = this.deps.limit();
    const trip = breakerTrip(occurrences, limit);
    if (!trip) return;

    this.safeLog(`Disjuntor de falhas: ${cardRef(story)} com ${trip.count} falhas iguais (limite ${limit}); bloqueando.`);
    router.handle(
      { type: 'card.status.set', cardId: story.id, status: 'blocked', note: breakerNote(trip, limit) },
      { author: AUTHOR, source: 'ai' },
    );
  }

  private safeLog(line: string): void {
    try {
      this.deps.log(line);
    } catch {
      // o log nunca derruba o fim da execução
    }
  }
}
