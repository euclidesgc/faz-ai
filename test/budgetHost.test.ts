// Teto de consumo, lado host (#1355): mensagens budget.config.set e budget.card.set pelo router real.
import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { toolDefinitions } from '../src/extension/mcp/tools';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { DEFAULT_BUDGET, validateBudgetConfig, validateCardCeiling, type BudgetConfig } from '../src/shared/budget';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const AI = { author: 'Claude Code', source: 'ai' } as const;

let dbHandle: { db: any; scheduleSave: () => void; close: () => Promise<void> };
const open = () =>
  new MessageRouter(dbHandle as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-budgetHost'),
  });

const VALID: BudgetConfig = { enabled: true, byEffort: { Baixo: 1000, Médio: 2000, Alto: 3000 }, warnAt: 70, policy: 'stop' };
const newCard = (router: MessageRouter): string => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
    parentId: null,
    title: 'H',
  });
};

beforeEach(async () => {
  dbHandle = { db: await openInMemory(WASM_DIR), scheduleSave: () => {}, close: async () => {} };
});

describe('budget.config.set', () => {
  it('sem gravação, o estado traz o padrão (desligado)', () => {
    expect(open().snapshot().budget).toEqual({ config: DEFAULT_BUDGET, cards: {} });
  });

  it('configuração válida persiste e sobrevive à reabertura', () => {
    const router = open();
    router.handle({ type: 'budget.config.set', config: VALID });
    expect(router.snapshot().budget.config).toEqual(VALID);
    expect(open().snapshot().budget.config).toEqual(VALID);
  });

  it.each([
    ['teto zero', { ...VALID, byEffort: { ...VALID.byEffort, Baixo: 0 } }],
    ['teto fracionado', { ...VALID, byEffort: { ...VALID.byEffort, Alto: 1.5 } }],
    ['aviso 0', { ...VALID, warnAt: 0 }],
    ['aviso 101', { ...VALID, warnAt: 101 }],
    ['política desconhecida', { ...VALID, policy: 'explodir' }],
    ['enabled não booleano', { ...VALID, enabled: 'sim' }],
  ])('faixa inválida (%s) é recusada e nada é gravado', (_n, config) => {
    const router = open();
    expect(() => router.handle({ type: 'budget.config.set', config: config as never })).toThrow();
    expect(router.snapshot().budget.config).toEqual(DEFAULT_BUDGET);
  });

  it('source "ai" é recusado sem efeito', () => {
    const router = open();
    expect(() => router.handle({ type: 'budget.config.set', config: VALID }, AI)).toThrow(/pessoa/);
    expect(router.snapshot().budget.config).toEqual(DEFAULT_BUDGET);
  });
});

describe('budget.card.set', () => {
  it('número, "off" e null (volta ao padrão)', () => {
    const router = open();
    const id = newCard(router);
    router.handle({ type: 'budget.card.set', cardId: id, ceiling: 5000 });
    expect(router.snapshot().budget.cards[id]).toBe(5000);
    router.handle({ type: 'budget.card.set', cardId: id, ceiling: 'off' });
    expect(open().snapshot().budget.cards[id]).toBe('off');
    router.handle({ type: 'budget.card.set', cardId: id, ceiling: null });
    expect(router.snapshot().budget.cards[id]).toBeUndefined();
  });

  it('valor inválido ou card inexistente é erro e nada é gravado', () => {
    const router = open();
    const id = newCard(router);
    for (const ceiling of [0, -1, 1.5, 'x', NaN]) {
      expect(() => router.handle({ type: 'budget.card.set', cardId: id, ceiling: ceiling as never })).toThrow();
    }
    expect(() => router.handle({ type: 'budget.card.set', cardId: 'nao-existe', ceiling: 10 })).toThrow(/não encontrado/);
    expect(router.snapshot().budget.cards).toEqual({});
  });

  it('source "ai" é recusado sem efeito', () => {
    const router = open();
    const id = newCard(router);
    expect(() => router.handle({ type: 'budget.card.set', cardId: id, ceiling: 10 }, AI)).toThrow(/pessoa/);
    expect(router.snapshot().budget.cards).toEqual({});
  });
});

describe('validadores e MCP', () => {
  it('validateBudgetConfig/validateCardCeiling', () => {
    expect(validateBudgetConfig(VALID)).toBeNull();
    expect(validateBudgetConfig(null)).not.toBeNull();
    expect(validateCardCeiling(null)).toBeNull();
    expect(validateCardCeiling('off')).toBeNull();
    expect(validateCardCeiling(0)).not.toBeNull();
  });

  it('nenhuma ferramenta MCP de teto', () => {
    expect(toolDefinitions().filter((t) => /budget/i.test(t.name))).toEqual([]);
  });
});
