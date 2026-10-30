import { catalogTool } from '../shared/aiProfiles';
import { PHASE_FIELD } from '../shared/boardFields';
import { BOARD_AUTHOR } from '../shared/gitflow';
import type { BoardState, Card } from '../shared/model';
import { isHandPicked, modelFieldOf, modelLabel, parseModelValue } from '../shared/models';
import { profileAvailable } from '../shared/profileAvailability';
import type { ModelLadders } from '../shared/modelLadder';
import { isCheapTier, pickReviewerModel, reviewerFloor, type ReviewerPick } from '../shared/reviewerModel';
import { runTargetOf } from '../shared/runTarget';
import { childrenOf, isLive, valueOf } from '../shared/selectors';
import type { BoardContext } from './panel/handlers/context';

export interface ReviewerDeps {
  ctx: BoardContext;
  log: (line: string) => void;
}

/** A Fase das sub-tarefas de revisão e a das que implementam: o nome da coluna da história. */
const REVIEW_PHASE = 'Revisão';
const IMPLEMENTATION_PHASE = 'Implementação';

const cardRef = (c: Card): string => `#${c.number}`;

const phaseOf = (state: BoardState, card: Card): string | null => {
  const field = state.fieldDefs.find((f) => f.name === PHASE_FIELD);
  const v = field ? valueOf(state, card.id, field.id) : null;
  return typeof v === 'string' ? v : null;
};

/** O modelo que o card usa agora: o do campo ou o efetivo (agente, regra, padrão). */
function modelOf(state: BoardState, card: Card): string {
  const field = modelFieldOf(state, card);
  const own = field ? valueOf(state, card.id, field.id) : null;
  return typeof own === 'string' && own ? own : (runTargetOf(state, card)?.value ?? '');
}

/**
 * O modelo que implementou a história: a moda dos modelos efetivos das sub-tarefas de Implementação (empate: o da
 * sub-tarefa mais recente). Sem sub-tarefas de Implementação com modelo, o da própria história; sem ele, null.
 */
export function implementerModelOf(d: ReviewerDeps, storyId: string): string | null {
  const state = d.ctx.state();
  const story = state.cards.find((c) => c.id === storyId);
  if (!story) return null;
  const counts = new Map<string, { n: number; at: number }>();
  const subtasks = childrenOf(state, story.id)
    .filter((c) => isLive(c) && phaseOf(state, c) === IMPLEMENTATION_PHASE)
    .sort((a, b) => a.updatedAt - b.updatedAt || a.number - b.number);
  for (const c of subtasks) {
    const value = modelOf(state, c);
    if (!value) continue;
    // a ordem crescente deixa `at` na sub-tarefa mais recente que usou o valor
    counts.set(value, { n: (counts.get(value)?.n ?? 0) + 1, at: c.updatedAt });
  }
  let best: string | null = null;
  for (const [value, c] of counts) {
    const top = best ? counts.get(best)! : null;
    if (!top || c.n > top.n || (c.n === top.n && c.at >= top.at)) best = value;
  }
  return best ?? (modelOf(state, story) || null);
}

/** Os catálogos dos perfis ligados que podem responder agora (as cópias contam como o catálogo de origem). */
function readyCatalogs(state: BoardState): string[] {
  const ids = state.board.aiProfiles.filter((p) => p.enabled && profileAvailable(state, p.id)).map((p) => catalogTool(p) as string);
  return [...new Set(ids)];
}

/** O perfil de catálogo de um valor `tool:model@effort`. */
const catalogOf = (value: string): string => {
  const id = parseModelValue(value)?.id ?? '';
  return id.slice(0, Math.max(id.indexOf(':'), 0));
};

/** O piso do perfil do valor, quando o valor é do nível barato e há um acima dele. */
function withFloor(catalog: BoardState['board']['modelCatalog'], ladders: ModelLadders, value: string): ReviewerPick | null {
  const floor = reviewerFloor(catalog, ladders, catalogOf(value));
  return floor ? { value: floor, independence: 'same_provider_fallback', reason: 'sem o modelo da implementação para comparar' } : null;
}

/**
 * Chamado por `create_card` depois de `setFields` e do gancho da subida de modelo, só com `parent`: na sub-tarefa de
 * Fase "Revisão" o board escolhe o modelo do revisor (outro agente ou modelo, nunca o barato). O escolhido à mão
 * nunca muda; o valor que a IA passou em `fields.Modelo` (`aiSetModel`) conta como da IA e só fica se já for
 * independente do implementador e não barato. Nunca lança: erro é logado e a sub-tarefa nasce como estava.
 */
export function applyReviewerModel(d: ReviewerDeps, newCardId: string, aiSetModel = false): void {
  try {
    apply(d, newCardId, aiSetModel);
  } catch (e) {
    d.log(`Modelo do revisor não aplicado a ${newCardId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function apply(d: ReviewerDeps, newCardId: string, aiSetModel: boolean): void {
  const { ctx } = d;
  const state = ctx.state();
  const card = state.cards.find((c) => c.id === newCardId);
  if (!card || !card.parentId || phaseOf(state, card) !== REVIEW_PHASE) return;
  const story = state.cards.find((c) => c.id === card.parentId);
  const field = modelFieldOf(state, card);
  if (!story || !field) return;
  if (!aiSetModel && isHandPicked(state, card)) return;

  const catalog = state.board.modelCatalog;
  const ladders = ctx.boards.modelLadders(state.board.id);
  const current = modelOf(state, card) || null;
  const implementer = implementerModelOf(d, story.id);

  // o valor da IA fica quando já é outro modelo que o do implementador e não é do nível barato
  const cheap = (value: string): boolean => isCheapTier(catalog, ladders, catalogOf(value), value);
  const implementerId = implementer ? parseModelValue(implementer)?.id : null;
  if (aiSetModel && current && !cheap(current) && (!implementerId || parseModelValue(current)?.id !== implementerId)) return;

  // sem implementador conhecido não há o que declarar de independência: só se garante o "nunca barato"
  const pick = implementer
    ? pickReviewerModel({
        catalog,
        ladders,
        readyProfileIds: readyCatalogs(state),
        implementer,
        current,
        configured: ctx.boards.reviewerModel(),
      })
    : current && cheap(current)
      ? withFloor(catalog, ladders, current)
      : null;
  if (!pick || pick.value === current) return;

  ctx.cards.setFieldValue(card.id, field.id, pick.value);
  const label = (v: string) => modelLabel(catalog, v);
  const detail = `${label(pick.value)} (implementação: ${implementer ? label(implementer) : 'modelo não identificado'}).${pick.reason ? ` ${pick.reason}.` : ''}`;
  ctx.comments.add(card.id, BOARD_AUTHOR, `Revisor definido pelo board: ${detail}`, 'ai');
  ctx.comments.add(story.id, BOARD_AUTHOR, `Revisor de ${cardRef(card)} definido pelo board: ${detail}`, 'ai');
}
