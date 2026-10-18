import { estimateAgentContext, estimateContext, tokensOf, type ContextEstimate } from './contextEstimate';
import { contextAgentOrigin, contextFilesOf, type ContextOrigin } from './contextSources';
import {
  agentManifestOf,
  EXEC_ENFORCEMENT,
  executionCardSelectionsOf,
  manifestOf,
  profileOf,
  type ExecManifest,
  type ExecProfile,
} from './execution';
import { BOARD_MCP_NAME, selectedMcpNames, toolItemsOf } from './harnessSelection';
import type { BoardState, Card } from './model';

export interface ExecutionContextItem {
  id: string;
  kind: 'agent' | 'subagent' | 'rule' | 'skill' | 'mcp';
  name: string;
  location?: string;
  origins: ContextOrigin[];
  tokens: number | null;
}

export interface InstructionOverlap {
  agents: string[];
  characters: number;
}

export interface ExecutionContextPreview {
  estimate: ContextEstimate;
  items: ExecutionContextItem[];
  enforcement: (typeof EXEC_ENFORCEMENT)[keyof typeof EXEC_ENFORCEMENT];
  overlaps: InstructionOverlap[];
}

/** Somente parágrafos idênticos de tamanho significativo; não tenta inferir conflito semântico. */
function instructionOverlaps(m: ExecManifest): InstructionOverlap[] {
  const paragraphs = new Map<string, Set<string>>();
  for (const agent of [{ name: m.agent || m.profile || '', instructions: m.instructions }, ...m.delegates]) {
    for (const text of agent.instructions.split(/\n\s*\n/)) {
      const normalized = text.trim().replace(/\s+/g, ' ');
      if (normalized.length < 80) continue;
      const names = paragraphs.get(normalized) ?? new Set<string>();
      names.add(agent.name);
      paragraphs.set(normalized, names);
    }
  }
  return [...paragraphs].filter(([, names]) => names.size > 1).map(([text, names]) => ({ agents: [...names], characters: text.length }));
}

function preview(s: BoardState, m: ExecManifest, estimate: ContextEstimate, p: ExecProfile | undefined, c?: Card): ExecutionContextPreview {
  const items: ExecutionContextItem[] = [];
  if (p) {
    const artifact = s.harness.library?.artifacts.find((a) => a.kind === 'agent' && a.name === p.id);
    items.push({
      id: `agent:${artifact?.id ?? (p.path || p.id)}`,
      kind: 'agent',
      name: p.name,
      location: p.path || undefined,
      origins: c ? contextAgentOrigin(s, c, p) : ['agent'],
      tokens: m.agent ? tokensOf(m.instructions.length + m.purpose.length) : 0,
    });
  }
  if (s.board.aiTool === 'claude')
    for (const d of m.delegates)
      items.push({
        id: `delegate:${d.name}`,
        kind: 'subagent',
        name: d.name,
        origins: ['delegate'],
        tokens: tokensOf(d.name.length + d.purpose.length),
      });
  const files = contextFilesOf(s, m, p, c);
  for (const kind of ['rule', 'skill'] as const)
    for (const file of kind === 'rule' ? files.rules : files.skills)
      items.push({
        id: file.id,
        kind,
        name: file.name,
        location: file.item?.location,
        origins: file.origins,
        tokens: file.item?.size === undefined ? null : tokensOf(file.item.size),
      });
  const footprint = estimate.groups.find((g) => g.id === 'mcp');
  items.push({
    id: `mcp:${BOARD_MCP_NAME}`,
    kind: 'mcp',
    name: BOARD_MCP_NAME,
    origins: ['board'],
    tokens: s.boardServer ? (footprint?.tokens ?? 0) : null,
  });
  const always = selectedMcpNames(s, 'always');
  const explicit = executionCardSelectionsOf(s, c ?? null).mcps;
  for (const name of m.mcpServers) {
    const item = toolItemsOf(s).find((i) => i.kind === 'mcp' && i.name === name);
    const origins: ContextOrigin[] = [];
    if (p?.mcpServers.includes(name)) origins.push('agent');
    if (explicit.includes(name)) origins.push('card');
    if (always.includes(name)) origins.push('always');
    items.push({ id: `mcp:${item?.boardArtifactId ?? name}`, kind: 'mcp', name, location: item?.location, origins, tokens: null });
  }
  return {
    estimate,
    items,
    enforcement: EXEC_ENFORCEMENT[s.board.aiTool],
    overlaps: instructionOverlaps(s.board.aiTool === 'claude' ? m : { ...m, delegates: [] }),
  };
}

/** Leitura pura do mesmo manifesto usado na execução, sem spawn, IA ou acesso a credenciais. */
export function executionContextOf(s: BoardState, card: Card): ExecutionContextPreview {
  return preview(s, manifestOf(s, card), estimateContext(s, card), profileOf(s, card), card);
}

/** Mostra o rascunho do agente com os itens Sempre; seleções específicas de cards não entram. */
export function agentContextOf(s: BoardState, profile: ExecProfile): ExecutionContextPreview {
  return preview(s, agentManifestOf(s, profile), estimateAgentContext(s, profile), profile);
}
