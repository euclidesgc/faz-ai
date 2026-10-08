import { afterEach, describe, expect, it } from 'vitest';
import type { AiActivity } from '../../src/shared/model';
import { DEFAULT_RUNNER } from '../../src/shared/runner';
import { setLocale } from '../../src/webview/i18n';
import { activityMessage, elapsedLabel } from '../../src/webview/activity';
import { boardState, card, sub } from '../fakes/board';

// card 337: a mensagem calculada da barra de status (sem React). SPEC da #239, "Estratégia de testes", item 2.

afterEach(() => setLocale('pt-BR'));

const NOW = 1_700_000_000_000;

const activity = (over: Partial<AiActivity> = {}): AiActivity => ({
  cardId: 'c1',
  runId: 'r1',
  mode: 'phase',
  origin: 'manual',
  phase: 'Discovery',
  model: null,
  startedAt: NOW,
  ...over,
});

describe('activityMessage: sem execução', () => {
  it('mostra a nota do autopiloto quando há uma', () => {
    const state = boardState({ autopilot: { active: true, note: 'Esperando aprovação em #12.' } });
    expect(activityMessage(state, { offline: false, now: NOW })).toEqual({ kind: 'idle', text: 'Esperando aprovação em #12.' });
  });

  it('nota do autopiloto em inglês passa por t()', () => {
    setLocale('en');
    const state = boardState({ autopilot: { active: true, note: 'Esperando aprovação em #12.' } });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg).toEqual({ kind: 'idle', text: 'Esperando aprovação em #12.' });
  });

  it('heartbeat desligado', () => {
    const state = boardState({ board: { ...boardState().board, runner: { ...DEFAULT_RUNNER, heartbeat: false } } });
    expect(activityMessage(state, { offline: false, now: NOW })).toEqual({ kind: 'idle', text: 'Heartbeat desligado' });
  });

  it('heartbeat desligado, em inglês', () => {
    setLocale('en');
    const state = boardState({ board: { ...boardState().board, runner: { ...DEFAULT_RUNNER, heartbeat: false } } });
    expect(activityMessage(state, { offline: false, now: NOW })).toEqual({ kind: 'idle', text: 'Heartbeat off' });
  });

  it('heartbeat parado (sem ligação) mostra o motivo', () => {
    const state = boardState({ board: { ...boardState().board, runner: { ...DEFAULT_RUNNER, heartbeat: true } } });
    expect(activityMessage(state, { offline: true, now: NOW })).toEqual({
      kind: 'idle',
      text: 'Heartbeat parado: Sem ligação com o Faz AI.',
    });
  });

  it('heartbeat parado, em inglês', () => {
    setLocale('en');
    const state = boardState({ board: { ...boardState().board, runner: { ...DEFAULT_RUNNER, heartbeat: true } } });
    expect(activityMessage(state, { offline: true, now: NOW })).toEqual({
      kind: 'idle',
      text: 'Heartbeat stopped: No connection to Faz AI.',
    });
  });

  it('heartbeat batendo com a próxima rodada agendada', () => {
    const nextRoundAt = new Date(NOW);
    nextRoundAt.setHours(14, 30, 0, 0);
    const state = boardState({
      board: { ...boardState().board, runner: { ...DEFAULT_RUNNER, heartbeat: true } },
      heartbeatNextAt: nextRoundAt.getTime(),
    });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg).toEqual({ kind: 'idle', text: 'Próxima rodada às 14:30' });
  });

  it('heartbeat batendo sem heartbeatNextAt ainda publicado: IA parada', () => {
    const state = boardState({ board: { ...boardState().board, runner: { ...DEFAULT_RUNNER, heartbeat: true } }, heartbeatNextAt: null });
    expect(activityMessage(state, { offline: false, now: NOW })).toEqual({ kind: 'idle', text: 'IA parada' });
  });

  it('heartbeat batendo sem heartbeatNextAt, em inglês', () => {
    setLocale('en');
    const state = boardState({ board: { ...boardState().board, runner: { ...DEFAULT_RUNNER, heartbeat: true } }, heartbeatNextAt: null });
    expect(activityMessage(state, { offline: false, now: NOW })).toEqual({ kind: 'idle', text: 'AI idle' });
  });
});

describe('activityMessage: uma execução', () => {
  const baseState = (over: Partial<AiActivity>) =>
    boardState({
      cards: [card('c1', { number: 12, title: 'Discovery do board' })],
      aiActivity: [activity(over)],
    });

  it('fase: "agora"', () => {
    const state = baseState({ mode: 'phase', phase: 'Discovery', origin: 'manual', startedAt: NOW });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg).toEqual({
      kind: 'running',
      count: 1,
      items: [{ cardId: 'c1', ref: '#12', what: 'Discovery', since: 'agora', storyRef: null }],
      title: '#12 Discovery do board · manual',
    });
  });

  it('refinando, "há 3 min"', () => {
    const state = baseState({ mode: 'refine', origin: 'heartbeat', startedAt: NOW - 3 * 60_000 });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg).toEqual({
      kind: 'running',
      count: 1,
      items: [{ cardId: 'c1', ref: '#12', what: 'refinando', since: 'há 3 min', storyRef: null }],
      title: '#12 Discovery do board · heartbeat',
    });
  });

  it('resumindo, "há 2 h"', () => {
    const state = baseState({ mode: 'summarize', origin: 'autopilot', startedAt: NOW - 2 * 60 * 60_000 });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg).toEqual({
      kind: 'running',
      count: 1,
      items: [{ cardId: 'c1', ref: '#12', what: 'resumindo', since: 'há 2 h', storyRef: null }],
      title: '#12 Discovery do board · modo autônomo',
    });
  });

  it('em inglês: what e since traduzidos', () => {
    setLocale('en');
    const state = baseState({ mode: 'refine', origin: 'manual', startedAt: NOW - 3 * 60_000 });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg).toEqual({
      kind: 'running',
      count: 1,
      items: [{ cardId: 'c1', ref: '#12', what: 'refining', since: '3 min ago', storyRef: null }],
      title: '#12 Discovery do board · manual',
    });
  });

  it('sub-tarefa: ref da sub-tarefa e storyRef da história', () => {
    const state = boardState({
      cards: [
        card('p1', { number: 5, title: 'História', workflowId: 'wp' }),
        sub('c1', 'p1', 'todo', { number: 12, title: 'Sub-tarefa' }),
      ],
      aiActivity: [activity({ cardId: 'c1', origin: 'manual' })],
    });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg).toEqual({
      kind: 'running',
      count: 1,
      items: [{ cardId: 'c1', ref: '#12', what: 'Discovery', since: 'agora', storyRef: '#5' }],
      title: '#12 Sub-tarefa · manual · história #5',
    });
  });
});

describe('activityMessage: várias execuções', () => {
  it('conta, ordem preservada e title com todos os itens', () => {
    const state = boardState({
      cards: [
        card('c1', { number: 12, title: 'Discovery do board' }),
        card('c2', { number: 15, title: 'Refino' }),
        card('c3', { number: 20, title: 'Implementação' }),
      ],
      aiActivity: [
        activity({ cardId: 'c1', mode: 'phase', phase: 'Discovery', startedAt: NOW - 3 * 60_000 }),
        activity({ cardId: 'c2', mode: 'refine', startedAt: NOW - 60_000 }),
        activity({ cardId: 'c3', mode: 'phase', phase: 'Implementação', startedAt: NOW }),
      ],
    });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg.kind).toBe('running');
    if (msg.kind !== 'running') throw new Error('unreachable');
    expect(msg.count).toBe(3);
    expect(msg.items.map((i) => i.ref)).toEqual(['#12', '#15', '#20']);
    expect(msg.title).toBe(
      '#12 Discovery, há 3 min — Discovery do board\n#15 refinando, há 1 min — Refino\n#20 Implementação, agora — Implementação',
    );
  });

  it('card apagado/arquivado some da lista e do count', () => {
    const state = boardState({
      cards: [card('c1', { number: 12, title: 'Discovery do board' })],
      aiActivity: [activity({ cardId: 'c1' }), activity({ cardId: 'desaparecido' })],
    });
    const msg = activityMessage(state, { offline: false, now: NOW });
    expect(msg).toEqual({
      kind: 'running',
      count: 1,
      items: [{ cardId: 'c1', ref: '#12', what: 'Discovery', since: 'agora', storyRef: null }],
      title: '#12 Discovery do board · manual',
    });
  });
});

describe('elapsedLabel', () => {
  it('agora / minutos / horas', () => {
    expect(elapsedLabel(NOW, NOW)).toBe('agora');
    expect(elapsedLabel(NOW - 59_000, NOW)).toBe('agora');
    expect(elapsedLabel(NOW - 60_000, NOW)).toBe('há 1 min');
    expect(elapsedLabel(NOW - 2 * 60 * 60_000, NOW)).toBe('há 2 h');
  });
});
