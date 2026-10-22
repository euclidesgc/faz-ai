import type { ExecManifest } from './execution';
import { splitMcpName, type RunReport } from './log';

// Conferência da execução: o que a sessão usou (inventário do relatório) contra o que o card pediu
// (manifesto). Função pura, sem I/O: só informa, nunca bloqueia.

export type RunCheckKind = 'mcp_server' | 'agent' | 'skill' | 'tool';

export interface RunDeviation {
  kind: RunCheckKind;
  name: string;
  calls: number;
}

export type RunCheck =
  { status: 'ok' } | { status: 'deviation'; deviations: RunDeviation[] } | { status: 'unchecked'; reason: 'no_inventory' | 'not_measured' };

/** O que a conferência lê do manifesto. */
export type RunCheckManifest = Pick<ExecManifest, 'skills' | 'mcpServers' | 'tools' | 'deniedTools' | 'agent'>;

/** Prefixo das skills do fluxo do board, que vêm pelo `get_skill` e nunca contam como desvio. */
const FLOW_SKILL_PREFIX = 'faz-ai-';

const isFlowSkill = (name: string): boolean => name.startsWith(FLOW_SKILL_PREFIX);

/**
 * Compara o inventário da execução com o manifesto do card. `boardServer` (o servidor do board) é sempre
 * liberado. Inventário vazio não prova que nada foi usado (a ferramenta pode não informar), então vira
 * `unchecked`, nunca `ok`. Ferramentas nativas só são conferidas contra `tools` quando a lista não é vazia.
 */
export function checkRun(report: Pick<RunReport, 'measure' | 'inventory'>, manifest: RunCheckManifest, boardServer: string): RunCheck {
  if (report.measure === 'none') return { status: 'unchecked', reason: 'not_measured' };
  if (report.inventory.length === 0) return { status: 'unchecked', reason: 'no_inventory' };

  const deviations = new Map<string, RunDeviation>();
  const flag = (kind: RunCheckKind, name: string, calls: number): void => {
    const key = `${kind}\u0000${name}`;
    const known = deviations.get(key);
    if (known) known.calls += calls;
    else deviations.set(key, { kind, name, calls });
  };

  for (const item of report.inventory) {
    switch (item.kind) {
      case 'mcp_tool': {
        const { server } = splitMcpName(item.name);
        if (!server) flag('mcp_server', item.name, item.calls);
        else if (server !== boardServer && !manifest.mcpServers.includes(server)) flag('mcp_server', server, item.calls);
        break;
      }
      case 'agent':
        if (!manifest.agent || item.name !== manifest.agent) flag('agent', item.name, item.calls);
        break;
      case 'skill':
        if (!isFlowSkill(item.name) && !manifest.skills.includes(item.name)) flag('skill', item.name, item.calls);
        break;
      case 'tool':
        if (manifest.deniedTools.includes(item.name)) flag('tool', item.name, item.calls);
        else if (manifest.tools.length > 0 && !manifest.tools.includes(item.name)) flag('tool', item.name, item.calls);
        break;
    }
  }

  return deviations.size === 0 ? { status: 'ok' } : { status: 'deviation', deviations: [...deviations.values()] };
}

/** O que vai para `check_detail`: os desvios, ou a razão de não conferir; `ok` não tem detalhe. */
export function runCheckDetail(check: RunCheck): RunDeviation[] | string | null {
  if (check.status === 'deviation') return check.deviations;
  if (check.status === 'unchecked') return check.reason;
  return null;
}

/**
 * Reconstrói a conferência gravada. `NULL` (execução anterior à conferência) e qualquer valor que não se
 * reconhece leem como "não conferida": a leitura nunca afirma "sem desvio" sem ter conferido.
 */
export function runCheckFrom(status: string | null | undefined, detail: string | null | undefined): RunCheck {
  if (status === 'ok') return { status: 'ok' };
  if (status === 'deviation') {
    try {
      const parsed: unknown = detail ? JSON.parse(detail) : null;
      if (Array.isArray(parsed)) return { status: 'deviation', deviations: parsed as RunDeviation[] };
    } catch {
      // detalhe corrompido: cai para "não conferida"
    }
  }
  let reason: 'no_inventory' | 'not_measured' = 'not_measured';
  try {
    if (status === 'unchecked' && detail && JSON.parse(detail) === 'no_inventory') reason = 'no_inventory';
  } catch {
    // mantém o padrão
  }
  return { status: 'unchecked', reason };
}

const KIND_LABEL: Record<RunCheckKind, string> = {
  mcp_server: 'servidor MCP',
  agent: 'subagente',
  skill: 'skill',
  tool: 'ferramenta',
};

const describeDeviations = (deviations: RunDeviation[]): string => deviations.map((d) => `${KIND_LABEL[d.kind]} ${d.name}`).join('; ');

/** A linha da conferência no registro da execução (canal de log): sem desvio, com desvio e a lista, ou não conferida. */
export function runCheckLine(check: RunCheck): string {
  switch (check.status) {
    case 'ok':
      return 'Conferência: sem desvio.';
    case 'deviation':
      return `Conferência: com desvio (${check.deviations.length}): ${describeDeviations(check.deviations)}.`;
    case 'unchecked':
      return check.reason === 'not_measured'
        ? 'Conferência: não conferida (a execução não foi medida).'
        : 'Conferência: não conferida (a ferramenta não informou o que foi usado).';
  }
}

/** A mensagem do board na conversa do card; `null` quando não há desvio (sem desvio e não conferida ficam só no registro). */
export function runCheckNotice(check: RunCheck): string | null {
  if (check.status !== 'deviation') return null;
  return `Conferência: a execução usou algo fora do que o card liberou (${describeDeviations(check.deviations)}).`;
}
