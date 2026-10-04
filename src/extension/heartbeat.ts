import type { AiRunOrigin } from '../shared/log';
import { cardRef, type BoardState, type Card } from '../shared/model';
import { aiQueue, pendingWork } from '../shared/pending';
import { isLive } from '../shared/selectors';
import { statusInfo } from '../shared/status';

/** O que o heartbeat precisa do executor: iniciar um card e saber quando termina. */
export interface HeartbeatRunner {
  readonly running: string[];
  start(cardId: string, origin?: AiRunOrigin): void;
  stop(cardId: string): void;
  onDidFinish(listener: (cardId: string) => void): void;
}

export interface HeartbeatDeps {
  snapshot(): BoardState;
  now(): number;
  log(line: string): void;
}

/**
 * Cards que uma rodada do heartbeat deve executar, em ordem. A fila da IA é agrupada por história:
 * a execução de uma história cuida das sub-tarefas dela, então a sub-tarefa nunca roda sozinha.
 * Histórias que estão com a pessoa só entram se ela deixou uma mensagem sem resposta.
 */
export function heartbeatTargets(s: BoardState): Card[] {
  const p = pendingWork(s);
  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const unanswered = new Set(p.ai.unanswered.map((c) => c.id));
  const out: Card[] = [];
  for (const card of aiQueue(s, p)) {
    const story = card.parentId ? byId.get(card.parentId) : card;
    // as histórias em modo autônomo são do autopiloto, que não espera o intervalo
    if (!story || !isLive(story) || story.yolo || out.includes(story)) continue;
    const withHuman = !!story.status && statusInfo(story.status).owner === 'human';
    if (story.status === 'running' || (withHuman && !unanswered.has(story.id))) continue;
    out.push(story);
  }
  return out;
}

/**
 * Rotina periódica: quando há pendência com a IA, executa a ferramenta do projeto para cada
 * história da fila, uma por vez. Sem pendência, não executa nada. Não depende da API do VSCode.
 */
export class Heartbeat {
  private queue: string[] = [];
  private lastRoundAt: number;
  private listeners = new Set<() => void>();

  constructor(
    private runner: HeartbeatRunner,
    private deps: HeartbeatDeps,
  ) {
    // a primeira rodada acontece um intervalo depois de o editor abrir, não na abertura
    this.lastRoundAt = deps.now();
    runner.onDidFinish(() => this.pump());
  }

  /** Chamado de tempos em tempos (ex.: a cada minuto): começa uma rodada se o intervalo já passou. */
  tick(): void {
    const { runner } = this.deps.snapshot().board;
    if (!runner.heartbeat || this.busy) return;
    if (this.deps.now() - this.lastRoundAt >= runner.heartbeatMinutes * 60_000) this.round();
  }

  /** Começa uma rodada agora, mesmo com o heartbeat desligado. Devolve quantas histórias entraram na fila. */
  runNow(): number {
    return this.busy ? this.queue.length : this.round();
  }

  /** Esvazia a fila e interrompe a execução em andamento. */
  stop(): void {
    this.queue = [];
    for (const id of this.runner.running) this.runner.stop(id);
    this.changed();
  }

  get busy(): boolean {
    return this.queue.length > 0 || this.runner.running.length > 0;
  }

  get queued(): number {
    return this.queue.length;
  }

  /** Momento da próxima rodada automática, ou null com o heartbeat desligado. */
  get nextRoundAt(): number | null {
    const { runner } = this.deps.snapshot().board;
    return runner.heartbeat ? this.lastRoundAt + runner.heartbeatMinutes * 60_000 : null;
  }

  onDidChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  private round(): number {
    this.lastRoundAt = this.deps.now();
    const targets = heartbeatTargets(this.deps.snapshot());
    this.queue = targets.map((c) => c.id);
    this.deps.log(
      targets.length
        ? `Heartbeat: ${targets.length} história(s) com pendência: ${targets.map(cardRef).join(', ')}.`
        : 'Heartbeat: nada pendente com a IA.',
    );
    this.pump();
    return targets.length;
  }

  /** Inicia a próxima história da fila quando nenhuma execução está em andamento. */
  private pump(): void {
    while (this.queue.length && this.runner.running.length === 0) {
      const id = this.queue.shift()!;
      // a situação pode ter mudado desde que a fila foi montada (a pessoa agiu, outra execução resolveu)
      if (!heartbeatTargets(this.deps.snapshot()).some((c) => c.id === id)) continue;
      try {
        this.runner.start(id, 'heartbeat');
      } catch (e) {
        this.deps.log(`Heartbeat: ${e instanceof Error ? e.message : String(e)}`);
        // sem como executar a ferramenta, não adianta tentar as demais
        this.queue = [];
      }
    }
    this.changed();
  }

  private changed(): void {
    this.listeners.forEach((fn) => fn());
  }
}
