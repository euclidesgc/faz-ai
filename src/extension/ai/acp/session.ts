// Operações de sessão do ACP separadas do ciclo de uma execução. Só tenta session/load quando o
// servidor o anunciou em initialize; ACP não define um mecanismo universal para criar subagentes.
import { asObject, asText, type Json } from '../../aiOutput/json';
import type { RpcConnection } from './connection';

export interface AcpSessionParams {
  cwd: string;
  mcpServers: Json[];
}

export interface AcpSessionHandle {
  sessionId: string;
  resumed: boolean;
  details: Json;
}

/** Abre uma sessão nova ou carrega uma sessão nativa existente, se o agente anunciou loadSession. */
export async function openAcpSession(
  rpc: RpcConnection,
  initialize: Json,
  params: AcpSessionParams,
  existingSessionId?: string,
): Promise<AcpSessionHandle> {
  const capabilities = asObject(asObject(initialize)?.agentCapabilities);
  if (existingSessionId) {
    if (capabilities?.loadSession !== true)
      throw new Error('O agente ACP não anunciou suporte a session/load; a sessão salva não foi substituída por uma sessão nova.');
    const details = await rpc.request('session/load', {
      sessionId: existingSessionId,
      cwd: params.cwd,
      mcpServers: params.mcpServers,
    } as unknown as Json);
    // ACP v1 pode omitir sessionId na resposta de load (codex-acp 2.2.2 faz isso); o pedido já identifica a sessão.
    const reported = asText(asObject(details)?.sessionId);
    if (reported && reported !== existingSessionId) throw new Error('O agente não retomou a sessão ACP solicitada.');
    return { sessionId: existingSessionId, resumed: true, details };
  }
  const details = await rpc.request('session/new', { cwd: params.cwd, mcpServers: params.mcpServers } as unknown as Json);
  const sessionId = asText(asObject(details)?.sessionId);
  if (!sessionId) throw new Error('O agente abriu a sessão ACP sem id.');
  return { sessionId, resumed: false, details };
}

/** Envia um turno para uma sessão ACP existente. Não fecha sessão nem processo ao concluir. */
export function sendAcpTurn(rpc: RpcConnection, sessionId: string, prompt: string): Promise<Json> {
  return rpc.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] });
}
