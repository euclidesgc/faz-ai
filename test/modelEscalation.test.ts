import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { EscalationRepo } from '../src/extension/repositories/escalationRepo';
import { GateRepo } from '../src/extension/repositories/gateRepo';
import { valueOf } from '../src/shared/selectors';
import type { WebviewToHost } from '../src/shared/messages';

// A subida de modelo quando o portão falha (#1108): `failGate` com resultado `failed` sobe o Modelo do card que será
// reexecutado (sub-tarefa ou história sem sub-tarefas) ou deixa a subida pendente na história com sub-tarefas na fase.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
let escalations: EscalationRepo;
let gates: GateRepo;
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
  gates = new GateRepo(db);
  fired = [];
  router.onGate((id) => fired.push(id));
});

describe('caminho 1: o próprio card é reexecutado', () => {
  beforeEach(() => {
    withChecks('A fazer', 'child');
    create('H', 'Implementação');
    create('Passo', 'A fazer', 1);
    setField(2, 'Esforço da atividade', 'Baixo');
  });

  it('sub-tarefa sobe o Modelo um nível, registra applied e comenta de/para/checagem', () => {
    expect(modelOf(2)).toBe('claude:haiku@medium');
    fail(2, 'Em andamento', 'child');
    expect(modelOf(2)).toBe('claude:haiku@high');
    expect(card(2).status).toBe('ready');
    expect(unit(2, 'A fazer', 'child')).toMatchObject({
      status: 'applied',
      fromModel: 'claude:haiku@medium',
      toModel: 'claude:haiku@high',
      check: 'Typecheck',
      targetCardId: card(2).id,
    });
    expect(comments(2)).toContain('Modelo subiu de Haiku 5.5 · medium para Haiku 5.5 · high porque a checagem "Typecheck" falhou.');
  });

  it('usa a escada do board quando há uma', () => {
    const ladders = JSON.stringify({ claude: ['claude:haiku@medium', 'claude:sonnet@medium', 'claude:opus@high'] });
    (router as unknown as { ctx: { boards: { setMeta(k: string, v: string): void } } }).ctx.boards.setMeta('model_ladders', ladders);
    fail(2, 'Em andamento', 'child');
    expect(modelOf(2)).toBe('claude:sonnet@medium');
  });

  it('história sem sub-tarefas sobe o próprio Modelo', () => {
    withChecks('Implementação');
    setField(1, 'Esforço da atividade', 'Médio');
    expect(modelOf(1)).toBe('claude:sonnet@medium');
    fail(1, 'Revisão', 'parent');
    expect(modelOf(1)).toBe('claude:sonnet@high');
    expect(unit(1, 'Implementação')).toMatchObject({ status: 'applied', targetCardId: card(1).id });
  });

  it('modelo escolhido à mão não sobe', () => {
    setField(2, 'Modelo', 'claude:opus@low');
    fail(2, 'Em andamento', 'child');
    expect(modelOf(2)).toBe('claude:opus@low');
    expect(unit(2, 'A fazer', 'child')).toBeUndefined();
    expect(comments(2)).toContain('O modelo de #2 não subiu: foi escolhido à mão.');
    expect(card(2).status).toBe('ready');
  });

  it('topo da escada: comenta que não há nível acima e o card segue ready', () => {
    const ladders = JSON.stringify({ claude: ['claude:haiku@medium', 'claude:sonnet@medium'] });
    (router as unknown as { ctx: { boards: { setMeta(k: string, v: string): void } } }).ctx.boards.setMeta('model_ladders', ladders);
    setField(2, 'Esforço da atividade', 'Médio');
    expect(modelOf(2)).toBe('claude:sonnet@medium');
    fail(2, 'Em andamento', 'child');
    expect(modelOf(2)).toBe('claude:sonnet@medium');
    expect(unit(2, 'A fazer', 'child')).toBeUndefined();
    expect(comments(2)).toContain('Sem nível acima de Sonnet 5.5 · medium para o agente Claude Code.');
    expect(card(2).status).toBe('ready');
  });

  it('interrupted nunca sobe', () => {
    fail(2, 'Em andamento', 'child', 'interrupted');
    expect(modelOf(2)).toBe('claude:haiku@medium');
    expect(unit(2, 'A fazer', 'child')).toBeUndefined();
    expect(comments(2).some((b) => b.startsWith('Modelo subiu'))).toBe(false);
  });

  it('segunda falha da mesma unidade bloqueia o card e não grava outra linha', () => {
    fail(2, 'Em andamento', 'child');
    fail(2, 'Em andamento', 'child');
    expect(card(2).status).toBe('blocked');
    expect(modelOf(2)).toBe('claude:haiku@high');
    expect(comments(2)).toContain('A checagem "Typecheck" falhou de novo depois de subir o modelo; o card passou para a pessoa.');
    expect(escalations.listFor(card(2).id)).toHaveLength(1);
  });
});

describe('caminho 2: história com sub-tarefas na fase', () => {
  beforeEach(() => {
    withChecks('Implementação');
    create('H', 'Implementação');
    create('Passo', 'Concluído', 1);
    setField(2, 'Fase', 'Implementação');
    setField(2, 'Esforço da atividade', 'Baixo');
  });

  it('deixa a subida pendente, com a base na última sub-tarefa concluída, e comenta na história', () => {
    fail(1, 'Revisão', 'parent');
    expect(unit(1, 'Implementação')).toMatchObject({
      status: 'pending',
      targetCardId: null,
      fromModel: 'claude:haiku@medium',
      toModel: 'claude:haiku@high',
    });
    expect(modelOf(1)).toBeNull();
    expect(comments(1)).toContain('A correção subirá de Haiku 5.5 · medium para Haiku 5.5 · high porque a checagem "Typecheck" falhou.');
    expect(card(1).status).toBe('ready');
  });

  it('nova falha com a subida ainda pendente não duplica nem bloqueia', () => {
    fail(1, 'Revisão', 'parent');
    fail(1, 'Revisão', 'parent');
    expect(escalations.listFor(card(1).id)).toHaveLength(1);
    expect(card(1).status).toBe('ready');
  });

  it('falha de novo depois da correção aplicada bloqueia a história', () => {
    fail(1, 'Revisão', 'parent');
    escalations.markApplied(unit(1, 'Implementação')!.id, card(2).id);
    fail(1, 'Revisão', 'parent');
    expect(card(1).status).toBe('blocked');
    expect(comments(1)).toContain('A checagem "Typecheck" falhou de novo depois de subir o modelo; o card passou para a pessoa.');
  });

  it('sub-tarefa de outra fase não conta: a história sobe o próprio Modelo', () => {
    setField(2, 'Fase', 'Spec');
    setField(1, 'Esforço da atividade', 'Médio');
    fail(1, 'Revisão', 'parent');
    expect(unit(1, 'Implementação')).toMatchObject({ status: 'applied' });
    expect(modelOf(1)).toBe('claude:sonnet@high');
  });
});

describe('falha fechada', () => {
  it('erro na subida é logado e o failGate segue', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    setField(1, 'Esforço da atividade', 'Médio');
    (router as unknown as { escalation: { repo: unknown } }).escalation.repo = {
      forUnit: () => {
        throw new Error('banco quebrado');
      },
    };
    fail(1, 'Revisão', 'parent');
    expect(card(1).status).toBe('ready');
    expect(gates.get(fired[0]!)!.result).toBe('failed');
    expect(logged.some((l) => l.includes('banco quebrado'))).toBe(true);
  });
});
