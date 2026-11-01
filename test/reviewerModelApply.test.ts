import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { applyReviewerModel, implementerModelOf } from '../src/extension/reviewerModelApply';
import { valueOf } from '../src/shared/selectors';
import type { ModelOption } from '../src/shared/models';
import type { WebviewToHost } from '../src/shared/messages';

// O modelo do revisor aplicado à sub-tarefa de Revisão criada (#1111): `applyReviewerModel`.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const opt = (model: string): ModelOption => ({
  id: `claude:${model}`,
  tool: 'claude',
  model,
  label: model,
  efforts: [],
  defaultEffort: null,
});

let router: MessageRouter;
let logged: string[];
const snap = () => router.snapshot();
const card = (n: number) => snap().cards.find((c) => c.number === n)!;
const ai = (msg: WebviewToHost) => router.handle(msg, { author: 'Claude Code', source: 'ai' });
const human = (msg: WebviewToHost) => router.handle(msg);
const deps = () => ({ ctx: (router as unknown as { ctx: never }).ctx, log: (l: string) => logged.push(l) });
const field = (name: string) => snap().fieldDefs.find((f) => f.name === name)!;
const create = (title: string, parent?: number) => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
const setField = (n: number, name: string, value: string | null, by: 'ai' | 'human' = 'ai') =>
  (by === 'ai' ? ai : human)({ type: 'field.setValue', cardId: card(n).id, fieldId: field(name).id, value });
const modelOf = (n: number) => valueOf(snap(), card(n).id, field('Modelo').id);
const comments = (n: number) =>
  snap()
    .comments.filter((c) => c.cardId === card(n).id)
    .map((c) => c.body);
/** uma sub-tarefa de Implementação já feita com `model` */
const implemented = (model: string) => {
  const n = snap().cards.length + 1;
  create(`Passo ${n}`, 1);
  setField(n, 'Fase', 'Implementação');
  setField(n, 'Modelo', model);
  return n;
};
/** a sub-tarefa de revisão como o create_card a deixa depois do setFields */
const review = (model?: string, by: 'ai' | 'human' = 'ai') => {
  const n = snap().cards.length + 1;
  create('Revisão', 1);
  setField(n, 'Fase', 'Revisão');
  if (model) setField(n, 'Modelo', model, by);
  return n;
};

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  logged = [];
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-reviewer-model'),
    log: (l) => logged.push(l),
  });
  // um agente só: haiku (barato), sonnet e opus
  human({ type: 'settings.models.set', catalog: [opt('haiku'), opt('sonnet'), opt('opus')] });
  human({ type: 'models.ladder.set', tool: 'claude', ladder: ['claude:haiku', 'claude:sonnet', 'claude:opus'] });
  create('História');
});

describe('implementerModelOf', () => {
  it('a moda dos modelos das sub-tarefas de Implementação', () => {
    implemented('claude:sonnet');
    implemented('claude:opus');
    implemented('claude:sonnet');
    expect(implementerModelOf(deps(), card(1).id)).toBe('claude:sonnet');
  });

  it('empate: o da sub-tarefa mais recente', () => {
    implemented('claude:sonnet');
    const last = implemented('claude:opus');
    // a mais recente é a que foi gravada por último
    setField(last, 'Modelo', 'claude:opus');
    expect(implementerModelOf(deps(), card(1).id)).toBe('claude:opus');
  });

  it('só conta a Fase Implementação; sem elas, cai no modelo da história; sem ele, null', () => {
    const n = snap().cards.length + 1;
    create('Spec', 1);
    setField(n, 'Fase', 'Spec');
    setField(n, 'Modelo', 'claude:sonnet');
    expect(implementerModelOf(deps(), card(1).id)).toBeNull();
    setField(1, 'Modelo', 'claude:opus');
    expect(implementerModelOf(deps(), card(1).id)).toBe('claude:opus');
  });
});

describe('applyReviewerModel', () => {
  it('sem modelo: outro modelo do mesmo agente, nunca o barato, com comentário nos dois cards', () => {
    implemented('claude:opus');
    const n = review();
    applyReviewerModel(deps(), card(n).id);
    expect(modelOf(n)).toBe('claude:sonnet');
    expect(comments(n)[0]).toContain('Revisor definido pelo board: sonnet (implementação: opus)');
    expect(comments(n)[0]).toContain('só há um agente pronto');
    expect(comments(1).some((b) => b.includes(`#${n}`) && b.includes('sonnet'))).toBe(true);
  });

  it('o modelo escolhido à mão não muda', () => {
    implemented('claude:opus');
    const n = review('claude:haiku', 'human');
    applyReviewerModel(deps(), card(n).id);
    expect(modelOf(n)).toBe('claude:haiku');
    expect(comments(n)).toEqual([]);
  });

  it('fields.Modelo da IA no nível barato é trocado', () => {
    implemented('claude:opus');
    const n = review('claude:haiku');
    applyReviewerModel(deps(), card(n).id, true);
    expect(modelOf(n)).toBe('claude:sonnet');
  });

  it('fields.Modelo da IA igual ao do implementador é trocado', () => {
    implemented('claude:opus');
    const n = review('claude:opus');
    applyReviewerModel(deps(), card(n).id, true);
    expect(modelOf(n)).toBe('claude:sonnet');
  });

  it('fields.Modelo da IA independente e não barato é mantido, sem comentário', () => {
    implemented('claude:opus');
    const n = review('claude:sonnet');
    applyReviewerModel(deps(), card(n).id, true);
    expect(modelOf(n)).toBe('claude:sonnet');
    expect(comments(n)).toEqual([]);
  });

  it('sem implementador conhecido só garante o não barato', () => {
    const n = review('claude:haiku');
    applyReviewerModel(deps(), card(n).id, true);
    expect(modelOf(n)).toBe('claude:sonnet');
    const m = review('claude:opus');
    applyReviewerModel(deps(), card(m).id, true);
    expect(modelOf(m)).toBe('claude:opus');
  });

  it('outra Fase, ou sem pai, fica como está', () => {
    implemented('claude:opus');
    const n = snap().cards.length + 1;
    create('Outra', 1);
    setField(n, 'Fase', 'Implementação');
    applyReviewerModel(deps(), card(n).id);
    expect(modelOf(n)).toBeNull();
    const solta = create('Solta');
    applyReviewerModel(deps(), solta);
    expect(logged).toEqual([]);
  });

  it('erro no gancho é logado e não lança', () => {
    const broken = {
      ctx: {
        state: () => {
          throw new Error('boom');
        },
      } as never,
      log: (l: string) => logged.push(l),
    };
    expect(() => applyReviewerModel(broken, 'x')).not.toThrow();
    expect(logged[0]).toContain('boom');
  });
});

describe('settings.reviewerModel.set', () => {
  it('a pessoa grava e volta ao automático com null', () => {
    human({ type: 'settings.reviewerModel.set', value: 'claude:opus' });
    expect(snap().board.reviewerModel).toBe('claude:opus');
    human({ type: 'settings.reviewerModel.set', value: null });
    expect(snap().board.reviewerModel).toBeNull();
  });

  it('a IA é recusada e modelo fora do catálogo também', () => {
    expect(() => ai({ type: 'settings.reviewerModel.set', value: 'claude:opus' })).toThrow();
    expect(() => human({ type: 'settings.reviewerModel.set', value: 'claude:nao-existe' })).toThrow();
    expect(() => human({ type: 'settings.reviewerModel.set', value: '' })).toThrow();
    expect(snap().board.reviewerModel).toBeNull();
  });
});
