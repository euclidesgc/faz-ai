// O avanço por aprovação da pessoa com a trilha curta (regra shortTrack), pelo router real: `advanceApproved`
// em src/extension/panel/handlers/cards.ts usa `nextColumnFor`. Montagem no padrão de test/cardsMany.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { EFFORT_FIELD } from '../src/shared/models';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;

const card = (id: string) => router.snapshot().cards.find((c) => c.id === id)!;
const parentWf = () => router.snapshot().workflows.find((w) => w.kind === 'parent')!;
const columnByName = (name: string) => router.snapshot().columns.find((c) => c.name === name && c.workflowId === parentWf().id)!;
const columnNameOf = (id: string) => router.snapshot().columns.find((c) => c.id === card(id).columnId)!.name;

/** Cria uma história viva, pelo nome do tipo (História ou Bug), na coluna informada. */
function createStory(typeName: string, columnName: string, title = typeName): string {
  const s = router.snapshot();
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.name === typeName && t.defaultWorkflowId === parentWf().id)!.id,
    columnId: columnByName(columnName).id,
    parentId: null,
    title,
  });
}
/** Cria uma sub-tarefa aberta ("A fazer") da história, com o campo Fase informado. */
function createSub(parentId: string, phase: string): string {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'child')!;
  const id = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.name === 'A fazer' && c.workflowId === wf.id)!.id,
    parentId,
    title: 'Passo',
  });
  const field = s.fieldDefs.find((f) => f.name === 'Fase')!;
  router.handle({ type: 'field.setValue', cardId: id, fieldId: field.id, value: phase }, { author: 'Claude Code', source: 'ai' });
  return id;
}
const setEffort = (cardId: string, value: string) => {
  const field = router.snapshot().fieldDefs.find((f) => f.name === EFFORT_FIELD)!;
  router.handle({ type: 'field.setValue', cardId, fieldId: field.id, value });
};
/** A pessoa aprova a história (não é a IA: só a aprovação dela dispara o avanço automático). */
const approve = (cardId: string) => {
  router.handle({ type: 'card.status.set', cardId, status: 'waiting_review' });
  router.handle({ type: 'card.status.set', cardId, status: 'approved' });
};

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-approveAdvance'),
  });
  router.handle({ type: 'settings.rules.update', patch: { shortTrack: true } });
});

describe('aprovação com a trilha curta', () => {
  it('um Bug aprovado no Discovery vai direto ao Plan, sem PRD nem Spec', () => {
    const bug = createStory('Bug', 'Discovery');
    approve(bug);
    expect(columnNameOf(bug)).toBe('Plan');
  });

  it('uma história de esforço Baixo também pula; aprovada no Plan, segue normalmente para a Implementação', () => {
    const story = createStory('História', 'Discovery');
    setEffort(story, 'Baixo');
    approve(story);
    expect(columnNameOf(story)).toBe('Plan');
    approve(story);
    expect(columnNameOf(story)).toBe('Implementação');
  });

  it('o esforço subido antes da aprovação devolve a história à trilha completa: vai ao PRD', () => {
    const story = createStory('História', 'Discovery');
    setEffort(story, 'Baixo');
    setEffort(story, 'Alto');
    approve(story);
    expect(columnNameOf(story)).toBe('PRD');
  });

  it('com a regra desligada, o Bug vai ao PRD como as demais', () => {
    router.handle({ type: 'settings.rules.update', patch: { shortTrack: false } });
    const bug = createStory('Bug', 'Discovery');
    approve(bug);
    expect(columnNameOf(bug)).toBe('PRD');
  });

  it('a regra de sub-tarefa da fase em aberto continua valendo: o avanço é recusado e a conversa diz para onde ele iria', () => {
    router.handle({ type: 'settings.rules.update', patch: { blockPhaseAdvanceWithOpenChildren: true } });
    const bug = createStory('Bug', 'Discovery');
    createSub(bug, 'Discovery');
    approve(bug);
    expect(columnNameOf(bug)).toBe('Discovery');
    const bodies = router
      .snapshot()
      .comments.filter((c) => c.cardId === bug)
      .map((c) => c.body);
    expect(bodies.at(-1)).toContain('Aprovado, mas o card não foi para Plan');
    // a aprovação fica registrada, para a IA retomar depois que a sub-tarefa fechar
    expect(card(bug).status).toBe('approved');
  });

  it('o movimento explícito para o PRD é aceito e força a trilha completa: a aprovação seguinte pula só a Spec', () => {
    const bug = createStory('Bug', 'Discovery');
    router.handle({ type: 'card.move', cardId: bug, columnId: columnByName('PRD').id, position: 0 });
    expect(columnNameOf(bug)).toBe('PRD');
    approve(bug);
    expect(columnNameOf(bug)).toBe('Plan');
  });
});
