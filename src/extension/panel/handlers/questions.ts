import { newId } from '../../db/ids';
import { answerEntry, applyAnswers, cleanQuestions, questionsProblem, type QuestionAnswer } from '../../../shared/questions';
import { limitChoiceKey, type LimitChoice } from '../../../shared/limitChoice';
import { modelFieldOf } from '../../../shared/models';
import { runTargetOf } from '../../../shared/runTarget';
import type { BoardContext, HandlerMap, MessageOf } from './context';

/** O autor das mensagens que o board grava sozinho na conversa (o mesmo do runner). */
const BOARD_AUTHOR = 'Faz AI';

function pendingLimitChoice(ctx: BoardContext, cardId: string): LimitChoice | null {
  const raw = ctx.boards.getMeta(limitChoiceKey(cardId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as LimitChoice;
    return typeof v?.question === 'string' && Array.isArray(v.options) ? v : null;
  } catch {
    return null;
  }
}

/**
 * A resposta à pergunta do limite de uso (`limitChoice`), que o board fez e o board aplica: o modelo escolhido vai
 * para o campo Modelo do card e das sub-tarefas abertas que rodariam no agente esgotado, e o card volta para a fila;
 * esperar deixa o modelo como está, e a fila tenta de novo quando o limite volta. Não entra na descrição: é uma
 * decisão de execução, registrada na conversa. Devolve false quando o card não tem essa pergunta pendente.
 */
function answerLimitChoice(ctx: BoardContext, msg: MessageOf<'card.questions.answer'>, author: string): boolean {
  const card = cardFor(ctx, msg.cardId);
  const choice = pendingLimitChoice(ctx, card.id);
  const question = choice && card.questions.find((q) => q.question === choice.question);
  if (!choice || !question) return false;
  const answer = msg.answers.find((a) => a.questionId === question.id);
  const picked = answer && !answer.custom ? choice.options.find((o) => o.label === answer.text) : undefined;
  ctx.boards.setMeta(limitChoiceKey(card.id), '');
  ctx.cards.setQuestions(card.id, []);
  if (picked?.value) {
    const state = ctx.state();
    const open = (c: (typeof state.cards)[number]) => state.columns.find((k) => k.id === c.columnId)?.category === 'open';
    const targets = [
      card,
      ...state.cards.filter(
        (c) =>
          c.parentId === card.id &&
          c.deletedAt === null &&
          c.archivedAt === null &&
          open(c) &&
          runTargetOf(state, c)?.cli.id === choice.profileId,
      ),
    ];
    for (const c of targets) {
      const field = modelFieldOf(state, c);
      if (field) ctx.cards.setFieldValue(c.id, field.id, picked.value);
    }
    const others = targets.length - 1;
    ctx.comments.add(
      card.id,
      BOARD_AUTHOR,
      `${author} escolheu: ${picked.label.replace(/^Seguir com /, 'seguir com ')}. O campo Modelo ${others ? `do card e de ${others} sub-tarefa(s) aberta(s) foi trocado` : 'do card foi trocado'}, e o card voltou para a fila.`,
      'ai',
    );
  } else {
    const text = answer?.text.trim();
    ctx.comments.add(
      card.id,
      BOARD_AUTHOR,
      `${author} escolheu esperar o limite voltar${answer?.custom && text ? ` ("${text}")` : ''}. O modelo do card fica como está, e a fila tenta de novo quando a pausa acabar.`,
      'ai',
    );
  }
  if (card.status === 'waiting_answer') ctx.cards.setStatus(card.id, 'ready', '', author);
  return true;
}

function cardFor(ctx: BoardContext, cardId: string) {
  const card = ctx.state().cards.find((item) => item.id === cardId);
  if (!card) throw new Error('Card não encontrado');
  return card;
}

function setQuestions(ctx: BoardContext, msg: MessageOf<'card.questions.set'>, author: string): void {
  const questions = cleanQuestions(msg.questions);
  const problem = questionsProblem(questions);
  if (problem) throw new Error(problem);
  const card = cardFor(ctx, msg.cardId);
  if (ctx.cards.isYolo(card.id)) {
    const entries = questions.map((q) => answerEntry(q, { kind: 'auto' }));
    ctx.cards.update(card.id, { description: applyAnswers(card.description, entries) });
    return;
  }
  ctx.cards.setQuestions(
    card.id,
    questions.map((q) => ({ id: newId(), ...q })),
  );
  ctx.cards.setStatus(card.id, 'waiting_answer', '', author);
}

function answerQuestions(ctx: BoardContext, msg: MessageOf<'card.questions.answer'>, author: string): void {
  if (answerLimitChoice(ctx, msg, author)) return;
  const card = cardFor(ctx, msg.cardId);
  if (!card.questions.length) throw new Error('Este card não tem perguntas pendentes.');
  const ids = new Set(card.questions.map((q) => q.id));
  if (msg.answers.some((answer) => !ids.has(answer.questionId)))
    throw new Error('As perguntas deste card mudaram: confira as novas antes de enviar.');
  const answers = new Map(msg.answers.map((answer) => [answer.questionId, answer]));
  const entries = card.questions.map((q) => {
    const selected = answers.get(q.id);
    const answer: QuestionAnswer = !selected?.text.trim()
      ? { kind: 'none' }
      : selected.custom
        ? { kind: 'custom', text: selected.text }
        : { kind: 'option', text: selected.text };
    return answerEntry(q, answer);
  });
  ctx.cards.update(card.id, { description: applyAnswers(card.description, entries) });
  ctx.cards.setQuestions(card.id, []);
  if (card.status === 'waiting_answer') ctx.cards.setStatus(card.id, 'ready', '', author);
}

export const questionHandlers = {
  'card.questions.set': (msg, ctx, { author }) => {
    setQuestions(ctx, msg, author);
    return true;
  },
  'card.questions.answer': (msg, ctx, { author }) => {
    answerQuestions(ctx, msg, author);
    return true;
  },
} satisfies Partial<HandlerMap>;
