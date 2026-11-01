// A conta de cada agente na tela de Conectar agentes: se há login, qual conta, como entrar e como sair. São
// verificações curtas, que abrem e fecham: o status da CLI (`claude auth status`, `cursor-agent status`) ou, pelo
// ACP, o `initialize` e uma sessão nova sem pedido (não gasta a conta). Nenhum processo fica aberto depois.
import * as acp from '@agentclientprotocol/sdk';
import type { AgentAccount, AgentAccountInfo, AgentLaunch, ProtocolLogEntry } from '../../shared/agentConnect';
import { toolModeEntry } from '../../shared/aiTools';
import { runCli } from '../cliRun';
import { kimiSignedIn } from '../ai/drivers/kimi/cli';
import {
  accountLabel,
  commandLine,
  isAuthRequired,
  openAgent,
  parseAuthMethods,
  type AgentSpawn,
  type TerminalInvocation,
} from './protocol';

/** Quanto a sessão da verificação pode levar para abrir: o agente já respondeu o `initialize`, então é pouco. */
const SESSION_TIMEOUT_MS = 60_000;

/** Quanto o login feito pelo próprio agente pode levar: a pessoa termina no navegador, no tempo dela. */
export const AGENT_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

/** O resultado de uma verificação: a conta e, para os métodos de terminal, como abrir cada login. */
export interface AccountCheck {
  account: AgentAccount;
  terminals: Map<string, TerminalInvocation>;
}

const withTimeout = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** As CLIs prontas que têm conta: o status (quando a CLI diz), como entrar e como sair. */
export type CliAccountTool = 'claude' | 'cursor' | 'kimi';

interface CliAccountSpec {
  /** os argumentos do status em JSON; null quando a CLI não tem (o Kimi Code guarda a credencial em arquivo) */
  status: string[] | null;
  read(stdout: string): { signedIn: boolean | null; label: string | null };
  /** os argumentos do logout; null quando a CLI não tem (o Kimi Code 2.x não tem `logout`) */
  logout: string[] | null;
}

// os comandos conferidos no `--help` de cada CLI em 2026-10-24: Claude Code (`auth status|login|logout`), Cursor
// (`status --format json`, `login`, `logout`) e Kimi Code (`login`, pelo código no navegador, sem `logout`)
const CLI_ACCOUNTS: Record<CliAccountTool, CliAccountSpec> = {
  claude: {
    status: ['auth', 'status'],
    read: (stdout) => {
      const j = obj(parseJson(stdout));
      if (!j || typeof j.loggedIn !== 'boolean') return { signedIn: null, label: null };
      // `subscriptionType` (max, pro…) é o plano da assinatura; sem ele, o modo de entrada (chave de API, Console)
      const plan = text(j.subscriptionType) ? `Claude ${capitalize(text(j.subscriptionType))}` : text(j.authMethod);
      return { signedIn: j.loggedIn, label: j.loggedIn ? [plan, text(j.email)].filter(Boolean).join(' · ') || null : null };
    },
    logout: ['auth', 'logout'],
  },
  cursor: {
    status: ['status', '--format', 'json'],
    read: (stdout) => {
      const j = obj(parseJson(stdout));
      if (!j || typeof j.isAuthenticated !== 'boolean') return { signedIn: null, label: null };
      return { signedIn: j.isAuthenticated, label: j.isAuthenticated ? text(obj(j.userInfo)?.email) || null : null };
    },
    logout: ['logout'],
  },
  kimi: { status: null, read: () => ({ signedIn: null, label: null }), logout: null },
};

/** O comando de login da CLI pronta, como o catálogo das ferramentas o escreve (`claude auth login`). */
export function cliLogin(tool: CliAccountTool): { name: string; args: string[] } {
  const [name = tool, ...args] = (toolModeEntry(tool, 'cli')?.cli?.login ?? tool).split(/\s+/);
  return { name, args };
}

export const isCliAccountTool = (tool: string): tool is CliAccountTool => Object.hasOwn(CLI_ACCOUNTS, tool);

export interface CliAccountOptions {
  pathEnv: string | undefined;
  homeDir: string;
  /** o ambiente da cópia do perfil (outra pasta de configuração = outra conta) */
  env?: Record<string, string>;
  now?: () => number;
}

/** A conta da CLI pronta pelo status dela; o login é o comando da CLI, num terminal. */
export async function cliAccount(tool: CliAccountTool, executable: string, o: CliAccountOptions): Promise<AccountCheck> {
  const spec = CLI_ACCOUNTS[tool];
  let found: { signedIn: boolean | null; label: string | null } = { signedIn: null, label: null };
  if (spec.status) {
    const run = await runCli(executable, spec.status, o.pathEnv, 20_000, undefined, { noShell: true, env: o.env });
    found = spec.read(run.stdout);
  } else if (tool === 'kimi') {
    found = { signedIn: kimiSignedIn(o.homeDir), label: null };
  }
  const login = cliLogin(tool);
  const terminal: TerminalInvocation = { command: executable, args: login.args, env: o.env ?? {} };
  return {
    account: {
      status: found.signedIn === null ? 'unknown' : found.signedIn ? 'signed-in' : 'signed-out',
      label: found.label,
      methods: [
        {
          id: 'cli-login',
          name: 'Entrar no terminal',
          description: null,
          type: 'terminal',
          terminalCommand: commandLine(login.name, login.args),
          apiKey: false,
        },
      ],
      canLogout: !!spec.logout,
      version: null,
      loggingIn: null,
      error: null,
      checkedAt: (o.now ?? Date.now)(),
    },
    terminals: new Map([['cli-login', terminal]]),
  };
}

/** Sai da conta da CLI pronta pelo comando dela; lança com o motivo quando a CLI recusa. */
export async function cliLogout(tool: CliAccountTool, executable: string, o: CliAccountOptions): Promise<void> {
  const args = CLI_ACCOUNTS[tool].logout;
  if (!args) throw new Error('Esta ferramenta não tem comando para sair da conta.');
  const run = await runCli(executable, args, o.pathEnv, 30_000, undefined, { noShell: true, env: o.env });
  if (run.code !== 0) throw new Error(`O comando para sair da conta terminou com o código ${run.code ?? '?'}.`);
}

export interface AcpAccountOptions {
  /** a chave do cofre, entregue pelo `authenticate` como na execução (o Gemini) */
  auth?: { methodId: string; apiKey: string };
  log?(entry: ProtocolLogEntry): void;
  now?: () => number;
}

/**
 * A conta de um agente pelo ACP: `initialize`, o login por chave quando o board tem a chave, e uma sessão nova sem
 * pedido. A sessão recusada com `auth_required` é falta de login; o adaptador do Claude abre a sessão mesmo sem
 * login e diz a conta no `_auth/status_update`, que também vale.
 */
export async function acpAccount(launch: AgentLaunch, cwd: string, spawn: AgentSpawn, o: AcpAccountOptions = {}): Promise<AccountCheck> {
  let info: AgentAccountInfo | null = null;
  const agent = await openAgent(launch, cwd, spawn, { log: o.log, account: (i) => (info = i) });
  try {
    const { init, conn } = agent;
    const methods = parseAuthMethods(init.authMethods, launch);
    if (o.auth && methods.some((m) => m.method.id === o.auth!.methodId))
      await conn.agent.request(acp.methods.agent.authenticate, { methodId: o.auth.methodId, _meta: { 'api-key': o.auth.apiKey } });
    let signedIn: boolean;
    try {
      const session = await withTimeout(
        conn.agent.buildSession(cwd).start(),
        SESSION_TIMEOUT_MS,
        `${launch.name} não abriu a sessão em ${SESSION_TIMEOUT_MS / 1000} s.`,
      );
      session.dispose();
      signedIn = true;
    } catch (e) {
      if (!isAuthRequired(e)) throw e;
      signedIn = false;
    }
    const reported = info as AgentAccountInfo | null;
    if (reported?.kind === 'none') signedIn = false;
    return {
      account: {
        status: signedIn ? 'signed-in' : 'signed-out',
        label: signedIn ? accountLabel(reported) : null,
        methods: methods.map((m) => m.method),
        canLogout: !!init.agentCapabilities?.auth?.logout,
        version: init.agentInfo?.version ?? null,
        loggingIn: null,
        error: null,
        checkedAt: (o.now ?? Date.now)(),
      },
      terminals: new Map(methods.flatMap((m) => (m.terminal ? [[m.method.id, m.terminal] as const] : []))),
    };
  } finally {
    agent.conn.close();
    agent.close('verificação da conta concluída');
  }
}

/** `logout` pelo ACP: o agente esquece a conta (na máquina inteira, não só no board). */
export async function acpLogout(launch: AgentLaunch, cwd: string, spawn: AgentSpawn, log?: (entry: ProtocolLogEntry) => void) {
  const agent = await openAgent(launch, cwd, spawn, { log });
  try {
    if (!agent.init.agentCapabilities?.auth?.logout) throw new Error(`${launch.name} não oferece sair da conta pelo protocolo.`);
    await withTimeout(
      agent.conn.agent.request(acp.methods.agent.logout, {}),
      SESSION_TIMEOUT_MS,
      `${launch.name} não respondeu ao logout.`,
    );
  } finally {
    agent.conn.close();
    agent.close('logout concluído');
  }
}

/**
 * O login feito pelo próprio agente (`authenticate` com um método sem terminal): ele abre o navegador ou pede a
 * chave e responde quando a pessoa termina. A chave, quando o método recebe uma, vai em `_meta["api-key"]`.
 */
export async function acpLogin(
  launch: AgentLaunch,
  cwd: string,
  spawn: AgentSpawn,
  methodId: string,
  o: { apiKey?: string; log?: (entry: ProtocolLogEntry) => void; timeoutMs?: number } = {},
): Promise<void> {
  const agent = await openAgent(launch, cwd, spawn, { log: o.log });
  try {
    await withTimeout(
      agent.conn.agent.request(acp.methods.agent.authenticate, { methodId, ...(o.apiKey ? { _meta: { 'api-key': o.apiKey } } : {}) }),
      o.timeoutMs ?? AGENT_LOGIN_TIMEOUT_MS,
      `O login pelo ${launch.name} não terminou em ${Math.round((o.timeoutMs ?? AGENT_LOGIN_TIMEOUT_MS) / 60_000)} min.`,
    );
  } finally {
    agent.conn.close();
    agent.close('login concluído');
  }
}
