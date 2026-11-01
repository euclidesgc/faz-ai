// O serviço da tela de Conectar agentes no host do board: a lista do registro (em cache), se cada agente está
// instalado, a conta de cada um (verificação curta), o login (no terminal, que avisa quando termina, ou pelo
// próprio agente) e o logout. As telas abertas (o editor e o navegador) recebem as mudanças pelos avisos.
//
// "Conectado" é o que o board guarda do Conectar (`connections`, o perfil ligado com os modelos): nada aqui deixa
// processo aberto. O processo do agente só vive durante uma verificação, um login, a sessão de teste ou uma
// execução de card.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ACCOUNT_UNCHECKED,
  registryIdOf,
  type AgentAccount,
  type AgentLaunch,
  type ProtocolLogEntry,
  type RegistryAgent,
  type RegistryListing,
} from '../../shared/agentConnect';
import { isAcpProfile, isGeminiCli, isReadyProfile, type AiProfile } from '../../shared/aiProfiles';
import type { ConnectState } from '../../shared/connect';
import { resolveCommand, resolveProfileCommand } from '../cliResolve';
import { acpAgent } from '../ai/acp/agents';
import type { AcpAuth } from '../ai/acp/provider';
import { acpAccount, acpLogin, acpLogout, cliAccount, cliLogout, isCliAccountTool, type AccountCheck } from './account';
import { commandLine, errorText, type AgentSpawn, type TerminalInvocation } from './protocol';
import { ProtocolLogFile } from './protocolLog';
import { RegistryCache, type ResolveFn } from './registry';
import { agentSpawn } from './host';

/** Um processo de login num terminal do editor, à vista da pessoa; o board espera ele terminar. */
export interface TerminalSpec {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
}

export interface AgentConnectDeps {
  /** pasta de dados do Faz AI: a cópia do registro fica nela */
  storageDir: string;
  /** pasta do log do protocolo (a do rastreio do board); null não grava arquivo */
  logDir: string | null;
  homeDir: string;
  /** o PATH do terminal; `fresh` relê (a pessoa instalou algo com o board aberto) */
  pathEnv(fresh?: boolean): Promise<string | undefined>;
  /** os perfis como a tela os vê */
  profiles(): readonly AiProfile[];
  /** o perfil com a configuração privada (o comando e o ambiente de uma cópia) */
  privateProfile(id: string): AiProfile;
  /** a chave do cofre para o agente que entra por chave (o Gemini), no formato do `authenticate` */
  acpAuth(profile: AiProfile): AcpAuth | undefined;
  /** a chave da ferramenta está no cofre */
  hasApiKey(tool: string): boolean;
  /** abre o login num terminal do editor e devolve o código de saída; ausente fora do editor */
  runTerminal?(spec: TerminalSpec): Promise<number | null>;
  /** o Conectar do perfil, como o board guarda */
  connection(profileId: string): ConnectState | undefined;
  /** retoma o Conectar do perfil (depois do login que faltava) */
  resumeConnect(profileId: string): Promise<void>;
  log(line: string): void;
  spawn?: AgentSpawn;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/** O que muda e as telas precisam saber: a conta de um agente ou uma linha do log do protocolo. */
export type AgentConnectNotice = { type: 'account'; key: string; account: AgentAccount } | { type: 'log'; entry: ProtocolLogEntry };

/** Como o board fala com o agente para saber da conta. */
type Target =
  | { kind: 'cli'; name: string; tool: 'claude' | 'cursor' | 'kimi'; executable: string; env?: Record<string, string> }
  | { kind: 'acp'; name: string; launch: AgentLaunch; auth?: AcpAuth }
  | { kind: 'api-key'; name: string; tool: string }
  | { kind: 'none'; name: string };

const REGISTRY_PREFIX = 'registry:';

export class AgentConnectService {
  readonly registry: RegistryCache;
  readonly spawn: AgentSpawn;
  private accounts = new Map<string, AgentAccount>();
  /** os logins de terminal que a última verificação de cada agente achou, por método */
  private terminals = new Map<string, Map<string, TerminalInvocation>>();
  private running = new Map<string, Promise<AgentAccount>>();
  private listeners = new Set<(notice: AgentConnectNotice) => void>();
  private logFile: ProtocolLogFile | null;
  /** a última lista do registro, para achar o agente que só existe nele */
  private known: RegistryAgent[] = [];
  private currentPath: string | undefined;

  constructor(private deps: AgentConnectDeps) {
    this.registry = new RegistryCache(path.join(deps.storageDir, 'acp-registry.json'), deps.fetchFn, deps.now);
    this.spawn = deps.spawn ?? agentSpawn(() => this.currentPath);
    this.logFile = deps.logDir ? new ProtocolLogFile(deps.logDir) : null;
  }

  /** Escuta as mudanças; devolve o que desliga a escuta. */
  on(listener: (notice: AgentConnectNotice) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** As contas verificadas até agora, para uma tela que abre. */
  snapshot(): Record<string, AgentAccount> {
    return Object.fromEntries(this.accounts);
  }

  /** O arquivo do log do protocolo de hoje; null sem pasta de dados. */
  logFilePath(): string | null {
    return this.logFile?.file() ?? null;
  }

  /** Uma linha do log do protocolo: vai para o arquivo; `broadcast` também para as telas abertas. */
  writeLog(entry: ProtocolLogEntry, broadcast = true): void {
    this.logFile?.append(entry);
    if (broadcast) this.emit({ type: 'log', entry });
  }

  private emit(notice: AgentConnectNotice): void {
    for (const listener of this.listeners) listener(notice);
  }

  private setAccount(key: string, patch: Partial<AgentAccount>): AgentAccount {
    const account = { ...(this.accounts.get(key) ?? ACCOUNT_UNCHECKED), ...patch };
    this.accounts.set(key, account);
    this.emit({ type: 'account', key, account });
    return account;
  }

  private async resolver(fresh = false): Promise<ResolveFn> {
    this.currentPath = await this.deps.pathEnv(fresh);
    const PATH = this.currentPath;
    return (command) => resolveCommand(command, PATH, this.deps.homeDir);
  }

  /**
   * A lista do registro e quais perfis do board têm a ferramenta instalada (o comando no PATH; o modo API não tem
   * binário). `refresh` baixa o registro de novo e relê o PATH.
   */
  async listing(refresh = false): Promise<{ listing: RegistryListing; installed: Record<string, boolean> }> {
    const resolve = await this.resolver(refresh);
    const listing = await this.registry.listing(resolve, refresh);
    this.known = listing.agents;
    const installed: Record<string, boolean> = {};
    for (const p of this.deps.profiles()) {
      try {
        installed[p.id] = p.mode === 'api' || !!resolveProfileCommand(this.deps.privateProfile(p.id), this.currentPath, this.deps.homeDir);
      } catch {
        // a cópia ou o personalizado desligado: a configuração dele fica no cofre até ser ligado, e sem ela não dá
        // para saber; fica de fora, e a tela não diz que não está instalado
      }
    }
    return { listing, installed };
  }

  /** O agente do registro de uma chave `registry:<id>`, ou o que cobre o perfil. */
  private registryAgent(id: string | null): RegistryAgent | null {
    return id ? (this.known.find((a) => a.id === id) ?? null) : null;
  }

  private async knownRegistry(): Promise<void> {
    if (!this.known.length) await this.listing().catch(() => {});
  }

  /** Como iniciar pelo ACP o agente de uma entrada do registro. */
  private registryLaunch(agent: RegistryAgent): AgentLaunch {
    if (!agent.available) throw new Error(agent.note ?? `${agent.name} não está disponível nesta máquina.`);
    return { id: agent.id, name: agent.name, command: agent.command, args: agent.args, env: agent.env };
  }

  /**
   * Como iniciar pelo ACP o agente de uma chave, para a sessão de teste: o comando que a execução dos cards usa
   * (o agente do catálogo do board, achado no PATH), com a chave do cofre quando ele entra por chave (o Gemini),
   * quando o board o conhece; senão, o do registro (o Claude Code, que roda os cards pela CLI, testa pelo
   * adaptador `claude-agent-acp`).
   */
  async testLaunch(key: string): Promise<{ launch: AgentLaunch; auth?: AcpAuth }> {
    await this.knownRegistry();
    if (key.startsWith(REGISTRY_PREFIX)) {
      const agent = this.registryAgent(key.slice(REGISTRY_PREFIX.length));
      if (!agent) throw new Error('Este agente não está mais no registro do ACP.');
      return { launch: this.registryLaunch(agent) };
    }
    const profile = this.deps.privateProfile(key);
    const own = acpAgent(String(profile.config.acpAgent ?? profile.tool));
    if (own) {
      const command = resolveCommand(own.command, this.currentPath ?? (await this.deps.pathEnv()), this.deps.homeDir);
      if (!command) throw new Error(`${own.label} não está instalado: o comando ${own.command} não está no PATH.`);
      const launch = { id: profile.id, name: profile.name, command, args: [...own.args], env: { ...(profile.config.env ?? {}) } };
      const auth = this.deps.acpAuth(profile);
      return { launch, ...(auth ? { auth } : {}) };
    }
    const agent = this.registryAgent(registryIdOf(profile));
    if (!agent) throw new Error(`${profile.name} não tem modo ACP para a sessão de teste.`);
    return { launch: this.registryLaunch(agent) };
  }

  /** Como falar com o agente de uma chave para saber da conta. */
  private async target(key: string): Promise<Target> {
    if (key.startsWith(REGISTRY_PREFIX)) {
      await this.knownRegistry();
      const agent = this.registryAgent(key.slice(REGISTRY_PREFIX.length));
      if (!agent) throw new Error('Este agente não está mais no registro do ACP.');
      return { kind: 'acp', name: agent.name, launch: this.registryLaunch(agent) };
    }
    const profile = this.deps.privateProfile(key);
    const PATH = this.currentPath ?? (await this.deps.pathEnv());
    // o modo API e o Gemini pela CLI entram pela chave do cofre: não há agente para perguntar
    if (profile.mode === 'api' || isGeminiCli(profile)) return { kind: 'api-key', name: profile.name, tool: profile.tool };
    if (isAcpProfile(profile)) {
      const agent = acpAgent(String(profile.config.acpAgent));
      const command = resolveProfileCommand(profile, PATH, this.deps.homeDir);
      if (!agent) throw new Error(`Agente ACP desconhecido: ${String(profile.config.acpAgent)}.`);
      if (!command) throw new Error(`${agent.label} não está instalado: o comando ${agent.command} não está no PATH.`);
      return {
        kind: 'acp',
        name: profile.name,
        launch: { id: profile.id, name: profile.name, command, args: [...agent.args], env: { ...(profile.config.env ?? {}) } },
        auth: this.deps.acpAuth(profile),
      };
    }
    if (profile.base !== 'generic' && isCliAccountTool(profile.base)) {
      const executable = resolveProfileCommand(profile, PATH, this.deps.homeDir);
      if (!executable) throw new Error(`${profile.name} não está instalado neste computador.`);
      // a cópia roda com o ambiente dela (outra pasta de configuração pode ser outra conta)
      const env = isReadyProfile(profile) ? undefined : profile.config.env;
      return { kind: 'cli', name: profile.name, tool: profile.base, executable, ...(env ? { env } : {}) };
    }
    return { kind: 'none', name: profile.name };
  }

  /** Abre o agente numa pasta descartável, para a verificação não tocar o projeto. */
  private async inScratch<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-agent-'));
    try {
      return await fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /**
   * Verifica a conta do agente: o status da CLI, ou pelo ACP o `initialize` e uma sessão nova sem pedido. Duas
   * verificações do mesmo agente ao mesmo tempo esperam a mesma.
   */
  check(key: string): Promise<AgentAccount> {
    const running = this.running.get(key);
    if (running) return running;
    const work = this.runCheck(key).finally(() => this.running.delete(key));
    this.running.set(key, work);
    return work;
  }

  private async runCheck(key: string): Promise<AgentAccount> {
    this.setAccount(key, { status: 'checking', error: null });
    try {
      const target = await this.target(key);
      const found = await this.checkTarget(target);
      if (found.terminals.size) this.terminals.set(key, found.terminals);
      return this.setAccount(key, { ...found.account, loggingIn: this.accounts.get(key)?.loggingIn ?? null });
    } catch (e) {
      return this.setAccount(key, { status: 'error', error: errorText(e), checkedAt: (this.deps.now ?? Date.now)() });
    }
  }

  private async checkTarget(target: Target): Promise<AccountCheck> {
    const now = this.deps.now ?? Date.now;
    switch (target.kind) {
      case 'cli':
        return cliAccount(target.tool, target.executable, {
          pathEnv: this.currentPath,
          homeDir: this.deps.homeDir,
          ...(target.env ? { env: target.env } : {}),
          now,
        });
      case 'acp':
        return this.inScratch((dir) =>
          acpAccount(target.launch, dir, this.spawn, { auth: target.auth, log: (e) => this.writeLog(e), now }),
        );
      case 'api-key': {
        const has = this.deps.hasApiKey(target.tool);
        return {
          account: {
            ...ACCOUNT_UNCHECKED,
            status: has ? 'signed-in' : 'signed-out',
            methods: [{ id: 'api-key', name: 'Chave de API', description: null, type: 'agent', terminalCommand: null, apiKey: true }],
            checkedAt: now(),
          },
          terminals: new Map(),
        };
      }
      case 'none':
        return { account: { ...ACCOUNT_UNCHECKED, checkedAt: now() }, terminals: new Map() };
    }
  }

  /**
   * Entra na conta pelo método escolhido. O de terminal abre o login num terminal do editor e espera ele fechar
   * (saída 0 é sucesso, como pede o protocolo); o do agente manda `authenticate` e espera a pessoa terminar. Depois,
   * verifica de novo e, se o Conectar do perfil tinha parado por falta de login, retoma.
   */
  async login(key: string, methodId: string, apiKey?: string): Promise<void> {
    if (this.accounts.get(key)?.loggingIn) throw new Error('Já há um login em curso para este agente.');
    const target = await this.target(key);
    // o método vem da última verificação; sem ela, verifica antes: um método de terminal nunca vai ao
    // `authenticate`, como o protocolo manda, e só a verificação sabe qual é de terminal
    const methodOf = () => this.accounts.get(key)?.methods.find((m) => m.id === methodId);
    if (!methodOf()) await this.check(key);
    const method = methodOf();
    const terminal = method?.type === 'terminal' ? this.terminals.get(key)?.get(methodId) : undefined;
    this.setAccount(key, { loggingIn: methodId, error: null });
    try {
      if (terminal) {
        if (!this.deps.runTerminal) throw new Error(`Rode no terminal: ${commandLine(terminal.command, terminal.args)}`);
        const PATH = this.currentPath ?? (await this.deps.pathEnv());
        const code = await this.deps.runTerminal({
          name: `Faz AI: entrar no ${target.name}`,
          command: terminal.command,
          args: terminal.args,
          env: { ...(PATH ? { PATH } : {}), ...terminal.env },
          cwd: this.deps.homeDir,
        });
        // fechar o terminal sem esperar o fim não diz nada: a verificação conta o que aconteceu
        if (code !== null && code !== 0) throw new Error(`O login no terminal terminou com o código ${code}.`);
      } else if (target.kind === 'acp' && method?.type === 'agent') {
        await this.inScratch((dir) => acpLogin(target.launch, dir, this.spawn, methodId, { apiKey, log: (e) => this.writeLog(e) }));
      } else {
        throw new Error('Este agente não tem esse método de login.');
      }
    } catch (e) {
      this.setAccount(key, { loggingIn: null, error: errorText(e) });
      return;
    }
    this.setAccount(key, { loggingIn: null });
    const account = await this.check(key);
    const connection = key.startsWith(REGISTRY_PREFIX) ? undefined : this.deps.connection(key);
    if (account.status === 'signed-in' && connection?.status === 'failed' && connection.step === 'signIn')
      await this.deps.resumeConnect(key).catch((e: unknown) => this.deps.log(`Conectar de ${key} depois do login: ${errorText(e)}`));
  }

  /** Sai da conta do agente (na máquina inteira: o terminal e o editor também saem) e verifica de novo. */
  async logout(key: string): Promise<void> {
    const target = await this.target(key);
    this.setAccount(key, { status: 'checking', error: null });
    try {
      if (target.kind === 'cli') {
        await cliLogout(target.tool, target.executable, {
          pathEnv: this.currentPath,
          homeDir: this.deps.homeDir,
          ...(target.env ? { env: target.env } : {}),
        });
      } else if (target.kind === 'acp') {
        await this.inScratch((dir) => acpLogout(target.launch, dir, this.spawn, (e) => this.writeLog(e)));
      } else {
        throw new Error('Este agente não sai da conta por aqui.');
      }
    } catch (e) {
      this.setAccount(key, { status: 'error', error: errorText(e) });
      return;
    }
    await this.check(key);
  }
}
