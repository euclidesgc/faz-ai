import { cardRef, type BoardState, type Card, type Column } from '../shared/model';
import { aiQueue, pendingWork } from '../shared/pending';
import { childrenOf, columnOf, columnsOf, isAiWorking, isLive } from '../shared/selectors';
import { statusInfo } from '../shared/status';
import { yoloStories } from '../shared/story';
import type { MessageRouter } from './panel/messageRouter';

const AUTHOR = 'Faz AI';
/** Execuções seguidas sem nenhum progresso na história antes de o autopiloto desistir e bloquear o card. */
export const MAX_RUNS_WITHOUT_PROGRESS = 3;

/** O que o autopiloto precisa do executor: iniciar um card e saber quando termina. */
export interface AutopilotRunner {
  readonly running: string[];
  start(cardId: string): void;
  stop(cardId: string): void;
  onDidFinish(listener: (cardId: string) => void): void;
}

export interface AutopilotDeps {
  log(line: string): void;
  /** só a janela dona do board toca as histórias, para duas não chamarem a IA em dobro; padrão: sempre */
  canRun?(): boolean;
  /**
   * Adia uma função para depois do que está acontecendo agora; padrão: microtarefa. As mudanças do board
   * feitas ao encerrar uma execução chegam antes do aviso de que ela terminou, e o autopiloto precisa
   * ver esse aviso (e medir o progresso) antes de decidir o passo seguinte.
   */
  defer?(fn: () => void): void;
}

/** O que fazer agora com as histórias em modo autônomo. */
export type AutopilotStep =
  | { kind: 'idle' }
  /** a história está numa coluna em que a IA não atua (ex.: Backlog): leva para a próxima */
  | { kind: 'advance'; story: Card; column: Column }
  | { kind: 'run'; story: Card }
  | { kind: 'wait'; story: Card }
  /** a fila parou numa história que depende de uma pessoa (impedimento) */
  | { kind: 'paused'; story: Card; reason: string };

/**
 * Próximo passo. As histórias vão em fila, uma de cada vez e na ordem do número: a branch de cada uma
 * parte da anterior, então a seguinte só começa quando a atual sai de aberto. Uma história com
 * impedimento segura a fila, em vez de a seguinte passar na frente.
 */
export function autopilotStep(s: BoardState): AutopilotStep {
  const story = yoloStories(s)[0];
  if (!story) return { kind: 'idle' };
  const column = columnOf(s, story)!;
  if (isAiWorking(s, story) || childrenOf(s, story.id).some((c) => isAiWorking(s, c))) return { kind: 'wait', story };

  if (story.status && statusInfo(story.status).owner === 'human')
    return {
      kind: 'paused',
      story,
      reason: story.statusReason
        ? `${cardRef(story)} está bloqueado: ${story.statusReason}`
        : `${cardRef(story)} está esperando uma pessoa.`,
    };

  if (!column.aiActive) {
    const next = columnsOf(s, story.workflowId).find((c) => c.position > column.position && c.category !== 'cancelled');
    return next ? { kind: 'advance', story, column: next } : { kind: 'idle' };
  }
  const queue = aiQueue(s, pendingWork(s));
  if (queue.some((c) => c.id === story.id || c.parentId === story.id)) return { kind: 'run', story };
  // nada com a IA e a história continua aberta: o ciclo emperrou
  return { kind: 'paused', story, reason: `${cardRef(story)} não tem nada pendente com a IA, mas ainda não foi concluído.` };
}

/** O que muda quando a história avança: coluna, status, PR e o andamento das sub-tarefas. */
function progressOf(s: BoardState, story: Card): string {
  const kids = childrenOf(s, story.id)
    .map((c) => `${c.id}:${c.columnId}:${c.status}`)
    .sort();
  return [story.columnId, story.status, story.prUrl, story.branch, ...kids].join('|');
}

/**
 * Toca sozinho as histórias em modo autônomo (YOLO): leva a primeira da fila do Backlog ao fim, uma
 * execução da IA após a outra, sem esperar o intervalo do heartbeat, e só então passa à próxima.
 * Não pede aprovação de nada, mas para quando a IA bloqueia o card, quando uma execução falha, e depois
 * de execuções seguidas que não avançam nada. Não depende da API do VSCode.
 */
export class Autopilot {
  private active = false;
  private note: string | null = null;
  private busy = false;
  private scheduled = false;
  private known: Set<string>;
  /** estado da história quando a última execução começou, e quantas execuções seguidas não mudaram nada */
  private progress = new Map<string, { sig: string; stalls: number }>();

  constructor(
    private router: MessageRouter,
    private runner: AutopilotRunner,
    private deps: AutopilotDeps,
  ) {
    // histórias que já estavam em modo autônomo ao abrir o editor não disparam nada sozinhas: é preciso retomar
    this.known = new Set(yoloStories(router.snapshot()).map((c) => c.id));
    router.onDidChange(() => this.onBoardChange());
    runner.onDidFinish((cardId) => this.onRunFinished(cardId));
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Liga o autopiloto e trata a fila agora. */
  resume(): void {
    this.active = true;
    this.progress.clear();
    this.evaluate();
  }

  /** Para o autopiloto e interrompe a execução em andamento nas histórias em modo autônomo. */
  pause(): void {
    this.active = false;
    this.publish(null);
    const s = this.router.snapshot();
    for (const id of this.runner.running) {
      const card = s.cards.find((c) => c.id === id);
      const story = card?.parentId ? s.cards.find((c) => c.id === card.parentId) : card;
      if (story?.yolo) this.runner.stop(id);
    }
  }

  /** Liga sozinho quando uma pessoa liga o modo numa história. */
  private onBoardChange(): void {
    const now = new Set(yoloStories(this.router.snapshot()).map((c) => c.id));
    const added = [...now].some((id) => !this.known.has(id));
    this.known = now;
    if (added && !this.active && this.canRun()) return this.resume();
    if (this.scheduled) return;
    this.scheduled = true;
    (this.deps.defer ?? queueMicrotask)(() => {
      this.scheduled = false;
      this.evaluate();
    });
  }

  private onRunFinished(cardId: string): void {
    const s = this.router.snapshot();
    const card = s.cards.find((c) => c.id === cardId);
    const story = card && (card.parentId ? s.cards.find((c) => c.id === card.parentId) : card);
    if (story?.yolo && this.active) this.checkProgress(s, story);
    this.evaluate();
  }

  /** Disjuntor: execuções seguidas sem mudar nada na história a bloqueiam, em vez de gastar sem fim. */
  private checkProgress(s: BoardState, story: Card): void {
    const before = this.progress.get(story.id);
    if (!before) return;
    const stalls = before.sig === progressOf(s, story) ? before.stalls + 1 : 0;
    this.progress.set(story.id, { ...before, stalls });
    if (stalls < MAX_RUNS_WITHOUT_PROGRESS || story.status === 'blocked') return;
    this.deps.log(`Autopiloto: ${cardRef(story)} sem progresso em ${MAX_RUNS_WITHOUT_PROGRESS} execuções; bloqueando.`);
    this.router.handle(
      {
        type: 'card.status.set',
        cardId: story.id,
        status: 'blocked',
        note: `O autopiloto parou: ${MAX_RUNS_WITHOUT_PROGRESS} execuções seguidas não avançaram a história. Veja a conversa e o log, destrave o card e retome.`,
      },
      { author: AUTHOR, source: 'ai' },
    );
  }

  private canRun(): boolean {
    return this.deps.canRun?.() ?? true;
  }

  /** Decide e executa o próximo passo; chamado a cada mudança no board e a cada fim de execução. */
  evaluate(): void {
    // as mudanças que o próprio autopiloto faz voltam por aqui: a volta de baixo já as enxerga
    if (this.busy || !this.active || !this.canRun()) return;
    this.busy = true;
    try {
      for (let guard = 0; guard < 50; guard++) {
        this.recoverStale();
        const step = autopilotStep(this.router.snapshot());
        this.publish(step.kind === 'paused' ? step.reason : null);
        if (step.kind === 'idle') {
          this.finish();
          return;
        }
        if (step.kind === 'advance') {
          this.deps.log(`Autopiloto: ${cardRef(step.story)} avança para ${step.column.name}.`);
          this.router.handle(
            { type: 'card.move', cardId: step.story.id, columnId: step.column.id, position: Number.MAX_SAFE_INTEGER },
            { author: AUTHOR, source: 'ai' },
          );
          continue;
        }
        if (step.kind === 'run' && this.runner.running.length === 0) this.start(step.story);
        return;
      }
    } finally {
      this.busy = false;
    }
  }

  private start(story: Card): void {
    try {
      this.deps.log(`Autopiloto: chamando a IA em ${cardRef(story)}.`);
      const s = this.router.snapshot();
      this.progress.set(story.id, { sig: progressOf(s, story), stalls: this.progress.get(story.id)?.stalls ?? 0 });
      this.runner.start(story.id);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.deps.log(`Autopiloto: ${reason}`);
      // sem como executar a ferramenta, insistir não adianta
      this.active = false;
      this.publish(reason);
    }
  }

  /** Acabou a fila: o autopiloto se desliga até a próxima história entrar em modo autônomo. */
  private finish(): void {
    this.deps.log('Autopiloto: nenhuma história em modo autônomo pendente.');
    this.active = false;
    this.publish(null);
  }

  /** Um "Em execução" sem execução de verdade (a sessão caiu): volta para a IA tentar de novo. */
  private recoverStale(): void {
    if (this.runner.running.length) return;
    const s = this.router.snapshot();
    const story = yoloStories(s)[0];
    if (!story) return;
    for (const c of [story, ...childrenOf(s, story.id).filter(isLive)])
      if (c.status === 'running' && !s.aiRuns.includes(c.id))
        this.router.handle({ type: 'card.status.set', cardId: c.id, status: 'ready' }, { author: AUTHOR, source: 'ai' });
  }

  private publish(note: string | null): void {
    this.note = note;
    this.router.setAutopilot({ active: this.active, note: this.note });
  }
}
