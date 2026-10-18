// O transporte ACP: uma execução do board = um processo do agente, uma sessão, um `session/prompt`.
// Devolve o mesmo `Measured` do transporte das CLIs (`aiOutput/measured.ts`) — `proc.onExit` uma vez,
// `proc.kill`, `report()` no fim —, e é isso que faz o desenho caber no gateway sem mexer no ciclo do
// log de uso: o gateway escolhe `spawnMeasured` ou `spawnAcp` pelo provider e o resto é o mesmo.
//
// O que muda em relação ao `-p`:
// - o `stdin` fica aberto: o board responde no meio do trabalho (`session/request_permission`);
// - os servidores MCP (o do board e os liberados pelo agente do card) vão no `session/new`. Nenhum
//   arquivo é escrito na pasta do projeto;
// - Parar é `session/cancel`, e só depois de uma folga o processo é morto: o agente responde o
//   prompt com `cancelled` e o que ele já tinha medido chega.
//
// O código de saída que o gateway recebe é o do protocolo, não o do processo: quem fecha o agente no
// fim é o board, e um agente encerrado por nós não sai com o código do trabalho.
import type { RunnerPermission } from '../../../shared/runner';
import type { MeasuredDeps, Measured } from '../../aiOutput/measured';
import { lineSplitter } from '../../aiOutput/lines';
import { asList, asObject, asText, cut, type Json } from '../../aiOutput/json';
import { MeasureBrokenError } from '../../aiOutput/errors';
import { BOARD_SERVER } from '../../execution';
import type { HeadlessInput } from '../provider';
import { AUTH_REQUIRED, RpcError, rpcConnection } from './connection';
import type { AcpMcpServer, AcpProcess, AcpProvider, AcpSpawnFn, AcpToolCall } from './provider';
import { acpReader, toolCallOf } from './reader';

/** A versão do protocolo que este cliente fala. */
export const ACP_PROTOCOL_VERSION = 1;

/** Quanto o board espera o agente sair sozinho (fim do `stdin` ou `session/cancel`) antes de matar. */
const GRACE_MS = 5_000;

export interface AcpDeps extends Omit<MeasuredDeps, 'spawn'> {
  spawn: AcpSpawnFn;
  graceMs?: number;
}

/** Os servidores MCP da execução no formato do `session/new`. */
export function acpMcpServers(input: HeadlessInput): AcpMcpServer[] {
  // o mesmo JSON que o Claude Code recebe por `--mcp-config`: o do board e os liberados pelo agente
  const config = input.exec?.mcpConfig ? asObject(asObject(JSON.parse(input.exec.mcpConfig))?.mcpServers) : null;
  const defs: Record<string, unknown> = config ?? (input.boardServer ? { [BOARD_SERVER]: input.boardServer } : {});
  const servers: AcpMcpServer[] = [];
  for (const [name, raw] of Object.entries(defs)) {
    const def = asObject(raw);
    const command = asText(def?.command);
    // o ACP de v1 garante só stdio; http/sse dependem de `mcpCapabilities` e ficam para depois
    if (!def || !command) continue;
    servers.push({
      name,
      command,
      args: asList(def.args).filter((a): a is string => typeof a === 'string'),
      env: Object.entries(asObject(def.env) ?? {}).map(([n, v]) => ({ name: n, value: String(v) })),
    });
  }
  return servers;
}

/**
 * O que o board permite sem ninguém aprovando, pelo nível da execução: o mesmo recorte que o Claude
 * Code recebe na linha de comando (`board` = ler o projeto e usar os servidores MCP que o board passou;
 * `edits` = mais editar arquivos; `full` = tudo).
 */
export function boardAllows(permission: RunnerPermission, call: AcpToolCall, mcp: { server: string } | null, servers: string[]): boolean {
  if (permission === 'full') return true;
  if (mcp) return servers.includes(mcp.server);
  const kind = call.kind ?? 'other';
  if (['read', 'search', 'think'].includes(kind)) return true;
  return permission === 'edits' && ['edit', 'delete', 'move'].includes(kind);
}

/** A opção do pedido de permissão que diz sim (ou não) só para esta chamada. */
function pickOption(params: Json, allow: boolean): string | null {
  const options = asList(params.options).map((o) => asObject(o));
  const want = allow ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always'];
  for (const kind of want) {
    const found = options.find((o) => asText(o?.kind) === kind);
    if (found) return asText(found.optionId);
  }
  return null;
}

export function spawnAcp(provider: AcpProvider, input: HeadlessInput, cwd: string, deps: AcpDeps): Measured {
  const reader = acpReader(provider);
  const servers = acpMcpServers(input);
  const graceMs = deps.graceMs ?? GRACE_MS;
  const listeners: ((code: number | null, error?: Error) => void)[] = [];
  let sessionId: string | null = null;
  /** o código que o protocolo deu ao trabalho; null enquanto o prompt não respondeu */
  let result: number | null = null;
  let failure: Error | undefined;
  let killed = false;
  let done = false;
  let exited = false;

  const built = provider.command(input);
  deps.log(`Chamando ${provider.label} (ACP): ${built.command} ${built.args.join(' ')}`);

  const stdout = lineSplitter();
  const stderr = lineSplitter();
  let proc: AcpProcess | null = null;
  const rpc = rpcConnection({
    send: (line) => proc?.write(`${line}\n`),
    onNotification: (method, params) => {
      if (method !== 'session/update') return;
      for (const line of reader.update(asObject(params.update) ?? {})) deps.log(line);
    },
    onRequest: (method, params) => {
      if (method !== 'session/request_permission') throw new RpcError(-32601, `método não suportado pelo board: ${method}`);
      const call = toolCallOf(asObject(params.toolCall)) ?? { toolCallId: '?', title: null, kind: null };
      if (killed) return { outcome: { outcome: 'cancelled' } };
      const mcp = provider.mcpToolOf(call);
      const allow = boardAllows(
        input.permission,
        call,
        mcp,
        servers.map((s) => s.name),
      );
      const optionId = pickOption(params, allow);
      const what = mcp ? `${mcp.server}/${mcp.tool}` : (call.title ?? call.kind ?? 'ferramenta');
      deps.log(
        `${provider.label} pediu permissão para ${cut(what, 120)}: ${allow ? 'permitido' : 'negado'} pelo board (nível ${input.permission}).`,
      );
      // sem a opção pedida na lista, o board não inventa uma: cancela, que todo agente precisa aceitar.
      // A resposta é imediata (a regra do nível decide, como o `dontAsk` do Claude Code): não fica
      // pedido pendente para o `session/cancel` responder
      if (!optionId) return { outcome: { outcome: 'cancelled' } };
      return { outcome: { outcome: 'selected', optionId } };
    },
  });

  const finish = (code: number | null, error?: Error): void => {
    if (done) return;
    done = true;
    for (const fn of listeners) fn(code, error);
  };

  /** Mata o agente que não saiu sozinho na folga. */
  const killLater = (): void => {
    setTimeout(() => {
      if (!exited) proc?.kill();
    }, graceMs).unref?.();
  };

  /** Fecha o agente: fim do `stdin` e, se ele não sair na folga, morte. */
  const close = (): void => {
    proc?.end();
    killLater();
  };

  const feed = (text: string, stream: 'stdout' | 'stderr'): void => {
    if (stream === 'stderr') {
      for (const line of stderr.push(text)) if (line) deps.log(cut(line, 300));
      return;
    }
    // o que não for JSON-RPC é texto solto do agente (aviso de versão, log): vai para o canal
    for (const line of stdout.push(text)) if (line && !rpc.receive(line)) deps.log(cut(line, 300));
  };

  proc = deps.spawn(built, cwd, feed);
  proc.onExit((code, error) => {
    exited = true;
    for (const line of [...stdout.flush(), ...stderr.flush()]) if (line && !rpc.receive(line)) deps.log(cut(line, 300));
    const gone = error ?? new Error(`${provider.label} saiu (código ${code}) antes de terminar o pedido.`);
    rpc.close(gone);
    for (const line of reader.flush()) deps.log(line);
    // saiu antes de o prompt responder: o código é o do processo (ou 1, se ele saiu "bem" no meio)
    if (result === null) finish(error ? null : code === 0 ? 1 : code, failure ?? error);
    else finish(result, failure);
  });

  const run = async (): Promise<void> => {
    const init = await rpc.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      // o board não empresta o editor ao agente: sem `fs/*` nem `terminal/*`, ele lê e roda sozinho, e
      // cada escrita ou comando passa pelo pedido de permissão
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'faz-ai', title: 'Faz AI Kanban' },
    });
    const version = init.protocolVersion;
    if (version !== ACP_PROTOCOL_VERSION)
      throw new Error(`${provider.label} fala a versão ${String(version)} do ACP; o board fala a ${ACP_PROTOCOL_VERSION}.`);

    const session = await rpc.request('session/new', { cwd, mcpServers: servers });
    sessionId = asText(session.sessionId);
    if (!sessionId) throw new Error(`${provider.label} abriu a sessão sem id.`);
    deps.log(`Sessão ACP aberta com ${servers.length ? servers.map((s) => s.name).join(', ') : 'nenhum servidor MCP'}.`);

    const mode = provider.modeFor(input.permission);
    const modes = asList(asObject(session.modes)?.availableModes).map((m) => asText(asObject(m)?.id));
    // um modo recusado não derruba a execução: no modo padrão o board responde a cada pedido
    if (mode && modes.includes(mode))
      await rpc
        .request('session/set_mode', { sessionId, modeId: mode })
        .catch((e: Error) => deps.log(`Modo ${mode} recusado: ${e.message}`));

    if (killed) {
      result = 143;
      return;
    }
    const answer = await rpc.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: input.prompt }] });
    for (const line of reader.finish(answer)) deps.log(line);
    const stop = asText(answer.stopReason);
    // `max_tokens`, `max_turn_requests` e `refusal` param no meio: o trabalho não terminou
    result = stop === 'end_turn' ? 0 : stop === 'cancelled' ? 143 : 1;
  };

  run()
    .catch((e: unknown) => {
      if (done) return;
      const err = e instanceof Error ? e : new Error(String(e));
      // sem login o agente recusa a sessão; o board não abre o navegador da pessoa sozinho
      const msg =
        err instanceof RpcError && err.code === AUTH_REQUIRED
          ? `${provider.label} pede login. Rode \`${built.command}\` no terminal uma vez e entre com a sua conta.`
          : err.message;
      deps.log(msg);
      failure = new Error(msg);
      result = 1;
    })
    .finally(() => {
      if (!done) close();
    });

  return {
    proc: {
      onExit: (fn) => listeners.push(fn),
      kill: () => {
        if (killed) return;
        killed = true;
        // o protocolo: avisa e espera o prompt voltar com `cancelled`, trazendo o que já foi medido
        if (sessionId) rpc.notify('session/cancel', { sessionId });
        killLater();
      },
    },
    report: () => {
      const report = reader.report(sessionId);
      if (report.measure !== 'none') return report;
      return { ...report, reason: new MeasureBrokenError(provider.label).message };
    },
  };
}
