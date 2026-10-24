// A sessão de teste da tela de Conectar agentes: conversa com o agente pelo SDK oficial do ACP para ver, em tempo
// real, o que ele responde, as ferramentas que chama, os pedidos de permissão e as opções da sessão (modelo, modo,
// esforço). Abre quando a pessoa pede e fecha sozinha depois de um tempo parada: nenhum processo fica esquecido
// aberto, e a conexão do board com o agente (a que roda os cards) não depende dela.
//
// Nada aqui grava no banco nem no log de uso: o teste fica fora do caminho de execução dos cards.
import { randomUUID } from 'node:crypto';
import * as acp from '@agentclientprotocol/sdk';
import {
  TEST_IDLE,
  type AgentAccountInfo,
  type AgentLaunch,
  type ProtocolLogEntry,
  type TestConnection,
  type TestEvent,
  type TestState,
} from '../../shared/agentConnect';
import {
  capabilityLabels,
  configOptionsOf,
  errorText,
  isAuthRequired,
  openAgent,
  parseAuthMethods,
  toTestEvent,
  type AgentSpawn,
  type OpenedAgent,
} from './protocol';

/** Quanto a sessão de teste fica aberta sem uso antes de fechar sozinha. */
export const TEST_IDLE_MS = 10 * 60 * 1000;

export interface TestSink {
  event(e: TestEvent): void;
  state(s: TestState): void;
  /** cada mensagem JSON-RPC e cada fato do processo, para o log do protocolo */
  log?(entry: ProtocolLogEntry): void;
}

export class TestSession {
  private agent: OpenedAgent | null = null;
  private session: acp.ActiveSession | null = null;
  private current: TestState = TEST_IDLE;
  private permissions = new Map<string, (optionId: string | null) => void>();
  /** o agente e a pasta da sessão aberta, para abrir de novo (depois do login, por exemplo) */
  private opened: { key: string; launch: AgentLaunch; cwd: string; auth?: { methodId: string; apiKey: string } } | null = null;
  /** a sessão foi fechada de propósito: a saída do processo não é erro */
  private closing = false;
  /** a última conta que o agente informou: o aviso pode chegar antes de a conexão estar montada */
  private account: AgentAccountInfo | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  /** a abertura em curso: os avisos de um processo anterior (saída, stderr) não mexem na sessão nova */
  private generation = 0;

  constructor(
    private sink: TestSink,
    private spawn: AgentSpawn,
    private idleMs: number = TEST_IDLE_MS,
  ) {}

  get state(): TestState {
    return this.current;
  }

  private setState(patch: Partial<TestState>): void {
    this.current = { ...this.current, ...patch };
    this.sink.state(this.current);
    this.armIdle();
  }

  /**
   * O relógio da inatividade: corre enquanto a sessão está aberta e parada; para durante uma resposta (o agente
   * pode trabalhar mais que o prazo) e com a sessão fechada.
   */
  private armIdle(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    const phase = this.current.phase;
    if (phase === 'idle' || phase === 'prompting' || phase === 'connecting' || !this.agent) return;
    this.idle = setTimeout(() => {
      const minutes = Math.round(this.idleMs / 60_000);
      this.close(`A sessão de teste fechou depois de ${minutes} min sem uso. Abra de novo para continuar.`);
    }, this.idleMs);
    this.idle.unref?.();
  }

  /** Inicia o agente e abre uma sessão na pasta. Uma sessão anterior (deste ou de outro agente) fecha antes. */
  async open(key: string, launch: AgentLaunch, cwd: string, auth?: { methodId: string; apiKey: string }): Promise<void> {
    this.release('outra sessão de teste começou');
    this.closing = false;
    this.account = null;
    this.opened = { key, launch, cwd, ...(auth ? { auth } : {}) };
    const generation = ++this.generation;
    const current = () => this.generation === generation;
    this.setState({ phase: 'connecting', connection: null, error: null });
    try {
      const agent = await openAgent(launch, cwd, this.spawn, {
        log: (entry) => this.sink.log?.(entry),
        account: (info) => current() && this.setAccount(info),
        permission: (params, signal) => this.askPermission(params, signal),
        stderr: (text) => current() && this.sink.event({ kind: 'stderr', text }),
        exit: (code) => {
          if (!current()) return;
          this.sink.event({ kind: 'exit', code });
          // a saída antes do `initialize` já virou o erro da abertura
          if (!this.agent) return;
          this.agent = null;
          this.dropSession();
          if (this.closing) this.setState({ ...TEST_IDLE });
          else this.setState({ phase: 'error', error: `O agente saiu (código ${code ?? '?'}).` });
        },
      });
      if (!current()) {
        // outra abertura (ou o fechamento) passou na frente enquanto este agente iniciava
        agent.conn.close();
        agent.close('a sessão de teste mudou');
        return;
      }
      this.agent = agent;
      const init = agent.init;
      // a chave do cofre, como na execução: o agente que entra por chave (o Gemini) recebe no `authenticate`
      if (auth && init.authMethods?.some((m) => m.id === auth.methodId))
        await agent.conn.agent.request(acp.methods.agent.authenticate, { methodId: auth.methodId, _meta: { 'api-key': auth.apiKey } });
      const connection: TestConnection = {
        key,
        agent: launch,
        cwd,
        protocolVersion: init.protocolVersion,
        agentInfo: init.agentInfo ? { name: init.agentInfo.name, version: init.agentInfo.version } : null,
        capabilities: capabilityLabels(init.agentCapabilities),
        authMethods: parseAuthMethods(init.authMethods, launch).map((m) => m.method),
        canLogout: !!init.agentCapabilities?.auth?.logout,
        sessionId: null,
        modes: [],
        currentModeId: null,
        configOptions: [],
        account: this.account,
      };
      this.setState({ connection });
      await this.openSession();
    } catch (e) {
      if (current()) this.fail(e);
    }
  }

  /** Fecha e abre de novo o mesmo agente: depois de entrar na conta, o agente precisa reler o login. */
  async reopen(): Promise<void> {
    const opened = this.opened;
    if (!opened) throw new Error('Nenhuma sessão de teste para abrir de novo.');
    await this.open(opened.key, opened.launch, opened.cwd, opened.auth);
  }

  private setAccount(account: AgentAccountInfo): void {
    this.account = account;
    if (this.current.connection) this.setState({ connection: { ...this.current.connection, account } });
  }

  private async openSession(): Promise<void> {
    const agent = this.agent!;
    try {
      const session = await agent.conn.agent.buildSession(this.current.connection!.cwd).start();
      this.session = session;
      this.setState({
        phase: 'connected',
        connection: {
          ...this.current.connection!,
          sessionId: session.sessionId,
          modes: (session.modes?.availableModes ?? []).map((m) => ({ id: m.id, name: m.name })),
          currentModeId: session.modes?.currentModeId ?? null,
          configOptions: configOptionsOf(session.newSessionResponse.configOptions),
        },
      });
      void this.pump(session);
    } catch (e) {
      if (isAuthRequired(e)) {
        this.setState({ phase: 'needs-auth', error: 'O agente pediu login antes de abrir a sessão.' });
        return;
      }
      throw e;
    }
  }

  /** Lê os avisos da sessão enquanto ela existir: entre um prompt e outro também chegam (comandos, modo). */
  private async pump(session: acp.ActiveSession): Promise<void> {
    try {
      while (this.session === session) {
        const msg = await session.nextUpdate();
        if (this.session !== session) return;
        if (msg.kind === 'stop') {
          this.sink.event({ kind: 'end', stopReason: msg.stopReason });
          this.setState({ phase: 'connected' });
          continue;
        }
        if (msg.update.sessionUpdate === 'config_option_update') this.updateConfig(msg.update.configOptions);
        const ev = toTestEvent(msg.update);
        if (ev) this.sink.event(ev);
        if (ev?.kind === 'mode' && this.current.connection) {
          this.setState({ connection: { ...this.current.connection, currentModeId: ev.modeId } });
        }
      }
    } catch {
      /* a conexão fechou: a saída do processo já avisou a tela */
    }
  }

  /** Manda o prompt de teste; a resposta chega pelos eventos, e o fim do turno, pelo `end`. */
  prompt(text: string): void {
    const session = this.session;
    if (!session) throw new Error('Nenhuma sessão de teste aberta.');
    if (this.current.phase === 'prompting') throw new Error('O agente ainda está respondendo.');
    this.sink.event({ kind: 'prompt', text });
    this.setState({ phase: 'prompting' });
    session.prompt(text).catch((e: unknown) => {
      this.sink.event({ kind: 'error', message: errorText(e) });
      if (this.session !== session) return;
      // o adaptador do Claude abre a sessão sem login e só recusa no prompt: a tela passa a pedir o login
      if (isAuthRequired(e)) this.setState({ phase: 'needs-auth', error: 'O agente pediu login para responder.' });
      else this.setState({ phase: 'connected' });
    });
  }

  /** `session/cancel`: o agente encerra o turno com `cancelled`; as permissões em aberto também. */
  cancel(): void {
    const session = this.session;
    if (!session || !this.agent) return;
    for (const resolve of this.permissions.values()) resolve(null);
    this.permissions.clear();
    void this.agent.conn.agent.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId }).catch(() => {});
  }

  async setMode(modeId: string): Promise<void> {
    const session = this.session;
    if (!session || !this.agent) throw new Error('Nenhuma sessão de teste aberta.');
    await this.agent.conn.agent.request(acp.methods.agent.session.setMode, { sessionId: session.sessionId, modeId });
    if (this.current.connection) this.setState({ connection: { ...this.current.connection, currentModeId: modeId } });
  }

  /** Muda uma opção da sessão (modelo, esforço, modo…); o agente devolve a lista inteira já atualizada. */
  async setConfigOption(configId: string, value: string | boolean): Promise<void> {
    const session = this.session;
    if (!session || !this.agent) throw new Error('Nenhuma sessão de teste aberta.');
    const res = await this.agent.conn.agent.request(
      acp.methods.agent.session.setConfigOption,
      typeof value === 'boolean'
        ? { sessionId: session.sessionId, configId, type: 'boolean', value }
        : { sessionId: session.sessionId, configId, value },
    );
    this.updateConfig(res.configOptions);
  }

  private updateConfig(options: acp.SessionConfigOption[]): void {
    const connection = this.current.connection;
    if (!connection) return;
    const configOptions = configOptionsOf(options);
    // o modo também vive no estado antigo (`modes`): os dois ficam iguais
    const mode = configOptions.find((o) => o.category === 'mode' && o.type === 'select');
    this.setState({
      connection: { ...connection, configOptions, ...(mode && connection.modes.length ? { currentModeId: String(mode.current) } : {}) },
    });
  }

  /** A resposta da tela a um pedido de permissão; null recusa (cancela) o pedido. */
  answerPermission(permissionId: string, optionId: string | null): void {
    const resolve = this.permissions.get(permissionId);
    if (!resolve) return;
    this.permissions.delete(permissionId);
    resolve(optionId);
  }

  private askPermission(params: acp.RequestPermissionRequest, signal: AbortSignal): Promise<acp.RequestPermissionResponse> {
    const permissionId = randomUUID();
    this.sink.event({
      kind: 'permission',
      permissionId,
      title: params.toolCall.title ?? params.toolCall.toolCallId,
      options: params.options.map((o) => ({ optionId: o.optionId, name: o.name, kind: o.kind })),
    });
    return new Promise((resolve) => {
      const done = (optionId: string | null) => {
        signal.removeEventListener('abort', onAbort);
        const option = params.options.find((o) => o.optionId === optionId);
        this.sink.event({ kind: 'permission-answer', permissionId, choice: option?.name ?? 'Cancelado' });
        resolve({ outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } });
      };
      const onAbort = () => {
        this.permissions.delete(permissionId);
        done(null);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      this.permissions.set(permissionId, done);
    });
  }

  private fail(e: unknown): void {
    const message = errorText(e);
    this.sink.event({ kind: 'error', message });
    this.setState({ phase: 'error', error: message });
  }

  private dropSession(): void {
    for (const resolve of this.permissions.values()) resolve(null);
    this.permissions.clear();
    this.session?.dispose();
    this.session = null;
  }

  /** Encerra o processo sem mexer no estado da tela (quem chama decide o que mostrar). */
  private release(why: string): void {
    this.generation++;
    const agent = this.agent;
    if (!agent) return;
    this.closing = true;
    this.agent = null;
    this.dropSession();
    agent.conn.close();
    agent.close(why);
  }

  /** Fecha a sessão e o processo do agente; `reason` aparece na conversa (o fechamento por inatividade, por exemplo). */
  close(reason?: string): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    const had = !!this.agent || this.current.phase !== 'idle';
    this.release(reason ? 'a sessão de teste fechou sozinha' : 'sessão de teste fechada pela tela');
    if (had) this.sink.event({ kind: 'closed', reason: reason ?? 'Sessão de teste encerrada.' });
    if (had) this.setState({ ...TEST_IDLE });
  }
}
