import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { EscalationRepo } from '../src/extension/repositories/escalationRepo';
import { valueOf } from '../src/shared/selectors';
import type { WebviewToHost } from '../src/shared/messages';

// Aplicar a subida pendente na sub-tarefa de correção criada (#1108): `applyEscalationToNewCard`.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
let escalations: EscalationRepo;
let fired: string[];
let logged: string[];
const snap = () => router.snapshot();
const card = (n: number) => snap().cards.find((c) => c.number === n)!;
const column = (name: string, kind: 'parent' | 'child' = 'parent') => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === kind)!;
  return s.columns.find((c) => c.workflowId === wf.id && c.name === name)!;
};
const ai = (msg: WebviewToHost) => router.handle(msg, { author: 'Claude Code', source: 'ai' });
const human = (msg: WebviewToHost) => router.handle(msg);
const create = (title: string, columnName: string, parent?: number) => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === columnName)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
const field = (name: string) => snap().fieldDefs.find((f) => f.name === name)!;
const setField = (n: number, name: string, value: string | null) =>
  ai({ type: 'field.setValue', cardId: card(n).id, fieldId: field(name).id, value });
const modelOf = (n: number) => valueOf(snap(), card(n).id, field('Modelo').id);
const withChecks = (name: string, kind: 'parent' | 'child' = 'parent') =>
  human({
    type: 'settings.column.update',
    columnId: column(name, kind).id,
    patch: { checks: [{ name: 'Typecheck', command: 'true', timeoutSec: 30 }] },
  });
const comments = (n: number) =>
  snap()
    .comments.filter((c) => c.cardId === card(n).id)
    .map((c) => c.body);
/** o card tenta sair da coluna, o portão abre e falha */
const fail = (n: number, to: string, kind: 'parent' | 'child', result: 'failed' | 'interrupted' = 'failed', check = 'Typecheck') => {
  ai({ type: 'card.move', cardId: card(n).id, columnId: column(to, kind).id, position: 0 });
  router.failGate(fired.at(-1)!, result, `**${check}** falhou (código 2)`, check);
};
const unit = (n: number, col: string, kind: 'parent' | 'child' = 'parent') => escalations.forUnit(card(n).id, column(col, kind).id);

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  logged = [];
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-model-escalation'),
    log: (l) => logged.push(l),
  });
  escalations = new EscalationRepo(db);
  fired = [];
  router.onGate((id) => fired.push(id));
});

const pendingSetup = () => {
  withChecks('Implementação');
  create('H', 'Implementação');
  create('Passo', 'Concluído', 1);
  setField(2, 'Fase', 'Implementação');
  setField(2, 'Esforço da atividade', 'Baixo');
  fail(1, 'Revisão', 'parent');
};
/** a sub-tarefa de correção, como o create_card a deixa depois de setFields */
const correction = (phase: string, model?: string) => {
  const n = snap().cards.length + 1;
  create('Correção', 'A fazer', 1);
  setField(n, 'Fase', phase);
  if (model) setField(n, 'Modelo', model);
  router.applyEscalationToNewCard(card(n).id);
  return n;
};

describe('subida pendente aplicada na correção criada', () => {
  beforeEach(pendingSetup);

  it('Fase certa: grava o modelo acima, marca applied e comenta nos dois cards', () => {
    const n = correction('Implementação');
    expect(modelOf(n)).toBe('claude:haiku@high');
    expect(unit(1, 'Implementação')).toMatchObject({ status: 'applied', targetCardId: card(n).id });
    expect(comments(n).some((b) => b.startsWith('Modelo subiu'))).toBe(true);
    expect(comments(1).some((b) => b.includes(`#${n} usará`))).toBe(true);
  });

  it('Fase errada não consome a pendência', () => {
    const n = correction('Spec');
    expect(modelOf(n)).toBeNull();
    expect(unit(1, 'Implementação')!.status).toBe('pending');
  });

  it('fields.Modelo mais alto fica, e a pendência é consumida', () => {
    const n = correction('Implementação', 'claude:opus@high');
    expect(modelOf(n)).toBe('claude:opus@high');
    expect(unit(1, 'Implementação')!.status).toBe('applied');
    expect(comments(n).some((b) => b.includes('já estava em nível igual ou acima'))).toBe(true);
  });

  it('fields.Modelo mais baixo sobe', () => {
    const n = correction('Implementação', 'claude:haiku@low');
    expect(modelOf(n)).toBe('claude:haiku@high');
  });

  it('sem pendência nada muda', () => {
    correction('Implementação');
    const n = correction('Implementação');
    expect(modelOf(n)).toBeNull();
  });

  it('sem pai (criada pela tela) não passa por aqui', () => {
    const id = create('Solta', 'Implementação');
    router.applyEscalationToNewCard(id);
    expect(unit(1, 'Implementação')!.status).toBe('pending');
  });
});
