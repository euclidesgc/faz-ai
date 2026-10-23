import { baseInfo, parseAiTool } from '../src/shared/harness';
import { expect, it } from 'vitest';
import {
  activeProfile,
  BUILTIN_ISOLATION,
  BUILTIN_PROFILES,
  contextEnforced,
  isolationSummary,
  leakLabel,
  profileIsolation,
  catalogTool,
  isCatalogCopy,
  isReadyAcp,
  isReadyCli,
  isReadyProfile,
  modeLabel,
  normalizeProfileKind,
  toolLabel,
  expandArgLines,
  newProfileId,
  resolveModelOption,
  toolInfo,
  validateProfile,
  type AiProfile,
} from '../src/shared/aiProfiles';
import { enforcementOf } from '../src/shared/execution';
import { catalog } from './fixtures/executionPolicy';
const custom: AiProfile = {
  id: 'local',
  name: 'Local',
  kind: 'custom',
  tool: 'local',
  mode: 'cli',
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
  // os ids dos agentes ACP prontos também são do catálogo
  expect(newProfileId('gemini', [])).toBe('gemini-2');
  const name = 'Á @: '.repeat(50),
    first = newProfileId(name, []),
    next = newProfileId(name, [first]);
  expect(next).toMatch(/^[a-z0-9-]{1,32}$/);
  expect(next).not.toBe(first);
});
it('valida configuração sem presumir permissões e devolve metadados neutros', () => {
  expect(validateProfile(custom)).toEqual([]);
  // o agente ACP pronto é generic com o agente do catálogo; sem o agente, ou com base de CLI, é inválido
  const acp = { ...custom, id: 'gemini', kind: 'catalog' as const, tool: 'gemini', mode: 'acp' as const, config: { acpAgent: 'gemini' } };
  expect(validateProfile(acp)).toEqual([]);
  expect(validateProfile({ ...acp, config: {} })).toEqual(['Agente ACP inválido.']);
  expect(validateProfile({ ...acp, base: 'claude' })).toContain('Tipo ou base do perfil inválido.');
  expect(validateProfile({ ...custom, config: { boardServer: 'project' } })).toHaveLength(2);
  expect(validateProfile({ ...custom, config: { command: 'cli', permissionArgs: { board: ['--readonly'] } } })).toEqual([]);
  // com agente ACP o comando é o do catálogo; o id tem o formato do registro do ACP
  expect(validateProfile({ ...custom, config: { acpAgent: 'gemini' } })).toEqual([]);
  expect(validateProfile({ ...custom, config: { acpAgent: 'Gemini CLI' } })).toEqual(['Agente ACP inválido.']);
  expect(validateProfile({ ...custom, config: {} })).toEqual(['Informe o comando do perfil personalizado.']);
  expect(toolInfo(custom)).toMatchObject({ id: 'local', label: 'Local', skills: '', rules: '' });
});
it('resolve catálogo do base da cópia, modelo livre só no personalizado e fallback legado', () => {
  const copy: AiProfile = { ...custom, id: 'copy', kind: 'catalog', tool: 'claude', mode: 'cli', base: 'claude' };
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
  expect(toolInfo({ ...custom, id: 'minha-copia', name: 'Minha cópia', kind: 'catalog', tool: 'claude', base: 'claude' })).toMatchObject({
    id: 'minha-copia',
    label: 'Minha cópia',
    skills: '.claude/skills',
  });
});

const builtin = (id: 'claude' | 'cursor' | 'kimi') => BUILTIN_PROFILES.find((p) => p.id === id)!;
const verified = { conversation: 'verified', artifacts: 'verified' } as const;
it('isolamento dos prontos vem do código, com data e versão conferidas', () => {
  expect(profileIsolation(builtin('claude'))).toMatchObject({
    args: ['--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config'],
    loads: [],
    checked: { date: '2026-10-16', version: 'Claude Code 2.1.296' },
  });
  expect(profileIsolation(builtin('cursor')).loads).toHaveLength(9);
  expect(profileIsolation(builtin('kimi')).loads).toContainEqual({ kind: 'hook', scope: 'user' });
  expect(profileIsolation(builtin('kimi')).loads).not.toContainEqual({ kind: 'hook', scope: 'project' });
  for (const base of ['claude', 'cursor', 'kimi'] as const) expect(BUILTIN_ISOLATION[base].checked?.sources.length).toBeGreaterThan(0);
});
it('cópia herda a lista do base e usa a própria quando gravada; personalizado novo é vazio', () => {
  const copy: AiProfile = {
    id: 'c',
    name: 'C',
    kind: 'catalog',
    tool: 'cursor',
    mode: 'cli',
    base: 'cursor',
    enabled: true,
    position: 4,
    config: {},
  };
  expect(profileIsolation(copy).loads).toEqual(BUILTIN_ISOLATION.cursor.loads);
  const own = { ...copy, config: { isolation: { loads: [{ kind: 'mcp', scope: 'user' }] } } } as AiProfile;
  expect(profileIsolation(own).loads).toEqual([{ kind: 'mcp', scope: 'user' }]);
  expect(profileIsolation(custom)).toEqual({ args: [], loads: [] });
});
it('item desconhecido é contado e nunca vira contexto imposto por descarte', () => {
  const p = {
    ...custom,
    capabilities: verified,
    config: {
      isolation: {
        loads: [
          { kind: 'plugin', scope: 'user' },
          { kind: 'mcp', scope: 'user' },
        ],
      },
    },
  } as AiProfile;
  const iso = profileIsolation(p);
  expect(iso.loads).toEqual([{ kind: 'mcp', scope: 'user' }]);
  expect(iso.unrecognized).toBe(1);
  expect(isolationSummary(iso)).toContain('itens não reconhecidos');
  expect(validateProfile({ ...p, config: p.config })).toContain('Isolamento do perfil inválido.');
  expect(contextEnforced({ ...custom, capabilities: verified, config: { isolation: { loads: 'x' } } as never })).toBe(false);
});
it('lista vazia e configuração manual não provam contexto vazio: só capacidades verificadas', () => {
  expect(contextEnforced(builtin('claude'))).toBe(false);
  expect(enforcementOf(builtin('claude')).context).toBe('advised');
  expect(enforcementOf(builtin('claude'))).toMatchObject({ agent: 'enforced', mcp: 'enforced', model: 'enforced' });
  expect(contextEnforced({ ...custom, config: { isolation: { loads: [] } } })).toBe(false);
  expect(contextEnforced({ ...custom, capabilities: { conversation: 'verified', artifacts: 'partial' } })).toBe(false);
  expect(contextEnforced({ ...builtin('claude'), capabilities: verified })).toBe(true);
  expect(enforcementOf({ ...builtin('claude'), capabilities: verified }).context).toBe('enforced');
  expect(contextEnforced({ ...builtin('cursor'), capabilities: verified })).toBe(false);
  expect(enforcementOf(custom)).toEqual({
    agent: 'advised',
    skills: 'advised',
    mcp: 'advised',
    tools: 'advised',
    model: 'advised',
    context: 'advised',
  });
});
it('rótulos e resumo do que a CLI pode carregar', () => {
  expect(leakLabel({ kind: 'instructions', scope: 'project' })).toBe('regras do projeto');
  expect(leakLabel({ kind: 'mcp', scope: 'user' })).toBe('servidores MCP do usuário');
  expect(
    isolationSummary({
      args: [],
      loads: [
        { kind: 'instructions', scope: 'project' },
        { kind: 'mcp', scope: 'user' },
      ],
    }),
  ).toBe('A CLI pode carregar por conta própria: regras do projeto, servidores MCP do usuário.');
  expect(isolationSummary({ args: [], loads: [] })).toContain('sem prova de isolamento');
});

it('perfil = ferramenta × modo: os tipos antigos são lidos, e os prontos, cópias e personalizados se distinguem pela ferramenta', () => {
  expect(['builtin', 'acp', 'copy', 'catalog'].map(normalizeProfileKind)).toEqual(['catalog', 'catalog', 'catalog', 'catalog']);
  expect(normalizeProfileKind('custom')).toBe('custom');
  expect(normalizeProfileKind('outro')).toBeNull();
  const ready = (id: string) => BUILTIN_PROFILES.find((p) => p.id === id)!;
  expect(ready('claude')).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli' });
  expect(ready('gemini')).toMatchObject({ kind: 'catalog', tool: 'gemini', mode: 'acp' });
  const copy: AiProfile = { ...ready('claude'), id: 'claude-2', name: 'Claude 2' };
  const acpCustom: AiProfile = { ...custom, mode: 'acp', config: { acpAgent: 'gemini' } };
  const table = [ready('claude'), ready('gemini'), copy, custom, acpCustom].map((p) => [
    p.id,
    isReadyProfile(p),
    isReadyCli(p),
    isReadyAcp(p),
    isCatalogCopy(p),
    catalogTool(p),
  ]);
  expect(table).toEqual([
    ['claude', true, true, false, false, 'claude'],
    ['gemini', true, false, true, false, 'gemini'],
    ['claude-2', false, false, false, true, 'claude'],
    ['local', false, false, false, false, 'local'],
    ['local', false, false, false, false, 'local'],
  ]);
  // o rótulo da tela é "ferramenta · modo"
  expect(`${toolLabel('gemini')} · ${modeLabel('acp')}`).toBe('Gemini · ACP');
  expect(`${toolLabel('claude')} · ${modeLabel('cli')}`).toBe('Claude Code · CLI');
  expect(toolLabel('github-copilot-cli')).toBe('GitHub Copilot');
  expect(toolLabel('desconhecida')).toBe('desconhecida');
  // a cópia de uma CLI pronta não aponta agente ACP
  expect(validateProfile({ ...copy, config: { acpAgent: 'gemini' } })).toContain('Tipo ou base do perfil inválido.');
});
