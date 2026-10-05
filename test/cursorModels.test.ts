// A saída de `cursor-agent models`: um exemplo pequeno com as cores ANSI e as marcas, e a lista REAL
// de uma conta (test/fixtures/cursor-models.txt, `cursor-agent` 2026.10.01, 2026-10-05).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { manifestOf } from '../src/shared/execution';
import type { FieldDef } from '../src/shared/model';
import { boardState, card } from './fakes/board';
import { cursorModelId } from '../src/extension/headless';
import {
  discoverModels,
  isFastVariant,
  forgetModels,
  modelsFor,
  onlyBuiltin,
  parseCursorModels,
  rememberModels,
} from '../src/extension/models';

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

  it('a lista real: as variantes de nível viram um modelo com os níveis dele, sem as -fast', () => {
    const real = parseCursorModels(fs.readFileSync(path.join(__dirname, 'fixtures', 'cursor-models.txt'), 'utf8'));
    const byModel = new Map(real.map((o) => [o.model, o]));
    expect(byModel.get('claude-opus-5-5')).toMatchObject({
      label: 'Claude Opus 5.5 1M',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      // "Claude Opus 5.5 1M" sem nível no nome é a variante -medium
      defaultEffort: 'medium',
    });
    // `extra-high` é um nível, não parte do nome
    expect(byModel.get('gpt-5.5')!.efforts).toContain('extra-high');
    expect(byModel.has('gpt-5.5-extra')).toBe(false);
    // modelo com variante sem sufixo: o padrão é ela (sem nível)
    expect(byModel.get('gpt-5.3-codex')).toMatchObject({ label: 'Codex 5.3', defaultEffort: null });
    // os espaços de largura zero e os duplos saem do nome
    expect(byModel.get('grok-4.7')!.label).toBe('Grok 4.7');
    // as rápidas viram modelos à parte, com os mesmos níveis da versão normal
    expect(byModel.get('claude-opus-5-5-fast')).toMatchObject({
      label: 'Claude Opus 5.5 1M Fast',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'medium',
    });
    expect(byModel.get('composer-2.5-fast')).toMatchObject({ label: 'Composer 2.5 Fast', efforts: [] });
    expect(isFastVariant(byModel.get('composer-2.5-fast')!, real)).toBe(true);
    expect(isFastVariant(byModel.get('composer-2.5')!, real)).toBe(false);
    const normal = real.filter((o) => !isFastVariant(o, real));
    expect(normal.length).toBeLessThan(60);
    expect(byModel.get('auto')).toMatchObject({ label: 'Auto', efforts: [] });
  });

  it('o "Detectar" usa a última lista lida da CLI; sem ela, a embutida', () => {
    expect(discoverModels('cursor', '/home')).toEqual([]);
    expect(modelsFor('cursor', '/home').map((o) => o.model)).toEqual(['auto', 'composer-2.5']);
    rememberModels('cursor', parseCursorModels(OUTPUT));
    expect(modelsFor('cursor', '/home').map((o) => o.model)).toContain('claude-opus-5-5');
    // uma lista vazia (CLI sem login) não apaga a que já foi lida
    rememberModels('cursor', []);
    expect(modelsFor('cursor', '/home')).toHaveLength(4);
  });

  it('sabe quando o catálogo ainda é só a lista embutida', () => {
    const builtin = modelsFor('cursor', '');
    expect(onlyBuiltin('cursor', builtin)).toBe(true);
    // o catálogo de quem vem da versão anterior ainda tem o modelo que saiu da lista embutida
    expect(onlyBuiltin('cursor', [...builtin, { ...builtin[0]!, id: 'cursor:grok-4.7', model: 'grok-4.7', label: 'Grok 4.7' }])).toBe(true);
    expect(onlyBuiltin('cursor', [...builtin, ...parseCursorModels(OUTPUT)])).toBe(false);
  });
});

describe('nível do modelo do Cursor na execução', () => {
  it('sem nível escolhido no card, vai o padrão do modelo: no Cursor o nível é parte do id', () => {
    const real = parseCursorModels(fs.readFileSync(path.join(__dirname, 'fixtures', 'cursor-models.txt'), 'utf8'));
    const field: FieldDef = {
      id: 'm',
      boardId: 'b',
      name: 'Modelo',
      kind: 'model',
      options: [],
      appliesToTypes: null,
      display: 'hidden',
      position: 0,
    };
    const base = boardState();
    const state = (tool: 'cursor' | 'claude', value: string) =>
      boardState({
        board: {
          ...base.board,
          aiTool: tool,
          modelCatalog: [
            ...real,
            { id: 'claude:opus', tool: 'claude', model: 'opus', label: 'Opus', efforts: ['low', 'high'], defaultEffort: 'high' },
          ],
        },
        cards: [card('c')],
        fieldDefs: [field],
        fieldValues: [{ cardId: 'c', fieldId: 'm', value }],
      });
    expect(manifestOf(state('cursor', 'cursor:claude-opus-5-5'), card('c')).model).toEqual({ name: 'claude-opus-5-5', effort: 'medium' });
    expect(manifestOf(state('cursor', 'cursor:claude-opus-5-5@max'), card('c')).model).toEqual({ name: 'claude-opus-5-5', effort: 'max' });
    // nas outras ferramentas, sem nível escolhido, a ferramenta decide
    expect(manifestOf(state('claude', 'claude:opus'), card('c')).model).toEqual({ name: 'opus', effort: null });
  });
});

describe('id do modelo do Cursor no comando', () => {
  it('o nível vem como sufixo, e na versão rápida antes do -fast', () => {
    expect(cursorModelId('claude-opus-5-5', 'high')).toBe('claude-opus-5-5-high');
    expect(cursorModelId('claude-opus-5-5-fast', 'high')).toBe('claude-opus-5-5-high-fast');
    expect(cursorModelId('composer-2.5-fast', null)).toBe('composer-2.5-fast');
    expect(cursorModelId('auto', null)).toBe('auto');
  });

  it('todo id montado a partir do catálogo existe na lista real', () => {
    const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'cursor-models.txt'), 'utf8');
    const ids = new Set([...text.matchAll(/^(\S+) - /gm)].map((m) => m[1]));
    for (const o of parseCursorModels(text))
      for (const effort of o.efforts.length ? [...o.efforts, ...(o.defaultEffort === null ? [null] : [])] : [null])
        expect(ids, `${o.model} ${effort}`).toContain(cursorModelId(o.model, effort));
  });
});
