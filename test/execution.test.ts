import { describe, expect, it } from 'vitest';
import type { ExecInput } from '../src/extension/execution';
import { headlessCommand, tmpArg, type HeadlessCommand } from '../src/extension/headless';
import { EXEC_ENFORCEMENT, defaultAgent, effortToRun, parseProfiles } from '../src/shared/execution';
import { ALL_AI_TOOLS } from '../src/shared/harness';

const exec: ExecInput = {
  agent: 'planejador',
  agentDefinition: null,
  mcpAllowed: ['github'],
  mcpBlocked: ['slack', 'com.ponto'],
  mcpConfig: '{"mcpServers":{}}',
  tools: ['Read', 'Edit'],
  deniedTools: ['WebFetch'],
  model: { name: 'opus', effort: 'high' },
};
const args = (tool: (typeof ALL_AI_TOOLS)[number], permission: 'board' | 'full' = 'full') =>
  (headlessCommand(tool, { prompt: 'P', permission, exec }) as HeadlessCommand).args;
const has = (list: string[], ...seq: string[]) => list.some((_, i) => seq.every((s, j) => list[i + j] === s));

describe('perfil de execução na linha de comando de cada ferramenta', () => {
  it('Claude Code: agente, modelo, ferramentas, servidores MCP e contexto vazio por parâmetro', () => {
    const command = headlessCommand('claude', { prompt: 'P', permission: 'board', exec }) as HeadlessCommand;
    const a = command.args;
    expect(has(a, '--agent', 'planejador')).toBe(true);
    expect(has(a, '--model', 'opus', '--effort', 'high')).toBe(true);
    expect(has(a, '--tools', 'Read,Edit')).toBe(true);
    expect(has(a, '--disallowedTools', 'WebFetch')).toBe(true);
    expect(has(a, '--strict-mcp-config', '--mcp-config', tmpArg('mcp.json'))).toBe(true);
    // contexto vazio: nenhuma fonte de configuração (nem do usuário nem do projeto) e nenhuma skill invocável
    expect(has(a, '--setting-sources', '', '--disable-slash-commands')).toBe(true);
    // o agente inline vai em --agents e é escolhido por --agent
    const inline = headlessCommand('claude', {
      prompt: 'P',
      permission: 'board',
      exec: { ...exec, agentDefinition: { name: 'planejador', description: 'Planeja', prompt: 'Você planeja.' } },
    }) as HeadlessCommand;
    expect(
      has(
        inline.args,
        '--agents',
        JSON.stringify({ planejador: { description: 'Planeja', prompt: 'Você planeja.' } }),
        '--agent',
        'planejador',
      ),
    ).toBe(true);
    // os servidores liberados no perfil rodam sem pedir aprovação, junto do servidor do board
    expect(has(a, '--allowedTools', 'mcp__faz-ai__*', 'Read', 'Glob', 'Grep', 'mcp__github__*')).toBe(true);
    expect(command.tempFiles).toEqual({ 'mcp.json': '{"mcpServers":{}}' });
    expect(command.stdin).toBe('P');
  });

  it('Codex, Copilot, Cursor e Kimi: só o que cada um aceita por parâmetro', () => {
    const codex = args('codex');
    expect(has(codex, '--model', 'opus', '-c', 'model_reasoning_effort="high"')).toBe(true);
    expect(has(codex, '-c', 'mcp_servers.slack.enabled=false', '-c', 'mcp_servers."com.ponto".enabled=false')).toBe(true);
    expect(codex).not.toContain('planejador');
    expect(codex.at(-1)).toBe('-');

    const copilot = args('copilot');
    for (const flag of [
      '--agent=planejador',
      '--model=opus',
      '--effort=high',
      '--available-tools=Read,Edit',
      '--excluded-tools=WebFetch',
      '--disable-mcp-server=slack',
      '--no-custom-instructions',
    ])
      expect(copilot).toContain(flag);

    // o Cursor recebe o esforço como sufixo do id, como `cursor-agent models` lista as variantes
    expect(has(args('cursor'), '--model', 'opus-high')).toBe(true);
    expect(args('cursor')).not.toContain('--agent');
    expect(has(args('kimi'), '--model', 'opus', '--agent', 'planejador')).toBe(true);
  });

  it('sem perfil, o contexto continua vazio: o Claude Code sem fontes de configuração, o Copilot sem instruções do repositório', () => {
    for (const tool of ALL_AI_TOOLS)
      expect(headlessCommand(tool, { prompt: 'P', permission: 'full' })).toEqual(
        headlessCommand(tool, { prompt: 'P', permission: 'full', exec: undefined }),
      );
    expect((headlessCommand('claude', { prompt: 'P', permission: 'full' }) as HeadlessCommand).args).toEqual([
      '-p',
      '--permission-mode',
      'bypassPermissions',
      '--setting-sources',
      '',
      '--disable-slash-commands',
    ]);
    // com o servidor do board, o arquivo de servidores é estrito: nada do usuário nem do projeto entra
    const withBoard = headlessCommand('claude', {
      prompt: 'P',
      permission: 'full',
      boardServer: { command: 'node', args: ['b.js'] },
    }) as HeadlessCommand;
    expect(has(withBoard.args, '--strict-mcp-config', '--mcp-config', tmpArg('mcp.json'))).toBe(true);
    expect(JSON.parse(withBoard.tempFiles!['mcp.json']!)).toEqual({
      mcpServers: { 'faz-ai': { type: 'stdio', command: 'node', args: ['b.js'] } },
    });
    expect((headlessCommand('copilot', { prompt: 'P', permission: 'full' }) as HeadlessCommand).args).toContain('--no-custom-instructions');
  });

  it('a tabela do que é imposto cobre todas as ferramentas, e as skills vão sempre como orientação', () => {
    for (const tool of ALL_AI_TOOLS) expect(EXEC_ENFORCEMENT[tool].skills).toBe('advised');
    expect(EXEC_ENFORCEMENT.claude).toMatchObject({
      agent: 'enforced',
      mcp: 'enforced',
      tools: 'enforced',
      model: 'enforced',
      context: 'enforced',
    });
  });

  it('lê os perfis que o banco guardava (só para a migração), descartando o que for inválido', () => {
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
        isDefault: false,
      },
    ]);
    // sem nada (ou com lixo), não há o que migrar
    expect(parseProfiles('isto não é json')).toEqual([]);
    expect(parseProfiles('[]')).toEqual([]);
    // o agente embutido é o que vale quando nenhum arquivo está marcado
    expect(defaultAgent()).toMatchObject({ id: 'padrao', scope: 'builtin', isDefault: true, mcpServers: [] });
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
