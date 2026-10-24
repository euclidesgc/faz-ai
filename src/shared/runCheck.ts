import { GEMINI_TOOL_EQUIVALENTS } from './agentTools';
import { KNOWN_TOOL_NAMES, MCP_DENY_ENTRY } from './apiTools';
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

/**
 * O leitor ACP grava o inventário pelo kind do protocolo (minúsculo), não pelo nome do Claude Code que o card usa.
 * Cada kind vira a lista de nomes equivalentes do card; `[]` é kind sem efeito ou não atribuível a uma ferramenta
 * (`think`, `switch_mode`, `other`), que nunca é desvio: a permissão já foi decidida em tempo real, por chamada.
 * Os nomes do Claude/Cursor/Kimi são capitalizados, então não colidem com estes.
 */
const ACP_KIND_EQUIVALENTS: Record<string, string[]> = {
  think: [],
  switch_mode: [],
  other: [],
  read: ['Read'],
  search: ['Grep', 'Glob'],
  edit: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'],
  delete: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'],
  move: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'],
  execute: ['Bash'],
  fetch: ['WebFetch', 'WebSearch'],
};

/**
 * De qual ferramenta veio o inventário, quando o vocabulário dela não é o do card nem o dos kinds do ACP: o
 * Gemini pela CLI grava os nomes internos dele (`read_file`, `run_shell_command`). A tabela do Gemini só vale
 * para o inventário dele: o Cursor também grava nomes minúsculos (`glob`, `read`, `shell`), e uma tabela
 * global leria o `glob` do Cursor como o do Gemini.
 */
export type RunCheckVocabulary = 'gemini';

/**
 * Os equivalentes no vocabulário do card: os kinds do ACP valem para todo inventário (como antes); os nomes do
 * Gemini, só no do Gemini pela CLI. Um nome sem equivalente é conferido como nome do card.
 */
export function equivalentsOf(name: string, vocabulary: RunCheckVocabulary | undefined): string[] | null {
  if (vocabulary === 'gemini' && Object.hasOwn(GEMINI_TOOL_EQUIVALENTS, name)) return GEMINI_TOOL_EQUIVALENTS[name]!;
  return Object.hasOwn(ACP_KIND_EQUIVALENTS, name) ? ACP_KIND_EQUIVALENTS[name]! : null;
}

/** As listas do card que restringem as ferramentas nativas, no vocabulário do card. */
export interface ToolRestriction {
  tools: readonly string[];
  deniedTools: readonly string[];
}

/** Por que um uso fere o card: um equivalente negado (o nome dele) ou nenhum equivalente na lista `tools`. */
export type ToolBreach = { denied: string } | { unlisted: true };

/**
 * A regra única de uma ferramenta nativa contra o card, pelos equivalentes dela no vocabulário do card: fere
 * quando algum equivalente está em `deniedTools`, ou quando nenhum está em `tools` (lista não vazia). Sem
 * equivalente (`[]`: `think`, `switch_mode`, `other`) nunca fere. A conferência depois da execução
 * (`toolDeviates`) e a decisão em tempo real do ACP (`boardDecision`) perguntam por aqui.
 */
export function equivalentsBreach(equivalents: readonly string[], restriction: ToolRestriction): ToolBreach | null {
  if (equivalents.length === 0) return null;
  const denied = equivalents.find((e) => restriction.deniedTools.includes(e));
  if (denied) return { denied };
  if (restriction.tools.length > 0 && !equivalents.some((e) => restriction.tools.includes(e))) return { unlisted: true };
  return null;
}

/**
 * Desvio de uma ferramenta nativa. Nome do card: negada, ou fora de `tools` (lista não vazia). Kind ACP ou nome
 * do Gemini: a regra dos equivalentes (`equivalentsBreach`).
 */
function toolDeviates(name: string, manifest: RunCheckManifest, vocabulary?: RunCheckVocabulary): boolean {
  const equivalents = equivalentsOf(name, vocabulary);
  if (!equivalents) return manifest.deniedTools.includes(name) || (manifest.tools.length > 0 && !manifest.tools.includes(name));
  return equivalentsBreach(equivalents, manifest) !== null;
}

/**
 * Se uma entrada de `deniedTools` do card nega a ferramenta MCP `tool` do servidor `server`: o nome exato
 * (`mcp__servidor__ferramenta`, com o servidor escrito como o Claude Code escreve: o que não for letra, número,
 * `_` ou `-` vira `_`), o servidor inteiro (`mcp__servidor__*`) ou só o prefixo do servidor (`mcp__servidor`).
 * A ferramenta passa pela mesma normalização, e nada diferencia maiúsculas: o nome que o agente mostra (`Search`
 * no título do Gemini) pode não ser o do servidor (`search`), e na dúvida vale negar. A entrada também é
 * normalizada (`mcp__my.srv__x` nega a `x` do `my.srv`), e `mcp__srv__x*` nega as que começam por `x`. Um nome
 * que o Gemini truncou (com `...`, acima de 64 caracteres) não dá para comparar: qualquer negada do servidor nega.
 */
export function deniesMcpTool(entry: string, server: string, tool: string): boolean {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_*-]/g, '_').toLowerCase();
  const m = /^mcp__(.+?)(?:__(.+))?$/i.exec(entry.trim());
  if (!m || clean(m[1]!) !== clean(server)) return false;
  const pattern = m[2];
  if (!pattern || pattern === '*' || tool.includes('...')) return true;
  if (pattern.endsWith('*')) return clean(tool).startsWith(clean(pattern.slice(0, -1)));
  return clean(pattern) === clean(tool);
}

/** Os nomes reconhecidos numa negada, na grafia exata: os do modo API (`KNOWN_TOOL_NAMES`) e os equivalentes das tabelas. */
const CARD_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...KNOWN_TOOL_NAMES,
  ...Object.values(ACP_KIND_EQUIVALENTS).flat(),
  ...Object.values(GEMINI_TOOL_EQUIVALENTS).flat(),
]);

/**
 * Se um nome negado é reconhecido no ACP: a mesma lista que o modo API aceita (`KNOWN_TOOL_NAMES`, com os nomes
 * nativos de cada ferramenta), os equivalentes das tabelas e os nomes MCP (`MCP_DENY_ENTRY`), mas na grafia
 * exata. Uma regra fina (`Bash(rm:*)`) ou outra grafia (`bash`) não é: a negação dela não tem tradução para o
 * pedido do agente, que é comparado por equivalentes.
 */
export function isCardToolName(name: string): boolean {
  return MCP_DENY_ENTRY.test(name) || CARD_TOOL_NAMES.has(name);
}

const isFlowSkill = (name: string): boolean => name.startsWith(FLOW_SKILL_PREFIX);

/**
 * Compara o inventário da execução com o manifesto do card. `boardServer` (o servidor do board) é sempre
 * liberado. Inventário vazio não prova que nada foi usado (a ferramenta pode não informar), então vira
 * `unchecked`, nunca `ok`. Ferramentas nativas só são conferidas contra `tools` quando a lista não é vazia.
 * `vocabulary` diz quando o inventário está nos nomes de uma ferramenta (o Gemini pela CLI).
 */
export function checkRun(
  report: Pick<RunReport, 'measure' | 'inventory'>,
  manifest: RunCheckManifest,
  boardServer: string,
  vocabulary?: RunCheckVocabulary,
): RunCheck {
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
        if (toolDeviates(item.name, manifest, vocabulary)) flag('tool', item.name, item.calls);
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
