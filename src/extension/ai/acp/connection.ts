// A conexão JSON-RPC 2.0 do ACP (Agent Client Protocol) sobre as linhas do `stdin`/`stdout` do agente.
// É o lado "cliente" do protocolo: o board pede (`initialize`, `session/new`, `session/prompt`), avisa
// (`session/cancel`) e também ATENDE pedidos do agente (`session/request_permission`) — por isso a
// conexão é de mão dupla, e não um "manda e espera" como o `-p` das CLIs.
//
// Escrita à mão de propósito, no protótipo: são três dezenas de linhas, e o SDK oficial
// (`@agentclientprotocol/sdk`) traria dependência nova para validar um desenho. Ver a lista do que
// falta no registro de decisão (`docs/decisoes/acp-transporte-de-agentes.md`).
import { asObject, asText, type Json } from '../../aiOutput/json';

/** O erro que o agente devolveu num pedido; `code` segue o JSON-RPC (e o ACP, para `auth_required`). */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

/** Código do ACP para "autentique antes": o agente recusa a sessão sem login. */
export const AUTH_REQUIRED = -32000;
const METHOD_NOT_FOUND = -32601;

export interface RpcHandlers {
  /** escreve uma linha no `stdin` do agente (sem o `\n`) */
  send(line: string): void;
  /** um pedido do agente; o que devolver vira o `result`, o que lançar vira o `error` */
  onRequest(method: string, params: Json): Promise<unknown> | unknown;
  /** um aviso do agente (`session/update`): não tem resposta */
  onNotification(method: string, params: Json): void;
}

export interface RpcConnection {
  request(method: string, params: Json): Promise<Json>;
  notify(method: string, params: Json): void;
  /** Uma linha do `stdout`; false quando não é JSON-RPC (o agente escreveu texto solto). */
  receive(line: string): boolean;
  /** O agente saiu: os pedidos sem resposta falham com este erro. */
  close(error: Error): void;
}

export function rpcConnection(h: RpcHandlers): RpcConnection {
  let next = 1;
  const pending = new Map<number, { resolve(v: Json): void; reject(e: Error): void }>();
  let closed: Error | null = null;

  const write = (msg: Json): void => h.send(JSON.stringify({ jsonrpc: '2.0', ...msg }));

  const answer = async (id: unknown, method: string, params: Json): Promise<void> => {
    try {
      const result = await h.onRequest(method, params);
      write({ id, result: result ?? null });
    } catch (e) {
      const code = e instanceof RpcError ? e.code : METHOD_NOT_FOUND;
      write({ id, error: { code, message: e instanceof Error ? e.message : String(e) } });
    }
  };

  return {
    request(method, params) {
      if (closed) return Promise.reject(closed);
      const id = next++;
      return new Promise<Json>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        write({ id, method, params });
      });
    },
    notify(method, params) {
      if (!closed) write({ method, params });
    },
    receive(line) {
      let msg: Json | null;
      try {
        msg = asObject(JSON.parse(line));
      } catch {
        return false;
      }
      if (!msg || msg.jsonrpc !== '2.0') return false;
      const method = asText(msg.method);
      const params = asObject(msg.params) ?? {};
      // pedido do agente: tem `method` e `id`; aviso: só `method`; resposta: só `id`
      if (method && msg.id !== undefined) void answer(msg.id, method, params);
      else if (method) h.onNotification(method, params);
      else if (typeof msg.id === 'number') {
        const waiting = pending.get(msg.id);
        pending.delete(msg.id);
        const error = asObject(msg.error);
        if (error) waiting?.reject(new RpcError(Number(error.code), asText(error.message) ?? 'erro sem mensagem', error.data));
        else waiting?.resolve(asObject(msg.result) ?? {});
      }
      return true;
    },
    close(error) {
      closed = error;
      for (const p of pending.values()) p.reject(error);
      pending.clear();
    },
  };
}
