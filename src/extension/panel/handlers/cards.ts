import { canSetBulkStatus } from '../../../shared/status';
import { linkProblem } from '../../../shared/links';
import { norm } from '../../../shared/filters';
import { columnOf, columnsOf, isLive } from '../../../shared/selectors';
import { isAtYoloStop, lastAiColumn, yoloStopOptions } from '../../../shared/story';
import { fieldValueBlocker } from '../../../shared/boardFields';
import { settleDelivery } from '../../delivery';

import type { BoardState, Card } from '../../../shared/model';
import type { BoardContext, HandlerMap, MessageOf } from './context';
import { applySuggestion, suggestionFor } from './models';

/**
 * Muda o status de trabalho do card. Aprovar é só da pessoa; bloquear exige o motivo. Em modo autônomo
 * (YOLO) o pedido de revisão da IA vira aprovação na hora: ninguém vai revisar, e o resumo fica na conversa.
 * A única exceção, em que o card fica mesmo em "waiting_review", é a coluna até onde a pessoa liberou o
 * modo: ali o modo se desliga e a revisão é dela. Nem `pending` segura a fila
 * (#441): no modo autônomo a IA decide o que ficou em aberto e registra a decisão.
 *
 * A aprovação da pessoa numa história leva o card para a próxima coluna na hora (#441): esperar a IA
 * mover deixava o card na mesma coluna, e ela refazia a fase e pedia a revisão de novo. Ficam para a IA
 * só os casos em que o board não pode mover sozinho: a aprovação que faz o merge automático (a
 * conclusão é do `AutoMerger`) e a conclusão recusada (sub-tarefa em aberto).
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
  const autoApprove = byAi && msg.status === 'waiting_review' && yolo && !atStop;
  ctx.cards.setStatus(msg.cardId, autoApprove ? 'approved' : msg.status, msg.status === 'blocked' ? note : '', author);
  if (note) ctx.comments.add(msg.cardId, author, note, byAi ? 'ai' : 'human');
  if (autoApprove && msg.pending)
    ctx.comments.add(
      msg.cardId,
      author,
      'Modo autônomo: a pendência acima não segura a história. Decida você mesmo (registre a decisão e o motivo na conversa e no documento da fase) e siga.',
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
  if (msg.status === 'approved') {
    ctx.approved.push(msg.cardId);
    if (!byAi) advanceApproved(ctx, msg.cardId);
  }
}

/**
 * Muda o status de trabalho de vários cards de uma vez, reaproveitando `setStatus` (que grava o motivo na
 * conversa e dispara o avanço automático dos aprovados). Só a pessoa usa o lote; o motivo do bloqueio é
 * obrigatório e o lote inteiro é recusado antes de mexer em qualquer card quando ele falta.
 */
function setStatusMany(ctx: BoardContext, msg: MessageOf<'card.status.setMany'>, author: string, byAi: boolean): void {
  if (byAi) throw new Error('Só uma pessoa muda o status em lote.');
  if (!['approved', 'blocked', 'ready'].includes(msg.status)) throw new Error('Status em lote inválido.');
  if (msg.status === 'blocked' && !msg.note?.trim()) throw new Error('Informe o motivo do bloqueio.');
  for (const story of liveStoriesOf(ctx, msg.cardIds)) {
    if (!canSetBulkStatus(story.status, msg.status)) continue;
    setStatus(
      ctx,
      { type: 'card.status.set', cardId: story.id, status: msg.status, ...(msg.note !== undefined ? { note: msg.note } : {}) },
      author,
      false,
    );
  }
}

/**
 * Leva a história aprovada pela pessoa para a próxima coluna (o status recomeça lá: "pronto" onde a IA
 * atua). Não move quando a aprovação vai fazer o merge automático (a próxima coluna é a de conclusão, há
 * pull request e o merge automático está ligado: o `AutoMerger` conclui o card depois do merge), e deixa
 * o card aprovado, para a IA, quando o board recusa o movimento (ex.: conclusão com sub-tarefa em aberto).
 */
function advanceApproved(ctx: BoardContext, cardId: string): void {
  const state = ctx.state();
  const card = state.cards.find((c) => c.id === cardId);
  if (!card || card.parentId) return;
  const column = columnOf(state, card);
  if (!column) return;
  const next = columnsOf(state, card.workflowId).find((c) => c.position > column.position && c.category !== 'cancelled');
  if (!next) return;
  if (next.category === 'done' && state.board.git.autoMerge && card.prUrl) return;
  try {
    ctx.cards.move(card.id, next.id, Number.MAX_SAFE_INTEGER, { byAi: false });
  } catch (e) {
    ctx.comments.add(
      card.id,
      'Faz AI',
      `Aprovado, mas o card não foi para ${next.name}: ${e instanceof Error ? e.message : String(e)}`,
      'ai',
    );
    return;
  }
  const storyId = ctx.cards.yoloStoryIdOf(card.id);
  if (storyId) settleDelivery(ctx, storyId);
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
  const release = card.status === 'waiting_review' ? 'approved' : card.status === 'waiting_answer' ? 'ready' : null;
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

/** As histórias vivas do lote, na ordem em que a mensagem listou os ids. */
function liveStoriesOf(ctx: BoardContext, cardIds: string[]): Card[] {
  return ctx.state().cards.filter((c) => cardIds.includes(c.id) && !c.parentId && isLive(c));
}

/** Arquiva várias histórias de uma vez; ignora silenciosamente quem da lista não for história viva. */
function archiveMany(ctx: BoardContext, msg: MessageOf<'card.archiveMany'>): void {
  for (const story of liveStoriesOf(ctx, msg.cardIds)) ctx.cards.archive(story.id);
}

/** Manda várias histórias para a lixeira de uma vez; ignora silenciosamente quem da lista não for história viva. */
function trashMany(ctx: BoardContext, msg: MessageOf<'card.trashMany'>): void {
  for (const story of liveStoriesOf(ctx, msg.cardIds)) ctx.cards.trash(story.id);
}

/** Os cards do lote que estão na lixeira, na ordem em que a mensagem listou os ids. */
function trashedOf(ctx: BoardContext, cardIds: string[]): string[] {
  const trashed = new Set(
    ctx
      .state()
      .cards.filter((c) => c.deletedAt !== null)
      .map((c) => c.id),
  );
  return cardIds.filter((id) => trashed.has(id));
}

/**
 * Restaura várias lixeiras de uma vez. Um item que falha (ex.: sub-tarefa cuja história ainda está na lixeira,
 * listada antes dela) não interrompe o lote: o erro vira só a ausência do efeito naquele card.
 */
function restoreMany(ctx: BoardContext, msg: MessageOf<'card.restoreMany'>): void {
  for (const id of trashedOf(ctx, msg.cardIds)) {
    try {
      ctx.cards.restore(id);
    } catch {
      // pai ainda na lixeira: a sub-tarefa volta junto com a história, quando ela for restaurada
    }
  }
}

/**
 * Apaga de vez várias lixeiras de uma vez, com os filhos. Um id já removido por um item anterior do lote
 * (ex.: a sub-tarefa listada depois da história que a levou junto) não tem efeito: `deletePermanent` devolve
 * vazio para ele.
 */
function deletePermanentMany(ctx: BoardContext, msg: MessageOf<'card.deletePermanentMany'>): void {
  for (const id of trashedOf(ctx, msg.cardIds)) ctx.cards.deletePermanent(id).forEach((removed) => ctx.store.removeCard(removed));
}

/**
 * Move várias histórias de uma vez para a mesma coluna. `cancelChildren: true` sempre: cobre RF13
 * (cancelar as sub-tarefas em aberto do lote ao mover para uma coluna de cancelamento, sem perguntar
 * de novo) sem efeito quando o destino não é cancelamento (mesma regra de `card.move` de hoje).
 * Quando o `moveInner` recusa uma história (ex.: sub-tarefa em aberto indo para conclusão), pula ela
 * e segue o lote (RF12), em vez de deixar a exceção interromper as demais.
 */
function moveMany(ctx: BoardContext, msg: MessageOf<'card.moveMany'>, byAi: boolean): void {
  const stories = liveStoriesOf(ctx, msg.cardIds).filter((c) => c.columnId !== msg.columnId);
  for (const story of stories) {
    try {
      ctx.cards.move(story.id, msg.columnId, Number.MAX_SAFE_INTEGER, { cancelChildren: true, byAi });
    } catch {
      // história bloqueada pelo moveInner (ex.: sub-tarefa em aberto indo para conclusão, RF12): pula e segue o lote
    }
  }
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
  'card.status.setMany': (msg, ctx, { author, byAi }) => {
    setStatusMany(ctx, msg, author, byAi);
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
  'card.archiveMany': (msg, ctx) => {
    archiveMany(ctx, msg);
    return true;
  },
  'card.trashMany': (msg, ctx) => {
    trashMany(ctx, msg);
    return true;
  },
  'card.restoreMany': (msg, ctx) => {
    restoreMany(ctx, msg);
    return true;
  },
  'card.deletePermanentMany': (msg, ctx) => {
    deletePermanentMany(ctx, msg);
    return true;
  },
  'card.moveMany': (msg, ctx, { byAi }) => {
    moveMany(ctx, msg, byAi);
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
