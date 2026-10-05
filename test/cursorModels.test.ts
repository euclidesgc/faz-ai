// A saída de `cursor-agent models` montada como a CLI 2026.10.01 a formata: título, uma linha por
// modelo (`id - Nome (current, default)`) com cores ANSI, e a dica no fim. Não há saída real
// capturada porque a listagem exige login na conta do Cursor.
import { afterEach, describe, expect, it } from 'vitest';
import { discoverModels, forgetModels, modelsFor, onlyBuiltin, parseCursorModels, rememberModels } from '../src/extension/models';

const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const OUTPUT = [
  dim('Available models'),
  '',
  `${cyan('auto')} ${dim('- Auto')}`,
  `\x1b[32mcomposer-2.5\x1b[39m ${dim('- Composer 2.5')}${dim(' (current, default)')}`,
  `${cyan('claude-opus-5-5')} ${dim('- Claude Opus 5.5')}`,
  `${cyan('gpt-6.1-sol')}`,
  '',
  dim(`Tip: use ${cyan('--model <id>')} (or ${cyan('/model <id>')} in interactive mode) to switch.`),
].join('\n');

afterEach(() => forgetModels('cursor'));

describe('modelos do Cursor', () => {
  it('lê id e nome de cada linha, sem as cores, as marcas e a dica', () => {
    expect(parseCursorModels(OUTPUT).map((o) => [o.id, o.label])).toEqual([
      ['cursor:auto', 'Auto'],
      ['cursor:composer-2.5', 'Composer 2.5'],
      ['cursor:claude-opus-5-5', 'Claude Opus 5.5'],
      ['cursor:gpt-6.1-sol', 'gpt-6.1-sol'],
    ]);
    expect(parseCursorModels('Not logged in')).toEqual([]);
  });

  it('o "Detectar" usa a última lista lida da CLI; sem ela, a embutida', () => {
    expect(discoverModels('cursor', '/home')).toEqual([]);
    expect(modelsFor('cursor', '/home').map((o) => o.model)).toEqual(['auto', 'composer-2.5', 'composer-2.5-fast']);
    rememberModels('cursor', parseCursorModels(OUTPUT));
    expect(modelsFor('cursor', '/home').map((o) => o.model)).toContain('claude-opus-5-5');
    // uma lista vazia (CLI sem login) não apaga a que já foi lida
    rememberModels('cursor', []);
    expect(modelsFor('cursor', '/home')).toHaveLength(4);
  });

  it('sabe quando o catálogo ainda é só a lista embutida', () => {
    const builtin = modelsFor('cursor', '');
    expect(onlyBuiltin('cursor', builtin)).toBe(true);
    expect(onlyBuiltin('cursor', [...builtin, ...parseCursorModels(OUTPUT)])).toBe(false);
  });
});
