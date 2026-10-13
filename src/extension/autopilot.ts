import type { AiRunOrigin } from '../shared/log';
import { cardRef, type BoardState, type Card, type Column } from '../shared/model';
import { openPredecessors } from '../shared/links';
import { aiQueue, pendingWork } from '../shared/pending';
import { activityKindOf, runningByKind, type ActivityKind } from '../shared/activity';
import { blocksExecution } from '../shared/requirements';
import { limitOf, type AiRunMode } from '../shared/runner';
import { childrenOf, columnOf, columnsOf, isAiWorking, isLive } from '../shared/selectors';
import { isDelivered, isWithHuman, yoloStories } from '../shared/story';
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

/** Uma história que o autopiloto pode iniciar agora, com o tipo da atividade (texto ou branch). */
export type AutopilotRun = { kind: 'run'; story: Card; activity: ActivityKind };

/** O que fazer agora com as histórias em modo autônomo. */
export type AutopilotStep =
  | { kind: 'idle' }
  /** a história está numa coluna em que a IA não atua (ex.: Backlog): leva para a próxima */
  | { kind: 'advance'; story: Card; column: Column }
  | AutopilotRun
  | { kind: 'wait'; story: Card }
  /** a história está parada por um impedimento (bloqueio, pergunta, dependência ou ciclo emperrado) */
  | { kind: 'paused'; story: Card; reason: string };

/** Histórias em modo autônomo ainda não entregues, na ordem da fila (bug primeiro, depois a posição no board). */
const pendingStories = (s: BoardState): Card[] => yoloStories(s).filter((c) => !isDelivered(s, c));

/**
 * Todas as histórias que o autopiloto pode iniciar agora, na ordem da fila. A história em fase de texto
 * (Discovery, PRD, Spec...) só produz documento e não precisa da branch: entra sempre que estiver com a
 * IA (uma execução por história já é garantida por `storyStep`, que devolve `wait` enquanto ela roda).
 * A história em fase de código (branch) parte da branch da anterior, então só entra se for a primeira
 * da fila que está com a IA (`run` ou `wait`): qualquer história anterior em execução ou pendente, de
 * qualquer tipo, a segura. Histórias anteriores paradas (`paused`) ou só avançando de coluna
 * (`advance`) não seguram.
 */
export function autopilotRuns(s: BoardState): AutopilotRun[] {
  const runs: AutopilotRun[] = [];
  let busyBefore = false;
  for (const story of pendingStories(s)) {
    const step = storyStep(s, story);
    if (step.kind === 'run' && (step.activity === 'text' || !busyBefore)) runs.push(step);
    if (step.kind === 'run' || step.kind === 'wait') busyBefore = true;
  }
  return runs;
}

/**
 * Próximo passo. As histórias vão em fila na ordem da posição do card no board (bug sempre primeiro,
 * `byExecutionOrder`). Nenhum impedimento (bloqueio, pergunta sem resposta, dependência de outro card
 * em aberto, ciclo emperrado) segura a fila: a vez passa para a próxima história que pode rodar. Uma
 * história em execução também não segura as de fase de texto atrás dela (`autopilotRuns`). Só quando
 * nenhuma história pode avançar é que a fila para de fato, mostrando a razão da primeira que ficou
 * parada. Precedência: `advance` > `run` > `wait` > `paused` > `idle`.
 */
export function autopilotStep(s: BoardState): AutopilotStep {
  let firstWait: AutopilotStep | undefined;
  let firstPaused: AutopilotStep | undefined;
  // uma história entregue já passou para a pessoa: não segura a fila, a próxima assume
  for (const story of pendingStories(s)) {
    const step = storyStep(s, story);
    if (step.kind === 'advance' || step.kind === 'idle') return step;
    if (step.kind === 'wait') firstWait ??= step;
    if (step.kind === 'paused') firstPaused ??= step;
  }
  return autopilotRuns(s)[0] ?? firstWait ?? firstPaused ?? { kind: 'idle' };
}

/** Teto da nota do autopiloto na barra de atividade, em caracteres. */
const NOTE_MAX = 160;

/**
 * O motivo de um bloqueio reduzido a uma linha para a barra de atividade: o `statusReason` pode ser
 * markdown inteiro (cercas de código, várias linhas), e a barra mostra tudo cru numa linha só.
 */
export function noteOf(reason: string): string {
  const line =
    reason
      .replace(/```[^\n]*\n?/g, '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? '';
  return line.length > NOTE_MAX ? `${line.slice(0, NOTE_MAX - 1).trimEnd()}…` : line;
}

/** O passo de uma história, olhando só para ela. */
function storyStep(s: BoardState, story: Card): AutopilotStep {
  const column = columnOf(s, story)!;
  if (isAiWorking(s, story) || childrenOf(s, story.id).some((c) => isAiWorking(s, c))) return { kind: 'wait', story };

  if (isWithHuman(story))
    return {
      kind: 'paused',
      story,
      reason: story.statusReason
        ? `${cardRef(story)} está bloqueado: ${noteOf(story.statusReason)}`
        : `${cardRef(story)} está esperando uma pessoa.`,
    };

  if (!column.aiActive) {
    const next = columnsOf(s, story.workflowId).find((c) => c.position > column.position && c.category !== 'cancelled');
    return next ? { kind: 'advance', story, column: next } : { kind: 'idle' };
  }
  const queue = aiQueue(s, pendingWork(s));
  if (queue.some((c) => c.id === story.id || c.parentId === story.id))
    return { kind: 'run', story, activity: activityKindOf(s, story, 'phase') };
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
  /** segurado por uma falha ao iniciar a ferramenta: só retomar religa. A pausa da pessoa fica gravada no board (`autopilotPaused`). */
  private held = false;
  /** `stop()` em andamento: as mudanças do board que a interrupção provoca não religam o autopiloto */
  private stopping = false;

  constructor(
    private router: MessageRouter,
    private runner: AutopilotRunner,
    private deps: AutopilotDeps,
  ) {
    this.known = new Set(yoloStories(router.snapshot()).map((c) => c.id));
    router.onDidChange(() => this.onBoardChange());
    runner.onDidFinish((cardId, mode) => this.onRunFinished(cardId, mode));
    // histórias que já estavam em modo autônomo ao abrir o editor continuam sozinhas: a pessoa ligou o
    // modo para não precisar voltar ao board; só a pausa dela segura a fila (#240)
    (deps.defer ?? queueMicrotask)(() => this.autoResume());
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Liga o autopiloto (limpando a pausa gravada no board e a última falha) e trata a fila agora. */
  resume(): void {
    this.held = false;
    this.active = true;
    this.progress.clear();
    if (this.paused()) this.setPaused(false);
    this.evaluate();
  }

  /**
   * Para o autopiloto por decisão da pessoa: grava a pausa no board, para ela valer até retomar mesmo
   * depois de reabrir o editor (#220), e interrompe a execução em andamento nas histórias em modo autônomo.
   */
  pause(): void {
    // a pausa é gravada antes de interromper: a mudança do board que a interrupção provoca já a enxerga
    this.setPaused(true);
    this.stop();
  }

  /** Desliga e interrompe as execuções sem gravar pausa: fechar o editor não é uma pausa da pessoa. */
  stop(): void {
    this.stopping = true;
    try {
      this.active = false;
      this.publish(null);
      const s = this.router.snapshot();
      for (const id of this.runner.running) {
        const card = s.cards.find((c) => c.id === id);
        const story = card?.parentId ? s.cards.find((c) => c.id === card.parentId) : card;
        if (story?.yolo) this.runner.stop(id);
      }
    } finally {
      this.stopping = false;
    }
  }

  /** A pessoa pausou o autopiloto (gravado no board). */
  private paused(): boolean {
    return this.router.snapshot().board.runner.autopilotPaused;
  }

  private setPaused(autopilotPaused: boolean): void {
    this.router.handle({ type: 'settings.board.update', patch: { runner: { autopilotPaused } } }, { author: AUTHOR, source: 'ai' });
  }

  /**
   * Liga sozinho ao abrir o editor (ou quando esta janela passa a ser a dona do board) com história em
   * modo autônomo ainda por fazer. Não religa o que a pessoa pausou nem uma fila só de histórias entregues.
   */
  private autoResume(): void {
    if (this.active || this.held || this.stopping || this.paused() || !this.canRun()) return;
    if (autopilotStep(this.router.snapshot()).kind === 'idle') return;
    this.deps.log('Autopiloto: histórias em modo autônomo pendentes; retomando.');
    this.resume();
  }

  /** Liga sozinho quando uma pessoa liga o modo numa história; ligar de novo também desfaz a pausa dela. */
  private onBoardChange(): void {
    const now = new Set(yoloStories(this.router.snapshot()).map((c) => c.id));
    const added = [...now].some((id) => !this.known.has(id));
    this.known = now;
    if (added && !this.active && !this.stopping && this.canRun()) return this.resume();
    if (!this.active) this.autoResume();
    if (!this.active) return;
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
    // refinar e resumir não movem a história de propósito: não contam como execução sem progresso
    if (story?.yolo && this.active && mode !== 'refine' && mode !== 'summarize') this.checkProgress(s, story);
    // decide depois dos demais ouvintes do fim da execução: o heartbeat guarda a vaga para o autopiloto
    // quando a execução que terminou era dele, e a toma quando era do autopiloto (as filas se intercalam)
    (this.deps.defer ?? queueMicrotask)(() => this.evaluate());
  }

  /** Disjuntor: execuções seguidas sem mudar nada na história a bloqueiam, em vez de gastar sem fim. */
  private checkProgress(s: BoardState, story: Card): void {
    const before = this.progress.get(story.id);
    if (!before) return;
    const current = s.cards.find((c) => c.id === story.id) ?? story;
    // já está com a pessoa (entregue, aguardando resposta ou bloqueada): não é tentativa falha da IA.
    if (isWithHuman(current)) return;
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
        if (step.kind !== 'run') return;
        // login vencido (preventivo ou pela falha reativa de uma execução): não insiste sozinho, a pessoa resolve
        if (blocksExecution(this.router.snapshot())) return;
        // o teto é por tipo de atividade e conta toda execução em andamento (heartbeat, chamadas à mão):
        // o autopiloto usa as vagas livres de cada tipo, na ordem da fila
        const s = this.router.snapshot();
        const counts = runningByKind(s, this.runner.running);
        for (const r of autopilotRuns(s)) {
          if (counts[r.activity] >= limitOf(s.board.runner, s.board.git.mode, r.activity)) continue;
          this.start(r.story);
          counts[r.activity]++;
        }
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
      this.runner.start(story.id, 'autopilot');
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.deps.log(`Autopiloto: ${reason}`);
      // sem como executar a ferramenta, insistir não adianta
      this.held = true;
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

  /**
   * Um "Em execução" sem execução de verdade (a sessão caiu): volta para a IA tentar de novo. Olha todas
   * as histórias em modo autônomo ainda não entregues, não só a da vez: com várias rodando ao mesmo
   * tempo, qualquer uma pode ter caído.
   */
  private recoverStale(): void {
    const s = this.router.snapshot();
    for (const story of pendingStories(s).filter(isLive))
      for (const c of [story, ...childrenOf(s, story.id).filter(isLive)])
        if (c.status === 'running' && !s.aiRuns.includes(c.id) && !this.runner.running.includes(c.id))
          this.router.handle({ type: 'card.status.set', cardId: c.id, status: 'ready' }, { author: AUTHOR, source: 'ai' });
  }

  private publish(note: string | null): void {
    this.note = note;
    this.router.setAutopilot({ active: this.active, note: this.note });
  }
}
