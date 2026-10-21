import { baseInfo, parseAiTool } from '../src/shared/harness';
import { expect, it } from 'vitest';
import {
  activeProfile,
  BUILTIN_PROFILES,
  catalogTool,
  expandArgLines,
  newProfileId,
  resolveModelOption,
  toolInfo,
  validateProfile,
  type AiProfile,
} from '../src/shared/aiProfiles';
import { catalog } from './fixtures/executionPolicy';
const custom: AiProfile = {
  id: 'local',
  name: 'Local',
  kind: 'custom',
  base: 'generic',
  enabled: true,
  position: 3,
  config: { command: 'local-cli' },
};
it('expande argumentos sem dividir valores e remove a linha inteira quando falta marcador', () => {
  expect(
    expandArgLines(['--model {model}', '--effort {effort}', '--prompt {prompt}', '--add-dir {addDir}', '--model={model}'], {
      model: 'um modelo',
      prompt: 'pedido com espaços\ne quebra',
      addDir: ['/pasta um', '/pasta dois'],
    }),
  ).toEqual([
    '--model',
    'um modelo',
    '--prompt',
    'pedido com espaços\ne quebra',
    '--add-dir',
    '/pasta um',
    '--add-dir',
    '/pasta dois',
    '--model=um modelo',
  ]);
  expect(expandArgLines(['--add-dir {addDir}'], { addDir: [] })).toEqual([]);
  expect(expandArgLines(['--add-dir {addDir}'], { addDir: ['/única'] })).toEqual(['--add-dir', '/única']);
  expect(expandArgLines(['--model {model}'], { model: '' })).toEqual([]);
});
it('gera identificadores limitados, sem reservados, colisões ou delimitadores de modelo', () => {
  expect(newProfileId('', [])).toBe('perfil');
  expect(newProfileId('Claude', [])).toBe('claude-2');
  expect(newProfileId('Claude', ['claude-2'])).toBe('claude-3');
  const name = 'Á @: '.repeat(50),
    first = newProfileId(name, []),
    next = newProfileId(name, [first]);
  expect(next).toMatch(/^[a-z0-9-]{1,32}$/);
  expect(next).not.toBe(first);
});
it('valida configuração sem presumir permissões e devolve metadados neutros', () => {
  expect(validateProfile(custom)).toEqual([]);
  expect(validateProfile({ ...custom, config: { boardServer: 'project' } })).toHaveLength(2);
  expect(validateProfile({ ...custom, config: { command: 'cli', permissionArgs: { board: ['--readonly'] } } })).toEqual([]);
  expect(toolInfo(custom)).toMatchObject({ id: 'local', label: 'Local', skills: '', rules: '' });
});
it('resolve catálogo do base da cópia, modelo livre só no personalizado e fallback legado', () => {
  const copy: AiProfile = { ...custom, id: 'copy', kind: 'copy', base: 'claude' };
  const board = { aiTool: 'copy', aiProfiles: [...BUILTIN_PROFILES, copy, custom], modelCatalog: catalog };
  expect(catalogTool(copy)).toBe('claude');
  expect(resolveModelOption(board, 'claude:opus@high')).toMatchObject({ name: 'opus', effort: 'high' });
  expect(resolveModelOption(board, 'claude:opus@impossivel')).toBeNull();
  expect(resolveModelOption({ ...board, aiTool: 'local' }, 'local:novo-modelo')).toEqual({
    option: null,
    name: 'novo-modelo',
    effort: null,
  });
  expect(resolveModelOption({ ...board, aiTool: 'local' }, 'local:novo-modelo@esforço inválido')).toBeNull();
  expect(resolveModelOption(board, 'copy:novo-modelo')).toBeNull();
  expect(activeProfile({ ...board, aiTool: 'ausente' }).id).toBe('claude');
  expect(activeProfile({ ...board, aiProfiles: [...BUILTIN_PROFILES, { ...copy, enabled: false }] }).id).toBe('claude');
});

it('identidade do perfil é aberta e metadados de cópia preservam nome e identidade', () => {
  expect(parseAiTool('["claude-trabalho"]', ['claude-trabalho'])).toBe('claude-trabalho');
  expect(parseAiTool('["ausente"]', ['claude-trabalho'])).toBe('claude');
  expect(baseInfo('personalizado')).toMatchObject({ id: 'personalizado', rules: '', skills: '' });
  expect(toolInfo({ ...custom, id: 'minha-copia', name: 'Minha cópia', kind: 'copy', base: 'claude' })).toMatchObject({
    id: 'minha-copia',
    label: 'Minha cópia',
    skills: '.claude/skills',
  });
});
