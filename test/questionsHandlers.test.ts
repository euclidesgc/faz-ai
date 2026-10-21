import { afterEach, beforeEach, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';

let dir: string;
let db: Awaited<ReturnType<typeof openInMemory>>;
let router: MessageRouter;
let cardId: string;
const card = () => router.snapshot().cards.find((item) => item.id === cardId)!;
const questions = [
  { question: ' Qual caminho? ', options: [' Rápido ', ' Seguro '], recommended: ' Seguro ' },
  { question: 'Qual formato?', options: ['JSON', 'CSV'], recommended: 'JSON' },
];
const set = () => router.handle({ type: 'card.questions.set', cardId, questions }, { source: 'ai' });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-questions-handlers-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'questions-handlers',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
  });
  const state = router.snapshot();
  const workflow = state.workflows.find((item) => item.kind === 'parent')!;
  cardId = router.createCard({
    typeId: state.cardTypes.find((item) => item.defaultWorkflowId === workflow.id)!.id,
    columnId: state.columns.find((item) => item.workflowId === workflow.id)!.id,
    parentId: null,
    title: 'Perguntas',
  });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('guarda perguntas limpas, ids novos e espera a pessoa; rodada nova substitui a anterior', () => {
  set();
  const first = card().questions[0]!.id;
  expect(card().questions).toMatchObject([
    { question: 'Qual caminho?', options: ['Rápido', 'Seguro'], recommended: 'Seguro' },
    { question: 'Qual formato?', options: ['JSON', 'CSV'], recommended: 'JSON' },
  ]);
  expect(card().status).toBe('waiting_answer');
  set();
  expect(card().questions[0]!.id).not.toBe(first);
  expect(() =>
    router.handle({ type: 'card.questions.answer', cardId, answers: [{ questionId: first, text: 'Seguro', custom: false }] }),
  ).toThrow('As perguntas deste card mudaram');
  expect(card().questions).toHaveLength(2);
});

it('recusa conjunto inválido sem gravar ou mudar status', () => {
  expect(() =>
    router.handle({ type: 'card.questions.set', cardId, questions: [{ ...questions[0]!, recommended: 'inexistente' }] }),
  ).toThrow('não está entre as opções');
  expect(card().questions).toEqual([]);
  expect(card().status).toBeNull();
});

it('no modo autônomo grava indicada na descrição sem perguntas pendentes ou mudar status', () => {
  router.handle({ type: 'card.yolo.set', cardId, enabled: true });
  const status = card().status;
  set();
  expect(card().description).toContain('Seguro (decidido pela IA no modo autônomo)');
  expect(card().questions).toEqual([]);
  expect(card().status).toBe(status);
});

it('registra opção e resposta personalizada, limpa perguntas, devolve a vez e não comenta', () => {
  set();
  const ids = card().questions.map((item) => item.id);
  const comments = router.snapshot().comments.length;
  router.handle({
    type: 'card.questions.answer',
    cardId,
    answers: [
      { questionId: ids[0]!, text: 'Seguro', custom: false },
      { questionId: ids[1]!, text: ' Meu formato\n próprio ', custom: true },
    ],
  });
  expect(card().description).toContain('**Resposta:** Seguro (a indicada)');
  expect(card().description).toContain('**Resposta (personalizada):** Meu formato próprio');
  expect(card().questions).toEqual([]);
  expect(card().status).toBe('ready');
  expect(router.snapshot().comments).toHaveLength(comments);
});

it('aceita envio parcial e vazio como não respondida', () => {
  set();
  router.handle({
    type: 'card.questions.answer',
    cardId,
    answers: [{ questionId: card().questions[0]!.id, text: 'Rápido', custom: false }],
  });
  expect(card().description).toContain('**Resposta:** não respondida');
  set();
  router.handle({ type: 'card.questions.answer', cardId, answers: [] });
  expect(card().description.match(/\*\*Resposta:\*\* não respondida/g)).toHaveLength(2);
});

it('recusa card sem perguntas e preserva status alterado manualmente no envio', () => {
  expect(() => router.handle({ type: 'card.questions.answer', cardId, answers: [] })).toThrow('não tem perguntas pendentes');
  set();
  router.handle({ type: 'card.status.set', cardId, status: 'blocked', note: 'Outro impedimento' });
  router.handle({ type: 'card.questions.answer', cardId, answers: [] });
  expect(card().status).toBe('blocked');
  expect(card().questions).toEqual([]);
});
