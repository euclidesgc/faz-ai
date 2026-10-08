import { describe, expect, it } from 'vitest';
import type { ExecInput } from '../src/extension/execution';
import { headlessCommand, tmpArg, type HeadlessCommand } from '../src/extension/headless';
import { EXEC_ENFORCEMENT, defaultAgent, effortToRun, parseProfiles } from '../src/shared/execution';
import { ALL_AI_TOOLS } from '../src/shared/harness';

const exec: ExecInput = {
  agent: 'planejador',
  mcpAllowed: ['github'],
  mcpBlocked: ['slack', 'com.ponto'],
  mcpConfig: '{"mcpServers":{}}',
  tools: ['Read', 'Edit'],
  deniedTools: ['WebFetch'],
  model: { name: 'opus', effort: 'high' },
  clean: true,
};
const args = (tool: (typeof ALL_AI_TOOLS)[number], permission: 'board' | 'full' = 'full') =>
  (headlessCommand(tool, { prompt: 'P', permission, exec }) as HeadlessCommand).args;
const has = (list: string[], ...seq: string[]) => list.some((_, i) => seq.every((s, j) => list[i + j] === s));

describe('perfil de execução na linha de comando de cada ferramenta', () => {
  it('Claude Code: agente, modelo, ferramentas, servidores MCP e sessão limpa por parâmetro', () => {
    const command = headlessCommand('claude', { prompt: 'P', permission: 'board', exec }) as HeadlessCommand;
    const a = command.args;
    expect(has(a, '--agent', 'planejador')).toBe(true);
    expect(has(a, '--model', 'opus', '--effort', 'high')).toBe(true);
    expect(has(a, '--tools', 'Read,Edit')).toBe(true);
    expect(has(a, '--disallowedTools', 'WebFetch')).toBe(true);
    expect(has(a, '--strict-mcp-config', '--mcp-config', tmpArg('mcp.json'))).toBe(true);
    expect(has(a, '--setting-sources', 'project,local', '--disable-slash-commands')).toBe(true);
    // os servidores liberados no perfil rodam sem pedir aprovação, junto do servidor do board
    expect(has(a, '--allowedTools', 'mcp__faz-ai__*', 'Read', 'Glob', 'Grep', 'mcp__github__*')).toBe(true);
    expect(command.tempFiles).toEqual({ 'mcp.json': '{"mcpServers":{}}' });
    expect(command.stdin).toBe('P');
  });

  it('Cursor: só o que ele aceita por parâmetro', () => {
    // o Cursor recebe o esforço como sufixo do id, como `cursor-agent models` lista as variantes
    expect(has(args('cursor'), '--model', 'opus-high')).toBe(true);
    expect(args('cursor')).not.toContain('--agent');
  });

  it('sem perfil, o comando é o mesmo de antes', () => {
    for (const tool of ALL_AI_TOOLS)
      expect(headlessCommand(tool, { prompt: 'P', permission: 'full' })).toEqual(
        headlessCommand(tool, { prompt: 'P', permission: 'full', exec: undefined }),
      );
    expect((headlessCommand('claude', { prompt: 'P', permission: 'full' }) as HeadlessCommand).args).toEqual([
      '-p',
      '--permission-mode',
      'bypassPermissions',
    ]);
  });

  it('a tabela do que é imposto cobre todas as ferramentas, e as skills vão sempre como orientação', () => {
    for (const tool of ALL_AI_TOOLS) expect(EXEC_ENFORCEMENT[tool].skills).toBe('advised');
    expect(EXEC_ENFORCEMENT.claude).toMatchObject({
      agent: 'enforced',
      mcp: 'enforced',
      tools: 'enforced',
      model: 'enforced',
      clean: 'enforced',
    });
  });

  it('lê os perfis salvos, descartando o que for inválido e mantendo um só padrão', () => {
    const parsed = parseProfiles(
      JSON.stringify([
        { id: 'a', name: ' Plan ', skills: ['x', 'x', 3], mcpServers: [], isDefault: true },
        { id: 'a', name: 'duplicado' },
        { name: 'sem id' },
        { id: 'b', isDefault: true, mcpServers: 'tudo' },
      ]),
    );
    expect(parsed).toEqual([
      {
        id: 'a',
        name: 'Plan',
        purpose: '',
        agent: '',
        skills: ['x'],
        mcpServers: [],
        tools: [],
        deniedTools: [],
        model: '',
        clean: false,
        isDefault: true,
      },
      {
        id: 'b',
        name: 'Agente',
        purpose: '',
        agent: '',
        skills: [],
        mcpServers: null,
        tools: [],
        deniedTools: [],
        model: '',
        clean: false,
        isDefault: false,
      },
    ]);
    // sem nada (ou com lixo), vale o agente padrão: toda execução passa por um agente
    expect(parseProfiles('isto não é json')).toEqual([defaultAgent()]);
    expect(parseProfiles('[]')).toEqual([defaultAgent()]);
    // sem nenhum marcado como padrão, o primeiro assume
    expect(parseProfiles(JSON.stringify([{ id: 'x' }, { id: 'y' }])).map((p) => p.isDefault)).toEqual([true, false]);
  });
});

describe('effortToRun', () => {
  const option = (tool: 'cursor' | 'claude') => ({
    id: `${tool}:m`,
    tool,
    model: 'm',
    label: 'M',
    efforts: ['low', 'high'],
    defaultEffort: 'high',
  });

  it('o nível escolhido vale quando o modelo o tem', () => {
    expect(effortToRun(option('claude'), 'low')).toBe('low');
    expect(effortToRun(option('cursor'), 'low')).toBe('low');
  });

  it('sem nível válido, o Cursor usa o padrão do modelo (o id sem nível não existe) e as outras ferramentas, nenhum', () => {
    expect(effortToRun(option('cursor'), null)).toBe('high');
    expect(effortToRun(option('cursor'), 'max')).toBe('high');
    expect(effortToRun(option('claude'), null)).toBeNull();
  });
});
