import { describe, expect, it } from 'vitest';
import type { ExecInput } from '../src/extension/execution';
import { headlessCommand, tmpArg, type HeadlessCommand } from '../src/extension/headless';
import { executionPlan } from '../src/extension/execution';
import { BUILTIN_PROFILES } from '../src/shared/aiProfiles';
import { estimateContext } from '../src/shared/contextEstimate';
import {
  CONDUCTOR_AGENT,
  EXEC_ENFORCEMENT,
  agentProfiles,
  defaultAgent,
  delegatesOf,
  effortToRun,
  manifestOf,
  parseProfiles,
} from '../src/shared/execution';
import { runTargetOf } from '../src/shared/runTarget';
import type { BoardState } from '../src/shared/model';
import type { ModelOption } from '../src/shared/models';
import { boardState, card } from './fakes/board';
import type { Agent } from '../src/shared/harness';
import { toItemName } from '../src/shared/harnessProject';
import { ALL_AI_BASES } from '../src/shared/harness';

const exec: ExecInput = {
  agent: 'planejador',
  agentDefinition: null,
  delegates: [],
  mcpAllowed: ['github'],
  mcpBlocked: ['slack', 'com.ponto'],
  mcpConfig: '{"mcpServers":{}}',
  tools: ['Read', 'Edit'],
  deniedTools: ['WebFetch'],
  model: { name: 'opus', effort: 'high' },
};
const args = (tool: (typeof ALL_AI_BASES)[number], permission: 'board' | 'full' = 'full') =>
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
    // os outros agentes do board vão no mesmo JSON, como subagentes, com as ferramentas e o modelo de cada um
    const delegated = headlessCommand('claude', {
      prompt: 'P',
      permission: 'full',
      exec: {
        ...exec,
        tools: [],
        agentDefinition: { name: 'condutor', description: 'Conduz', prompt: 'Delegue.', tools: ['Read', 'Agent'] },
        delegates: [
          { name: 'backend-node', description: 'Backend', prompt: 'Codifique.', tools: ['Read', 'Edit', 'Bash'], model: 'sonnet' },
        ],
      },
    }) as HeadlessCommand;
    expect(
      has(
        delegated.args,
        '--agents',
        JSON.stringify({
          condutor: { description: 'Conduz', prompt: 'Delegue.', tools: ['Read', 'Agent'] },
          'backend-node': { description: 'Backend', prompt: 'Codifique.', tools: ['Read', 'Edit', 'Bash'], model: 'sonnet' },
        }),
        '--agent',
        'condutor',
      ),
    ).toBe(true);
    expect(delegated.args).not.toContain('--tools');
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

  it('sem perfil, o contexto continua vazio: o Claude Code sem fontes de configuração', () => {
    for (const tool of ALL_AI_BASES)
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
  });

  it('a tabela do que é imposto cobre todas as ferramentas, e as skills vão sempre como orientação', () => {
    for (const tool of ALL_AI_BASES) expect(EXEC_ENFORCEMENT[tool].skills).toBe('advised');
    expect(EXEC_ENFORCEMENT.claude).toMatchObject({
      agent: 'enforced',
      mcp: 'enforced',
      tools: 'enforced',
      model: 'enforced',
    });
    // o contexto vazio depende das capacidades verificadas do perfil (enforcementOf), não desta tabela
    expect(EXEC_ENFORCEMENT.claude).not.toHaveProperty('context');
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

describe('agentProfiles: o padrão do board', () => {
  const agent = (name: string): Agent => ({
    name,
    scope: 'user',
    path: `/h/.claude/agents/${name}.md`,
    location: `~/.claude/agents/${name}.md`,
    content: '',
    description: name,
    model: '',
    modelValue: '',
    body: '',
    tools: [],
    deniedTools: [],
    skills: [],
    mcp: [],
    seed: false,
    readonly: false,
    background: false,
  });
  const marked = (names: string[]) =>
    names.map((n) => ({ kind: 'agent' as const, location: `~/.claude/agents/${n}.md`, usage: 'contextual' as const }));

  it('o escolhido em Configurações vale; sem ele (apagado, desmarcado), o condutor; sem o condutor, o primeiro', () => {
    const agents = [agent('backend-node'), agent(CONDUCTOR_AGENT), agent('qa-testes')];
    const defaults = (chosen: string, list = agents) =>
      agentProfiles(list, marked(list.map((a) => a.name)), chosen).find((p) => p.isDefault)?.id;
    expect(defaults('qa-testes')).toBe('qa-testes');
    expect(defaults('agente-padr-o')).toBe(CONDUCTOR_AGENT);
    expect(defaults('')).toBe(CONDUCTOR_AGENT);
    expect(defaults('agente-padr-o', [agent('backend-node'), agent('qa-testes')])).toBe('backend-node');
  });
});

describe('toItemName', () => {
  it('tira acentos antes de trocar o resto por hífen: "Agente padrão" vira agente-padrao, não agente-padr-o', () => {
    expect(toItemName('Agente padrão')).toBe('agente-padrao');
    expect(toItemName('Revisão de Código')).toBe('revisao-de-codigo');
  });
});

describe('manifesto e plano pelo alvo da execução', () => {
  const opt = (tool: string, model: string): ModelOption =>
    ({ id: `${tool}:${model}`, tool, model, label: model, efforts: [], defaultEffort: null }) as ModelOption;
  const agente = (id: string, model: string) =>
    ({ ...defaultAgent(), id, name: id, model, isDefault: false, scope: 'project', path: `/${id}.md` }) as never;
  const cenario = (cardModel: string, ligados = ['claude', 'cursor']) => {
    const s = boardState();
    s.board.aiTool = 'claude';
    s.board.aiProfiles = BUILTIN_PROFILES.map((p) => ({ ...structuredClone(p), enabled: ligados.includes(p.id) }));
    s.board.modelCatalog = [opt('claude', 'sonnet'), opt('cursor', 'composer-2.5')];
    s.fieldDefs = [{ id: 'modelo', kind: 'model', appliesToTypes: null } as never];
    const c = card('c1', { columnId: 'backlog' });
    s.cards = [c];
    s.fieldValues = cardModel ? [{ cardId: 'c1', fieldId: 'modelo', value: cardModel } as never] : [];
    return { s, c };
  };

  it('manifestOf().target é o runTargetOf e o model sai dele', () => {
    const { s, c } = cenario('cursor:composer-2.5');
    const m = manifestOf(s, c);
    expect(m.target).toEqual(runTargetOf(s, c));
    expect(m.target.cli.id).toBe('cursor');
    expect(m.model).toEqual({ name: 'composer-2.5', effort: null });
  });

  it('executionPlan de um card do Cursor num board com padrão Claude usa a imposição do Cursor e os servidores da biblioteca do board', () => {
    const { s, c } = cenario('cursor:composer-2.5');
    s.harness = {
      ...s.harness,
      library: {
        directory: '',
        artifacts: [{ id: 'a', kind: 'mcp', name: 'da-biblioteca', description: '', origin: '', usage: 'off', missing: false }],
      },
    } as never;
    const plan = executionPlan(s, c, {}, { command: 'node', args: [] });
    expect(plan.input.mcpBlocked).toEqual(['da-biblioteca']);
    // o Cursor não recebe o arquivo de MCP nem o agente por parâmetro: a orientação vai no pedido
    expect(plan.input.mcpConfig).toBeNull();
    expect(plan.summary).toContain('Servidores MCP: faz-ai (pelo pedido)');
    expect(plan.summary.some((l) => l.startsWith('Modelo: composer-2.5') && l.endsWith('(imposto pela CLI)'))).toBe(true);
  });

  it('um board com um perfil só sai como hoje: padrão Claude, MCP imposto e arquivo de configuração', () => {
    const { s, c } = cenario('claude:sonnet', ['claude']);
    const plan = executionPlan(s, c, {}, { command: 'node', args: [] });
    expect(plan.manifest.target.cli.id).toBe('claude');
    expect(plan.input.mcpConfig).not.toBeNull();
    expect(plan.summary).toContain('Servidores MCP: faz-ai (imposto pela CLI)');
  });

  it('o subagente cujo modelo é de outro perfil fica com model null', () => {
    const { s, c } = cenario('');
    s.board.execProfiles = [agente('mesmo', 'claude:sonnet'), agente('outro', 'cursor:composer-2.5'), agente('sem', '')];
    const model = (n: string) => delegatesOf(s, c, undefined).find((d) => d.name === n)!.model;
    expect(model('mesmo')).toBe('sonnet');
    expect(model('outro')).toBeNull();
    expect(model('sem')).toBeNull();
    // a sessão do Cursor inverte: só o modelo do Cursor vale
    const cursor = cenario('cursor:composer-2.5');
    cursor.s.board.execProfiles = s.board.execProfiles;
    const m = (n: string) => delegatesOf(cursor.s, cursor.c, undefined).find((d) => d.name === n)!.model;
    expect(m('outro')).toBe('composer-2.5');
    expect(m('mesmo')).toBeNull();
  });

  it('a janela de contexto e a ferramenta da estimativa são as do perfil do alvo', () => {
    const { s, c } = cenario('cursor:composer-2.5');
    const e = estimateContext(s as BoardState, c);
    expect(e.tool).toBe('cursor');
    expect(e.model).toBe('composer-2.5');
  });
});
