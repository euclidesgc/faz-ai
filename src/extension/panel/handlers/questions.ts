import { newId } from '../../db/ids';
import { answerEntry, applyAnswers, cleanQuestions, questionsProblem, type QuestionAnswer } from '../../../shared/questions';
import type { BoardContext, HandlerMap, MessageOf } from './context';

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
