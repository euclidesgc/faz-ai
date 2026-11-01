// O passo do login no Conectar (história 7) para o agente que entra por chave de API pelo protocolo: abre o
// agente, `initialize`, `authenticate` com a chave e fecha. Não abre sessão nem pede trabalho: não gasta a
// conta. Serve para o erro de uma chave recusada (ou de uma versão sem o método) ficar preso ao passo do
// login, e não aparecer só depois, na verificação ou no primeiro card.
import { version as EXTENSION_VERSION } from '../../../../package.json';
import { lineSplitter } from '../../aiOutput/lines';
import { RpcError, acpAuthenticate, rpcConnection } from './connection';
import { ACP_CLIENT_CAPABILITIES } from './models';
import { ACP_PROTOCOL_VERSION, acpCommand, type AcpAgent, type AcpAuth, type AcpSpawnFn } from './provider';

export interface AcpSignInDeps {
  spawn: AcpSpawnFn;
  /** o executável do agente já resolvido no PATH */
  executable: string;
  /** uma pasta descartável: o agente lê a configuração da pasta em que abre */
  cwd: string;
  timeoutMs?: number;
}

/** Entrega a chave ao agente pelo `authenticate`; lança com o motivo (sem a chave) quando ele não a aceita. */
export async function acpSignIn(agent: AcpAgent, auth: AcpAuth, deps: AcpSignInDeps): Promise<void> {
  const built = acpCommand(agent, { prompt: '', permission: 'board' });
  const stdout = lineSplitter();
  let proc = null as ReturnType<AcpSpawnFn> | null;
  let exited = false;
  const rpc = rpcConnection({
    send: (line) => proc?.write(`${line}\n`),
    onNotification: () => {},
    // o login não pede trabalho: qualquer pedido do agente é recusado
    onRequest: () => ({ outcome: { outcome: 'cancelled' } }),
  });
  const done = new Promise<void>((resolve) => {
    proc = deps.spawn({ ...built, command: deps.executable }, deps.cwd, (text, stream) => {
      if (stream !== 'stdout') return;
      for (const line of stdout.push(text)) if (line) rpc.receive(line);
    });
    proc.onExit((code, error) => {
      exited = true;
      rpc.close(error ?? new Error(`${agent.label} saiu (código ${code}) antes de concluir o login.`));
      resolve();
    });
  });
  const timer = setTimeout(() => proc?.kill(), deps.timeoutMs ?? 60_000);
  try {
    const init = await rpc.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: ACP_CLIENT_CAPABILITIES,
      clientInfo: { name: 'faz-ai', title: 'Faz AI Kanban (conectar)', version: EXTENSION_VERSION },
    });
    if (init.protocolVersion !== ACP_PROTOCOL_VERSION)
      throw new Error(`${agent.label} fala a versão ${String(init.protocolVersion)} do ACP; o board fala a ${ACP_PROTOCOL_VERSION}.`);
    const result = await acpAuthenticate(rpc, init, auth);
    // a versão instalada não anuncia o login por chave: o board não tem como entregar a chave
    if (result === 'not-offered')
      throw new Error(
        `A versão instalada do ${agent.label} não oferece o login por chave de API pelo ACP (${auth.methodId}). Atualize a ferramenta e tente de novo.`,
      );
  } catch (e) {
    // a recusa do `authenticate` vem do agente (código e mensagem dele); o resto (saiu, versão) segue como veio
    if (e instanceof RpcError) throw new Error(`${agent.label} recusou a chave de API: ${e.message}`);
    throw e;
  } finally {
    clearTimeout(timer);
    proc?.end();
    setTimeout(() => {
      if (!exited) proc?.kill();
    }, 5_000).unref?.();
    await done;
  }
}
