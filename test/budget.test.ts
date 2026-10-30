import { describe, expect, it } from 'vitest';
import {
  budgetCardKey,
  budgetLevel,
  budgetNote,
  budgetStateKey,
  ceilingOf,
  DEFAULT_BUDGET,
  parseBudget,
  parseBudgetState,
  parseCardCeiling,
  planDowngrade,
  type DowngradeInput,
} from '../src/shared/budget';

const on = { ...DEFAULT_BUDGET, enabled: true };

describe('parseBudget', () => {
  it('ausente, lixo e formato errado viram o padrão desligado', () => {
    for (const x of [null, undefined, '', 'lixo', '[1]', '3']) expect(parseBudget(x)).toEqual(DEFAULT_BUDGET);
    expect(DEFAULT_BUDGET.enabled).toBe(false);
  });
  it('lê uma configuração válida', () => {
    const cfg = { enabled: true, byEffort: { Baixo: 1, Médio: 2, Alto: 3 }, warnAt: 60, policy: 'stop' };
    expect(parseBudget(JSON.stringify(cfg))).toEqual(cfg);
  });
  it('campo inválido volta ao padrão, sem perder os válidos', () => {
    const r = parseBudget(JSON.stringify({ enabled: true, byEffort: { Baixo: -1, Médio: 'x', Alto: 9 }, warnAt: 99, policy: 'x' }));
    expect(r).toEqual({ enabled: true, byEffort: { ...DEFAULT_BUDGET.byEffort, Alto: 9 }, warnAt: 80, policy: 'finish' });
    expect(parseBudget('{"warnAt":49}').warnAt).toBe(80);
    expect(parseBudget('{"warnAt":50}').warnAt).toBe(50);
    expect(parseBudget('{"warnAt":95}').warnAt).toBe(95);
  });
});

describe('chaves e teto do card', () => {
  it('monta as chaves do meta', () => {
    expect(budgetCardKey('7')).toBe('budget_card:7');
    expect(budgetStateKey('9')).toBe('budget_state:9');
  });
  it('parseCardCeiling', () => {
    expect(parseCardCeiling('12000000')).toBe(12_000_000);
    expect(parseCardCeiling('off')).toBe('off');
    for (const x of [null, undefined, '', '0', '-5', '1.5', 'abc']) expect(parseCardCeiling(x)).toBeNull();
  });
});

describe('ceilingOf', () => {
  it('desligado não tem teto', () => {
    expect(ceilingOf(DEFAULT_BUDGET, 5, 'Alto')).toBeNull();
  });
  it('usa o padrão do esforço, e Médio sem esforço reconhecido', () => {
    expect(ceilingOf(on, null, 'Baixo')).toBe(5_000_000);
    expect(ceilingOf(on, null, 'Alto')).toBe(60_000_000);
    expect(ceilingOf(on, null, null)).toBe(20_000_000);
    expect(ceilingOf(on, null, 'Gigante')).toBe(20_000_000);
  });
  it('o card sobrepõe, e off tira o teto', () => {
    expect(ceilingOf(on, 123, 'Alto')).toBe(123);
    expect(ceilingOf(on, 'off', 'Alto')).toBeNull();
  });
});

describe('budgetLevel', () => {
  it('limites 79/80/99/100 com teto 100 e aviso 80', () => {
    expect(budgetLevel(79, 100, 80)).toBe('ok');
    expect(budgetLevel(80, 100, 80)).toBe('warn');
    expect(budgetLevel(99, 100, 80)).toBe('warn');
    expect(budgetLevel(100, 100, 80)).toBe('exceeded');
    expect(budgetLevel(500, 100, 80)).toBe('exceeded');
    expect(budgetLevel(0, 100, 80)).toBe('ok');
  });
  it('respeita o aviso configurado', () => {
    expect(budgetLevel(49, 100, 50)).toBe('ok');
    expect(budgetLevel(50, 100, 50)).toBe('warn');
    expect(budgetLevel(94, 100, 95)).toBe('ok');
  });
});

describe('parseBudgetState', () => {
  it('lê o estado e rejeita o inválido', () => {
    expect(parseBudgetState('{"ceiling":10,"warned":true}')).toEqual({ ceiling: 10, warned: true, stopped: false });
    for (const x of [null, '', 'lixo', '{}', '{"ceiling":0}', 'null']) expect(parseBudgetState(x)).toBeNull();
  });
});

describe('planDowngrade', () => {
  const base: DowngradeInput = { id: 'a', model: 'claude:opus@high', handPicked: false, escalated: false, review: false, started: false };
  const prev = (m: string) => (m === 'claude:opus@high' ? 'claude:sonnet@medium' : null);
  const run = (over: Partial<DowngradeInput>) => planDowngrade([{ ...base, ...over }], prev);

  it('desce um nível de quem pode', () => {
    expect(run({})).toEqual({ change: [{ id: 'a', from: 'claude:opus@high', to: 'claude:sonnet@medium' }], kept: [] });
  });
  it.each([
    ['handPicked', 'modelo escolhido à mão'],
    ['escalated', 'modelo subido por checagem'],
    ['review', 'Revisão'],
    ['started', 'já executado'],
  ] as const)('exclui %s', (k, reason) => {
    expect(run({ [k]: true })).toEqual({ change: [], kept: [{ id: 'a', reason }] });
  });
  it('sem modelo e no primeiro degrau ficam', () => {
    expect(run({ model: null }).kept).toEqual([{ id: 'a', reason: 'sem modelo' }]);
    expect(run({ model: 'claude:haiku' })).toEqual({ change: [], kept: [{ id: 'a', reason: 'já no nível mais baixo' }] });
  });
  it('mistura e resultado vazio', () => {
    const r = planDowngrade([base, { ...base, id: 'b', handPicked: true }], prev);
    expect(r.change.map((c) => c.id)).toEqual(['a']);
    expect(r.kept.map((c) => c.id)).toEqual(['b']);
    expect(planDowngrade([], prev)).toEqual({ change: [], kept: [] });
  });
});

describe('budgetNote', () => {
  it('monta os textos em português', () => {
    expect(budgetNote.warn(80, 100, budgetNote.actionFinish)).toBe(
      '**Teto de consumo**: a história gastou 80% do teto (80 de 100 tokens). A execução em curso termina e a história passou para você.',
    );
    expect(budgetNote.warn(80, 100, budgetNote.actionStop, 2)).toContain('2 execução(ões) sem consumo medido');
    expect(budgetNote.actionDowngrade(['#1'], [{ id: '#2', reason: 'Revisão' }])).toBe('Desci o modelo de: #1. Ficaram: #2 (Revisão).');
    expect(budgetNote.stopped(100, 100)).toContain('O board não inicia mais execuções sozinho');
  });
});
