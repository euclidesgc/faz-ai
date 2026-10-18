// O protótipo do transporte ACP (spike): um agente falso que fala o Agent Client Protocol pelo
// `stdin`/`stdout` e o provider do Gemini CLI. Mostra o que o board ganha e o que sobra de medição:
// pedido, eventos, permissão respondida pelo board, servidor MCP do board no `session/new` (sem
// arquivo no projeto), Parar pelo `session/cancel` e o `RunReport` que o gateway gravaria.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { geminiAcpProvider } from '../src/extension/ai/acp/gemini';
import type { AcpSpawnFn } from '../src/extension/ai/acp/provider';
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

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-acp-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Roda até o fim e devolve o que o gateway receberia: código, erro, relatório e as linhas do canal. */
function run(agent: FakeAgent, input: Partial<HeadlessInput> = {}) {
  const lines: string[] = [];
  const measured = spawnAcp(geminiAcpProvider, { prompt: 'Trabalhe o card #12', permission: 'board', boardServer: BOARD, ...input }, dir, {
    spawn: agent.spawn,
    log: (l) => lines.push(l),
    graceMs: 10,
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

describe('transporte ACP (protótipo, Gemini CLI)', () => {
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
        inputTokens: 1200,
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
