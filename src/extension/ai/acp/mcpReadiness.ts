import type { AcpMcpReadiness } from '../provider';

const STATUS = new Map([
  ['Connected', 'connected'],
  ['Connecting', 'starting'],
  ['Not started', 'notStarted'],
  ['Needs authentication', 'authenticationRequired'],
  ['Failed', 'failed'],
  ['Cancelled', 'cancelled'],
  ['Disabled', 'disabled'],
  ['Unknown', 'unknown'],
]);

function serverNameForCodex(name: string): string {
  return name.replace(/\p{White_Space}/gu, '_');
}

function failed(parentSessionId: string, requiredServers: string[], reason: string): AcpMcpReadiness {
  return { parentSessionId, requiredServers, connectedServers: [], failedServers: [...requiredServers], reason };
}

/**
 * Parses the English Markdown emitted by codex-acp's local `/mcp` command. This is deliberately strict:
 * the text is not a protocol schema, so a new or localized format cannot accidentally prove readiness.
 */
export function acpMcpReadinessOf(parentSessionId: string, requiredServers: string[], output: string): AcpMcpReadiness {
  const required = [...new Set(requiredServers)];
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || !/^\*\*MCP servers:\*\* \d+ \(.+\)$/u.test(lines[0]!))
    return failed(parentSessionId, required, 'A resposta de /mcp não contém o resumo MCP esperado.');

  const observed = new Map<string, string[]>();
  let status: string | null = null;
  for (const line of lines.slice(1)) {
    const heading = /^\*\*(.+?)\*\*:?$/u.exec(line)?.[1];
    if (heading !== undefined) {
      status = STATUS.get(heading) ?? null;
      if (!status) return failed(parentSessionId, required, 'A resposta de /mcp contém uma categoria desconhecida.');
      continue;
    }
    const entry = /^- `([^`]+)`(?:: .+)?$/u.exec(line);
    if (entry && status) {
      const name = entry[1]!;
      observed.set(name, [...(observed.get(name) ?? []), status]);
      continue;
    }
    // Dica fora dos grupos, linha traduzida, tabela ou markup diferente: sem prova legível.
    return failed(parentSessionId, required, 'A resposta de /mcp não segue o formato de status esperado.');
  }

  const connectedServers: string[] = [];
  const failedServers: string[] = [];
  for (const name of required) {
    const states = observed.get(serverNameForCodex(name)) ?? [];
    if (states.length !== 1 || states[0] !== 'connected') failedServers.push(name);
    else connectedServers.push(name);
  }
  const reason = failedServers.length ? `MCPs ausentes, ambíguos ou não conectados: ${failedServers.join(', ')}.` : null;
  return { parentSessionId, requiredServers: required, connectedServers, failedServers, reason };
}
