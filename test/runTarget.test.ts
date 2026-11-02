import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import type { BoardState, Card } from '../src/shared/model';
import { defaultModelOf, withDefaultModel, type ModelOption, type ModelRule } from '../src/shared/models';
import {
  cliOfValue,
  defaultTarget,
  modelGroups,
  modelPrecedence,
  profilesInUse,
  resolveRunTarget,
  runTargetOf,
  suggestedByBoard,
  targetOfValue,
} from '../src/shared/runTarget';

const opt = (tool: string, model: string, efforts: string[] = []): ModelOption =>
  ({ id: `${tool}:${model}`, tool, model, label: model, efforts, defaultEffort: null }) as ModelOption;
const catalog = [opt('claude', 'haiku'), opt('claude', 'opus', ['low', 'high']), opt('cursor', 'composer-2.5'), opt('kimi', 'k3')];
const profile = (id: string): AiProfile => ({ ...BUILTIN_PROFILES.find((p) => p.id === id)!, enabled: true });
const profiles = (...ids: string[]): AiProfile[] => ids.map(profile);

interface Opts {
  aiTool?: string;
  aiProfiles?: AiProfile[];
  rules?: ModelRule[];
  agentModel?: string;
  phaseModel?: string | null;
  cards?: { id: string; model?: string; parentId?: string | null; ready?: boolean }[];
}
function state(o: Opts = {}): BoardState {
  const cards = (o.cards ?? [{ id: 'c1' }]).map(
    (c) =>
      ({
        id: c.id,
        typeId: 't',
        columnId: 'col',
        parentId: c.parentId ?? null,
        execProfile: null,
        status: c.ready === false ? 'waiting_review' : 'ready',
        position: 0,
        deletedAt: null,
        archivedAt: null,
      }) as unknown as Card,
  );
  return {
    board: {
      aiTool: o.aiTool ?? 'claude',
      aiProfiles: o.aiProfiles ?? profiles('claude', 'cursor'),
      modelCatalog: catalog,
      modelRules: o.rules ?? [],
      execProfiles: o.agentModel ? [{ id: 'a', name: 'ag', isDefault: true, model: o.agentModel }] : [],
    },
    workflows: [],
    columns: [{ id: 'col', name: 'Implementação', category: 'open', execProfile: null, phaseModel: o.phaseModel ?? null }],
    cardTypes: [{ id: 't', name: 'Tarefa' }],
    cards,
    fieldDefs: [{ id: 'modelo', kind: 'model', appliesToTypes: null }],
    fieldValues: (o.cards ?? [{ id: 'c1' }]).filter((c) => c.model).map((c) => ({ cardId: c.id, fieldId: 'modelo', value: c.model })),
    links: [],
    comments: [],
  } as unknown as BoardState;
}
const first = (s: BoardState) => s.cards[0]!;
const rule = (model: string): ModelRule => ({
  id: 'r',
  name: 'r',
  enabled: true,
  groups: [[{ fieldId: '@type', op: 'is', value: 'Tarefa' }]],
  model,
});

describe('runTargetOf', () => {
  it('o modelo do card decide a CLI (Haiku no Claude, Composer no Cursor)', () => {
    const s = state({
      cards: [
        { id: 'c1', model: 'claude:haiku' },
        { id: 'c2', model: 'cursor:composer-2.5' },
      ],
    });
    expect(runTargetOf(s, s.cards[0]!)).toMatchObject({ cli: { id: 'claude' }, model: { name: 'haiku' }, source: 'card' });
    expect(runTargetOf(s, s.cards[1]!)).toMatchObject({ cli: { id: 'cursor' }, model: { name: 'composer-2.5' }, source: 'card' });
  });

  it('sem escolha herda: agente, depois regra, depois o padrão', () => {
    expect(runTargetOf(state({ agentModel: 'cursor:composer-2.5', rules: [rule('claude:haiku')] }), first(state()))?.source).toBe('agent');
    const r = state({ rules: [rule('cursor:composer-2.5')] });
    expect(runTargetOf(r, first(r))).toMatchObject({ cli: { id: 'cursor' }, source: 'rule' });
    const d = state();
    expect(runTargetOf(d, first(d))).toMatchObject({ cli: { id: 'claude' }, model: null, source: 'default' });
  });

  it('trocar o padrão muda o alvo sem modelo', () => {
    const s = state({ aiTool: 'cursor' });
    expect(runTargetOf(s, first(s))?.cli.id).toBe('cursor');
  });

  it('escolha explícita inválida bloqueia, sem cair para o próximo nível', () => {
    const off = state({
      aiProfiles: profiles('claude'),
      cards: [{ id: 'c1', model: 'cursor:composer-2.5' }],
      rules: [rule('claude:haiku')],
    });
    expect(resolveRunTarget(off, first(off))).toMatchObject({ blocked: true, block: { reason: 'profile-unavailable', source: 'card' } });
    const unknown = state({ cards: [{ id: 'c1', model: 'claude:nada' }] });
    expect(resolveRunTarget(unknown, first(unknown))).toMatchObject({ blocked: true, block: { reason: 'model-unknown' } });
    const effort = state({ cards: [{ id: 'c1', model: 'claude:opus@turbo' }] });
    expect(resolveRunTarget(effort, first(effort))).toMatchObject({ blocked: true, block: { reason: 'effort-invalid' } });
    expect(runTargetOf(effort, first(effort))).toBeNull();
  });

  it('a regra vale mesmo com "aplicar a sugestão" desligado (a regra é só o modelo)', () => {
    const s = state({ rules: [rule('claude:opus@high')] });
    expect(runTargetOf(s, first(s))).toMatchObject({ model: { name: 'opus', effort: 'high' }, source: 'rule' });
  });

  it('sub-tarefas da mesma história rodam em perfis diferentes', () => {
    const s = state({
      cards: [{ id: 'h' }, { id: 'a', parentId: 'h', model: 'claude:haiku' }, { id: 'b', parentId: 'h', model: 'cursor:composer-2.5' }],
    });
    expect(runTargetOf(s, s.cards[1]!)?.cli.id).toBe('claude');
    expect(runTargetOf(s, s.cards[2]!)?.cli.id).toBe('cursor');
  });
});

describe('modelPrecedence: card > agente > regra, com o que o vencedor sobrepõe', () => {
  const named = (model: string, name = 'Esforço Baixo'): ModelRule => ({ ...rule(model), name });

  it('card escolhido à mão vence o agente e a regra, e lista os dois com o valor que perdeu', () => {
    const s = state({ cards: [{ id: 'c1', model: 'claude:opus@low' }], agentModel: 'claude:opus@high', rules: [named('claude:haiku')] });
    const p = modelPrecedence(s, first(s));
    expect(p.winner).toEqual({ source: 'card', value: 'claude:opus@low', name: '' });
    expect(p.overridden).toEqual([
      { source: 'agent', value: 'claude:opus@high', name: 'ag' },
      { source: 'rule', value: 'claude:haiku', name: 'Esforço Baixo' },
    ]);
  });

  it('o card preenchido pela regra vence o agente com a força do card, e a frase diz que foi a regra (#1375)', () => {
    const s = state({ cards: [{ id: 'c1', model: 'claude:haiku' }], agentModel: 'claude:opus@high', rules: [named('claude:haiku')] });
    const p = modelPrecedence(s, first(s));
    expect(p.winner).toEqual({ source: 'card', value: 'claude:haiku', name: 'Esforço Baixo', filledByRule: true });
    // a regra não perdeu: o valor dela é o que venceu
    expect(p.overridden).toEqual([{ source: 'agent', value: 'claude:opus@high', name: 'ag' }]);
  });

  it('sem Modelo no card, o agente vence a regra (o caso do esforço baixo caro)', () => {
    const s = state({ agentModel: 'claude:opus@high', rules: [named('claude:haiku')] });
    const p = modelPrecedence(s, first(s));
    expect(p.winner).toMatchObject({ source: 'agent', value: 'claude:opus@high' });
    expect(p.overridden).toEqual([{ source: 'rule', value: 'claude:haiku', name: 'Esforço Baixo' }]);
    expect(runTargetOf(s, first(s))).toMatchObject({ source: 'agent', model: { name: 'opus', effort: 'high' } });
  });

  it('fontes iguais não contradizem; sem nível preenchido não há vencedor; a regra sem nome vira a condição dela', () => {
    const same = state({ agentModel: 'claude:haiku', rules: [named('claude:haiku')] });
    expect(modelPrecedence(same, first(same))).toMatchObject({ winner: { source: 'agent' }, overridden: [] });
    const none = state();
    expect(modelPrecedence(none, first(none))).toEqual({ winner: null, overridden: [] });
    const unnamed = state({ agentModel: 'claude:opus', rules: [named('claude:haiku', '')] });
    expect(modelPrecedence(unnamed, first(unnamed)).overridden[0]!.name).toBe('Tipo = Tarefa');
  });
});

describe('suggestedByBoard: a indicação do board quando o modelo vem do campo do card e difere dela', () => {
  const named = (model: string): ModelRule => ({ ...rule(model), name: 'Esforço Baixo' });

  it('card à mão diferente do agente: o valor do agente', () => {
    const s = state({ cards: [{ id: 'c1', model: 'claude:opus@low' }], agentModel: 'claude:opus@high', rules: [named('claude:haiku')] });
    expect(suggestedByBoard(s, first(s))).toBe('claude:opus@high');
  });

  it('card à mão sem agente: a regra', () => {
    const s = state({ cards: [{ id: 'c1', model: 'claude:opus@low' }], rules: [named('claude:haiku')] });
    expect(suggestedByBoard(s, first(s))).toBe('claude:haiku');
  });

  it('card preenchido pela regra e diferente do agente: o valor do agente', () => {
    const s = state({ cards: [{ id: 'c1', model: 'claude:haiku' }], agentModel: 'claude:opus@high', rules: [named('claude:haiku')] });
    expect(modelPrecedence(s, first(s)).winner?.filledByRule).toBe(true);
    expect(suggestedByBoard(s, first(s))).toBe('claude:opus@high');
  });

  it('card igual à indicação: null', () => {
    const s = state({ cards: [{ id: 'c1', model: 'claude:opus@high' }], agentModel: 'claude:opus@high', rules: [named('claude:haiku')] });
    expect(suggestedByBoard(s, first(s))).toBeNull();
    const viaRule = state({ cards: [{ id: 'c1', model: 'claude:haiku' }], rules: [named('claude:haiku')] });
    expect(suggestedByBoard(viaRule, first(viaRule))).toBeNull();
  });

  it('sem Modelo no card: null, mesmo com agente e regra divergentes', () => {
    const s = state({ agentModel: 'claude:opus@high', rules: [named('claude:haiku')] });
    expect(suggestedByBoard(s, first(s))).toBeNull();
  });

  it('card com Modelo, sem agente nem regra: o padrão do board, ou null sem padrão', () => {
    const s = state({ cards: [{ id: 'c1', model: 'claude:opus@low' }] });
    const fallback = defaultTarget(s.board).value;
    expect(suggestedByBoard(s, first(s))).toBe(fallback || null);
    const withDefault = state({ cards: [{ id: 'c1', model: 'claude:opus@low' }] });
    withDefault.board.modelCatalog = [{ ...catalog[0]!, default: true } as ModelOption, ...catalog.slice(1)];
    expect(defaultTarget(withDefault.board).value).toBe('claude:haiku');
    expect(suggestedByBoard(withDefault, first(withDefault))).toBe('claude:haiku');
    // o padrão não fixa esforço: o card com o modelo padrão, em qualquer esforço, coincide; outro modelo devolve o padrão
    const sameModel = state({ cards: [{ id: 'c1', model: 'claude:haiku@medium' }] });
    sameModel.board.modelCatalog = withDefault.board.modelCatalog;
    expect(suggestedByBoard(sameModel, first(sameModel))).toBeNull();
    const otherModel = state({ cards: [{ id: 'c1', model: 'claude:opus@medium' }] });
    otherModel.board.modelCatalog = withDefault.board.modelCatalog;
    expect(suggestedByBoard(otherModel, first(otherModel))).toBe('claude:haiku');
    const none = state({ cards: [{ id: 'c1', model: 'claude:opus@low' }] });
    none.board.modelCatalog = [];
    expect(suggestedByBoard(none, first(none))).toBeNull();
  });
});

describe('cliOfValue e targetOfValue', () => {
  it('perfil desligado ou valor sem prefixo: null', () => {
    const b = state({ aiProfiles: profiles('claude') }).board;
    expect(cliOfValue(b, 'cursor:composer-2.5')).toBeNull();
    expect(cliOfValue(b, 'semprefixo')).toBeNull();
    expect(targetOfValue(b, 'claude:nada', 'card')).toBeNull();
  });

  it('a cópia padrão executa o prefixo do original; o original, quando a cópia não é o padrão', () => {
    const copy: AiProfile = { ...profile('claude'), id: 'claude-2', name: 'Claude 2', kind: 'catalog' };
    expect(cliOfValue({ aiTool: 'claude-2', aiProfiles: [profile('claude'), copy] }, 'claude:haiku')?.id).toBe('claude-2');
    expect(cliOfValue({ aiTool: 'claude', aiProfiles: [copy, profile('claude')] }, 'claude:haiku')?.id).toBe('claude');
  });

  it('perfil personalizado aceita modelo livre', () => {
    const custom: AiProfile = { ...profile('claude'), id: 'meu', name: 'Meu', kind: 'custom', tool: 'meu', mode: 'cli', base: 'generic' };
    const b = { aiTool: 'claude', aiProfiles: [profile('claude'), custom], modelCatalog: catalog };
    expect(targetOfValue(b, 'meu:qualquer@alto', 'card')).toMatchObject({
      cli: { id: 'meu' },
      model: { name: 'qualquer', effort: 'alto' },
    });
  });

  it('defaultTarget usa o perfil padrão', () => {
    expect(defaultTarget({ ...state().board, aiTool: 'cursor' }).cli.id).toBe('cursor');
  });

  it('sem modelo indicado, vale o modelo padrão do agente; sem padrão, a ferramenta escolhe', () => {
    const board = { ...state().board, aiTool: 'cursor' };
    expect(defaultTarget(board)).toMatchObject({ model: null, value: '' });
    const marked = withDefaultModel(board.modelCatalog, 'cursor', 'composer-2.5');
    expect(defaultTarget({ ...board, modelCatalog: marked })).toMatchObject({
      cli: { id: 'cursor' },
      model: { name: 'composer-2.5', effort: null },
      value: 'cursor:composer-2.5',
      source: 'default',
    });
    // o padrão de outro agente não vale para este
    expect(defaultTarget({ ...board, aiTool: 'claude', modelCatalog: marked }).model).toBeNull();
    // o card sem modelo também cai no padrão do agente
    const s = state({ aiTool: 'cursor' });
    s.board.modelCatalog = marked;
    expect(runTargetOf(s, s.cards[0]!)).toMatchObject({ model: { name: 'composer-2.5' }, source: 'default' });
  });

  it('withDefaultModel deixa um só padrão por ferramenta e null o tira', () => {
    const one = withDefaultModel(catalog, 'claude', 'haiku');
    const two = withDefaultModel(one, 'claude', 'opus');
    expect(two.filter((o) => o.default).map((o) => o.id)).toEqual(['claude:opus']);
    expect(withDefaultModel(two, 'claude', null).some((o) => o.default)).toBe(false);
    expect(defaultModelOf(withDefaultModel(two, 'cursor', 'composer-2.5'), 'claude')?.id).toBe('claude:opus');
  });
});

describe('profilesInUse e modelGroups', () => {
  it('padrão mais os perfis dos cards da IA, sem repetição', () => {
    const s = state({
      cards: [
        { id: 'a', model: 'cursor:composer-2.5' },
        { id: 'b', model: 'cursor:composer-2.5' },
        { id: 'c', model: 'claude:haiku' },
        { id: 'd', model: 'kimi:k3', ready: false },
      ],
      aiProfiles: profiles('claude', 'cursor', 'kimi'),
    });
    expect(
      profilesInUse(s)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['claude', 'cursor']);
  });
  it('um grupo por perfil ligado', () => {
    const s = state({ aiProfiles: [profile('claude'), { ...profile('kimi'), enabled: false }, profile('cursor')] });
    const g = modelGroups(s.board);
    expect(g.map((x) => x.cli)).toEqual(['claude', 'cursor']);
    expect(g[0]!.options.map((o) => o.model)).toEqual(['haiku', 'opus']);
    expect(g.map((x) => x.custom)).toEqual([false, false]);
  });

  it('o perfil personalizado forma grupo mesmo sem modelo no catálogo, marcado como custom', () => {
    const custom: AiProfile = {
      id: 'gemini-acp',
      name: 'Gemini ACP',
      enabled: true,
      kind: 'custom',
      tool: 'gemini-acp',
      mode: 'cli',
      base: 'generic',
      config: {},
      position: 9,
    };
    const g = modelGroups(state({ aiProfiles: [profile('claude'), custom] }).board);
    expect(g[1]).toMatchObject({ cli: 'gemini-acp', label: 'Gemini ACP', options: [], custom: true });
  });
});

describe('nível column: card > agente > coluna > regra (#1411)', () => {
  const named = (model: string): ModelRule => ({ ...rule(model), name: 'Esforço Baixo' });

  it('modelLevels traz os quatro níveis na ordem', () => {
    const s = state({
      cards: [{ id: 'c1', model: 'claude:opus@low' }],
      agentModel: 'claude:opus@high',
      phaseModel: 'claude:haiku',
      rules: [named('claude:opus')],
    });
    expect(modelPrecedence(s, first(s)).winner).toEqual({ source: 'card', value: 'claude:opus@low', name: '' });
    expect(modelPrecedence(s, first(s)).overridden.map((l) => l.source)).toEqual(['agent', 'column', 'rule']);
  });

  it('sem Modelo no card, o agente vence a coluna, que vence a regra', () => {
    const s = state({ agentModel: 'claude:opus@high', phaseModel: 'claude:haiku', rules: [named('claude:opus')] });
    expect(modelPrecedence(s, first(s)).overridden).toEqual([
      { source: 'column', value: 'claude:haiku', name: 'Implementação' },
      { source: 'rule', value: 'claude:opus', name: 'Esforço Baixo' },
    ]);
    const noAgent = state({ phaseModel: 'claude:haiku', rules: [named('claude:opus')] });
    expect(runTargetOf(noAgent, first(noAgent))).toMatchObject({ source: 'column', model: { name: 'haiku' } });
  });

  it('card igual ao modelo da coluna: filledByColumn, e filledByRule só quando a coluna não tem modelo', () => {
    const col = state({ cards: [{ id: 'c1', model: 'claude:haiku' }], phaseModel: 'claude:haiku', rules: [named('claude:haiku')] });
    expect(modelPrecedence(col, first(col)).winner).toEqual({
      source: 'card',
      value: 'claude:haiku',
      name: 'Implementação',
      filledByColumn: true,
    });
    const rul = state({ cards: [{ id: 'c1', model: 'claude:haiku' }], rules: [named('claude:haiku')] });
    expect(modelPrecedence(rul, first(rul)).winner?.filledByRule).toBe(true);
    expect(modelPrecedence(rul, first(rul)).winner?.filledByColumn).toBeUndefined();
  });

  it('valor inválido na coluna bloqueia com source column, sem cair na regra', () => {
    const s = state({ phaseModel: 'claude:nada', rules: [named('claude:haiku')] });
    expect(resolveRunTarget(s, first(s))).toMatchObject({ blocked: true, block: { source: 'column', reason: 'model-unknown' } });
  });
});
