import type { AiRunOrigin } from '../shared/log';
import { cardRef, type BoardState, type Card, type Column } from '../shared/model';
import { openPredecessors } from '../shared/links';
import { aiQueue, pendingWork } from '../shared/pending';
import { blocksExecution } from '../shared/requirements';
import { parallelLimit, type AiRunMode } from '../shared/runner';
import { childrenOf, columnOf, columnsOf, isAiWorking, isLive } from '../shared/selectors';
import { statusInfo } from '../shared/status';
import { isDelivered, yoloStories } from '../shared/story';
import type { MessageRouter } from './panel/messageRouter';

const AUTHOR = 'Faz AI';
/** Execuções seguidas sem nenhum progresso na história antes de o autopiloto desistir e bloquear o card. */
export const MAX_RUNS_WITHOUT_PROGRESS = 3;

/** O que o autopiloto precisa do executor: iniciar um card e saber quando termina. */
export interface AutopilotRunner {
  readonly running: string[];
  start(cardId: string, origin?: AiRunOrigin): void;
  stop(cardId: string): void;
  onDidFinish(listener: (cardId: string, mode?: AiRunMode) => void): void;
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

/** O passo de **uma** história pendente, como se ela estivesse sozinha na fila. */
function storyStep(s: BoardState, story: Card): AutopilotStep {
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
  // a fila da IA não traz card que ainda espera uma dependência em aberto: diz de quem a história depende
  const blockers = [
    ...new Set(
      [story, ...childrenOf(s, story.id).filter(isLive)].flatMap((c) => openPredecessors(s, c.id)).filter((p) => p.parentId !== story.id),
    ),
  ];
  if (blockers.length) return { kind: 'paused', story, reason: `${cardRef(story)} espera ${blockers.map(cardRef).join(', ')} terminar.` };
  // nada com a IA e a história continua aberta: o ciclo emperrou
  return { kind: 'paused', story, reason: `${cardRef(story)} não tem nada pendente com a IA, mas ainda não foi concluído.` };
}

/** Histórias em modo autônomo ainda não entregues, na ordem da fila: uma entregue já passou para a pessoa e não ocupa a fila. */
const pendingStories = (s: BoardState): Card[] => yoloStories(s).filter((c) => !isDelivered(s, c));

/**
 * Próximo passo. As histórias vão em fila, uma de cada vez e na ordem da posição do card no board
 * (bug sempre primeiro, `byExecutionOrder`): a branch de cada uma parte da anterior, então a seguinte
 * só começa quando a atual sai de aberto. Uma história com impedimento (bloqueada ou esperando uma
 * pessoa) é pulada e a seguinte passa na frente; a fila só espera quando todas as pendentes estão com
 * a pessoa. Destravada, a história volta a concorrer na posição que ocupa no board, e espera a que
 * estiver em execução terminar.
 */
export function autopilotStep(s: BoardState): AutopilotStep {
  const pending = pendingStories(s);
  if (!pending.length) return { kind: 'idle' };
  const steps = pending.map((story) => storyStep(s, story));
  // uma história por vez: com uma em execução, nenhuma outra começa, pulada ou não
  const running = steps.find((p) => p.kind === 'wait');
  if (running) return running;
  const next = steps.find((p) => p.kind === 'advance' || p.kind === 'run');
  if (next) return next;
  if (steps.every((p) => p.kind === 'idle')) return { kind: 'idle' };
  // todas com a pessoa: a fila para na primeira, dizendo o motivo de cada uma
  return {
    kind: 'paused',
    story: pending[0]!,
    reason: steps
      .map((p) => (p.kind === 'paused' ? p.reason : ''))
      .filter(Boolean)
      .join(' '),
  };
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
 * execução da IA após a outra, sem esperar o intervalo do heartbeat, e só então passa à próxima. Divide o
 * limite de execuções simultâneas com o heartbeat: começa numa vaga livre e, quando as duas filas
 * disputam a mesma vaga, elas se intercalam.
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
  /** histórias entregues já anunciadas no log, para não repetir a linha a cada mudança do board */
  private deliveredLogged = new Set<string>();

  constructor(
    private router: MessageRouter,
    private runner: AutopilotRunner,
    private deps: AutopilotDeps,
  ) {
    // histórias que já estavam em modo autônomo ao abrir o editor não disparam nada sozinhas: é preciso retomar
    this.known = new Set(yoloStories(router.snapshot()).map((c) => c.id));
    router.onDidChange(() => this.onBoardChange());
    runner.onDidFinish((cardId, mode) => this.onRunFinished(cardId, mode));
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

  private onRunFinished(cardId: string, mode?: AiRunMode): void {
    const s = this.router.snapshot();
    const card = s.cards.find((c) => c.id === cardId);
    const story = card && (card.parentId ? s.cards.find((c) => c.id === card.parentId) : card);
    // refinar não move a história de propósito: não conta como execução sem progresso
    if (story?.yolo && this.active && mode !== 'refine') this.checkProgress(s, story);
    // decide depois dos demais ouvintes do fim da execução: o heartbeat guarda a vaga para o autopiloto
    // quando a execução que terminou era dele, e a toma quando era do autopiloto (as filas se intercalam)
    (this.deps.defer ?? queueMicrotask)(() => this.evaluate());
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

  /** Anuncia, uma vez por história, que uma entrega parou de ocupar a fila e o autopiloto seguiu adiante. */
  private logDelivered(s: BoardState): void {
    for (const story of yoloStories(s).filter((c) => isDelivered(s, c))) {
      if (this.deliveredLogged.has(story.id)) continue;
      this.deliveredLogged.add(story.id);
      this.deps.log(`Autopiloto: ${cardRef(story)} entregue (pull request aberto, aguardando revisão); seguindo para a próxima.`);
    }
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
        this.logDelivered(this.router.snapshot());
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
        // login vencido (preventivo ou pela falha reativa de uma execução): não insiste sozinho, a pessoa resolve
        if (step.kind === 'run' && blocksExecution(this.router.snapshot())) return;
        // o limite conta toda execução em andamento (heartbeat, chamadas à mão): o autopiloto usa uma vaga livre
        if (step.kind === 'run' && this.runner.running.length < this.limit()) this.start(step.story);
        return;
      }
    } finally {
      this.busy = false;
    }
  }

  private limit(): number {
    const { board } = this.router.snapshot();
    return parallelLimit(board.runner, board.git.mode);
  }

  private start(story: Card): void {
    try {
      this.deps.log(`Autopiloto: chamando a IA em ${cardRef(story)}.`);
      const s = this.router.snapshot();
      this.progress.set(story.id, { sig: progressOf(s, story), stalls: this.progress.get(story.id)?.stalls ?? 0 });
      this.runner.start(story.id, 'autopilot');
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
    const s = this.router.snapshot();
    // entregue não tem execução a recuperar; a história da vez pode ser qualquer pendente, então todas são olhadas
    for (const story of pendingStories(s)) {
      const cards = [story, ...childrenOf(s, story.id).filter(isLive)];
      // só as execuções desta história contam: as do heartbeat em outras histórias não a seguram
      if (cards.some((c) => this.runner.running.includes(c.id))) continue;
      for (const c of cards)
        if (c.status === 'running' && !s.aiRuns.includes(c.id))
          this.router.handle({ type: 'card.status.set', cardId: c.id, status: 'ready' }, { author: AUTHOR, source: 'ai' });
    }
  }

  private publish(note: string | null): void {
    this.note = note;
    this.router.setAutopilot({ active: this.active, note: this.note });
  }
}
