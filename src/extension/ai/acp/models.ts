// Os modelos que um agente ACP anuncia ao abrir a sessão, lidos sem gastar a conta da pessoa: só
// `initialize` e `session/new`, nunca `session/prompt`. O protocolo mudou de forma no meio do caminho:
// o esquema atual anuncia o seletor em `configOptions` (categoria `model`, trocado por
// `session/set_config_option`); a forma anterior, ainda usada pelo Gemini CLI 0.65.0, é o bloco
// `models` (`availableModels`, `currentModelId`). O board lê as duas e prefere a atual.
import { modelId, type ModelOption } from '../../../shared/models';
import { asList, asObject, asText, type Json } from '../../aiOutput/json';
import { lineSplitter } from '../../aiOutput/lines';
import { version as EXTENSION_VERSION } from '../../../../package.json';
import { AUTH_REQUIRED, RpcError, rpcConnection } from './connection';
import { ACP_PROTOCOL_VERSION, acpCommand, type AcpAgent, type AcpSpawnFn } from './provider';

/**
 * O que o board anuncia ao agente: não empresta o editor (sem `fs/*` nem `terminal/*`, cada escrita ou
 * comando passa pelo pedido de permissão) e entende as opções de configuração da sessão, para o agente
 * mandar o seletor de modelo na forma atual do protocolo.
 */
export const ACP_CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
  session: { configOptions: {} },
} as const;

export interface AcpModelValue {
  value: string;
  name: string;
}

/** O seletor de modelo da sessão (`configOptions` de categoria `model`), com os valores que ele aceita. */
export interface AcpModelOption {
  configId: string;
  current: string | null;
  values: AcpModelValue[];
}

/** Os modelos que a sessão anunciou, já no formato do catálogo; `source` diz por qual forma do protocolo. */
export interface AcpSessionModels {
  options: ModelOption[];
  current: string | null;
  source: 'configOptions' | 'models' | null;
}

const valueOf = (raw: unknown): AcpModelValue | null => {
  const v = asObject(raw);
  const value = asText(v?.value);
  return value ? { value, name: asText(v?.name) ?? value } : null;
};

/** As opções de um seletor, planas ou em grupos (o protocolo não mistura as duas formas). */
function flatten(options: unknown): AcpModelValue[] {
  return asList(options).flatMap((entry) => {
    const o = asObject(entry);
    if (o && Array.isArray(o.options)) return flatten(o.options);
    const v = valueOf(entry);
    return v ? [v] : [];
  });
}

/** O seletor de modelo da resposta do `session/new` (ou da lista atualizada), ou null quando o agente não expõe um. */
export function modelConfigOption(session: Json): AcpModelOption | null {
  for (const entry of asList(session.configOptions)) {
    const o = asObject(entry);
    const configId = asText(o?.id);
    // o `type` ausente é `select`; um booleano nunca é o seletor de modelo
    if (!configId || asText(o?.category) !== 'model' || (o?.type !== undefined && o.type !== 'select')) continue;
    return { configId, current: asText(o?.currentValue), values: flatten(o?.options) };
  }
  return null;
}

/** A forma anterior do protocolo: `models.availableModels` e `currentModelId`. */
function legacyModels(session: Json): { current: string | null; values: AcpModelValue[] } | null {
  const models = asObject(session.models);
  if (!models) return null;
  const values = asList(models.availableModels).flatMap((entry) => {
    const m = asObject(entry);
    const value = asText(m?.modelId);
    return value ? [{ value, name: asText(m?.name) ?? value }] : [];
  });
  return { current: asText(models.currentModelId), values };
}

/**
 * Os modelos da sessão como entradas do catálogo da ferramenta `tool` (o id do perfil). O modelo atual do
 * agente vem primeiro: é o que ele usaria sem escolha do card. Esforço: o protocolo não o expõe no seletor.
 */
export function parseAcpSessionModels(session: Json, tool: string): AcpSessionModels {
  const option = modelConfigOption(session);
  const legacy = option ? null : legacyModels(session);
  const found = option ?? legacy;
  if (!found) return { options: [], current: null, source: null };
  const sorted = [...found.values].sort((a, b) => (a.value === found.current ? -1 : b.value === found.current ? 1 : 0));
  const seen = new Set<string>();
  const options = sorted
    .filter((v) => !seen.has(v.value) && seen.add(v.value))
    .map((v): ModelOption => ({
      id: modelId(tool, v.value),
      tool,
      model: v.value,
      label: v.name,
      efforts: [],
      defaultEffort: null,
      fromTool: true,
    }));
  return { options, current: found.current, source: option ? 'configOptions' : 'models' };
}

export interface AcpModelsDeps {
  spawn: AcpSpawnFn;
  /** o executável do agente já resolvido no PATH; sem ele, vale o comando do catálogo */
  executable?: string;
  timeoutMs?: number;
}

/**
 * Abre o agente uma vez (`initialize`, `session/new` sem servidores MCP) e lê os modelos que ele anuncia.
 * Sem login, o erro diz como entrar; um agente que sai antes de responder derruba a leitura com o motivo.
 */
export async function acpSessionModels(agent: AcpAgent, tool: string, cwd: string, deps: AcpModelsDeps): Promise<AcpSessionModels> {
  const built = acpCommand(agent, { prompt: '', permission: 'board' });
  const stdout = lineSplitter();
  let proc = null as ReturnType<AcpSpawnFn> | null;
  let exited = false;
  const rpc = rpcConnection({
    send: (line) => proc?.write(`${line}\n`),
    onNotification: () => {},
    // a leitura não pede trabalho: qualquer pedido do agente é recusado
    onRequest: () => ({ outcome: { outcome: 'cancelled' } }),
  });
  const done = new Promise<void>((resolve) => {
    proc = deps.spawn({ ...built, command: deps.executable ?? built.command }, cwd, (text, stream) => {
      if (stream !== 'stdout') return;
      for (const line of stdout.push(text)) if (line) rpc.receive(line);
    });
    proc.onExit((code, error) => {
      exited = true;
      rpc.close(error ?? new Error(`${agent.label} saiu (código ${code}) antes de anunciar os modelos.`));
      resolve();
    });
  });
  const timer = setTimeout(() => proc?.kill(), deps.timeoutMs ?? 60_000);
  try {
    const init = await rpc.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: ACP_CLIENT_CAPABILITIES,
      clientInfo: { name: 'faz-ai', title: 'Faz AI Kanban (modelos)', version: EXTENSION_VERSION },
    });
    if (init.protocolVersion !== ACP_PROTOCOL_VERSION)
      throw new Error(`${agent.label} fala a versão ${String(init.protocolVersion)} do ACP; o board fala a ${ACP_PROTOCOL_VERSION}.`);
    const session = await rpc.request('session/new', { cwd, mcpServers: [] });
    return parseAcpSessionModels(session, tool);
  } catch (e) {
    if (e instanceof RpcError && e.code === AUTH_REQUIRED)
      throw new Error(`${agent.label} pede login. Rode \`${agent.login}\` no terminal uma vez e entre com a sua conta.`);
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
