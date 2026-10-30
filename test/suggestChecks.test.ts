import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type ProjectProfile } from '../src/shared/projectProfile';
import { mergeSuggestions, suggestChecks, suggestedCheckName } from '../src/shared/suggestChecks';

const profile = (scripts: Record<string, string>, tools: string[] = []): ProjectProfile => ({ ...EMPTY_PROFILE, scripts, tools });

describe('suggestChecks', () => {
  it('sugere tipos, lint e testes, nesta ordem', () => {
    expect(suggestChecks(profile({ test: 'x', lint: 'x', typecheck: 'x' }))).toEqual(['npm run typecheck', 'npm run lint', 'npm run test']);
  });

  it('com Vitest, acrescenta os testes dos arquivos alterados depois do lint e antes da suíte', () => {
    expect(suggestChecks(profile({ typecheck: 'x', lint: 'x', test: 'x' }, ['vitest']))).toEqual([
      'npm run typecheck',
      'npm run lint',
      'npx vitest related {changed_files} --run',
      'npm run test',
    ]);
  });

  it('sem Vitest não sugere o comando related', () => {
    expect(suggestChecks(profile({ test: 'jest' }, ['jest']))).toEqual(['npm run test']);
  });

  it('usa o primeiro nome de tipos que existir', () => {
    expect(suggestChecks(profile({ tsc: 'x', 'type-check': 'x' }))).toEqual(['npm run type-check']);
    expect(suggestChecks(profile({ tsc: 'x' }))).toEqual(['npm run tsc']);
  });

  it('ignora scripts desconhecidos e devolve vazio para o perfil vazio', () => {
    expect(suggestChecks(profile({ build: 'x', start: 'x' }))).toEqual([]);
    expect(suggestChecks(EMPTY_PROFILE)).toEqual([]);
  });
});

describe('mergeSuggestions', () => {
  it('mantém a ordem atual e acrescenta só os ausentes, comparando sem espaços nas pontas', () => {
    expect(mergeSuggestions(['  npm run lint '], ['npm run typecheck', 'npm run lint', 'npm run test'])).toEqual([
      '  npm run lint ',
      'npm run typecheck',
      'npm run test',
    ]);
  });

  it('não duplica repetidos dentro da própria sugestão', () => {
    expect(mergeSuggestions([], ['a', 'a ', 'b'])).toEqual(['a', 'b']);
  });
});

describe('suggestedCheckName', () => {
  it('dá um nome curto a cada comando sugerido', () => {
    expect(suggestedCheckName('npm run typecheck')).toBe('Tipos');
    expect(suggestedCheckName('npm run lint')).toBe('Lint');
    expect(suggestedCheckName('npx vitest related {changed_files} --run')).toBe('Testes alterados');
    expect(suggestedCheckName('npm run test')).toBe('Testes');
  });
});
