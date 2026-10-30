import type { AiRunOrigin } from '../shared/log';
import type { WebviewToHost } from '../shared/messages';
import { cardRef, type BoardState, type Card } from '../shared/model';
import { openPredecessors } from '../shared/links';
import { aiQueue, pendingWork } from '../shared/pending';
import { cardCliProblem, cardRunUnsupported, cliProblem, noProfileAvailable, type CliProblem } from '../shared/requirements';
import { profilesInUse } from '../shared/runTarget';
import { profileLabel } from '../shared/aiProfiles';
import { childrenOf, columnOf, columnsOf, isAiWorking, isLive } from '../shared/selectors';
import { limitOf, type AiRunMode } from '../shared/runner';
import { activityKindOf, runningByKind, type ActivityKind } from '../shared/activity';
import { USAGE_LIMIT_TEXT } from '../shared/conversation';
import { isWithHuman } from '../shared/story';
import { autopilotStep, needsSummary, type StoryDriver } from './autopilot';
import { isUnblockNote, orchestratesStory, UNBLOCK_MARK } from '../shared/orchestration';
import { RetryHeld, UsageLimitHeld } from './runner';

/** O que o heartbeat precisa do executor: iniciar um card e saber quando termina. */
export interface HeartbeatRunner {
  readonly running: string[];
  start(cardId: string, origin?: AiRunOrigin, mode?: AiRunMode): void;
  stop(cardId: string): void;
  onDidFinish(listener: (cardId: string) => void): void;
}

export interface HeartbeatDeps {
  /** conduz as histórias de fase de código que já têm sub-tarefas (o `Orchestrator`); sem ele, passam por `runner.start` */
  driver?: StoryDriver;
  snapshot(): BoardState;
  now(): number;
  log(line: string): void;
  /**
   * A manutenção de cada rodada, automática ou pedida (merges, sincronização das branches, órfãs,
   * versões publicadas), chamada depois da arrumação. Quando devolve uma promessa, a fila da IA só é
   * bombeada depois que ela resolve (ou rejeita): a IA encontra as branches já sincronizadas. O número
   * da rodada sai na hora mesmo assim. Não deve rejeitar.
   */
  onRound?: () => void | Promise<void>;
  /**
   * Aplica uma mudança no board em nome do heartbeat (devolver um card bloqueado por limite de uso,
   * avisar de um card parado). Sem ela, a rodada só executa a IA.
   */
  act?: (msg: WebviewToHost) => void;
  /**
   * As histórias com conflito no pull request ainda sem tentativa da IA (`MergeWatcher.pendingConflicts`):
   * entram no começo da fila como execuções de conflito (#747). Sem ela, a rodada não trata conflitos.
   */
  conflicts?: () => ReadonlySet<string>;
}

/** Dias com a pessoa (revisão, resposta ou bloqueio) a partir dos quais a rodada avisa que o card está parado. */
export const STALE_DAYS = 2;
/** Parte estável do aviso de card parado: o "já avisei" é conferido na própria conversa, depois do último status. */
const STALE_MARK = 'está com você há';
/** Parte estável do aviso de desbloqueio por limite de uso. */
const USAGE_RELEASE_MARK = 'voltou para a IA: o limite de uso renova sozinho';

/** Um item da fila da rodada: a história e o que fazer nela. */
export interface HeartbeatItem {
  id: string;
  mode: AiRunMode;
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
    // login vencido, CLI ausente ou perfil que o board não roda, da história: só ela fica de fora, as dos outros perfis seguem
    if (cardCliProblem(s, story) || cardRunUnsupported(s, story)) continue;
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

/** A coluna fica antes da primeira em que a IA atua: é o Backlog (ou equivalente) do workflow. */
function isBacklogColumn(s: BoardState, card: Card): boolean {
  const column = columnOf(s, card);
  if (!column || column.category !== 'open' || column.aiActive) return false;
  const firstAi = columnsOf(s, card.workflowId).find((c) => c.aiActive);
  return !!firstAi && column.position < firstAi.position;
}

/**
 * Histórias do Backlog que a rodada deve refinar: ainda não refinadas, sem execução e sem estar com a
 * pessoa (um refinamento já entregue espera a revisão dela). Só com o refinamento automático ligado.
 * As histórias em modo autônomo ficam de fora: o autopiloto as leva direto para a primeira fase.
 */
export function refineTargets(s: BoardState): Card[] {
  if (!s.board.runner.heartbeatRefine) return [];
  return s.cards.filter(
    (c) =>
      isLive(c) &&
      !c.parentId &&
      !c.yolo &&
      c.refinedAt === null &&
      c.title.trim() !== '' &&
      isBacklogColumn(s, c) &&
      !isWithHuman(c) &&
      !isAiWorking(s, c) &&
      !cardCliProblem(s, c) &&
      !cardRunUnsupported(s, c),
  );
}

/**
 * Histórias cuja conversa cresceu desde o último resumo (`needsSummary`) e que não estão em execução: a
 * rodada resume antes de qualquer outro trabalho nelas, para a próxima execução receber só o resumo.
 * As do modo autônomo ficam de fora: o autopiloto resume ao trocar de fase.
 */
export function summaryTargets(s: BoardState): Card[] {
  return s.cards.filter(
    (c) =>
      isLive(c) &&
      !c.parentId &&
      !c.yolo &&
      columnOf(s, c)?.category === 'open' &&
      !isAiWorking(s, c) &&
      !childrenOf(s, c.id).some((k) => isLive(k) && isAiWorking(s, k)) &&
      needsSummary(s, c) &&
      !cardCliProblem(s, c) &&
      !cardRunUnsupported(s, c),
  );
}

/** Cards bloqueados por limite de uso da ferramenta: o limite renova sozinho, então o board os devolve para a IA. */
export function usageLimitBlocked(s: BoardState): Card[] {
  return s.cards.filter((c) => isLive(c) && c.status === 'blocked' && USAGE_LIMIT_TEXT.test(c.statusReason));
}

/** Quantas tentativas de desbloqueio seguidas, sem um gesto da pessoa entre elas, a mesma história recebe. */
export const MAX_UNBLOCK_ATTEMPTS = 3;

/** Uma impressão curta do texto, para a nota da tentativa dizer a que bloqueio ela se refere. */
function fingerprintOf(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * A chave do bloqueio da história: os motivos de todos os cards bloqueados da família. A mesma chave já
 * tentada não roda de novo; um motivo novo (a execução anterior achou outra causa) ganha outra tentativa.
 */
export function unblockKey(s: BoardState, story: Card): string {
  const family = [story, ...childrenOf(s, story.id).filter(isLive)];
  const reasons = family
    .filter((c) => c.status === 'blocked')
    .map((c) => `${c.id}:${c.statusReason.trim()}`)
    .sort();
  return fingerprintOf(reasons.join('\n'));
}

/** A nota com que a rodada abre a tentativa: a marca, a chave do bloqueio e o que a execução vai fazer. */
export const unblockNote = (key: string): string =>
  `${UNBLOCK_MARK} (${key}): o heartbeat chamou a IA para resolver a causa do bloqueio desta história e devolver o trabalho à fila. Se a causa depender de você, ela continua bloqueada com o que falta.`;

/**
 * Histórias que a rodada tenta destravar: a história ou uma sub-tarefa dela bloqueada pela IA ou pelo board.
 * Bloqueio não é fim de linha: a causa costuma ser algo que a própria IA resolve (rodar uma checagem que a
 * sub-tarefa não podia, trazer a base certa, registrar uma dependência), e esperar a pessoa parava o board.
 * Ficam de fora o bloqueio que a pessoa pôs (é uma espera combinada com ela), o de limite de uso (a arrumação
 * devolve), a história com mensagem da pessoa sem resposta (a resposta trata) ou com execução em andamento, e
 * a que já teve esta mesma chave tentada ou `MAX_UNBLOCK_ATTEMPTS` tentativas desde o último gesto da pessoa.
 * Entram as do modo autônomo: o autopiloto não mexe em história bloqueada. Pura.
 */
export function unblockTargets(s: BoardState): Card[] {
  const unanswered = new Set(pendingWork(s).ai.unanswered.map((c) => c.id));
  return s.cards
    .filter((story) => {
      if (!isLive(story) || story.parentId || columnOf(s, story)?.category !== 'open') return false;
      const family = [story, ...childrenOf(s, story.id).filter((c) => isLive(c) && columnOf(s, c)?.category === 'open')];
      const blocked = family.filter((c) => c.status === 'blocked');
      if (!blocked.length) return false;
      if (blocked.some((c) => c.statusBy === s.currentUser || USAGE_LIMIT_TEXT.test(c.statusReason))) return false;
      if (unanswered.has(story.id) || family.some((c) => isAiWorking(s, c))) return false;
      if (cardCliProblem(s, story) || cardRunUnsupported(s, story)) return false;
      const ids = new Set(family.map((c) => c.id));
      const lastHuman = Math.max(
        0,
        ...s.comments.filter((m) => ids.has(m.cardId) && m.source === 'human').map((m) => m.createdAt),
        ...family.filter((c) => c.statusBy === s.currentUser && c.statusAt !== null).map((c) => c.statusAt!),
      );
      const tries = s.comments.filter((m) => m.cardId === story.id && isUnblockNote(m));
      const key = unblockKey(s, story);
      if (tries.some((m) => m.body.startsWith(`${UNBLOCK_MARK} (${key})`))) return false;
      return tries.filter((m) => m.createdAt > lastHuman).length < MAX_UNBLOCK_ATTEMPTS;
    })
    .sort((a, b) => a.number - b.number);
}

/** Histórias paradas com a pessoa há `STALE_DAYS` ou mais, ainda sem o aviso desta parada na conversa. */
export function staleWithHuman(s: BoardState, now: number): Card[] {
  const limit = STALE_DAYS * 24 * 60 * 60_000;
  return s.cards.filter((c) => {
    if (!isLive(c) || c.parentId || !isWithHuman(c) || c.statusAt === null) return false;
    if (columnOf(s, c)?.category !== 'open' || now - c.statusAt < limit) return false;
    return !s.comments.some((m) => m.cardId === c.id && m.createdAt >= c.statusAt! && m.body.includes(STALE_MARK));
  });
}

/**
 * Histórias com conflito pendente no pull request que a rodada pode tratar agora: vivas, em coluna
 * aberta, com pull request e sem execução (nela nem numa sub-tarefa). Entram as do modo autônomo e as
 * que estão com a pessoa esperando revisão (resolver conflito é trabalho da IA, e o status volta no
 * fim); ficam de fora a bloqueada e a que espera resposta, que estão com a pessoa de verdade. Pura.
 */
export function conflictTargets(s: BoardState, pending: ReadonlySet<string>): Card[] {
  if (!pending.size) return [];
  return s.cards.filter(
    (c) =>
      pending.has(c.id) &&
      isLive(c) &&
      !c.parentId &&
      c.prUrl !== '' &&
      columnOf(s, c)?.category === 'open' &&
      c.status !== 'blocked' &&
      c.status !== 'waiting_answer' &&
      !isAiWorking(s, c) &&
      !childrenOf(s, c.id).some((k) => isLive(k) && isAiWorking(s, k)) &&
      !cardCliProblem(s, c) &&
      !cardRunUnsupported(s, c),
  );
}

/**
 * A fila de uma rodada: cada história uma vez, com o que fazer nela. Os conflitos de pull request vêm
 * primeiro (a história com conflito trabalha a fase só na rodada seguinte), depois os desbloqueios, depois
 * resumir antes de trabalhar a fase, resumos e refinamentos.
 */
export function heartbeatQueue(s: BoardState, conflicts: ReadonlySet<string> = new Set()): HeartbeatItem[] {
  const items: HeartbeatItem[] = [];
  const seen = new Set<string>();
  const push = (card: Card, mode: AiRunMode) => {
    if (seen.has(card.id)) return;
    seen.add(card.id);
    items.push({ id: card.id, mode });
  };
  for (const card of conflictTargets(s, conflicts)) push(card, 'conflict');
  // a história bloqueada vem antes do trabalho novo: destravar é o que libera as que dependem dela
  for (const card of unblockTargets(s)) push(card, 'unblock');
  const summaries = new Set(summaryTargets(s).map((c) => c.id));
  for (const card of heartbeatTargets(s)) push(card, summaries.has(card.id) ? 'summarize' : 'phase');
  for (const card of summaryTargets(s)) push(card, 'summarize');
  for (const card of refineTargets(s)) push(card, 'refine');
  return items;
}

/** O motivo de um perfil de CLI não poder executar, na frase da rodada. */
const PROBLEM_REASON: Record<CliProblem, (profile: string) => string> = {
  cli: (p) => `a CLI do ${p} não foi encontrada`,
  signin: (p) => `o login do ${p} venceu`,
  expired: (p) => `o login do ${p} venceu`,
};

/**
 * Por que uma rodada não tem o que executar: o motivo que vai para o log e para a pessoa. Cada causa
 * é uma das condições em que `heartbeatTargets` ou `pump` deixam um card de fora.
 */
export function heartbeatIdleReason(s: BoardState): string {
  // um perfil por vez, na ordem de `profilesInUse` (o padrão primeiro)
  for (const profile of profilesInUse(s)) {
    const problem = cliProblem(s, profile.id);
    if (problem) return `${PROBLEM_REASON[problem](profileLabel(s.board, profile.id))} (veja o aviso no topo do board).`;
  }
  if (noProfileAvailable(s)) return 'nenhum perfil de CLI ligado está disponível (veja o aviso no topo do board).';
  const p = pendingWork(s);
  const queue = aiQueue(s, p);
  if (!queue.length) return 'nada pendente com a IA.';
  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const stories = new Map<string, Card>();
  for (const c of queue) {
    const st = c.parentId ? byId.get(c.parentId) : c;
    if (st) stories.set(st.id, st);
  }
  const why: string[] = [];
  for (const st of stories.values()) {
    let reason: string;
    if (st.yolo) reason = 'em modo autônomo (é do autopiloto)';
    else if (isAiWorking(s, st) || childrenOf(s, st.id).some((k) => isLive(k) && isAiWorking(s, k))) reason = 'já há uma execução nela';
    else if (isWithHuman(st) && !p.ai.unanswered.some((c) => c.id === st.id)) reason = 'está com a pessoa, sem mensagem pendente';
    else if (openPredecessors(s, st.id).length) reason = 'espera outro card em aberto';
    else continue;
    why.push(`${cardRef(st)} ${reason}`);
  }
  return why.length ? `nenhuma história pode executar agora: ${why.join('; ')}.` : 'nada pendente com a IA.';
}

const MODE_LABEL: Record<AiRunMode, string> = {
  phase: 'fase',
  refine: 'refinar',
  summarize: 'resumir',
  conflict: 'conflito',
  reply: 'resposta',
  unblock: 'desbloqueio',
};

/**
 * Rotina periódica: a cada rodada, primeiro arruma o board (devolve para a IA os cards bloqueados por
 * limite de uso, avisa dos cards parados com a pessoa), depois espera a manutenção (`onRound`: merges e
 * sincronização das branches) e só então executa a ferramenta do projeto para
 * cada história da fila: resolve o conflito do pull request (na frente de tudo), resume a conversa que
 * cresceu, refina os cards novos do Backlog e trabalha a fase dos cards prontos. As vagas são por tipo de atividade (`limitOf`): refinar, resumir e as fases
 * de texto (só produzem documento) vão até `parallelStories` em qualquer modo; as que mexem em código
 * vão uma por vez ou, no modo worktree com o paralelo ligado, até o limite configurado. Cada teto conta
 * as execuções já em andamento daquele tipo: a rodada ocupa só as vagas livres. Sem pendência, não
 * executa nada. Não depende da API do VSCode.
 */
export class Heartbeat {
  private queue: HeartbeatItem[] = [];
  private lastRoundAt: number;
  private listeners = new Set<() => void>();
  /**
   * A vaga que acabou de abrir é do autopiloto: a execução que terminou não era dele. Assim as duas filas
   * se intercalam quando disputam a mesma vaga, em vez de uma esperar a outra esvaziar.
   */
  private yieldToAutopilot = true;
  /** A manutenção da rodada está em andamento: a fila da IA espera o fim dela (`pump` não inicia nada). */
  private holding = false;
  /** a manutenção que o `holding` espera: só o fim da mais recente libera a fila */
  private maintenance: Promise<void> | null = null;

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

  /**
   * Enfileira a história do card (ou o próprio card, se for uma história) para trabalhar a fase e tenta
   * iniciar na hora, sem esperar a rodada e sem depender de `runner.heartbeat`: é o que a aprovação de
   * uma pessoa pede com o heartbeat desligado. Respeita os tetos de paralelismo; sem vaga, fica na fila.
   */
  enqueue(cardId: string): void {
    const card = this.deps.snapshot().cards.find((c) => c.id === cardId);
    const storyId = card?.parentId ?? card?.id;
    if (storyId && !this.queue.some((i) => i.id === storyId)) this.queue.push({ id: storyId, mode: 'phase' });
    this.pump();
  }

  /** Esvazia a fila e interrompe a execução em andamento. */
  stop(): void {
    this.queue = [];
    for (const id of this.runner.running) this.runner.stop(id);
    this.changed();
  }

  get busy(): boolean {
    return this.holding || this.queue.length > 0 || this.runner.running.length > 0;
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
    // a arrumação vem antes da manutenção: o card que volta para a IA já entra na fila desta rodada
    this.tidy();
    const s = this.deps.snapshot();
    this.queue = heartbeatQueue(s, this.conflicts());
    const count = this.queue.length;
    const byId = new Map(s.cards.map((c) => [c.id, c]));
    const describe = (i: HeartbeatItem) => `${cardRef(byId.get(i.id)!)} (${MODE_LABEL[i.mode]})`;
    // o resumo da rodada: o que está com a pessoa aparece antes do que a IA vai tocar
    const withHuman = s.cards.filter((c) => isLive(c) && !c.parentId && isWithHuman(c) && columnOf(s, c)?.category === 'open').length;
    if (withHuman) this.deps.log(`Heartbeat: ${withHuman} história(s) com você (revisão, resposta ou bloqueio).`);
    this.deps.log(
      count ? `Heartbeat: ${count} história(s) na rodada: ${this.queue.map(describe).join(', ')}.` : `Heartbeat: ${heartbeatIdleReason(s)}`,
    );
    // a fila é montada antes da manutenção (é ela que dá o número na hora); o que perder a validade
    // enquanto isso (história concluída pelo merge, por exemplo) cai no `stillValid` do `pump`
    const maintenance = this.deps.onRound?.();
    if (!(maintenance instanceof Promise)) {
      this.pump();
      return count;
    }
    this.holding = true;
    this.maintenance = maintenance;
    this.changed();
    void maintenance
      .catch(() => undefined)
      .finally(() => {
        if (this.maintenance !== maintenance) return;
        this.maintenance = null;
        this.holding = false;
        this.frontConflicts();
        this.pump();
      });
    return count;
  }

  private conflicts(): ReadonlySet<string> {
    return this.deps.conflicts?.() ?? new Set();
  }

  /**
   * Os conflitos que a manutenção desta rodada acabou de achar vão para o começo da fila, no lugar do que
   * estava previsto para a mesma história: a fila foi montada antes da manutenção (é ela que dá o número
   * da rodada na hora), e a IA trata o conflito ainda nesta rodada.
   */
  private frontConflicts(): void {
    const s = this.deps.snapshot();
    const front = conflictTargets(s, this.conflicts())
      .filter((c) => !this.queue.some((i) => i.id === c.id && i.mode === 'conflict'))
      .map((c): HeartbeatItem => ({ id: c.id, mode: 'conflict' }));
    if (!front.length) return;
    const ids = new Set(front.map((i) => i.id));
    this.queue = [...front, ...this.queue.filter((i) => !ids.has(i.id))];
    const byId = new Map(s.cards.map((c) => [c.id, c]));
    this.deps.log(
      `Heartbeat: conflito no pull request de ${front.map((i) => cardRef(byId.get(i.id)!)).join(', ')}; a IA resolve nesta rodada.`,
    );
  }

  /**
   * A arrumação da rodada, sem IA: o card bloqueado por limite de uso volta para a IA (o limite renova
   * sozinho; a execução é repetida na própria rodada), e a história parada com a pessoa há dias ganha um
   * aviso na conversa, uma vez por parada.
   */
  private tidy(): void {
    const act = this.deps.act;
    if (!act) return;
    const s = this.deps.snapshot();
    for (const c of usageLimitBlocked(s)) {
      this.deps.log(`Heartbeat: ${cardRef(c)} estava bloqueado por limite de uso; voltou para a IA.`);
      act({ type: 'card.status.set', cardId: c.id, status: 'ready' });
      act({ type: 'comment.add', cardId: c.id, body: `O card ${USAGE_RELEASE_MARK}, e a execução é repetida pelo heartbeat.` });
    }
    for (const c of staleWithHuman(s, this.deps.now())) {
      const days = Math.floor((this.deps.now() - c.statusAt!) / (24 * 60 * 60_000));
      const what =
        c.status === 'blocked' ? 'bloqueado' : c.status === 'waiting_answer' ? 'esperando a sua resposta' : 'esperando a sua revisão';
      this.deps.log(`Heartbeat: ${cardRef(c)} ${STALE_MARK} ${days} dia(s) (${what}).`);
      act({
        type: 'comment.add',
        cardId: c.id,
        body: `Este card ${STALE_MARK} ${days} dia(s), ${what}. A IA só segue depois que você resolver.`,
      });
    }
  }

  /** O item ainda vale, com o board de agora: a situação pode ter mudado desde que a fila foi montada. */
  private stillValid(s: BoardState, item: HeartbeatItem): Card | undefined {
    if (item.mode === 'refine') return refineTargets(s).find((c) => c.id === item.id);
    if (item.mode === 'summarize') return summaryTargets(s).find((c) => c.id === item.id);
    if (item.mode === 'conflict') return conflictTargets(s, this.conflicts()).find((c) => c.id === item.id);
    if (item.mode === 'unblock') return unblockTargets(s).find((c) => c.id === item.id);
    return heartbeatTargets(s).find((c) => c.id === item.id);
  }

  /**
   * Inicia as histórias da fila que têm vaga no tipo de atividade delas. Cada teto conta toda execução em
   * andamento daquele tipo (também as chamadas à mão e o modo autônomo), para o board nunca passar do que
   * a pessoa configurou. Uma história sem vaga fica na fila sem travar as dos outros tipos. Quando o
   * autopiloto está esperando vaga, uma do tipo que ele quer fica guardada para ele (ver `yieldToAutopilot`).
   */
  private pump(): void {
    // durante a manutenção nada começa: uma execução que termina ou uma aprovação esperam o fim dela,
    // em vez de cruzar com a sincronização das branches
    if (this.holding) return void this.changed();
    const s = this.deps.snapshot();
    // nenhum perfil disponível: não insiste sozinho, a pessoa resolve
    if (noProfileAvailable(s)) {
      if (this.queue.length) this.deps.log(`Heartbeat: ${heartbeatIdleReason(s)}`);
      this.queue = [];
      return void this.changed();
    }
    const counts = runningByKind(s, this.runner.running);
    const wants = autopilotStep(s);
    const reservedKind: ActivityKind | null = this.yieldToAutopilot && s.autopilot.active && wants.kind === 'run' ? wants.activity : null;
    const limit = (kind: ActivityKind) => limitOf(s.board.runner, s.board.git.mode, kind) - (kind === reservedKind ? 1 : 0);
    const rest: HeartbeatItem[] = [];
    const waiting: Record<ActivityKind, number> = { text: 0, branch: 0 };
    const pausedProfiles = new Map<string, { message: string; count: number }>();
    for (const item of this.queue) {
      const current = this.deps.snapshot();
      const card = this.stillValid(current, item);
      if (!card) continue;
      // refinar e resumir só produzem texto: nunca ocupam a vaga de branch; o conflito sempre ocupa
      const kind = activityKindOf(current, card, item.mode);
      if (counts[kind] >= limit(kind)) {
        rest.push(item);
        waiting[kind]++;
        continue;
      }
      try {
        if (item.mode === 'phase' && this.deps.driver && orchestratesStory(current, card)) this.drive(this.deps.driver, card);
        else {
          const key = item.mode === 'unblock' ? unblockKey(current, card) : null;
          this.runner.start(item.id, 'heartbeat', item.mode);
          // a nota marca a chave como tentada e devolve as sub-tarefas à IA; só depois de a execução começar,
          // senão uma recusa (perfil pausado pelo limite de uso) gastava a tentativa sem ter rodado
          if (key) this.deps.act?.({ type: 'comment.add', cardId: card.id, body: unblockNote(key) });
        }
        counts[kind]++;
      } catch (e) {
        // perfil pausado pelo limite de uso: só as histórias dele ficam para a rodada em que a pausa vencer; os outros
        // perfis seguem. Não é falha, então a fila não é esvaziada
        // card esperando a retentativa por falha transitória: o runner o repete depois do backoff
        if (e instanceof RetryHeld) continue;
        if (e instanceof UsageLimitHeld) {
          const held = pausedProfiles.get(e.profileId);
          pausedProfiles.set(e.profileId, { message: e.message, count: (held?.count ?? 0) + 1 });
          continue;
        }
        this.deps.log(`Heartbeat: ${e instanceof Error ? e.message : String(e)}`);
        // sem como executar a ferramenta, não adianta tentar as demais
        this.queue = [];
        this.changed();
        return;
      }
    }
    this.queue = rest;
    for (const { message, count } of pausedProfiles.values()) this.deps.log(`Heartbeat: ${message} ${count} história(s) esperando.`);
    if (waiting.branch) this.deps.log(`Heartbeat: ${waiting.branch} história(s) com branch esperando vaga.`);
    if (waiting.text) this.deps.log(`Heartbeat: ${waiting.text} história(s) em fase de texto esperando vaga.`);
    this.changed();
  }

  /** A história é do orquestrador: a posse única decide se esta chamada inicia algo; a recusa vai para o log. */
  private drive(driver: StoryDriver, story: Card): void {
    driver
      .drive(story.id, 'heartbeat')
      .catch((e: unknown) => this.deps.log(`Heartbeat: ${cardRef(story)}: ${e instanceof Error ? e.message : String(e)}`));
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
