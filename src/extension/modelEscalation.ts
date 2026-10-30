import { PHASE_FIELD } from '../shared/boardFields';
import { BOARD_AUTHOR } from '../shared/gitflow';
import type { BoardState, Card } from '../shared/model';
import { isHandPicked, modelFieldOf, modelLabel } from '../shared/models';
import { nextTier, tierRank } from '../shared/modelLadder';
import { cliOfValue, runTargetOf } from '../shared/runTarget';
import { childrenOf, columnOf, isLive, valueOf } from '../shared/selectors';
import type { BoardContext } from './panel/handlers/context';
import type { GateRun } from './repositories/gateRepo';
import type { EscalationRepo } from './repositories/escalationRepo';

export interface EscalationDeps {
  ctx: BoardContext;
  repo: EscalationRepo;
  log: (line: string) => void;
}

const cardRef = (c: Card): string => `#${c.number}`;

/** O modelo que o card usaria agora: o do campo ou o efetivo (agente, regra, padrão). */
function currentModel(state: BoardState, card: Card): string {
  const field = modelFieldOf(state, card);
  const own = field ? valueOf(state, card.id, field.id) : null;
  return typeof own === 'string' && own ? own : (runTargetOf(state, card)?.value ?? '');
}

/** O nome do perfil de CLI que executa o valor (ou, sem valor, o card). */
function cliOf(state: BoardState, card: Card, value: string) {
  return cliOfValue(state.board, value) ?? runTargetOf(state, card)?.cli ?? null;
}

/** A sub-tarefa viva da história cuja Fase é a coluna do portão. */
function phaseChildren(state: BoardState, story: Card, phase: string): Card[] {
  const field = state.fieldDefs.find((f) => f.name === PHASE_FIELD);
  if (!field) return [];
  return childrenOf(state, story.id).filter((c) => isLive(c) && valueOf(state, c.id, field.id) === phase);
}

/** A última sub-tarefa concluída da fase (a que "errou"), ou null. */
function lastDone(state: BoardState, children: Card[]): Card | null {
  const done = children.filter((c) => columnOf(state, c)?.category === 'done');
  return done.sort((a, b) => b.updatedAt - a.updatedAt || b.number - a.number)[0] ?? null;
}

/**
 * O portão falhou (`failed`): decide, sem a IA, a subida de modelo da correção. Chamado por `failGate` depois de o
 * card voltar para `ready`; nunca para `interrupted`. O caminho 1 sobe o Modelo do próprio card (que será reexecutado);
 * o caminho 2 (história com sub-tarefas na fase) deixa a subida pendente para a sub-tarefa de correção que a IA criar.
 * A unidade (card + coluna do portão) sobe uma vez: a segunda falha depois de uma subida passa o card para a pessoa.
 */
export function onGateFailed(d: EscalationDeps, run: GateRun, failedCheck: string | undefined): void {
  const { ctx, repo } = d;
  const state = ctx.state();
  const card = state.cards.find((c) => c.id === run.cardId);
  if (!card || !isLive(card)) return;
  const check = failedCheck || 'sem nome';
  const say = (target: Card, body: string): void => void ctx.comments.add(target.id, BOARD_AUTHOR, body, 'ai');

  const previous = repo.forUnit(card.id, run.columnId);
  if (previous?.status === 'applied') {
    const body = `A checagem "${check}" falhou de novo depois de subir o modelo; o card passou para a pessoa.`;
    ctx.cards.setStatus(card.id, 'blocked', body, BOARD_AUTHOR);
    say(card, body);
    return;
  }
  // pendente: a correção ainda não foi criada, então não há o que subir de novo
  if (previous) return;

  const phase = state.columns.find((c) => c.id === run.columnId)?.name ?? '';
  const children = card.parentId ? [] : phaseChildren(state, card, phase);
  if (children.length > 0) return escalateCorrection(d, state, card, run, check, lastDone(state, children) ?? card, say);

  // caminho 1: o próprio card é reexecutado com o modelo acima
  const field = modelFieldOf(state, card);
  if (!field) return;
  if (isHandPicked(state, card)) return say(card, `O modelo de ${cardRef(card)} não subiu: foi escolhido à mão.`);
  const current = currentModel(state, card);
  const cli = cliOf(state, card, current);
  const next = cli && current ? nextTier(state.board.modelCatalog, ctx.boards.modelLadders(state.board.id), cli.id, current) : null;
  if (!cli || !next) return say(card, noTier(state, current, cli?.name));
  if (!record(d, { card, run, check, from: current, to: next, target: card.id, status: 'applied' })) return;
  ctx.cards.setFieldValue(card.id, field.id, next);
  say(card, risen(state, current, next, check));
}

/**
 * Chamado por `create_card` depois de `setFields`, só com `parent`: se a história tem subida pendente e a Fase da
 * sub-tarefa nova é a coluna do portão que falhou, grava o modelo acima no campo Modelo (nunca baixa o que já estava
 * lá, inclusive o que a IA passou em `fields`) e marca a subida como aplicada. Outra Fase não consome a pendência.
 */
export function applyPending(d: EscalationDeps, newCardId: string): void {
  const { ctx, repo } = d;
  const state = ctx.state();
  const card = state.cards.find((c) => c.id === newCardId);
  if (!card || !card.parentId) return;
  const story = state.cards.find((c) => c.id === card.parentId);
  if (!story) return;
  const pending = repo.pendingFor(story.id);
  if (!pending) return;
  const phaseField = state.fieldDefs.find((f) => f.name === PHASE_FIELD);
  const phase = state.columns.find((c) => c.id === pending.columnId)?.name;
  if (!phaseField || !phase || valueOf(state, card.id, phaseField.id) !== phase) return;
  const field = modelFieldOf(state, card);
  if (!field) return;
  const say = (target: Card, body: string): void => void ctx.comments.add(target.id, BOARD_AUTHOR, body, 'ai');
  const current = currentModel(state, card);
  const cli = cliOf(state, card, pending.toModel);
  const ladders = ctx.boards.modelLadders(state.board.id);
  const catalog = state.board.modelCatalog;
  const label = (v: string) => modelLabel(catalog, v);
  if (current && cli && tierRank(catalog, ladders, cli.id, current) >= tierRank(catalog, ladders, cli.id, pending.toModel)) {
    repo.markApplied(pending.id, card.id);
    say(card, `O modelo ficou em ${label(current)}: já estava em nível igual ou acima de ${label(pending.toModel)}.`);
    say(story, `A correção ${cardRef(card)} já estava em nível igual ou acima de ${label(pending.toModel)}; o modelo não foi alterado.`);
    return;
  }
  ctx.cards.setFieldValue(card.id, field.id, pending.toModel);
  repo.markApplied(pending.id, card.id);
  say(card, risen(state, pending.fromModel, pending.toModel, pending.check));
  say(story, `A correção ${cardRef(card)} usará ${label(pending.toModel)} porque a checagem "${pending.check}" falhou.`);
}

/** Caminho 2: grava a subida pendente com a base na última sub-tarefa concluída da fase (fallback: a história). */
function escalateCorrection(
  d: EscalationDeps,
  state: BoardState,
  story: Card,
  run: GateRun,
  check: string,
  base: Card,
  say: (target: Card, body: string) => void,
): void {
  const current = currentModel(state, base);
  const cli = cliOf(state, base, current);
  const next = cli && current ? nextTier(state.board.modelCatalog, d.ctx.boards.modelLadders(state.board.id), cli.id, current) : null;
  if (!cli || !next) return say(story, noTier(state, current, cli?.name));
  if (!record(d, { card: story, run, check, from: current, to: next, target: null, status: 'pending' })) return;
  const label = (v: string) => modelLabel(state.board.modelCatalog, v);
  say(story, `A correção subirá de ${label(current)} para ${label(next)} porque a checagem "${check}" falhou.`);
}

function record(
  d: EscalationDeps,
  a: { card: Card; run: GateRun; check: string; from: string; to: string; target: string | null; status: 'pending' | 'applied' },
): boolean {
  try {
    d.repo.record({
      cardId: a.card.id,
      columnId: a.run.columnId,
      gateRunId: a.run.id,
      check: a.check,
      fromModel: a.from,
      toModel: a.to,
      targetCardId: a.target,
      status: a.status,
    });
    return true;
  } catch (e) {
    // UNIQUE(card_id, column_id): outro portão da mesma história chegou antes; a unidade já tem a subida dela
    d.log(`Subida de modelo de ${cardRef(a.card)} não gravada (a unidade já tem uma): ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

const risen = (state: BoardState, from: string, to: string, check: string): string =>
  `Modelo subiu de ${modelLabel(state.board.modelCatalog, from)} para ${modelLabel(state.board.modelCatalog, to)} porque a checagem "${check}" falhou.`;

const noTier = (state: BoardState, current: string, profile: string | undefined): string =>
  `Sem nível acima ${current ? `de ${modelLabel(state.board.modelCatalog, current)}` : 'do modelo padrão'} para o agente ${profile ?? 'sem perfil'}.`;
