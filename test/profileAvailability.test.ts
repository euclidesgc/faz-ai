import { describe, expect, it } from 'vitest';
import { limitChoice } from '../src/shared/limitChoice';
import type { BoardState, Card } from '../src/shared/model';
import { profileBlock } from '../src/shared/profileAvailability';
import { testModels, isTextModel } from '../src/shared/models';
import type { RunTarget } from '../src/shared/runTarget';

const profile = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  enabled: true,
  kind: 'catalog',
  tool: id,
  mode: 'cli',
  ...over,
});
const option = (tool: string, model: string) => ({ id: `${tool}:${model}`, tool, model, label: model, efforts: [], defaultEffort: null });

function state(over: Partial<BoardState> = {}): BoardState {
  return {
    requirements: [],
    authExpired: [],
    usageLimit: [],
    connections: {},
    cards: [],
    columns: [],
    fieldDefs: [{ id: 'f-modelo', kind: 'model', name: 'Modelo', appliesToTypes: null }],
    board: {
      aiTool: 'claude',
      aiProfiles: [profile('claude'), profile('gemini', { mode: 'api' }), profile('cursor'), profile('kimi', { enabled: false })],
      modelCatalog: [
        option('claude', 'sonnet'),
        option('gemini', 'gemini-2.5-flash-preview-tts'),
        option('gemini', 'gemini-2.5-pro'),
        option('cursor', 'auto'),
      ],
    },
    ...over,
  } as unknown as BoardState;
}

describe('profileBlock: o agente pode responder agora?', () => {
  it('desligado, sem CLI, sem login, sem suporte ou com a conexão falha ficam de fora; o limite de uso não', () => {
    const s = state({
      requirements: [{ id: 'profile', profile: 'cursor', problem: 'signin' }] as never,
      aiRunUnsupportedBy: { claude: 'sem prova' },
      connections: { gemini: { profileId: 'gemini', step: 'signIn', status: 'waiting', needs: 'api-key' } } as never,
      usageLimit: [{ profileId: 'kimi', resumeAt: Date.now() + 60_000, source: 'reset', attempts: 0, probe: null }],
    });
    expect(profileBlock(s, 'kimi')).toBe('off');
    expect(profileBlock(s, 'cursor')).toBe('signin');
    expect(profileBlock(s, 'claude')).toBe('unsupported');
    expect(profileBlock(s, 'gemini')).toBe('connection');
    expect(profileBlock(state(), 'gemini')).toBeNull();
  });
});

describe('modelos de texto', () => {
  it('voz, imagem, música e pesquisa ficam por último no teste; o auto do Cursor é texto', () => {
    expect(isTextModel('gemini-2.5-pro')).toBe(true);
    expect(isTextModel('auto')).toBe(true);
    for (const m of [
      'gemini-2.5-flash-preview-tts',
      'gemini-3-pro-image',
      'lyria-3.5',
      'gemini-3.5-transcribe',
      'deep-research-preview-04-2026',
    ])
      expect(isTextModel(m)).toBe(false);
    expect(testModels(state().board.modelCatalog as never, 'gemini').map((m) => m.model)).toEqual([
      'gemini-2.5-pro',
      'gemini-2.5-flash-preview-tts',
    ]);
  });
});

describe('limitChoice: a pergunta quando o modelo do card esgota', () => {
  const card = { id: 'c1', typeId: 't' } as Card;
  const now = new Date(2026, 9, 28, 13, 0).getTime();
  const resumeAt = new Date(2026, 9, 28, 21, 3).getTime();
  const exhausted = {
    cli: profile('gemini', { mode: 'api' }),
    model: { name: 'gemini-2.5-pro', effort: null },
    value: 'gemini:gemini-2.5-pro',
    source: 'card',
  } as unknown as RunTarget;

  it('esperar primeiro, depois um modelo de texto de cada outro agente que responde; o da regra recomendado', () => {
    const s = state();
    const cursor = {
      cli: profile('cursor'),
      model: { name: 'auto', effort: null },
      value: 'cursor:auto',
      source: 'fallback',
    } as unknown as RunTarget;
    const choice = limitChoice(s, card, exhausted, [cursor], resumeAt, now)!;
    expect(choice.options.map((o) => [o.label, o.value])).toEqual([
      ['Esperar o limite voltar (às 21:03)', null],
      ['Seguir com auto (cursor)', 'cursor:auto'],
      ['Seguir com sonnet (claude)', 'claude:sonnet'],
    ]);
    expect(choice.recommended).toBe('Seguir com auto (cursor)');
    expect(choice.question).toBe('O gemini-2.5-pro do gemini esgotou o limite de uso. Como seguir com este card?');
  });

  it('sem regra, a recomendação é esperar; o agente também no limite fica de fora; sem outro destino, não pergunta', () => {
    const held = state({
      usageLimit: [{ profileId: 'cursor', resumeAt: now + 60_000, source: 'reset', attempts: 0, probe: null }] as never,
    });
    const choice = limitChoice(held, card, exhausted, [], resumeAt, now)!;
    expect(choice.recommended).toBe(choice.options[0]!.label);
    expect(choice.options.map((o) => o.value)).toEqual([null, 'claude:sonnet']);
    const alone = state({ board: { ...state().board, aiProfiles: [profile('gemini', { mode: 'api' })] } as never });
    expect(limitChoice(alone, card, exhausted, [], resumeAt, now)).toBeNull();
    expect(limitChoice(state({ fieldDefs: [] }), card, exhausted, [], resumeAt, now)).toBeNull();
  });
});
