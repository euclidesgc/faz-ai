// O protótipo do conector ACP (spike): um agente falso que fala o Agent Client Protocol pelo
// `stdin`/`stdout`, o catálogo de agentes e, em detalhe, o Gemini CLI. Mostra o que o board ganha e o
// que sobra de medição:
// pedido, eventos, permissão respondida pelo board, servidor MCP do board no `session/new` (sem
// arquivo no projeto), Parar pelo `session/cancel` e o `RunReport` que o gateway gravaria.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ACP_AGENTS, acpAgent } from '../src/extension/ai/acp/agents';
import type { AcpAgent } from '../src/extension/ai/acp/provider';
import { FakeAgent, GEMINI_INITIALIZE } from './fakes/acpAgent';
import { acpMcpServers, spawnAcp } from '../src/extension/ai/acp/run';
import { acpSessionModels } from '../src/extension/ai/acp/models';
import { acpSignIn } from '../src/extension/ai/acp/signIn';
import { driverFor } from '../src/extension/ai/drivers';
import { BUILTIN_PROFILES } from '../src/shared/aiProfiles';
import type { HeadlessInput } from '../src/extension/ai/provider';
import type { RunReport } from '../src/shared/log';

const BOARD = { command: '/usr/local/bin/node', args: ['/ext/dist/mcp-bridge.js', '/projeto'], env: { FAZAI_TOKEN: 'x' } };

const gemini = acpAgent('gemini')!;

let dir: string;
let home: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-acp-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-acp-home-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

/** Roda até o fim e devolve o que o gateway receberia: código, erro, relatório e as linhas do canal. */
function run(agent: FakeAgent, input: Partial<HeadlessInput> = {}, spec: AcpAgent = gemini) {
  const lines: string[] = [];
  const measured = spawnAcp(spec, { prompt: 'Trabalhe o card #12', permission: 'board', boardServer: BOARD, ...input }, dir, {
    spawn: agent.spawn,
    log: (l) => lines.push(l),
    graceMs: 10,
    homeDir: home,
  });
  const ended = new Promise<{ code: number | null; error?: Error; report: RunReport }>((resolve) =>
    measured.proc.onExit((code, error) => resolve({ code, error, report: measured.report() })),
  );
  return { measured, lines, ended };
}

/** O turno típico: texto, uma ferramenta MCP do board, um pedido de edição e o consumo. */
const typicalTurn = async (agent: FakeAgent) => {
  agent.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Lendo o ' } });
  agent.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'card.\nVou ' } });
  // o id como o Gemini CLI 0.65.0 o monta para a ferramenta MCP (`mcp_<servidor>_<ferramenta>__<id>`): é por ele
  // que o board reconhece o MCP no Gemini, não pelo título
  const board = { toolCallId: 'mcp_faz-ai_get_card__t1', title: 'get_card (faz-ai MCP Server)', kind: 'other', status: 'pending' };
  agent.update({ sessionUpdate: 'tool_call', ...board });
  const boardAnswer = await agent.ask(board);
  agent.update({ sessionUpdate: 'tool_call_update', toolCallId: 'mcp_faz-ai_get_card__t1', status: 'completed' });
  const edit = { toolCallId: 't2', title: 'Editar src/app.ts', kind: 'edit', status: 'pending' };
  agent.update({ sessionUpdate: 'tool_call', ...edit });
  const editAnswer = await agent.ask(edit);
  agent.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'mover o card.' } });
  agent.update({ sessionUpdate: 'usage_update', used: 12000, size: 1000000, cost: { amount: 0.0123, currency: 'USD' } });
  (agent as any).answers = { boardAnswer, editAnswer };
  return {
    stopReason: 'end_turn',
    usage: { totalTokens: 1650, inputTokens: 1200, outputTokens: 400, thoughtTokens: 50, cachedReadTokens: 800 },
  };
};

describe('conector ACP (protótipo), em detalhe com o Gemini CLI', () => {
  it('abre a sessão com o servidor do board no session/new e manda o pedido do card como texto', async () => {
    const agent = new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) });
    const { ended } = run(agent);
    const end = await ended;

    expect(agent.command).toEqual({ command: 'gemini', args: ['--acp', '--skip-trust'] });
    expect(agent.methods()).toEqual(['initialize', 'session/new', 'session/prompt']);
    const init = agent.received.find((m) => m.method === 'initialize')!.params;
    // o board não empresta o editor: sem fs nem terminal, cada escrita passa pela permissão
    expect(init).toMatchObject({
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      // Gemini CLI e OpenCode recusam o initialize sem a versão do cliente
      clientInfo: { name: 'faz-ai', version: expect.stringMatching(/^\d+\.\d+\.\d+/) },
    });
    const session = agent.received.find((m) => m.method === 'session/new')!.params;
    expect(session).toEqual({
      cwd: dir,
      mcpServers: [{ name: 'faz-ai', command: BOARD.command, args: BOARD.args, env: [{ name: 'FAZAI_TOKEN', value: 'x' }] }],
    });
    const prompt = agent.received.find((m) => m.method === 'session/prompt')!.params;
    expect(prompt).toEqual({ sessionId: 'sess-1', prompt: [{ type: 'text', text: 'Trabalhe o card #12' }] });
    // nenhum arquivo de configuração MCP na pasta do projeto (o Cursor e o Kimi precisam de um hoje)
    expect(fs.readdirSync(dir)).toEqual([]);
    // o board fecha o agente no fim do turno pelo stdin, sem matar
    expect(agent.ended).toBe(true);
    expect(agent.killed).toBe(false);
    expect(end.code).toBe(0);
  });

  it('os servidores liberados pelo agente do card vão junto, no formato do ACP', () => {
    const mcpConfig = JSON.stringify({
      mcpServers: {
        'faz-ai': { type: 'stdio', ...BOARD },
        github: { command: '/opt/bin/github-mcp', args: ['stdio'], env: { GH_TOKEN: 'segredo' } },
        // http/sse dependem de capacidade do agente: o protótipo só manda stdio
        docs: { type: 'http', url: 'https://exemplo.dev/mcp' },
      },
    });
    const servers = acpMcpServers({ prompt: '', permission: 'board', exec: { mcpConfig } as never });
    expect(servers.map((s) => s.name)).toEqual(['faz-ai', 'github']);
    expect(servers[1]!.env).toEqual([{ name: 'GH_TOKEN', value: 'segredo' }]);
  });

  it('transmite os eventos para o canal e responde as permissões pela regra do nível', async () => {
    const agent = new FakeAgent({ onPrompt: typicalTurn });
    const { ended, lines } = run(agent);
    const end = await ended;

    const { boardAnswer, editAnswer } = (agent as any).answers;
    // a ferramenta do board é permitida; editar arquivo, no nível "board", não
    expect(boardAnswer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-allow_once' } });
    expect(editAnswer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-reject_once' } });
    expect(lines).toEqual([
      'Chamando Gemini CLI (ACP): gemini --acp --skip-trust',
      'Sessão ACP aberta com faz-ai.',
      'Lendo o card.',
      'Vou ',
      '→ faz-ai/get_card: get_card (faz-ai MCP Server)',
      'Gemini CLI pediu permissão para faz-ai/get_card: permitido pelo board (nível board).',
      '→ edit: Editar src/app.ts',
      'Gemini CLI pediu permissão para Editar src/app.ts: negado (fora do nível board) pelo board (nível board).',
      'mover o card.',
      'Pronto',
    ]);
    expect(end.code).toBe(0);
  });

  it('o manifesto do card nega MCP fora dos servidores, subagente fora da lista e diz o motivo', async () => {
    const answers: any[] = [];
    const agent = new FakeAgent({
      onPrompt: async (a) => {
        answers.push(await a.ask({ toolCallId: 'm1', title: 'outro: listar', kind: 'other' }));
        answers.push(await a.ask({ toolCallId: 's1', title: 'Agent: revisar', kind: 'other' }));
        return { stopReason: 'end_turn' };
      },
    });
    const mcpConfig = JSON.stringify({ mcpServers: { outro: { command: 'x' } } });
    const { ended, lines } = run(agent, { permission: 'full', exec: { mcpConfig, tools: [], deniedTools: [] } as never });
    await ended;
    expect(answers[0]).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-allow_once' } });
    expect(answers[1]).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-reject_once' } });
    expect(lines.some((l) => l.includes('negado (o subagente não está na lista do card)'))).toBe(true);
  });

  it('no nível "board e arquivos" a edição é permitida', async () => {
    const agent = new FakeAgent({ onPrompt: typicalTurn });
    await run(agent, { permission: 'edits' }).ended;
    expect((agent as any).answers.editAnswer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-allow_once' } });
  });

  it('"sem restrições" troca para o modo yolo quando o agente o anuncia', async () => {
    const agent = new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) });
    await run(agent, { permission: 'full' }).ended;
    expect(agent.methods()).toEqual(['initialize', 'session/new', 'session/set_mode', 'session/prompt']);
    expect(agent.received.find((m) => m.method === 'session/set_mode')!.params).toEqual({ sessionId: 'sess-1', modeId: 'yolo' });
  });

  it('"sem restrições" com restrição do card (execução admitida) não troca o modo: o board segue decidindo', async () => {
    let answer: unknown;
    const agent = new FakeAgent({
      onPrompt: async (a) => {
        answer = await a.ask({ toolCallId: 's1', title: 'Agent: revisar', kind: 'other' });
        return { stopReason: 'end_turn' };
      },
    });
    const exec = { tools: ['Read'], deniedTools: ['Agent', 'Task'], toolSet: 'explicit' } as never;
    const { ended, lines } = run(agent, { permission: 'full', exec });
    await ended;
    expect(agent.methods()).not.toContain('session/set_mode');
    expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'opt-reject_once' } });
    expect(lines.some((l) => l.includes('negado'))).toBe(true);
  });

  it('sem a opção de negar, o board cancela o pedido em vez de inventar uma resposta', async () => {
    let answer: unknown;
    const agent = new FakeAgent({
      onPrompt: async (a) => {
        answer = await a.ask({ toolCallId: 't9', title: 'rm -rf build', kind: 'execute' }, ['allow_once']);
        return { stopReason: 'end_turn' };
      },
    });
    await run(agent).ended;
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('o que sobra de medição: tokens do turno (rascunho do ACP), custo do usage_update e o inventário', async () => {
    const agent = new FakeAgent({ onPrompt: typicalTurn });
    const { report } = await run(agent).ended;
    expect(report).toEqual({
      measure: 'full',
      consumption: {
        // o `inputTokens` do Gemini já traz os 800 do cache: descontados, o total do painel não os conta duas vezes
        inputTokens: 400,
        // o raciocínio entra como saída, como o Claude Code conta
        outputTokens: 450,
        cacheReadTokens: 800,
        cacheWriteTokens: 0,
        turns: null,
        sessionId: 'sess-1',
        costUsd: 0.0123,
      },
      inventory: [
        { kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 1 },
        { kind: 'tool', name: 'edit', calls: 1 },
      ],
      answer: 'Lendo o card.\nVou mover o card.',
      reason: null,
      usageLimitReached: false,
    });
  });

  it('agente que não informa tokens: fica o inventário (partial), sem custo solto', async () => {
    const agent = new FakeAgent({
      onPrompt: (a) => {
        a.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Ler README.md', kind: 'read' });
        // custo sem tokens não cabe no consumo (os quatro contadores são obrigatórios): fica de fora
        a.update({ sessionUpdate: 'usage_update', used: 10, size: 100, cost: { amount: 0.5, currency: 'USD' } });
        return { stopReason: 'end_turn' };
      },
    });
    const { report } = await run(agent).ended;
    expect(report.measure).toBe('partial');
    expect(report.consumption).toBeNull();
    expect(report.inventory).toEqual([{ kind: 'tool', name: 'read', calls: 1 }]);
  });

  it('agente que não informa nada: measure none com o motivo para o canal', async () => {
    const agent = new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) });
    const { report } = await run(agent).ended;
    expect(report.measure).toBe('none');
    expect(report.reason).toMatch(/não trouxe o consumo/);
  });

  it('Parar manda session/cancel, espera o cancelled e guarda o que já foi medido', async () => {
    let started!: () => void;
    const promptStarted = new Promise<void>((r) => (started = r));
    const agent = new FakeAgent({
      onPrompt: (a) => {
        a.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Ler card', kind: 'read' });
        started();
      },
      onCancel: (a) => a.respondPrompt({ stopReason: 'cancelled', usage: { totalTokens: 30, inputTokens: 20, outputTokens: 10 } }),
    });
    const { measured, ended, lines } = run(agent);
    await promptStarted;
    measured.proc.kill();
    const end = await ended;

    expect(agent.methods()).toContain('session/cancel');
    // o agente respondeu dentro da folga: saiu pelo fim do stdin, sem ser morto
    expect(agent.killed).toBe(false);
    expect(end.code).toBe(143);
    expect(lines.at(-1)).toBe('Terminou: cancelled');
    expect(end.report.consumption).toMatchObject({ inputTokens: 20, outputTokens: 10 });
  });

  it('agente que ignora o session/cancel é morto depois da folga', async () => {
    let started!: () => void;
    const promptStarted = new Promise<void>((r) => (started = r));
    const agent = new FakeAgent({ onPrompt: () => started() });
    const { measured, ended } = run(agent);
    await promptStarted;
    measured.proc.kill();
    const end = await ended;
    expect(agent.killed).toBe(true);
    expect(end.code).toBe(143);
  });

  it('sem login, o board avisa como entrar em vez de abrir o navegador', async () => {
    const agent = new FakeAgent({ sessionNew: () => ({ error: { code: -32000, message: 'Authentication required' } }) });
    const { ended, lines } = run(agent);
    const end = await ended;
    expect(agent.methods()).toEqual(['initialize', 'session/new']);
    expect(end.code).toBe(1);
    // o Gemini entra pela chave de API na tela do Conectar (história 7); os outros agentes, pelo terminal
    expect(lines).toContain('Gemini CLI pede login. Conecte em Configurações › Conectar agentes, com a chave de API.');
    expect(end.error?.message).toMatch(/pede login/);
    const opencode = new FakeAgent({ sessionNew: () => ({ error: { code: -32000, message: 'Authentication required' } }) });
    const other = run(opencode, {}, acpAgent('opencode')!);
    await other.ended;
    expect(other.lines).toContain('OpenCode pede login. Rode `opencode auth login` no terminal uma vez e entre com a sua conta.');
  });

  it('cota diária do Gemini no session/prompt (429): limite de uso com a renovação da meia-noite do Pacífico (história 12)', async () => {
    const agent = new FakeAgent({
      onPrompt: (a) => {
        a.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Ler src/app.ts', kind: 'read', status: 'pending' });
        a.rejectPrompt({ code: 429, message: 'You have exhausted your daily quota on this model.' });
      },
    });
    const { ended, lines } = run(agent);
    const end = await ended;
    expect(end.code).toBe(1);
    expect(end.error?.message).toBe('You have exhausted your daily quota on this model.');
    expect(lines).toContain('You have exhausted your daily quota on this model.');
    expect(end.report).toMatchObject({
      usageLimitReached: true,
      usageLimitHint: { resetsAt: null, text: null, dailyResetZone: 'America/Los_Angeles' },
      // o que já rodou antes do limite continua no inventário (a política lê como trabalho parcial)
      inventory: [{ kind: 'tool', name: 'read', calls: 1 }],
    });
  });

  it('429 que escapou das tentativas do Gemini: limite sem horário (backoff); a falha comum não é limite', async () => {
    const limited = new FakeAgent({ onPrompt: (a) => a.rejectPrompt({ code: 429, message: 'Rate limit exceeded. Try again later.' }) });
    const limitedEnd = await run(limited).ended;
    expect(limitedEnd.report.usageLimitReached).toBe(true);
    expect(limitedEnd.report.usageLimitHint).toBeUndefined();

    const broken = new FakeAgent({ onPrompt: (a) => a.rejectPrompt({ code: 500, message: 'Unknown stream execution error.' }) });
    const brokenEnd = await run(broken).ended;
    expect(brokenEnd.code).toBe(1);
    expect(brokenEnd.report.usageLimitReached).toBe(false);
  });

  it('o mesmo 429 num agente que não declara como escreve o limite não liga a pausa (o board não adivinha)', async () => {
    const agent = new FakeAgent({ onPrompt: (a) => a.rejectPrompt({ code: 429, message: 'You have exhausted your daily quota.' }) });
    const end = await run(agent, {}, acpAgent('opencode')!).ended;
    expect(end.code).toBe(1);
    expect(end.report.usageLimitReached).toBe(false);
    expect(acpAgent('opencode')!.classifyFailure).toBeUndefined();
  });

  it('versão do protocolo diferente: não abre sessão', async () => {
    const agent = new FakeAgent({ initialize: () => ({ protocolVersion: 2, agentCapabilities: {} }) });
    const end = await run(agent).ended;
    expect(agent.methods()).toEqual(['initialize']);
    expect(end.code).toBe(1);
    expect(end.error?.message).toMatch(/versão 2 do ACP/);
  });

  it('agente que morre no meio do turno: o código do processo e o stderr no canal', async () => {
    const agent = new FakeAgent({
      onPrompt: (a) => {
        a.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Começando' } });
        a.stderr('Error: quota exceeded\n');
        a.terminate(2);
      },
    });
    const { ended, lines } = run(agent);
    const end = await ended;
    expect(end.code).toBe(2);
    expect(lines).toContain('Error: quota exceeded');
    // o texto que estava sem quebra de linha não se perde
    expect(lines).toContain('Começando');
    expect(end.report.answer).toBe('Começando');
  });

  it('texto solto no stdout (não JSON-RPC) vai para o canal sem quebrar a sessão', async () => {
    const agent = new FakeAgent({
      onPrompt: (a) => {
        (a as any).out('Aviso: nova versão disponível\n', 'stdout');
        return { stopReason: 'end_turn' };
      },
    });
    const { ended, lines } = run(agent);
    expect((await ended).code).toBe(0);
    expect(lines).toContain('Aviso: nova versão disponível');
  });
});

describe('catálogo do conector ACP', () => {
  // os comandos do registro oficial do ACP (registry.json, 2026-10-18), com o executável da instalação
  it('cada agente com o comando do registro do ACP', () => {
    expect(Object.fromEntries(ACP_AGENTS.map((a) => [a.id, [a.command, ...a.args].join(' ')]))).toEqual({
      gemini: 'gemini --acp --skip-trust',
      'antigravity-acp': 'agy_acp_server.par',
      opencode: 'opencode acp',
      'codex-acp': 'codex-acp',
      cursor: 'cursor-agent acp',
      kimi: 'kimi acp',
      'github-copilot-cli': 'copilot --acp',
      'qwen-code': 'qwen --acp',
      goose: 'goose acp',
    });
  });

  it('o Claude fica de fora: segue pela CLI `claude`, a única que pode usar a assinatura da pessoa', () => {
    expect(ACP_AGENTS.map((a) => a.id)).not.toContain('claude-acp');
    expect(ACP_AGENTS.some((a) => /claude/i.test(a.command))).toBe(false);
  });

  it.each(ACP_AGENTS.map((a) => [a.label, a] as const))(
    '%s roda pelo mesmo transporte, com o MCP do board no session/new',
    async (_label, spec) => {
      const agent = new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) });
      const end = await run(agent, {}, spec).ended;
      expect(agent.command).toEqual({ command: spec.command, args: [...spec.args] });
      expect(agent.methods()).toEqual(['initialize', 'session/new', 'session/prompt']);
      expect(agent.received.find((m) => m.method === 'session/new')!.params.mcpServers.map((s: { name: string }) => s.name)).toEqual([
        'faz-ai',
      ]);
      // só o agente que, pela documentação, ignora o session/new ganha o arquivo dele no projeto
      if (spec.projectMcpFile)
        expect(JSON.parse(fs.readFileSync(path.join(dir, spec.projectMcpFile), 'utf8')).mcpServers['faz-ai']).toMatchObject({
          args: BOARD.args,
        });
      else expect(fs.readdirSync(dir)).toEqual([]);
      expect(end.code).toBe(0);
    },
  );

  it('o modelo do card vai na linha de comando de quem aceita', () => {
    const exec = { model: { name: 'gemini-3-pro', effort: 'high' } } as never;
    const agent = new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) });
    run(agent, { exec }, gemini);
    expect(agent.command!.args).toEqual(['--acp', '--skip-trust', '--model', 'gemini-3-pro']);
  });

  const modelSelector = (current: string) => ({
    sessionId: 'sess-1',
    configOptions: [
      { id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default', options: [{ value: 'default', name: 'Default' }] },
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        currentValue: current,
        options: [
          { value: 'gpt-5', name: 'GPT-5' },
          { value: 'gpt-5-mini', name: 'GPT-5 mini' },
        ],
      },
    ],
  });

  it('o modelo do card vai pelo seletor da sessão (session/set_config_option) quando o agente o expõe', async () => {
    const exec = { model: { name: 'gpt-5-mini', effort: null } } as never;
    const agent = new FakeAgent({ sessionNew: () => modelSelector('gpt-5'), onPrompt: () => ({ stopReason: 'end_turn' }) });
    const { ended, lines } = run(agent, { exec }, acpAgent('opencode')!);
    await ended;
    expect(agent.methods()).toEqual(['initialize', 'session/new', 'session/set_config_option', 'session/prompt']);
    expect(agent.received.find((m) => m.method === 'session/set_config_option')!.params).toEqual({
      sessionId: 'sess-1',
      configId: 'model',
      value: 'gpt-5-mini',
    });
    // o board anuncia que entende as opções de configuração: sem isso o agente não manda o seletor
    expect(agent.received.find((m) => m.method === 'initialize')!.params.clientCapabilities.session).toEqual({ configOptions: {} });
    expect(lines).toContain('Modelo gpt-5-mini escolhido na sessão.');
  });

  it('modelo já atual na sessão, ou que o seletor não oferece: sem set_config_option, e o canal diz com qual segue', async () => {
    const same = new FakeAgent({ sessionNew: () => modelSelector('gpt-5'), onPrompt: () => ({ stopReason: 'end_turn' }) });
    await run(same, { exec: { model: { name: 'gpt-5', effort: null } } as never }, acpAgent('opencode')!).ended;
    expect(same.methods()).toEqual(['initialize', 'session/new', 'session/prompt']);

    const other = new FakeAgent({ sessionNew: () => modelSelector('gpt-5'), onPrompt: () => ({ stopReason: 'end_turn' }) });
    const { ended, lines } = run(other, { exec: { model: { name: 'claude-x', effort: null } } as never }, acpAgent('opencode')!);
    await ended;
    expect(other.methods()).toEqual(['initialize', 'session/new', 'session/prompt']);
    expect(lines).toContain('O OpenCode não oferece o modelo claude-x nesta sessão; segue com gpt-5.');
  });

  it('agente na forma anterior do protocolo (models, sem configOptions): a escolha fica só na linha de comando', async () => {
    const exec = { model: { name: 'gemini-2.5-pro', effort: null } } as never;
    const agent = new FakeAgent({
      sessionNew: () => ({ sessionId: 'sess-1', models: { currentModelId: 'auto', availableModels: [{ modelId: 'auto', name: 'Auto' }] } }),
      onPrompt: () => ({ stopReason: 'end_turn' }),
    });
    await run(agent, { exec }, gemini).ended;
    expect(agent.methods()).toEqual(['initialize', 'session/new', 'session/prompt']);
    expect(agent.command!.args).toContain('--model');
  });

  it('sem padrão de título, a ferramenta MCP é reconhecida pelo nome do servidor que o board passou', async () => {
    const answers: unknown[] = [];
    const agent = new FakeAgent({
      onPrompt: async (a) => {
        a.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'faz-ai: get_card', kind: 'other' });
        answers.push(await a.ask({ toolCallId: 't1', title: 'faz-ai: get_card', kind: 'other' }));
        // uma ferramenta "other" de fora dos servidores do board não passa no nível "board"
        answers.push(await a.ask({ toolCallId: 't2', title: 'slack: post_message', kind: 'other' }));
        return { stopReason: 'end_turn' };
      },
    });
    const { report } = await run(agent, {}, acpAgent('opencode')!).ended;
    expect(answers).toEqual([
      { outcome: { outcome: 'selected', optionId: 'opt-allow_once' } },
      { outcome: { outcome: 'selected', optionId: 'opt-reject_once' } },
    ]);
    expect(report.inventory).toEqual([{ kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 1 }]);
  });

  it('OpenCode: tokens do turno e custo da sessão, a medição mais completa do catálogo', async () => {
    const agent = new FakeAgent({
      onPrompt: (a) => {
        a.update({ sessionUpdate: 'usage_update', used: 5000, size: 200000, cost: { amount: 0.042, currency: 'USD' } });
        return { stopReason: 'end_turn', usage: { inputTokens: 3000, outputTokens: 900, totalTokens: 3900 } };
      },
    });
    const { report } = await run(agent, {}, acpAgent('opencode')!).ended;
    expect(report.measure).toBe('full');
    expect(report.consumption).toMatchObject({ inputTokens: 3000, outputTokens: 900, costUsd: 0.042 });
  });

  it('Gemini anterior ao usage do protocolo: os tokens saem do _meta.quota', async () => {
    const agent = new FakeAgent({
      onPrompt: () => ({
        stopReason: 'end_turn',
        _meta: { quota: { token_count: { input_tokens: 700, output_tokens: 120 }, model_usage: [] } },
      }),
    });
    const { report } = await run(agent).ended;
    expect(report.consumption).toMatchObject({ inputTokens: 700, outputTokens: 120, cacheReadTokens: 0, costUsd: null });
  });

  it('Codex: "sem restrições" pede o modo agent-full-access quando o adaptador o anuncia', async () => {
    const agent = new FakeAgent({
      sessionNew: () => ({
        sessionId: 'sess-1',
        modes: { currentModeId: 'agent', availableModes: [{ id: 'read-only' }, { id: 'agent' }, { id: 'agent-full-access' }] },
      }),
      onPrompt: () => ({ stopReason: 'end_turn' }),
    });
    await run(agent, { permission: 'full' }, acpAgent('codex-acp')!).ended;
    expect(agent.received.find((m) => m.method === 'session/set_mode')!.params.modeId).toBe('agent-full-access');
  });

  it('Codex: o usage do adaptador (só o último pedido) não é gravado, para não mostrar menos do que foi gasto', async () => {
    const agent = new FakeAgent({
      onPrompt: (a) => {
        a.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Ler README.md', kind: 'read' });
        return { stopReason: 'end_turn', usage: { inputTokens: 70000, outputTokens: 800, totalTokens: 70800 } };
      },
    });
    const { ended, lines } = run(agent, {}, acpAgent('codex-acp')!);
    const { report } = await ended;
    expect(report.measure).toBe('partial');
    expect(report.consumption).toBeNull();
    expect(lines).toContain(
      'O Codex informa só o último pedido ao modelo; o board não grava esses tokens para não mostrar menos do que foi gasto.',
    );
  });

  it('modo recusado não derruba a execução: o board segue respondendo as permissões', async () => {
    const agent = new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) });
    const original = agent.spawn;
    agent.spawn = (command, cwd, out) => {
      const proc = original(command, cwd, out);
      const write = proc.write;
      // o agente responde o set_mode com erro
      proc.write = (text) => {
        const msg = JSON.parse(text);
        if (msg.method === 'session/set_mode') return agent.send({ id: msg.id, error: { code: -32602, message: 'modo inválido' } });
        write(text);
      };
      return proc;
    };
    const { ended, lines } = run(agent, { permission: 'full' });
    expect((await ended).code).toBe(0);
    expect(lines).toContain('Modo yolo recusado: modo inválido');
  });
});

describe('login por chave de API pelo ACP (história 7)', () => {
  const KEY = 'AIzaSy-chave-de-teste-123456';
  const auth = { methodId: 'gemini-api-key', apiKey: KEY };

  /** Como `run`, com a chave do cofre no `authenticate`. */
  function runWithKey(agent: FakeAgent, withAuth: typeof auth | null = auth) {
    const lines: string[] = [];
    const measured = spawnAcp(gemini, { prompt: 'Trabalhe o card #12', permission: 'board', boardServer: BOARD }, dir, {
      spawn: agent.spawn,
      log: (l) => lines.push(l),
      graceMs: 10,
      homeDir: home,
      ...(withAuth ? { auth: withAuth } : {}),
    });
    const ended = new Promise<{ code: number | null; error?: Error }>((resolve) =>
      measured.proc.onExit((code, error) => resolve({ code, error })),
    );
    return { lines, ended };
  }

  it('o Gemini do catálogo entra pelo método gemini-api-key, lido do pacote 0.65.0', () => {
    expect(gemini.apiKeyAuth).toEqual({ methodId: 'gemini-api-key' });
    // simetria: nenhum outro agente do catálogo recebe chave pelo protocolo nesta história
    expect(ACP_AGENTS.filter((a) => a.apiKeyAuth).map((a) => a.id)).toEqual(['gemini']);
  });

  it('authenticate com _meta["api-key"] logo depois do initialize, e a chave nunca no canal', async () => {
    const agent = new FakeAgent({ initialize: () => GEMINI_INITIALIZE, onPrompt: () => ({ stopReason: 'end_turn' }) });
    const { lines, ended } = runWithKey(agent);
    expect((await ended).code).toBe(0);
    expect(agent.methods()).toEqual(['initialize', 'authenticate', 'session/new', 'session/prompt']);
    const sent = agent.received.find((m) => m.method === 'authenticate')!;
    expect(sent.params).toEqual({ methodId: 'gemini-api-key', _meta: { 'api-key': KEY } });
    expect(agent.apiKey).toBe(KEY);
    expect(lines).toContain('Login no Gemini CLI pela chave de API do cofre do board.');
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('sem chave no cofre, nada de authenticate: vale o login que o agente já tiver, como antes', async () => {
    const agent = new FakeAgent({ initialize: () => GEMINI_INITIALIZE, onPrompt: () => ({ stopReason: 'end_turn' }) });
    const { ended } = runWithKey(agent, null);
    expect((await ended).code).toBe(0);
    expect(agent.methods()).toEqual(['initialize', 'session/new', 'session/prompt']);
  });

  it('versão que não anuncia o método: a chave não é entregue e a execução segue com o login do agente', async () => {
    const agent = new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) });
    const { lines, ended } = runWithKey(agent);
    expect((await ended).code).toBe(0);
    expect(agent.methods()).not.toContain('authenticate');
    expect(agent.stdin()).not.toContain(KEY);
    expect(lines).toContain('Gemini CLI não oferece o login por chave pelo ACP; segue com o login dele.');
  });

  it('chave recusada: a execução para no login, com o caminho do Conectar e sem a chave na mensagem', async () => {
    const agent = new FakeAgent({
      initialize: () => GEMINI_INITIALIZE,
      authenticate: () => ({ error: { code: -32000, message: 'API key not valid. Please pass a valid API key.' } }),
    });
    const { lines, ended } = runWithKey(agent);
    const end = await ended;
    expect(end.code).toBe(1);
    expect(agent.methods()).toEqual(['initialize', 'authenticate']);
    expect(end.error?.message).toMatch(/Conectar agentes/);
    expect([...lines, end.error?.message].join('\n')).not.toContain(KEY);
  });

  it('o driver gemini/acp leva a chave do contexto do gateway ao authenticate', async () => {
    const agent = new FakeAgent({ initialize: () => GEMINI_INITIALIZE, onPrompt: () => ({ stopReason: 'end_turn' }) });
    const lines: string[] = [];
    const measured = driverFor('gemini', 'acp')!.run(
      { prompt: 'Trabalhe o card', permission: 'board' },
      {
        profile: { ...BUILTIN_PROFILES.find((p) => p.id === 'gemini')!, enabled: true },
        cwd: dir,
        spawn: () => {
          throw new Error('o Gemini pelo ACP não usa o spawn da CLI');
        },
        spawnAcp: agent.spawn,
        log: (l) => lines.push(l),
        runId: 'r1',
        apiKey: KEY,
      },
    );
    await new Promise((resolve) => measured.proc.onExit(resolve));
    expect(agent.received.find((m) => m.method === 'authenticate')?.params._meta['api-key']).toBe(KEY);
  });

  it('a leitura de modelos e a sondagem de login autenticam antes do session/new', async () => {
    const models = new FakeAgent({
      initialize: () => GEMINI_INITIALIZE,
      sessionNew: () => ({
        sessionId: 's',
        models: { currentModelId: 'gemini-2.5-pro', availableModels: [{ modelId: 'gemini-2.5-pro' }] },
      }),
    });
    const found = await acpSessionModels(gemini, 'gemini', dir, { spawn: models.spawn, executable: '/bin/gemini', auth });
    expect(models.methods()).toEqual(['initialize', 'authenticate', 'session/new']);
    expect(found.options.map((o) => o.model)).toEqual(['gemini-2.5-pro']);

    const signIn = new FakeAgent({ initialize: () => GEMINI_INITIALIZE });
    await acpSignIn(gemini, auth, { spawn: signIn.spawn, executable: '/bin/gemini', cwd: dir });
    // o login não abre sessão nem pede trabalho: não gasta a conta
    expect(signIn.methods()).toEqual(['initialize', 'authenticate']);
  });

  it('sondagem de login: a recusa e a versão sem o método viram o motivo, sem a chave', async () => {
    const refused = new FakeAgent({
      initialize: () => GEMINI_INITIALIZE,
      authenticate: () => ({ error: { code: -32000, message: 'API key not valid. Please pass a valid API key.' } }),
    });
    await expect(acpSignIn(gemini, auth, { spawn: refused.spawn, executable: '/bin/gemini', cwd: dir })).rejects.toThrow(
      'Gemini CLI recusou a chave de API: API key not valid. Please pass a valid API key.',
    );
    const old = new FakeAgent();
    await expect(acpSignIn(gemini, auth, { spawn: old.spawn, executable: '/bin/gemini', cwd: dir })).rejects.toThrow(
      /não oferece o login por chave de API pelo ACP \(gemini-api-key\)/,
    );
    expect(old.stdin()).not.toContain(KEY);
  });
});
