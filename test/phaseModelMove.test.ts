// A sugestão de modelo reaplicada ao trocar de coluna (gancho `moveCard` e `reapplySuggestionIn`
// em src/extension/panel/handlers/cards.ts), pelo router real. Montagem no padrão de test/modelsHandlers.test.ts e
// portão no padrão de test/mcpGate.test.ts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { GateRepo } from '../src/extension/repositories/gateRepo';
import { valueOf } from '../src/shared/selectors';
import type { WebviewToHost } from '../src/shared/messages';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const PLAN_MODEL = 'claude:opus@high';
const SPEC_MODEL = 'claude:sonnet@low';
const AI = { author: 'Claude Code', source: 'ai' } as const;

let dir: string;
let router: MessageRouter;
let db: Awaited<ReturnType<typeof openInMemory>>;

const snap = () => router.snapshot();
const parentWf = () => snap().workflows.find((w) => w.kind === 'parent')!;
const column = (name: string) => snap().columns.find((c) => c.name === name && c.workflowId === parentWf().id)!;
const card = (id: string) => snap().cards.find((c) => c.id === id)!;
const modelField = () => snap().fieldDefs.find((f) => f.kind === 'model')!;
const modelOf = (id: string) => valueOf(snap(), id, modelField().id) ?? null;
const human = (msg: WebviewToHost) => router.handle(msg);
const setPhaseModelOf = (columnId: string, phaseModel: string | null) =>
  human({ type: 'settings.column.update', columnId, patch: { phaseModel } });
const setPhaseModel = (name: string, phaseModel: string | null) => setPhaseModelOf(column(name).id, phaseModel);
const story = (title: string, columnName: string, parentId: string | null = null): string => {
  const s = snap();
  const wf = parentId ? s.workflows.find((w) => w.kind === 'child')! : parentWf();
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: parentId ? s.columns.find((c) => c.workflowId === wf.id && c.position === 0)!.id : column(columnName).id,
    parentId,
    title,
  });
};
const pick = (cardId: string, value: string) => human({ type: 'field.setValue', cardId, fieldId: modelField().id, value });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-phase-move-'));
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
  });
  human({ type: 'settings.rules.update', patch: { autoApplyModelSuggestion: true } });
  setPhaseModel('Plan', PLAN_MODEL);
  setPhaseModel('Spec', SPEC_MODEL);
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('cada caminho de movimento reaplica a sugestão', () => {
  it('card.move', () => {
    const id = story('H', 'Discovery');
    human({ type: 'card.move', cardId: id, columnId: column('Plan').id, position: 0 });
    expect(modelOf(id)).toBe(PLAN_MODEL);
  });

  it('card.moveMany', () => {
    const id = story('H', 'Discovery');
    human({ type: 'card.moveMany', cardIds: [id], columnId: column('Plan').id });
    expect(modelOf(id)).toBe(PLAN_MODEL);
  });

  it('card.status.set approved (advanceApproved)', () => {
    const id = story('H', 'PRD');
    human({ type: 'card.status.set', cardId: id, status: 'waiting_review' });
    human({ type: 'card.status.set', cardId: id, status: 'approved' });
    expect(card(id).columnId).toBe(column('Spec').id);
    expect(modelOf(id)).toBe(SPEC_MODEL);
  });

  it('completeGate', () => {
    setPhaseModel('Revisão', PLAN_MODEL);
    human({
      type: 'settings.column.update',
      columnId: column('Implementação').id,
      patch: { checks: [{ name: 'Typecheck', command: 'true', timeoutSec: 30 }] },
    });
    const id = story('H', 'Implementação');
    router.handle({ type: 'card.move', cardId: id, columnId: column('Revisão').id, position: 0 }, AI);
    const run = new GateRepo(db).runningFor(id)!;
    expect(card(id).columnId).toBe(column('Implementação').id);
    router.completeGate(run.id, 'abc123');
    expect(card(id).columnId).toBe(column('Revisão').id);
    expect(modelOf(id)).toBe(PLAN_MODEL);
  });

  it('card.unarchive com coluna', () => {
    const id = story('H', 'Discovery');
    human({ type: 'card.archive', cardId: id });
    human({ type: 'card.unarchive', cardId: id, columnId: column('Plan').id, position: 0 });
    expect(modelOf(id)).toBe(PLAN_MODEL);
  });

  it('card.restoreArchived (volta à primeira coluna)', () => {
    const first = snap().columns.find((c) => c.workflowId === parentWf().id && c.position === 0)!;
    setPhaseModel(first.name, PLAN_MODEL);
    const id = story('H', 'Spec');
    human({ type: 'card.archive', cardId: id });
    human({ type: 'card.restoreArchived', cardId: id });
    expect(card(id).columnId).toBe(first.id);
    expect(modelOf(id)).toBe(PLAN_MODEL);
  });

  it('card.unarchiveMany', () => {
    const first = snap().columns.find((c) => c.workflowId === parentWf().id && c.position === 0)!;
    setPhaseModel(first.name, PLAN_MODEL);
    const id = story('H', 'Spec');
    human({ type: 'card.archive', cardId: id });
    human({ type: 'card.unarchiveMany', cardIds: [id] });
    expect(modelOf(id)).toBe(PLAN_MODEL);
  });
});

describe('quando não reaplica', () => {
  it('campo escolhido à mão não muda', () => {
    const id = story('H', 'Discovery');
    pick(id, 'claude:haiku@low');
    human({ type: 'card.move', cardId: id, columnId: column('Plan').id, position: 0 });
    expect(modelOf(id)).toBe('claude:haiku@low');
  });

  it('só a posição mudou: não muda', () => {
    const id = story('H', 'Plan');
    expect(modelOf(id)).toBe(PLAN_MODEL);
    pick(id, 'claude:haiku@low');
    human({ type: 'card.move', cardId: id, columnId: column('Plan').id, position: 0 });
    expect(modelOf(id)).toBe('claude:haiku@low');
  });

  it('regra desligada: não muda', () => {
    human({ type: 'settings.rules.update', patch: { autoApplyModelSuggestion: false } });
    const id = story('H', 'Discovery');
    human({ type: 'card.move', cardId: id, columnId: column('Plan').id, position: 0 });
    expect(modelOf(id)).toBeNull();
  });

  it('destino sem preferência: o campo esvazia quando nenhuma regra casa', () => {
    const id = story('H', 'Plan');
    expect(modelOf(id)).toBe(PLAN_MODEL);
    human({ type: 'card.move', cardId: id, columnId: column('Implementação').id, position: 0 });
    expect(modelOf(id)).toBeNull();
  });
});

describe('sub-tarefa de Revisão', () => {
  const phaseField = () => snap().fieldDefs.find((f) => f.name === 'Fase')!;
  const childCol = (name: string) => snap().columns.find((c) => c.name === name && c.workflowId !== parentWf().id)!;

  it('o revisor gravado não é trocado ao mudar de coluna, nem quando igual ao modelo da origem', () => {
    const parent = story('H', 'Discovery');
    const sub = story('Revisão', 'Discovery', parent);
    router.handle({ type: 'field.setValue', cardId: sub, fieldId: phaseField().id, value: 'Revisão' }, AI);
    const other = childCol('Em andamento');
    setPhaseModelOf(other.id, PLAN_MODEL);
    // revisor igual ao modelo da coluna de origem (a de entrada) e coluna seguinte com outro modelo
    const origin = snap().columns.find((c) => c.id === card(sub).columnId)!;
    setPhaseModelOf(origin.id, SPEC_MODEL);
    pick(sub, SPEC_MODEL);
    human({ type: 'card.move', cardId: sub, columnId: other.id, position: 0 });
    expect(modelOf(sub)).toBe(SPEC_MODEL);
  });
});
