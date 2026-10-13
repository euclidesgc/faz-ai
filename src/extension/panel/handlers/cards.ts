import { linkProblem } from '../../../shared/links';
import { norm } from '../../../shared/filters';
import { columnOf, isLive } from '../../../shared/selectors';
import { isAtYoloStop, lastAiColumn, yoloStopOptions } from '../../../shared/story';
import { CORE, CRITICALITY_FIELD, isCoreStory } from '../../../shared/critical';
import { fieldValueBlocker } from '../../../shared/boardFields';
import { settleDelivery } from '../../delivery';

import type { BoardState, Card } from '../../../shared/model';
import type { BoardContext, HandlerMap, MessageOf } from './context';
import { applySuggestion, suggestionFor } from './models';

/**
 * Muda o status de trabalho do card. Aprovar é só da pessoa; bloquear exige o motivo. Em modo autônomo
 * (YOLO) o pedido de revisão da IA vira aprovação na hora: ninguém vai revisar, e o resumo fica na conversa.
 * Exceções, em que o card fica mesmo em "waiting_review": com `pending` (a pendência é da pessoa, e o
 * status tem de mostrar isso); na coluna até onde a pessoa liberou o modo (ali o modo se desliga); e na
 * história do núcleo, numa coluna que exige aprovação (depois de aprovada, ela segue no modo).
 */
function setStatus(ctx: BoardContext, msg: MessageOf<'card.status.set'>, author: string, byAi: boolean): void {
  const note = msg.note?.trim() ?? '';
  if (msg.status === 'approved' && byAi) throw new Error('Só uma pessoa pode aprovar um card.');
  if (msg.status === 'blocked' && !note) throw new Error('Informe o motivo do bloqueio.');
  // a história chegou à coluna até onde a pessoa liberou o modo autônomo: o pedido de revisão é para ela
  const yolo = ctx.cards.isYolo(msg.cardId);
  const state = yolo ? ctx.state() : null;
  const card = state?.cards.find((c) => c.id === msg.cardId);
  const atStop = byAi && msg.status === 'waiting_review' && !!state && !!card && isAtYoloStop(state, card);
  // a história do núcleo espera a pessoa nas colunas que exigem aprovação, mesmo no modo autônomo
  const core =
    byAi &&
    msg.status === 'waiting_review' &&
    !!state &&
    !!card &&
    !card.parentId &&
    isCoreStory(state, card) &&
    !!columnOf(state, card)?.requiresApproval;
  const autoApprove = byAi && msg.status === 'waiting_review' && !msg.pending && yolo && !atStop && !core;
  ctx.cards.setStatus(msg.cardId, autoApprove ? 'approved' : msg.status, msg.status === 'blocked' ? note : '', author);
  if (note) ctx.comments.add(msg.cardId, author, note, byAi ? 'ai' : 'human');
  if (core && !atStop && !msg.pending)
    ctx.comments.add(
      card!.id,
      author,
      `História do núcleo (${CRITICALITY_FIELD} = ${CORE}): mesmo no modo autônomo, ${columnOf(state!, card!)?.name ?? 'esta fase'} espera a sua aprovação. Depois de aprovada, a IA segue sozinha.`,
      'ai',
    );
  if (atStop) {
    ctx.cards.stopYolo(card!.id);
    ctx.comments.add(
      card!.id,
      author,
      `O modo autônomo chegou até ${columnOf(state!, card!)?.name ?? 'a fase escolhida'}, como foi pedido ao ligá-lo, e foi desligado: a revisão desta fase é sua. Para a IA seguir sozinha daqui, ligue o modo de novo.`,
      'ai',
    );
  }
  // só a aprovação de uma pessoa dispara o merge automático: a do modo autônomo não passa por aqui
  if (msg.status === 'approved') ctx.approved.push(msg.cardId);
}

/**
 * A IA divide o trabalho de uma história em modo autônomo em outras histórias: elas nascem em modo autônomo
 * (a pessoa já abriu mão da aprovação para esse trabalho) e entram na fila depois da de origem.
 * Não amplia a autonomia a partir de uma história que não está em modo autônomo.
 */
function inheritYolo(ctx: BoardContext, msg: MessageOf<'card.yolo.inherit'>, author: string): void {
  const cards = ctx.state().cards;
  const from = cards.find((c) => c.id === msg.fromId);
  const card = cards.find((c) => c.id === msg.cardId);
  if (!from || !card) throw new Error('Card não encontrado');
  if (from.parentId || !from.yolo) throw new Error(`#${from.number} não é uma história em modo autônomo.`);
  if (card.parentId) throw new Error('O modo autônomo vale para a história, não para uma sub-tarefa.');
  // a nova vai até onde a de origem vai: a pessoa liberou esse trabalho até ali
  ctx.cards.setYolo(card.id, true, from.yoloUntil ?? '');
  ctx.comments.add(card.id, author, `Criada em modo autônomo a partir de #${from.number} ${from.title}.`, 'ai');
  if (!linkProblem(ctx.state(), card.id, from.id, 'related')) ctx.links.add(card.id, from.id, 'related');
}

/**
 * A história `cardId` é uma entrega derivada de `fromId` (a funcionalidade dividida em partes): a branch
 * dela vai partir da branch da origem, com o pull request empilhado sobre o dela, e as duas ficam
 * vinculadas como relativas. Vale para qualquer história, dentro ou fora do modo autônomo.
 */
function derive(ctx: BoardContext, msg: MessageOf<'card.derive'>, author: string, byAi: boolean): void {
  const cards = ctx.state().cards;
  const from = cards.find((c) => c.id === msg.fromId);
  const card = cards.find((c) => c.id === msg.cardId);
  if (!from || !card) throw new Error('Card não encontrado');
  if (from.parentId || card.parentId) throw new Error('Só uma história deriva de outra história; sub-tarefas seguem a história delas.');
  if (from.id === card.id) throw new Error('Uma história não deriva dela mesma.');
  // a origem não pode, ela mesma, derivar (direta ou indiretamente) da nova: a pilha viraria um ciclo
  for (let c: Card | undefined = from; c?.derivedFrom; c = cards.find((k) => k.id === c!.derivedFrom))
    if (c.derivedFrom === card.id) throw new Error(`#${from.number} já deriva de #${card.number}.`);
  if (card.branch) throw new Error(`#${card.number} já tem branch (${card.branch}): a base dela não muda mais.`);
  ctx.cards.setDerivedFrom(card.id, from.id);
  ctx.comments.add(
    card.id,
    author,
    `Derivada de #${from.number} ${from.title}: a branch desta história parte da branch dela, e o pull request é empilhado sobre o dela.`,
    byAi ? 'ai' : 'human',
  );
  if (!linkProblem(ctx.state(), card.id, from.id, 'related')) ctx.links.add(card.id, from.id, 'related');
}

/**
 * A coluna até onde o modo autônomo da história vai, validada: '' quando é até a última coluna da IA
 * (sem escolha, ou a própria última). Numa coluna de outro workflow, vale a de mesmo nome no workflow da
 * história (a ação em lote escolhe uma coluna só para todas). Recusa a que a história já passou.
 */
function yoloStop(state: BoardState, story: Card, until: string | null | undefined): string {
  if (!until) return '';
  const chosen = state.columns.find((c) => c.id === until);
  if (!chosen) throw new Error('Coluna não encontrada');
  const options = yoloStopOptions(state, story);
  const target = chosen.workflowId === story.workflowId ? chosen : options.find((c) => norm(c.name) === norm(chosen.name));
  if (!target) throw new Error(`O workflow de #${story.number} não tem a coluna ${chosen.name} para o modo autônomo parar nela.`);
  if (!options.some((c) => c.id === target.id))
    throw new Error(
      `#${story.number} não pode ir em modo autônomo só até ${target.name}: escolha uma coluna em que a IA atua, de ${columnOf(state, story)?.name ?? 'onde ela está'} em diante.`,
    );
  return target.id === lastAiColumn(state, story.workflowId)?.id ? '' : target.id;
}

/** O que a conversa diz ao ligar o modo, com o ponto de parada quando ele não é o fim. */
function yoloOnNote(state: BoardState, until: string): string {
  const stop = until ? state.columns.find((c) => c.id === until)?.name : undefined;
  return stop
    ? `Modo autônomo ligado até ${stop}: a IA segue sozinha, sem pedir aprovação nem confirmação, até terminar o trabalho de ${stop}; ali ela pede a sua revisão e o modo se desliga.`
    : 'Modo autônomo ligado: a IA segue por conta própria, sem pedir aprovação nem confirmação.';
}

/** Liga ou desliga o modo autônomo de uma história já validada; libera o que estava esperando uma pessoa. */
function applyYolo(ctx: BoardContext, card: Card, enabled: boolean, author: string, until = ''): void {
  const state = ctx.state();
  ctx.cards.setYolo(card.id, enabled, until);
  if (!enabled) return;
  // a revisão pendente da história do núcleo, numa coluna que exige aprovação, continua esperando a
  // pessoa: ligar o modo não é ler o que a IA entregou
  const coreReview = card.status === 'waiting_review' && isCoreStory(state, card) && !!columnOf(state, card)?.requiresApproval;
  const release = card.status === 'waiting_review' && !coreReview ? 'approved' : card.status === 'waiting_answer' ? 'ready' : null;
  if (release) ctx.cards.setStatus(card.id, release, '', author);
  ctx.comments.add(card.id, author, yoloOnNote(state, until), 'human');
}

/**
 * Liga ou desliga o modo autônomo da história. É decisão da pessoa: a IA nunca amplia a própria autonomia.
 * Ao ligar, o que estava esperando uma pessoa é liberado para a IA seguir. Com o modo já ligado, um ponto
 * de parada diferente só muda até onde ele vai.
 */
function setYolo(ctx: BoardContext, msg: MessageOf<'card.yolo.set'>, author: string, byAi: boolean): void {
  if (byAi) throw new Error('Só uma pessoa liga o modo autônomo.');
  const state = ctx.state();
  const card = state.cards.find((c) => c.id === msg.cardId);
  if (!card) throw new Error('Card não encontrado');
  if (card.parentId) throw new Error('O modo autônomo vale para a história, não para uma sub-tarefa.');
  const until = msg.enabled ? yoloStop(state, card, msg.until) : '';
  if (card.yolo === msg.enabled) {
    if (!msg.enabled || until === (card.yoloUntil ?? '')) return;
    ctx.cards.setYolo(card.id, true, until);
    const stop = until ? state.columns.find((c) => c.id === until)?.name : undefined;
    ctx.comments.add(
      card.id,
      author,
      stop ? `O modo autônomo agora vai até ${stop}.` : 'O modo autônomo agora vai até a última fase da IA, com o pull request.',
      'human',
    );
    return;
  }
  applyYolo(ctx, card, msg.enabled, author, until);
}

/**
 * Liga ou desliga o modo autônomo de várias histórias de uma vez. Ignora silenciosamente quem da lista
 * não for história viva (sub-tarefa, arquivada ou id inexistente); não repete o efeito em quem já está
 * no estado pedido. O ponto de parada é validado em todas antes de ligar qualquer uma.
 */
function setYoloMany(ctx: BoardContext, msg: MessageOf<'card.yolo.setMany'>, author: string, byAi: boolean): void {
  if (byAi) throw new Error('Só uma pessoa liga o modo autônomo.');
  const state = ctx.state();
  const stories = state.cards.filter((c) => msg.cardIds.includes(c.id) && !c.parentId && isLive(c) && c.yolo !== msg.enabled);
  const stops = new Map(stories.map((story) => [story.id, msg.enabled ? yoloStop(state, story, msg.until) : '']));
  for (const story of stories) applyYolo(ctx, story, msg.enabled, author, stops.get(story.id));
}

/** Cria o card e já aplica a sugestão de modelo; devolve o id. */
export function createCard(ctx: BoardContext, input: { typeId: string; columnId: string; parentId: string | null; title: string }): string {
  const id = ctx.cards.create(ctx.boardId, input);
  applySuggestion(ctx, id, null);
  return id;
}

/** Ciclo de vida do card: criar, editar, mover, arquivar, lixeira, campos, status e agente de execução. */
export const cardHandlers = {
  'card.create': (msg, ctx) => {
    createCard(ctx, msg);
    return true;
  },
  'card.update': (msg, ctx) => {
    ctx.cards.update(msg.cardId, msg.patch);
    return true;
  },
  'card.move': (msg, ctx, { byAi }) => {
    ctx.cards.move(msg.cardId, msg.columnId, msg.position, {
      cancelChildren: msg.cancelChildren,
      byAi,
      allowOpenChildren: msg.allowOpenChildren,
    });
    // a história pode ter acabado de chegar na última coluna da IA já com o pull request registrado
    // (ex.: quando o registro aconteceu antes do movimento, na mesma sessão): reavalia a entrega.
    // yoloStoryIdOf é uma consulta direta (sem montar o snapshot inteiro do board), undefined no caso
    // comum de um board (ou card) fora do modo autônomo, onde não há entrega a reavaliar.
    const storyId = ctx.cards.yoloStoryIdOf(msg.cardId);
    if (storyId) settleDelivery(ctx, storyId);
    return true;
  },
  'card.trash': (msg, ctx) => {
    ctx.cards.trash(msg.cardId);
    return true;
  },
  'card.restore': (msg, ctx) => {
    ctx.cards.restore(msg.cardId);
    return true;
  },
  'card.archive': (msg, ctx) => {
    ctx.cards.archive(msg.cardId);
    return true;
  },
  'card.unarchive': (msg, ctx, { byAi }) => {
    ctx.cards.unarchive(msg.cardId, msg.columnId, msg.position, byAi);
    return true;
  },
  'card.restoreArchived': (msg, ctx) => {
    ctx.cards.restoreArchived(msg.cardId);
    return true;
  },
  'card.deletePermanent': (msg, ctx) => {
    ctx.cards.deletePermanent(msg.cardId).forEach((id) => ctx.store.removeCard(id));
    return true;
  },
  'trash.empty': (_msg, ctx) => {
    ctx.cards.emptyTrash(ctx.boardId).forEach((id) => ctx.store.removeCard(id));
    return true;
  },
  'field.setValue': (msg, ctx, { byAi }) => {
    if (!byAi) {
      const blocker = fieldValueBlocker(ctx.state(), msg.fieldId);
      if (blocker) throw new Error(blocker);
    }
    // a IA marca a história do núcleo, mas só uma pessoa a tira dele: senão ela voltaria a se aprovar sozinha
    if (byAi && msg.value !== CORE) {
      const state = ctx.state();
      const field = state.fieldDefs.find((f) => f.id === msg.fieldId);
      const card = state.cards.find((c) => c.id === msg.cardId);
      if (field && card && norm(field.name) === norm(CRITICALITY_FIELD) && isCoreStory(state, card))
        throw new Error(`Só uma pessoa tira a história do núcleo: o campo ${CRITICALITY_FIELD} fica em ${CORE}.`);
    }
    // se o modelo atual veio da sugestão (ou está vazio), ele acompanha a nova sugestão
    const before = suggestionFor(ctx, msg.cardId);
    ctx.cards.setFieldValue(msg.cardId, msg.fieldId, msg.value);
    if (before.field && before.field.id !== msg.fieldId) applySuggestion(ctx, msg.cardId, before.suggestion);
    return true;
  },
  'card.status.set': (msg, ctx, { author, byAi }) => {
    setStatus(ctx, msg, author, byAi);
    return true;
  },
  'card.yolo.set': (msg, ctx, { author, byAi }) => {
    setYolo(ctx, msg, author, byAi);
    return true;
  },
  'card.yolo.setMany': (msg, ctx, { author, byAi }) => {
    setYoloMany(ctx, msg, author, byAi);
    return true;
  },
  'card.yolo.inherit': (msg, ctx, { author, byAi }) => {
    if (!byAi) throw new Error('Para ligar o modo autônomo numa história, use card.yolo.set.');
    inheritYolo(ctx, msg, author);
    return true;
  },
  'card.derive': (msg, ctx, { author, byAi }) => {
    derive(ctx, msg, author, byAi);
    return true;
  },
  'card.execProfile.set': (msg, ctx) => {
    ctx.cards.setExecProfile(msg.cardId, msg.profileId);
    return true;
  },
} satisfies Partial<HandlerMap>;
