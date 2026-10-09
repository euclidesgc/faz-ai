import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { activityKindOf, codeColumnOf, isTextColumn, runningByKind, runningKindOf } from '../src/shared/activity';
import { DEFAULT_RUNNER, limitOf, textLimit } from '../src/shared/runner';

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
const kind = (n: number, mode?: 'phase' | 'refine' | 'summarize') => activityKindOf(router.snapshot(), card(n), mode);
const run = (n: number, mode: 'phase' | 'refine' | 'summarize', phase: string) =>
  router.setAiRuns([{ cardId: card(n).id, runId: '', mode, origin: 'manual', phase, model: null, startedAt: 0 }]);

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-act'),
  });
});

describe('activityKindOf', () => {
  it('no board padrão, fases de documento são text e de código são branch', () => {
    const cols = ['Discovery', 'PRD', 'Spec', 'Plan', 'Implementação', 'Homologação'];
    cols.forEach((c, i) => create(`h${i}`, c));
    const got = cols.map((_, i) => kind(i + 1));
    expect(got).toEqual(['text', 'text', 'text', 'text', 'branch', 'branch']);
  });

  it('refine e summarize são text mesmo em Implementação', () => {
    create('h', 'Implementação');
    expect(kind(1, 'refine')).toBe('text');
    expect(kind(1, 'summarize')).toBe('text');
    expect(kind(1, 'phase')).toBe('branch');
  });

  it('sub-tarefa é classificada pela coluna da história', () => {
    create('h', 'Spec');
    create('s', 'A fazer', 1);
    expect(kind(2)).toBe('text');
    router.handle({
      type: 'card.move',
      cardId: card(1).id,
      columnId: router.snapshot().columns.find((c) => c.name === 'Implementação')!.id,
    } as never);
    expect(kind(2)).toBe('branch');
  });

  it('sem coluna de código, as colunas com artefato continuam text', () => {
    create('h', 'Plan');
    const s = router.snapshot();
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    const noCode = {
      ...s,
      columns: s.columns.map((c) => (c.workflowId === wf.id && c.artifactName === '' ? { ...c, aiActive: false } : c)),
    };
    expect(codeColumnOf(noCode, wf.id)).toBeUndefined();
    const plan = noCode.columns.find((c) => c.name === 'Plan')!;
    expect(isTextColumn(noCode, plan)).toBe(true);
    expect(activityKindOf(noCode, noCode.cards[0]!)).toBe('text');
  });
});

describe('runningKindOf e runningByKind', () => {
  it('sem aiActivity usa a coluna atual da história', () => {
    create('h', 'Spec');
    expect(runningKindOf(router.snapshot(), card(1).id)).toBe('text');
  });

  it('com aiActivity usa o modo e a fase congelada', () => {
    create('h', 'Implementação');
    run(1, 'refine', 'Implementação');
    expect(runningKindOf(router.snapshot(), card(1).id)).toBe('text');
    run(1, 'phase', 'Spec');
    expect(runningKindOf(router.snapshot(), card(1).id)).toBe('text');
    run(1, 'phase', 'Implementação');
    expect(runningKindOf(router.snapshot(), card(1).id)).toBe('branch');
    run(1, 'phase', 'Inexistente');
    expect(runningKindOf(router.snapshot(), card(1).id)).toBe('branch');
  });

  it('conta por tipo', () => {
    create('a', 'Spec');
    create('b', 'Implementação');
    create('c', 'PRD');
    const ids = [1, 2, 3].map((n) => card(n).id);
    expect(runningByKind(router.snapshot(), ids)).toEqual({ text: 2, branch: 1 });
    expect(runningByKind(router.snapshot(), [])).toEqual({ text: 0, branch: 0 });
  });
});

describe('tetos', () => {
  it('text usa parallelStories em qualquer modo, mesmo com parallel desligado', () => {
    const r = { ...DEFAULT_RUNNER, parallel: false, parallelStories: 3 };
    expect(textLimit(r)).toBe(3);
    expect(limitOf(r, 'branch', 'text')).toBe(3);
    expect(limitOf(r, 'worktree', 'text')).toBe(3);
  });

  it('branch segue parallelLimit', () => {
    const r = { ...DEFAULT_RUNNER, parallel: true, parallelStories: 3 };
    expect(limitOf(r, 'branch', 'branch')).toBe(1);
    expect(limitOf({ ...r, parallel: false }, 'worktree', 'branch')).toBe(1);
    expect(limitOf(r, 'worktree', 'branch')).toBe(3);
  });
});
