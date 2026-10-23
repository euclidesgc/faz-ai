import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import type { BoardState, Card } from '../src/shared/model';
import type { ModelOption, ModelRule } from '../src/shared/models';
import {
  cliOfValue,
  defaultTarget,
  modelGroups,
  profilesInUse,
  resolveRunTarget,
  runTargetOf,
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
    columns: [{ id: 'col', category: 'open', execProfile: null }],
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

describe('cliOfValue e targetOfValue', () => {
  it('perfil desligado ou valor sem prefixo: null', () => {
    const b = state({ aiProfiles: profiles('claude') }).board;
    expect(cliOfValue(b, 'cursor:composer-2.5')).toBeNull();
    expect(cliOfValue(b, 'semprefixo')).toBeNull();
    expect(targetOfValue(b, 'claude:nada', 'card')).toBeNull();
  });

  it('a cópia padrão executa o prefixo do original; o original, quando a cópia não é o padrão', () => {
    const copy: AiProfile = { ...profile('claude'), id: 'claude-2', name: 'Claude 2', kind: 'copy' };
    expect(cliOfValue({ aiTool: 'claude-2', aiProfiles: [profile('claude'), copy] }, 'claude:haiku')?.id).toBe('claude-2');
    expect(cliOfValue({ aiTool: 'claude', aiProfiles: [copy, profile('claude')] }, 'claude:haiku')?.id).toBe('claude');
  });

  it('perfil personalizado aceita modelo livre', () => {
    const custom: AiProfile = { ...profile('claude'), id: 'meu', name: 'Meu', kind: 'custom', base: 'generic' };
    const b = { aiTool: 'claude', aiProfiles: [profile('claude'), custom], modelCatalog: catalog };
    expect(targetOfValue(b, 'meu:qualquer@alto', 'card')).toMatchObject({
      cli: { id: 'meu' },
      model: { name: 'qualquer', effort: 'alto' },
    });
  });

  it('defaultTarget usa o perfil padrão', () => {
    expect(defaultTarget({ ...state().board, aiTool: 'cursor' }).cli.id).toBe('cursor');
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
      base: 'generic',
      config: {},
      position: 9,
    };
    const g = modelGroups(state({ aiProfiles: [profile('claude'), custom] }).board);
    expect(g[1]).toMatchObject({ cli: 'gemini-acp', label: 'Gemini ACP', options: [], custom: true });
  });
});
