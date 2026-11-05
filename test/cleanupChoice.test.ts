import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { CLEANUP_OPTIONS, cleanupChoice, cleanupChoiceKey, stackMergeChoice } from '../src/shared/cleanupChoice';

let dir: string;
let db: Awaited<ReturnType<typeof openInMemory>>;
let router: MessageRouter;
let cardId: string;
const card = () => router.snapshot().cards.find((item) => item.id === cardId)!;
const comments = () => router.snapshot().comments.filter((c) => c.cardId === cardId);
const answer = (text: string, custom = false) =>
  router.handle({ type: 'card.questions.answer', cardId, answers: [{ questionId: card().questions[0]!.id, text, custom }] });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-cleanup-choice-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'cleanup-choice',
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
    title: 'Limpeza',
  });
  router.askCleanupChoice(cardId, cleanupChoice('feature/1-x', '/tmp/wt', 'develop'), 'Faz AI');
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('cleanupChoice', () => {
  it('monta os comandos e as duas opções', () => {
    const c = cleanupChoice('feature/1-x', '/tmp/wt', 'develop');
    expect(c.options).toEqual(CLEANUP_OPTIONS);
    expect(c.commands.split('\n')).toEqual(['git switch develop', 'git worktree remove /tmp/wt', 'git branch -D feature/1-x']);
    expect(cleanupChoice('b', null, 'develop').commands).not.toContain('worktree');
  });

  it('a pergunta espera a pessoa, com as duas opções e a consequência de cada uma', () => {
    expect(card().status).toBe('waiting_answer');
    expect(card().questions[0]!.options).toEqual(['Pode fazer', 'Eu mesmo faço']);
    expect(card().questions[0]!.consequences).toHaveLength(2);
  });

  it('"Pode fazer": comentário com os comandos em bloco de código e o card volta para a fila', () => {
    answer('Pode fazer');
    const body = comments().at(-1)!.body;
    expect(body).toContain('```\ngit switch develop\ngit worktree remove /tmp/wt\ngit branch -D feature/1-x\n```');
    expect(card().status).toBe('ready');
    expect(card().questions).toHaveLength(0);
    expect(db.exec(`SELECT value FROM meta WHERE key = '${cleanupChoiceKey(cardId)}'`)[0]?.values[0]?.[0] ?? '').toBe('');
  });

  it.each([
    ['Eu mesmo faço', false],
    ['faço depois', true],
  ])('"%s": só limpa a pergunta, sem acionar a IA', (text, custom) => {
    answer(text, custom);
    expect(card().status).not.toBe('ready');
    expect(card().questions).toHaveLength(0);
    expect(comments().at(-1)!.body).toContain('```');
  });

  it('pilha: monta merge e consequências da nova base', () => {
    const choice = stackMergeChoice('feature/2', 'develop');
    expect(choice.commands).toBe('git fetch origin develop\ngit merge origin/develop');
    router.askCleanupChoice(cardId, choice, 'Faz AI');
    expect(card().questions[0]!.consequences).toEqual(choice.consequences);
    expect(choice.consequences![0]).toContain('sem rebase nem push forçado');
  });

  it.each([true, false])('remota: junta os comandos na ordem com limpeza local bloqueada = %s', (localBlocked) => {
    const remote = ['gh pr edit https://github.com/a/b/pull/2 --base develop', 'git push origin --delete feature/1'];
    const choice = cleanupChoice('feature/1', '/tmp/wt', 'develop', { commands: remote, localBlocked });
    expect(choice.commands.split('\n')).toEqual([
      ...(localBlocked ? ['git switch develop', 'git worktree remove /tmp/wt', 'git branch -D feature/1'] : []),
      ...remote,
    ]);
    expect(choice.question).toContain(localBlocked ? 'local e remota' : 'limpeza remota');
  });
});
