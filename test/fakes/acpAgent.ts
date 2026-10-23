// Compartilhado pelo teste do transporte (acpTransport) e pelos cenários de ponta a ponta
// (test/scenarios), que trocam só esta ponta do caminho do card.
import { spawn as spawnChild } from 'node:child_process';
import type { AcpSpawnFn } from '../../src/extension/ai/acp/provider';

export type Msg = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: any; result?: any; error?: any };

/**
 * Um agente ACP falso, dentro do processo: recebe as linhas que o board escreve no `stdin` e responde
 * pelo `out`, como o agente de verdade faria pelo `stdout`. `onPrompt` roteiriza o turno.
 */
export class FakeAgent {
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
  /** a chave que o board entregou no `authenticate` (o Gemini guarda só na memória do processo) */
  apiKey: string | null = null;

  constructor(
    private script: {
      initialize?: (params: any) => any;
      /** a resposta do `authenticate`; `{ error }` recusa. Sem roteiro, aceita qualquer chave */
      authenticate?: (params: any) => any;
      sessionNew?: (params: any) => Promise<any> | any;
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

  /**
   * Responde o `session/prompt` com um erro JSON-RPC, como o Gemini CLI 0.65.0 faz quando o turno falha
   * (`RequestError(status, mensagem).toResult()`: o status HTTP no `code`, 429 na cota).
   */
  rejectPrompt(error: { code: number; message: string; data?: unknown }): void {
    this.send({ id: this.promptId, error });
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

  /** Tudo o que o board escreveu no `stdin` deste processo, como texto (para conferir onde a chave foi). */
  stdin = () => this.received.map((m) => JSON.stringify(m)).join('\n');

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
      case 'authenticate': {
        const result = this.script.authenticate?.(msg.params) ?? {};
        if (result.error) return this.send({ id: msg.id, error: result.error });
        this.apiKey = msg.params?._meta?.['api-key'] ?? null;
        return this.send({ id: msg.id, result });
      }
      case 'session/new': {
        const result = (await this.script.sessionNew?.(msg.params)) ?? {
          sessionId: 'sess-1',
          modes: { currentModeId: 'default', availableModes: [{ id: 'default' }, { id: 'autoEdit' }, { id: 'yolo' }] },
        };
        if (result.error) return this.send({ id: msg.id, error: result.error });
        return this.send({ id: msg.id, result });
      }
      case 'session/set_mode':
        return this.send({ id: msg.id, result: {} });
      case 'session/set_config_option':
        return this.send({ id: msg.id, result: { configOptions: [] } });
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

/**
 * O `initialize` do Gemini CLI 0.65.0 (lido no pacote instalado, `GeminiAgent.initialize`): os quatro métodos
 * de login, o de chave com o `_meta` que diz que ela vai em `_meta["api-key"]` do `authenticate`.
 */
export const GEMINI_INITIALIZE = {
  protocolVersion: 1,
  agentInfo: { name: 'gemini-cli', title: 'Gemini CLI', version: '0.65.0' },
  agentCapabilities: { loadSession: true, mcpCapabilities: { http: true, sse: true } },
  authMethods: [
    { id: 'oauth-personal', name: 'Log in with Google', description: 'Log in with your Google account' },
    {
      id: 'gemini-api-key',
      name: 'Gemini API key',
      description: 'Use an API key with Gemini Developer API',
      _meta: { 'api-key': { provider: 'google' } },
    },
    { id: 'vertex-ai', name: 'Vertex AI', description: 'Use an API key with Vertex AI GenAI API' },
    {
      id: 'gateway',
      name: 'AI API Gateway',
      description: 'Use a custom AI API Gateway',
      _meta: { gateway: { protocol: 'google', restartRequired: 'false' } },
    },
  ],
};

/** Inicia um servidor MCP stdio e manda o `initialize`, como o agente faz com os servidores do `session/new`. */
function mcpInitialize(server: { command: string; args: string[] }): Promise<void> {
  return new Promise((resolve) => {
    const child = spawnChild(server.command, server.args, { stdio: ['pipe', 'pipe', 'ignore'] });
    child.stdout.once('data', () => child.stdin.end());
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
  });
}

/**
 * Uma fábrica de processos do Gemini CLI falso, um `FakeAgent` por processo. Como o de verdade (0.65.0), cada
 * processo guarda a chave do `authenticate` só na memória: sem a chave aceita, o `session/new` recusa com
 * `-32000`. A sessão anuncia os modelos na forma anterior do protocolo (`models.availableModels`).
 */
export class FakeGemini {
  processes: FakeAgent[] = [];
  constructor(
    private options: {
      /** a chave que o agente aceita; outra é recusada no `authenticate` */
      validKey: string;
      onPrompt?: (agent: FakeAgent, params: any) => Promise<any> | any;
      models?: { modelId: string; name: string }[];
    },
  ) {}

  spawn: AcpSpawnFn = (command, cwd, out) => {
    const models = this.options.models ?? [
      { modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ];
    const agent: FakeAgent = new FakeAgent({
      initialize: () => GEMINI_INITIALIZE,
      authenticate: (params) =>
        params?._meta?.['api-key'] === this.options.validKey
          ? {}
          : { error: { code: -32000, message: 'API key not valid. Please pass a valid API key.' } },
      sessionNew: async (params) => {
        if (agent.apiKey !== this.options.validKey)
          return { error: { code: -32000, message: 'Gemini API key is missing or not configured.' } };
        // o servidor MCP de teste do verificador (`allowed`): o agente de verdade o inicia e manda o
        // `initialize`, e é isso que a sondagem observa. Os do card (o do board) não rodam no teste
        for (const server of (params?.mcpServers ?? []).filter((s: any) => s.name === 'allowed')) await mcpInitialize(server);
        return {
          sessionId: `sess-${this.processes.indexOf(agent)}`,
          modes: { currentModeId: 'default', availableModes: [{ id: 'default' }, { id: 'autoEdit' }, { id: 'yolo' }] },
          models: { currentModelId: models[0]!.modelId, availableModels: models },
        };
      },
      onPrompt: this.options.onPrompt,
    });
    this.processes.push(agent);
    return agent.spawn(command, cwd, out);
  };

  /** Os métodos de cada processo, na ordem em que abriram. */
  methods = () => this.processes.map((p) => p.methods());
}
