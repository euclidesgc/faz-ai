import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { cardDetail } from '../src/extension/mcp/format';
import { boardState, card as fakeCard } from './fakes/board';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;

const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const create = (title: string, column: string, parent?: number) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === column)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
const parentColumnName = () => {
  const s = router.snapshot();
  return s.columns.find((c) => c.workflowId === s.workflows.find((w) => w.kind === 'parent')!.id)!.name;
};
const childColumnName = () => {
  const s = router.snapshot();
  return s.columns.find((c) => c.workflowId === s.workflows.find((w) => w.kind === 'child')!.id)!.name;
};

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-merge-commit'),
  });
});

describe('card.merge.set', () => {
  it('grava o commit do merge numa história', () => {
    create('História', parentColumnName());
    const story = card(1);

    router.handle({ type: 'card.merge.set', cardId: story.id, commit: 'abc123' });

    expect(card(1).mergeCommit).toBe('abc123');
  });

  it('chamada de uma sub-tarefa grava no pai', () => {
    create('História', parentColumnName());
    const story = card(1);
    create('Sub-tarefa', childColumnName(), 1);
    const sub = card(2);

    router.handle({ type: 'card.merge.set', cardId: sub.id, commit: 'def456' });

    expect(card(1).mergeCommit).toBe('def456');
    expect(card(2).mergeCommit).toBe('');
    expect(story.id).not.toBe(sub.id);
  });

  it('chamar duas vezes sobrescreve o valor anterior', () => {
    create('História', parentColumnName());
    const story = card(1);

    router.handle({ type: 'card.merge.set', cardId: story.id, commit: 'primeiro' });
    router.handle({ type: 'card.merge.set', cardId: story.id, commit: 'segundo' });

    expect(card(1).mergeCommit).toBe('segundo');
  });

  it('não muda o status nem a conversa do card', () => {
    create('História', parentColumnName());
    const story = card(1);
    router.handle({ type: 'card.status.set', cardId: story.id, status: 'waiting_review' });

    router.handle({ type: 'card.merge.set', cardId: story.id, commit: 'abc123' });

    const after = card(1);
    expect(after.status).toBe('waiting_review');
    expect(router.snapshot().comments.filter((m) => m.cardId === story.id)).toEqual([]);
  });
});

describe('get_card e o commit do merge', () => {
  it('devolve mergeCommit em workspace quando preenchido', () => {
    const s = boardState({ cards: [fakeCard('h1', { columnId: 'backlog', branch: 'historia/1-exemplo', mergeCommit: 'abc123' })] });

    const d = cardDetail(s, s.cards[0]!, () => '') as { workspace?: { mergeCommit?: string } };

    expect(d.workspace?.mergeCommit).toBe('abc123');
  });

  it('não devolve a chave mergeCommit quando vazio', () => {
    const s = boardState({ cards: [fakeCard('h1', { columnId: 'backlog', branch: 'historia/1-exemplo', mergeCommit: '' })] });

    const d = cardDetail(s, s.cards[0]!, () => '') as { workspace?: { mergeCommit?: string } };

    expect(d.workspace).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(d.workspace ?? {}, 'mergeCommit')).toBe(false);
  });
});
