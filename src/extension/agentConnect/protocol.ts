// O que a tela de Conectar agentes usa do SDK oficial do ACP (`@agentclientprotocol/sdk`): iniciar o agente com o
// log do protocolo ligado, fazer o `initialize` e converter o que ele declara para as formas simples da tela. A
// sessão de teste (`session.ts`) e as verificações curtas da conta (`account.ts`) passam por aqui.
//
// O board não declara capacidade de arquivos nem de terminal: o agente usa as ferramentas dele, e toda ação que
// ele quiser aprovar passa pelo `session/request_permission`. Só declara o login no terminal (`auth.terminal`),
// que a tela sabe abrir: sem ele, o adaptador do Claude não lista como entrar.
import { Readable, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import * as acp from '@agentclientprotocol/sdk';
import type {
  AgentAccountInfo,
  AgentAuthMethod,
  AgentConfigOption,
  AgentLaunch,
  ProtocolLogEntry,
  TestEvent,
} from '../../shared/agentConnect';
import { ProtocolLog } from './protocolLog';
import { version as EXTENSION_VERSION } from '../../../package.json';

/** Código do ACP para "autentique antes": o agente recusa a sessão sem login. */
export const AUTH_REQUIRED = -32000;

/** O aviso de conta do adaptador do Claude (`_auth/status_update`), fora do protocolo padrão. */
export const AUTH_STATUS_UPDATE = '_auth/status_update';

/**
 * As capacidades que o board declara no `initialize`: só o login no terminal. O `auth.terminal` é o campo do
 * protocolo; o `_meta["terminal-auth"]` é o formato anterior, que faz o agente mandar o comando pronto.
 */
export const CLIENT_CAPABILITIES: acp.ClientCapabilities = { auth: { terminal: true }, _meta: { 'terminal-auth': true } };

/**
 * Quanto o `initialize` pode levar: na primeira vez o npx baixa o pacote do agente antes de iniciá-lo, e isso
 * passa de um minuto numa rede lenta.
 */
export const INITIALIZE_TIMEOUT_MS = 120_000;

/** Quanto do `stderr` do agente vai para a tela por linha: um stack trace inteiro não ajuda. */
const MAX_STDERR_LINE = 400;

export type AgentSpawn = (command: string, args: string[], env: Record<string, string>, cwd: string) => ChildProcess;

/** A conta do `_auth/status_update`; null quando o aviso não tem o formato esperado. */
export function accountOf(params: unknown): AgentAccountInfo | null {
  const status = (params as { authStatus?: Record<string, unknown> } | null)?.authStatus;
  if (!status || typeof status.kind !== 'string') return null;
  const account = status.account as { email?: unknown } | undefined;
  const detail = typeof status.detail === 'string' ? status.detail : typeof account?.email === 'string' ? account.email : null;
  return { kind: status.kind, label: typeof status.label === 'string' ? status.label : status.kind, detail };
}

/** A conta em uma linha para a tela ("Claude Max · pessoa@exemplo.com"); null sem login. */
export const accountLabel = (info: AgentAccountInfo | null): string | null =>
  info && info.kind !== 'none' ? [info.label, info.detail].filter(Boolean).join(' · ') : null;

/** As capacidades do `initialize` em rótulos curtos, só as que o agente ligou. */
export function capabilityLabels(caps: acp.AgentCapabilities | undefined): string[] {
  if (!caps) return [];
  const labels: string[] = [];
  if (caps.loadSession) labels.push('loadSession');
  const session = caps.sessionCapabilities;
  if (session?.list) labels.push('session/list');
  if (session?.resume) labels.push('session/resume');
  if (session?.close) labels.push('session/close');
  if (caps.promptCapabilities?.image) labels.push('imagens');
  if (caps.promptCapabilities?.audio) labels.push('áudio');
  if (caps.promptCapabilities?.embeddedContext) labels.push('contexto embutido');
  if (caps.mcpCapabilities?.http) labels.push('MCP http');
  if (caps.mcpCapabilities?.sse) labels.push('MCP sse');
  return labels;
}

/** Como abrir o login de um método de terminal: o executável, os argumentos e o ambiente do processo. */
export interface TerminalInvocation {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** A linha de comando para a tela, com aspas no argumento que tem espaço. */
export const commandLine = (command: string, args: readonly string[]): string =>
  [command, ...args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');

/**
 * Os métodos de login do `initialize`, cada um com a invocação do terminal quando é de terminal. A especificação
 * manda montar o login com o mesmo programa do agente e os `args`/`env` do método; o `_meta["terminal-auth"]` (o
 * formato anterior) traz o comando pronto, e vale quando vem.
 */
export function parseAuthMethods(
  methods: acp.AuthMethod[] | undefined,
  launch: AgentLaunch,
): { method: AgentAuthMethod; terminal: TerminalInvocation | null }[] {
  return (methods ?? []).map((m) => {
    const meta = (m._meta ?? {}) as Record<string, unknown>;
    const isTerminal = 'type' in m && m.type === 'terminal';
    const fromMeta = meta['terminal-auth'] as { command?: unknown; args?: unknown; env?: unknown } | undefined;
    const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((a): a is string => typeof a === 'string') : []);
    const envOf = (v: unknown): Record<string, string> =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'))
        : {};
    let terminal: TerminalInvocation | null = null;
    if (isTerminal && typeof fromMeta?.command === 'string') {
      terminal = { command: fromMeta.command, args: strings(fromMeta.args), env: { ...launch.env, ...envOf(fromMeta.env) } };
    } else if (isTerminal) {
      const own = m as { args?: unknown; env?: unknown };
      terminal = { command: launch.command, args: [...launch.args, ...strings(own.args)], env: { ...launch.env, ...envOf(own.env) } };
    }
    return {
      method: {
        id: m.id,
        name: m.name,
        description: m.description ?? null,
        type: isTerminal ? 'terminal' : 'agent',
        terminalCommand: terminal && commandLine(terminal.command, terminal.args),
        apiKey: 'api-key' in meta,
      },
      terminal,
    };
  });
}

/** As opções da sessão no formato da tela: os grupos viram um campo `group` em cada opção. */
export function configOptionsOf(options: acp.SessionConfigOption[] | null | undefined): AgentConfigOption[] {
  return (options ?? []).map((o): AgentConfigOption => {
    const base = { id: o.id, name: o.name, description: o.description ?? null, category: o.category ?? null };
    if (o.type === 'boolean') return { ...base, type: 'boolean', current: o.currentValue, options: [] };
    const flat = (o.options as Array<acp.SessionConfigSelectOption | acp.SessionConfigSelectGroup>).flatMap(
      (x): AgentConfigOption['options'] =>
        'group' in x
          ? x.options.map((v) => ({ value: v.value, name: v.name, description: v.description ?? null, group: x.name }))
          : [{ value: x.value, name: x.name, description: x.description ?? null, group: null }],
    );
    return { ...base, type: 'select', current: o.currentValue, options: flat };
  });
}

/** Um `session/update` do agente no formato da tela; null para o que não interessa ao teste. */
export function toTestEvent(update: acp.SessionUpdate): TestEvent | null {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
    case 'agent_thought_chunk': {
      const text = update.content.type === 'text' ? update.content.text : `[${update.content.type}]`;
      return { kind: update.sessionUpdate === 'agent_message_chunk' ? 'message' : 'thought', text };
    }
    case 'tool_call':
    case 'tool_call_update':
      return {
        kind: 'tool',
        toolCallId: update.toolCallId,
        title: update.title ?? '',
        status: update.status ?? (update.sessionUpdate === 'tool_call' ? 'pending' : ''),
        toolKind: update.kind ?? null,
      };
    case 'plan':
      return { kind: 'plan', entries: update.entries.map((e) => ({ content: e.content, status: e.status })) };
    case 'current_mode_update':
      return { kind: 'mode', modeId: update.currentModeId };
    case 'usage_update':
      return { kind: 'usage', used: update.used, size: update.size };
    // o eco do próprio prompt (a tela já mostra o que a pessoa escreveu) e os avisos de protocolo que não dizem nada
    // à conversa (os comandos do agente, o título da sessão); ficam no log do protocolo
    case 'user_message_chunk':
    case 'available_commands_update':
    case 'session_info_update':
      return null;
    default:
      return { kind: 'update', name: update.sessionUpdate };
  }
}

export function errorText(e: unknown): string {
  if (e instanceof acp.RequestError) return `${e.message} (código ${e.code})`;
  return e instanceof Error ? e.message : String(e);
}

export const isAuthRequired = (e: unknown): boolean => e instanceof acp.RequestError && e.code === AUTH_REQUIRED;

/** O que quem abre o agente quer saber enquanto ele roda. */
export interface AgentHooks {
  /** cada mensagem JSON-RPC e cada fato do processo, para o log do protocolo */
  log?(entry: ProtocolLogEntry): void;
  /** a conta que o agente informou (`_auth/status_update`) */
  account?(info: AgentAccountInfo): void;
  /** um pedido de permissão; sem resposta própria, o board recusa (verificação e login não pedem trabalho) */
  permission?(params: acp.RequestPermissionRequest, signal: AbortSignal): Promise<acp.RequestPermissionResponse>;
  stderr?(line: string): void;
  exit?(code: number | null, signal: NodeJS.Signals | null): void;
}

/** Um agente iniciado e com o `initialize` respondido. */
export interface OpenedAgent {
  proc: ChildProcess;
  conn: acp.ClientConnection;
  init: acp.InitializeResponse;
  log: ProtocolLog;
  /** encerra o processo; `why` vai para o log */
  close(why?: string): void;
}

/**
 * Inicia o agente, liga o log do protocolo (as mensagens nos dois sentidos, o `stderr` e a saída do processo) e
 * faz o `initialize`. Um agente que não inicia, sai antes de responder ou passa do tempo vira erro com o motivo,
 * e o processo é encerrado.
 */
export async function openAgent(
  launch: AgentLaunch,
  cwd: string,
  spawn: AgentSpawn,
  hooks: AgentHooks = {},
  timeoutMs = INITIALIZE_TIMEOUT_MS,
): Promise<OpenedAgent> {
  const log = new ProtocolLog((entry) => hooks.log?.(entry));
  log.process(`iniciando: ${commandLine(launch.command, launch.args)} (pasta ${cwd})`);
  const proc = spawn(launch.command, launch.args, launch.env, cwd);
  let closing: string | null = null;
  const close = (why?: string) => {
    if (closing !== null || proc.exitCode !== null) return;
    closing = why ?? '';
    if (why) log.process(`${why}: encerrando o processo ${proc.pid ?? '?'}`);
    proc.kill();
  };
  // o fim antes do `initialize` vira o erro do pedido, com o motivo, em vez de uma espera sem fim
  const ended = new Promise<never>((_, reject) => {
    proc.once('error', (e) => reject(new Error(`Não deu para iniciar ${launch.name}: ${e.message}`)));
    proc.once('exit', (code) => reject(new Error(`${launch.name} saiu (código ${code ?? '?'}) antes de responder.`)));
  });
  ended.catch(() => {});
  watch(proc, log, hooks);
  if (proc.pid) log.process(`processo ${proc.pid} iniciado`);
  const stream = log.tap(
    acp.ndJsonStream(
      Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(proc.stdout!) as unknown as ReadableStream<Uint8Array>,
    ),
  );
  const conn = acp
    .client({ name: 'faz-ai' })
    .onRequest(acp.methods.client.session.requestPermission, (ctx) =>
      hooks.permission ? hooks.permission(ctx.params, ctx.signal) : { outcome: { outcome: 'cancelled' } },
    )
    .onNotification(
      AUTH_STATUS_UPDATE,
      (p: unknown) => p,
      (ctx) => {
        const info = accountOf(ctx.params);
        if (info) hooks.account?.(info);
      },
    )
    .connect(stream);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${launch.name} não respondeu ao initialize em ${Math.round(timeoutMs / 1000)} s.`)),
      timeoutMs,
    );
  });
  try {
    const init = await Promise.race([
      conn.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: CLIENT_CAPABILITIES,
        clientInfo: { name: 'faz-ai', title: 'Faz AI Kanban', version: EXTENSION_VERSION },
      }),
      ended,
      timeout,
    ]);
    return { proc, conn, init, log, close };
  } catch (e) {
    close('o initialize falhou');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** O `stderr` linha a linha e a saída do processo, no log e para quem abriu o agente. */
function watch(proc: ChildProcess, log: ProtocolLog, hooks: AgentHooks): void {
  let pending = '';
  proc.stderr?.setEncoding('utf8');
  proc.stderr?.on('data', (chunk: string) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const cut = line.slice(0, MAX_STDERR_LINE);
      log.stderr(cut);
      hooks.stderr?.(cut);
    }
  });
  proc.on('error', (e) => log.process(`erro ao iniciar: ${e.message}`));
  proc.on('exit', (code, signal) => {
    // com o PID: ao trocar de agente, a saída do anterior cai na linha do tempo do novo
    log.process(`processo ${proc.pid ?? '?'} saiu (código ${code ?? '?'}${signal ? `, sinal ${signal}` : ''})`);
    hooks.exit?.(code, signal);
  });
}
