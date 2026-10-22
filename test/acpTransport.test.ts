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
import type { AcpAgent, AcpSpawnFn } from '../src/extension/ai/acp/provider';
import { acpMcpServers, spawnAcp } from '../src/extension/ai/acp/run';
import type { HeadlessInput } from '../src/extension/ai/provider';
import type { RunReport } from '../src/shared/log';

type Msg = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: any; result?: any; error?: any };

/**
 * Um agente ACP falso, dentro do processo: recebe as linhas que o board escreve no `stdin` e responde
 * pelo `out`, como o agente de verdade faria pelo `stdout`. `onPrompt` roteiriza o turno.
 */
class FakeAgent {
  received: Msg[] = [];
  exitCode: number | null = null;
  killed = false;
  ended = false;
  private out!: (text: string, stream: 'stdout' | 'stderr') => void;
  private exit: (code: number | null, error?: Error) => void = () => {};
  private buffer = '';
  private nextId = 100;
  private waiting = new Map<number, (result: any) => void>();
  private promptId: number | string | undefined;
  command: { command: string; args: string[] } | null = null;

  constructor(
    private script: {
      initialize?: (params: any) => any;
      sessionNew?: (params: any) => any;
      onPrompt?: (agent: FakeAgent, params: any) => Promise<any> | any;
      onCancel?: (agent: FakeAgent) => void;
    } = {},
  ) {}

  spawn: AcpSpawnFn = (command, _cwd, out) => {
    this.command = command;
    this.out = out;
    return {
      write: (text) => this.onStdin(text),
      end: () => {
        this.ended = true;
        this.terminate(0);
      },
      kill: () => {
        this.killed = true;
        this.terminate(143);
      },
      onExit: (fn) => (this.exit = fn),
    };
  };

  send(msg: Omit<Msg, 'jsonrpc'>): void {
    // partido em dois pedaços, como o pipe faz com as linhas grandes
    const line = `${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`;
    this.out(line.slice(0, 7), 'stdout');
    this.out(line.slice(7), 'stdout');
  }

  update(update: any): void {
    this.send({ method: 'session/update', params: { sessionId: 'sess-1', update } });
  }

  /** Pede permissão ao board e devolve a resposta. */
  ask(toolCall: any, kinds = ['allow_once', 'allow_always', 'reject_once']): Promise<any> {
    const id = this.nextId++;
    this.send({
      id,
      method: 'session/request_permission',
      params: { sessionId: 'sess-1', toolCall, options: kinds.map((kind) => ({ optionId: `opt-${kind}`, name: kind, kind })) },
    });
    return new Promise((resolve) => this.waiting.set(id, resolve));
  }

  respondPrompt(result: any): void {
    this.send({ id: this.promptId, result });
  }

  stderr(text: string): void {
    this.out(text, 'stderr');
  }

  terminate(code: number | null, error?: Error): void {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    this.exit(code, error);
  }

  methods = () => this.received.filter((m) => m.method).map((m) => m.method);

  private onStdin(text: string): void {
    this.buffer += text;
    let at: number;
    while ((at = this.buffer.indexOf('\n')) >= 0) {
      const msg = JSON.parse(this.buffer.slice(0, at)) as Msg;
      this.buffer = this.buffer.slice(at + 1);
      this.received.push(msg);
      void this.handle(msg);
    }
  }

  private async handle(msg: Msg): Promise<void> {
    // resposta do board a um pedido nosso (permissão)
    if (!msg.method && typeof msg.id === 'number') return this.waiting.get(msg.id)?.(msg.result);
    switch (msg.method) {
      case 'initialize':
        return this.send({
          id: msg.id,
          result: this.script.initialize?.(msg.params) ?? {
            protocolVersion: 1,
            agentCapabilities: { loadSession: true, mcpCapabilities: { http: false, sse: false } },
            authMethods: [],
          },
        });
      case 'session/new': {
        const result = this.script.sessionNew?.(msg.params) ?? {
          sessionId: 'sess-1',
          modes: { currentModeId: 'default', availableModes: [{ id: 'default' }, { id: 'autoEdit' }, { id: 'yolo' }] },
        };
        if (result.error) return this.send({ id: msg.id, error: result.error });
        return this.send({ id: msg.id, result });
      }
      case 'session/set_mode':
        return this.send({ id: msg.id, result: {} });
      case 'session/prompt': {
        this.promptId = msg.id;
        const result = await this.script.onPrompt?.(this, msg.params);
        if (result) this.respondPrompt(result);
        return;
      }
      case 'session/cancel':
        return this.script.onCancel?.(this);
    }
  }
}

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
  const board = { toolCallId: 't1', title: 'get_card (faz-ai MCP Server)', kind: 'other', status: 'pending' };
  agent.update({ sessionUpdate: 'tool_call', ...board });
  const boardAnswer = await agent.ask(board);
  agent.update({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });
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

    expect(agent.command).toEqual({ command: 'gemini', args: ['--acp'] });
    expect(agent.methods()).toEqual(['initialize', 'session/new', 'session/prompt']);
    const init = agent.received.find((m) => m.method === 'initialize')!.params;
    // o board não empresta o editor: sem fs nem terminal, cada escrita passa pela permissão
    expect(init).toMatchObject({
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
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
      'Chamando Gemini CLI (ACP): gemini --acp',
      'Sessão ACP aberta com faz-ai.',
      'Lendo o card.',
      'Vou ',
      '→ faz-ai/get_card: get_card (faz-ai MCP Server)',
      'Gemini CLI pediu permissão para faz-ai/get_card: permitido pelo board (nível board).',
      '→ edit: Editar src/app.ts',
      'Gemini CLI pediu permissão para Editar src/app.ts: negado pelo board (nível board).',
      'mover o card.',
      'Pronto',
    ]);
    expect(end.code).toBe(0);
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
    expect(lines).toContain('Gemini CLI pede login. Rode `gemini` no terminal uma vez e entre com a sua conta.');
    expect(end.error?.message).toMatch(/pede login/);
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
      gemini: 'gemini --acp',
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
    expect(agent.command!.args).toEqual(['--acp', '--model', 'gemini-3-pro']);
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
