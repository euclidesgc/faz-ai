import type { AiRunOrigin } from '../shared/log';
import { cardRef, type BoardState, type Card } from '../shared/model';
import { openPredecessors } from '../shared/links';
import { aiQueue, pendingWork } from '../shared/pending';
import { blocksExecution } from '../shared/requirements';
import { childrenOf, isAiWorking, isLive } from '../shared/selectors';
import { limitOf } from '../shared/runner';
import { activityKindOf, runningByKind, type ActivityKind } from '../shared/activity';
import { isWithHuman } from '../shared/story';
import { autopilotStep } from './autopilot';

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
 * Histórias que estão com a pessoa só entram se ela deixou uma mensagem sem resposta. Ficam de fora a
 * história que já tem execução (nela ou numa sub-tarefa) e a que ainda depende de outro card em aberto.
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
    const withHuman = isWithHuman(story);
    if (withHuman && !unanswered.has(story.id)) continue;
    // já há uma execução tocando a história: outra em paralelo pisaria nas mesmas sub-tarefas
    if (isAiWorking(s, story) || childrenOf(s, story.id).some((k) => isLive(k) && isAiWorking(s, k))) continue;
    // a história espera outro card terminar; responder a pessoa na conversa não precisa esperar
    if (openPredecessors(s, story.id).length && !unanswered.has(story.id)) continue;
    out.push(story);
  }
  return out;
}

/**
 * Rotina periódica: quando há pendência com a IA, executa a ferramenta do projeto para cada
 * história da fila. As vagas são por tipo de atividade (`limitOf`): histórias em fase de texto (só
 * produzem documento) vão até `parallelStories` em qualquer modo; as que mexem em código vão uma por vez
 * ou, no modo worktree com o paralelo ligado, até o limite configurado. Cada teto conta as execuções já
 * em andamento daquele tipo: a rodada ocupa só as vagas livres. Sem pendência, não executa nada.
 * Não depende da API do VSCode.
 */
export class Heartbeat {
  private queue: string[] = [];
  private lastRoundAt: number;
  private listeners = new Set<() => void>();
  /**
   * A vaga que acabou de abrir é do autopiloto: a execução que terminou não era dele. Assim as duas filas
   * se intercalam quando disputam a mesma vaga, em vez de uma esperar a outra esvaziar.
   */
  private yieldToAutopilot = true;

  constructor(
    private runner: HeartbeatRunner,
    private deps: HeartbeatDeps,
  ) {
    // a primeira rodada acontece um intervalo depois de o editor abrir, não na abertura
    this.lastRoundAt = deps.now();
    runner.onDidFinish((cardId) => {
      this.yieldToAutopilot = !this.isAutopilotRun(cardId);
      this.pump();
    });
  }

  /** Chamado de tempos em tempos (ex.: a cada minuto): começa uma rodada se o intervalo já passou. */
  tick(): void {
    const { runner } = this.deps.snapshot().board;
    // uma rodada com histórias ainda na fila não é atropelada; execuções em andamento não impedem a rodada,
    // que usa as vagas livres
    if (!runner.heartbeat || this.queue.length) return;
    if (this.deps.now() - this.lastRoundAt >= runner.heartbeatMinutes * 60_000) this.round();
  }

  /**
   * Começa uma rodada agora, mesmo com o heartbeat desligado, usando as vagas livres. Devolve quantas
   * histórias a rodada vai tratar; com uma rodada ainda na fila, quantas faltam.
   */
  runNow(): number {
    return this.queue.length ? this.queue.length : this.round();
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

  /**
   * Inicia as histórias da fila que têm vaga no tipo de atividade delas. Cada teto conta toda execução em
   * andamento daquele tipo (também as chamadas à mão e o modo autônomo), para o board nunca passar do que
   * a pessoa configurou. Uma história sem vaga fica na fila sem travar as dos outros tipos. Quando o
   * autopiloto está esperando vaga, uma do tipo que ele quer fica guardada para ele (ver `yieldToAutopilot`).
   */
  private pump(): void {
    const s = this.deps.snapshot();
    // login vencido (preventivo ou pela falha reativa de uma execução): não insiste sozinho, a pessoa resolve
    if (blocksExecution(s)) {
      this.queue = [];
      return void this.changed();
    }
    const counts = runningByKind(s, this.runner.running);
    const wants = autopilotStep(s);
    const reservedKind: ActivityKind | null = this.yieldToAutopilot && s.autopilot.active && wants.kind === 'run' ? wants.activity : null;
    const limit = (kind: ActivityKind) => limitOf(s.board.runner, s.board.git.mode, kind) - (kind === reservedKind ? 1 : 0);
    const rest: string[] = [];
    const waiting: Record<ActivityKind, number> = { text: 0, branch: 0 };
    for (const id of this.queue) {
      // a situação pode ter mudado desde que a fila foi montada (a pessoa agiu, outra execução resolveu)
      const current = this.deps.snapshot();
      const card = heartbeatTargets(current).find((c) => c.id === id);
      if (!card) continue;
      const kind = activityKindOf(current, card, 'phase');
      if (counts[kind] >= limit(kind)) {
        rest.push(id);
        waiting[kind]++;
        continue;
      }
      try {
        this.runner.start(id, 'heartbeat');
        counts[kind]++;
      } catch (e) {
        this.deps.log(`Heartbeat: ${e instanceof Error ? e.message : String(e)}`);
        // sem como executar a ferramenta, não adianta tentar as demais
        this.queue = [];
        this.changed();
        return;
      }
    }
    this.queue = rest;
    if (waiting.branch) this.deps.log(`Heartbeat: ${waiting.branch} história(s) com branch esperando vaga.`);
    if (waiting.text) this.deps.log(`Heartbeat: ${waiting.text} história(s) em fase de texto esperando vaga.`);
    this.changed();
  }

  /** A execução é do autopiloto: o card é (ou pertence a) uma história em modo autônomo. */
  private isAutopilotRun(cardId: string): boolean {
    const s = this.deps.snapshot();
    const card = s.cards.find((c) => c.id === cardId);
    const story = card?.parentId ? s.cards.find((c) => c.id === card.parentId) : card;
    return !!story?.yolo;
  }

  private changed(): void {
    this.listeners.forEach((fn) => fn());
  }
}
