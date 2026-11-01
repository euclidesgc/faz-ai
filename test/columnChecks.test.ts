import { describe, expect, it } from 'vitest';
import {
  CHECK_TIMEOUT_DEFAULT,
  CHECK_TIMEOUT_MAX,
  CHECK_TIMEOUT_MIN,
  clampCheckTimeout,
  columnChecksError,
  parseColumnChecks,
} from '../src/shared/columnChecks';

describe('clampCheckTimeout', () => {
  it('mantém o que está no intervalo, ajusta os extremos e arredonda', () => {
    expect(clampCheckTimeout(90)).toBe(90);
    expect(clampCheckTimeout(0)).toBe(CHECK_TIMEOUT_MIN);
    expect(clampCheckTimeout(-5)).toBe(CHECK_TIMEOUT_MIN);
    expect(clampCheckTimeout(99999)).toBe(CHECK_TIMEOUT_MAX);
    expect(clampCheckTimeout(10.6)).toBe(11);
  });

  it('o que não é número volta ao padrão', () => {
    expect(clampCheckTimeout('abc')).toBe(CHECK_TIMEOUT_DEFAULT);
    expect(clampCheckTimeout(undefined)).toBe(CHECK_TIMEOUT_DEFAULT);
    expect(clampCheckTimeout(NaN)).toBe(CHECK_TIMEOUT_DEFAULT);
  });
});

describe('parseColumnChecks (leitura tolerante)', () => {
  it('JSON inválido, vazio ou que não é lista vira lista vazia', () => {
    expect(parseColumnChecks('{ruim')).toEqual([]);
    expect(parseColumnChecks('')).toEqual([]);
    expect(parseColumnChecks('{"name":"x"}')).toEqual([]);
    expect(parseColumnChecks(null)).toEqual([]);
    expect(parseColumnChecks(42)).toEqual([]);
  });

  it('descarta item sem nome ou comando, apara os textos e ajusta o tempo', () => {
    const raw = JSON.stringify([
      { name: ' Tipos ', command: ' npm run typecheck ', timeoutSec: 30 },
      { name: '', command: 'x', timeoutSec: 30 },
      { name: 'Sem comando', command: '   ', timeoutSec: 30 },
      null,
      'texto',
      { name: 'Lento', command: 'sleep 1', timeoutSec: 99999 },
      { name: 'Sem tempo', command: 'ls' },
    ]);
    expect(parseColumnChecks(raw)).toEqual([
      { name: 'Tipos', command: 'npm run typecheck', timeoutSec: 30 },
      { name: 'Lento', command: 'sleep 1', timeoutSec: CHECK_TIMEOUT_MAX },
      { name: 'Sem tempo', command: 'ls', timeoutSec: CHECK_TIMEOUT_DEFAULT },
    ]);
  });

  it('aceita a lista já pronta (sem texto JSON)', () => {
    expect(parseColumnChecks([{ name: 'a', command: 'b', timeoutSec: 5 }])).toEqual([{ name: 'a', command: 'b', timeoutSec: 5 }]);
  });
});

describe('columnChecksError (gravação estrita)', () => {
  const ok = { name: 'Tipos', command: 'npm run typecheck', timeoutSec: 600 };

  it('lista válida e lista vazia não têm erro', () => {
    expect(columnChecksError([ok])).toBeNull();
    expect(columnChecksError([])).toBeNull();
  });

  it('recusa nome, comando e tempo inválidos com o motivo', () => {
    expect(columnChecksError([{ ...ok, name: '  ' }])).toBe('Informe o nome da checagem.');
    expect(columnChecksError([{ ...ok, command: '' }])).toBe('Informe o comando da checagem.');
    expect(columnChecksError([{ ...ok, timeoutSec: 0 }])).toBe('O tempo limite vai de 1 a 3600 segundos.');
    expect(columnChecksError([{ ...ok, timeoutSec: 3601 }])).toBe('O tempo limite vai de 1 a 3600 segundos.');
    expect(columnChecksError([{ ...ok, timeoutSec: 1.5 }])).toBe('O tempo limite vai de 1 a 3600 segundos.');
  });
});
