import { PHASE_FIELD } from '../shared/boardFields';
import {
  BUDGET_META_KEY,
  budgetCardKey,
  budgetLevel,
  budgetNote,
  budgetStateKey,
  ceilingOf,
  parseBudget,
  parseBudgetState,
  parseCardCeiling,
  planDowngrade,
  type BudgetConfig,
  type BudgetState,
  type DowngradeInput,
} from '../shared/budget';
import type { AiRunOrigin } from '../shared/log';
import type { WebviewToHost } from '../shared/messages';
import type { BoardState, Card } from '../shared/model';
import { EFFORT_FIELD, isHandPicked, modelFieldOf, modelLabel } from '../shared/models';
import { previousTier, type ModelLadders } from '../shared/modelLadder';
import { cliOfValue, runTargetOf } from '../shared/runTarget';
import type { AiRunMode } from '../shared/runner';
import { childrenOf, columnOf, isLive, valueOf } from '../shared/selectors';
import { isWithHuman, storyOf } from '../shared/story';
import type { CardUsage } from '../shared/cardUsage';

const AUTHOR = 'Faz AI';
const REVIEW_PHASE = 'Revisão';

/**
 * O início automático foi recusado porque a história chegou ao teto de consumo. Como `UsageLimitHeld`, não é falha:
 * quem despacha (heartbeat, autopiloto, orquestrador) registra o motivo e segue com as outras histórias.
 */
export class BudgetExceeded extends Error {
  constructor(
    readonly storyId: string,
    readonly used: number,
    readonly ceiling: number,
  ) {
    super(
      `A história atingiu o teto de consumo (${used.toLocaleString('pt-BR')} de ${ceiling.toLocaleString('pt-BR')} tokens); o board não inicia mais execuções dela sozinho.`,
    );
    this.name = 'BudgetExceeded';
  }
}

/** O que o guarda usa do router: o estado, o `meta`, o gasto lido do log e `handle` (como o disjuntor de falhas). */
export interface BudgetRouter {
  snapshot(): BoardState;
  handle(msg: WebviewToHost, origin: { author?: string; source?: 'ai' | 'human' }): unknown;
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;
  storyTokens(storyId: string): { tokens: number; measured: number; runs: number };
  cardUsage(cardId: string): Pick<CardUsage, 'total'>;
}

export interface BudgetDeps {
  router: BudgetRouter;
  ladders: () => ModelLadders;
  /** o card (ou a unidade dele) teve o modelo subido por uma checagem: a subida prevalece sobre a descida */
  escalated: (cardId: string) => boolean;
  log: (line: string) => void;
}

/** O que `check` e `onRunFinished` precisam saber da história numa leitura só. */
interface Reading {
  story: Card;
  used: number;
  ceiling: number;
  warnAt: number;
  config: BudgetConfig;
  unmeasured: number;
  state: BudgetState;
}

/**
 * Teto de consumo por história. Falha aberta: um erro daqui (leitura do gasto, do `meta`) vai para o log e a
 * execução segue como seguiria sem teto. O que o guarda não faz: interromper a execução em curso, nem recusar a
 * que a pessoa inicia à mão.
 */
export class BudgetGuard {
  constructor(private readonly deps: BudgetDeps) {}

  /**
   * Antes de um início. Lança `BudgetExceeded` quando a história está em 100% e quem inicia não é a pessoa; o
   * resumo e a resolução de conflito passam (diminuem contexto futuro e fecham trabalho em curso).
   */
  check(cardId: string, origin: AiRunOrigin, mode: AiRunMode): void {
    let refusal: BudgetExceeded | null = null;
    try {
      if (mode === 'summarize' || mode === 'conflict') return;
      const r = this.read(cardId);
      if (!r || budgetLevel(r.used, r.ceiling, r.warnAt) !== 'exceeded') return;
      if (origin === 'manual') {
        // a pessoa está presente e decide: a execução roda, e a nota avisa uma vez por teto
        this.markStopped(r, () => this.say(r.story, budgetNote.manualAbove));
        return;
      }
      // a nota vem antes da recusa; o estado é gravado antes da nota (várias execuções em paralelo não repetem)
      this.markStopped(r, () => this.passToHuman(r.story, budgetNote.stopped(r.used, r.ceiling, r.unmeasured)));
      refusal = new BudgetExceeded(r.story.id, r.used, r.ceiling);
    } catch (e) {
      this.safeLog(e);
    }
    if (refusal) throw refusal;
  }

  /** No fim de cada execução da história. Aplica a política uma vez por teto. Nunca lança. */
  onRunFinished(cardId: string, mode: AiRunMode): void {
    try {
      // só o que trabalha a história conta: refinar, resumir e resolver conflito não são uma etapa dela
      if (mode === 'refine' || mode === 'summarize' || mode === 'conflict') return;
      const r = this.read(cardId);
      if (!r) return;
      const level = budgetLevel(r.used, r.ceiling, r.warnAt);
      if (level === 'ok') return;
      if (level === 'exceeded') {
        this.markStopped(r, () => this.passToHuman(r.story, budgetNote.stopped(r.used, r.ceiling, r.unmeasured)));
        return;
      }
      if (r.state.warned) return;
      this.save(r.story.id, { ...r.state, warned: true });
      this.applyPolicy(r);
    } catch (e) {
      this.safeLog(e);
    }
  }

  /** Lê config, teto e gasto da história do card; null quando o teto não se aplica ou não há base para medir. */
  private read(cardId: string): Reading | null {
    const { router } = this.deps;
    const config = parseBudget(router.getMeta(BUDGET_META_KEY));
    if (!config.enabled) return null;
    const state = router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    const story = card ? storyOf(state, card) : undefined;
    if (!story || !isLive(story) || columnOf(state, story)?.category !== 'open') return null;
    const field = state.fieldDefs.find((f) => f.name.toLowerCase() === EFFORT_FIELD.toLowerCase());
    const effort = field ? valueOf(state, story.id, field.id) : null;
    const ceiling = ceilingOf(
      config,
      parseCardCeiling(router.getMeta(budgetCardKey(story.id))),
      typeof effort === 'string' ? effort : null,
    );
    if (ceiling === null) return null;
    const spent = router.storyTokens(story.id);
    // sem execução medida não há base: nunca "estourou" por falta de medição
    if (spent.measured === 0) return null;
    const saved = parseBudgetState(router.getMeta(budgetStateKey(story.id)));
    // subir (ou baixar) o teto rearma o aviso e a parada
    const current = saved && saved.ceiling === ceiling ? saved : { ceiling, warned: false, stopped: false };
    return {
      story,
      used: spent.tokens,
      ceiling,
      warnAt: config.warnAt,
      config,
      unmeasured: Math.max(0, spent.runs - spent.measured),
      state: current,
    };
  }

  private save(storyId: string, state: BudgetState): void {
    this.deps.router.setMeta(budgetStateKey(storyId), JSON.stringify(state));
  }

  /** Grava `stopped` e só então executa `act`; já parado neste teto, não faz nada. */
  private markStopped(r: Reading, act: () => void): void {
    if (r.state.stopped) return;
    this.save(r.story.id, { ...r.state, stopped: true });
    act();
  }

  /** Nota assinada pelo board (autor "Faz AI"). */
  private say(story: Card, body: string): void {
    this.deps.router.handle({ type: 'comment.add', cardId: story.id, body }, { author: AUTHOR, source: 'ai' });
  }

  /**
   * A nota e a vez para a pessoa. A história já com a pessoa (ou com uma execução própria em curso) só recebe a nota:
   * quem chegou primeiro (a pergunta dela, o disjuntor, o autopiloto) vence, e o status não é trocado por baixo.
   */
  private passToHuman(story: Card, note: string, status: 'blocked' | 'waiting_review' = 'blocked'): void {
    const current = this.deps.router.snapshot().cards.find((c) => c.id === story.id) ?? story;
    if (isWithHuman(current) || current.status === 'running' || current.status === 'verifying') return this.say(story, note);
    if (status === 'blocked') {
      // o bloqueio grava o motivo na conversa; a nota é o próprio motivo
      this.deps.router.handle({ type: 'card.status.set', cardId: story.id, status, note }, { author: AUTHOR, source: 'ai' });
      return;
    }
    // "aguardando revisão" pela IA passaria pelo portão de checagens da coluna; o board o põe direto, sem mensagem
    // de pessoa (ela devolveria a vez à IA)
    this.say(story, note);
    this.deps.router.handle({ type: 'card.status.set', cardId: story.id, status }, { author: AUTHOR, source: 'human' });
  }

  private applyPolicy(r: Reading): void {
    const { story, used, ceiling, config, unmeasured } = r;
    const warn = (action: string): string => budgetNote.warn(used, ceiling, action, unmeasured);
    if (config.policy === 'stop') return this.passToHuman(story, warn(budgetNote.actionStop), 'blocked');
    if (config.policy === 'downgrade') {
      const done = this.downgrade(story);
      if (done) return this.say(story, warn(done));
    }
    this.passToHuman(story, warn(budgetNote.actionFinish), 'waiting_review');
  }

  /** Desce um nível o que ainda não rodou; devolve a frase da nota, ou null quando nada pôde descer (cai em `finish`). */
  private downgrade(story: Card): string | null {
    const { router, ladders, escalated } = this.deps;
    const state = router.snapshot();
    const catalog = state.board.modelCatalog;
    const table = ladders();
    const phaseField = state.fieldDefs.find((f) => f.name === PHASE_FIELD);
    const subtasks = childrenOf(state, story.id).filter((c) => isLive(c) && columnOf(state, c)?.category === 'open');
    const cards = [story, ...subtasks];
    const inputs: DowngradeInput[] = cards.map((c) => {
      const field = modelFieldOf(state, c);
      const own = field ? valueOf(state, c.id, field.id) : null;
      const target = runTargetOf(state, c);
      const phase = phaseField ? valueOf(state, c.id, phaseField.id) : null;
      return {
        id: c.id,
        model: typeof own === 'string' && own ? own : (target?.value ?? null),
        handPicked: isHandPicked(state, c),
        escalated: escalated(c.id),
        review: phase === REVIEW_PHASE,
        // a história em execução e o card que já rodou não mudam no meio do caminho
        started: c.status === 'running' || c.status === 'verifying' || router.cardUsage(c.id).total.runs > 0,
      };
    });
    const byId = new Map(cards.map((c) => [c.id, c]));
    const previous = (id: string) => (model: string) => {
      const card = byId.get(id)!;
      const cli = cliOfValue(state.board, model) ?? runTargetOf(state, card)?.cli ?? null;
      // nunca troca de perfil de CLI: a troca de cota é de outra regra
      return cli ? previousTier(catalog, table, cli.id, model) : null;
    };
    // `planDowngrade` recebe uma função só; o nível abaixo depende do card (perfil), então planeja um a um
    const change: { id: string; from: string; to: string }[] = [];
    const kept: { id: string; reason: string }[] = [];
    for (const input of inputs) {
      const plan = planDowngrade([input], previous(input.id));
      change.push(...plan.change);
      kept.push(...plan.kept);
    }
    if (change.length === 0) return null;
    const ref = (id: string): string => `#${byId.get(id)!.number}`;
    for (const c of change) {
      const card = byId.get(c.id)!;
      const field = modelFieldOf(state, card);
      if (!field) continue;
      router.handle({ type: 'field.setValue', cardId: c.id, fieldId: field.id, value: c.to }, { author: AUTHOR, source: 'ai' });
    }
    const label = (v: string): string => modelLabel(catalog, v);
    return budgetNote.actionDowngrade(
      change.map((c) => `${ref(c.id)} (${label(c.from)} → ${label(c.to)})`),
      kept.map((k) => ({ id: ref(k.id), reason: k.reason })),
    );
  }

  private safeLog(e: unknown): void {
    try {
      this.deps.log(`Teto de consumo: ${e instanceof Error ? e.message : String(e)}`);
    } catch {
      // o log não pode derrubar o fim da execução
    }
  }
}
