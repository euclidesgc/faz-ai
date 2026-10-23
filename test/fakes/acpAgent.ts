// Compartilhado pelo teste do transporte (acpTransport) e pelos cenários de ponta a ponta
// (test/scenarios), que trocam só esta ponta do caminho do card.
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
