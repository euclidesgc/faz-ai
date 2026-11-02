import { manifestOf, type ExecManifest } from '../shared/execution';
import { BOARD_MCP_NAME } from '../shared/harnessSelection';
import type { BoardState, Card } from '../shared/model';

/** MCP authority inherited by every native child of a Codex ACP story session. */
export interface StorySessionMcpPreflight {
  required: string[];
  missing: string[];
  allowed: boolean;
  reason: string | null;
}

/**
 * The principal's session must be prepared for every known child manifest, since native ACP children
 * inherit its MCP configuration. This describes shared availability; it does not provide per-child isolation.
 */
export function requiredMcpServersForStory(state: BoardState, storyId: string): string[] {
  const childCards = state.cards.filter((card) => card.parentId === storyId);
  return requiredMcpServersForManifests(childCards.map((card) => manifestOf(state, card)));
}

/** MCP servers required by the child currently being considered for delegation. */
export function requiredMcpServersForCard(state: BoardState, child: Card): string[] {
  return requiredMcpServersForManifests([manifestOf(state, child)]);
}

/** Collect server names from already-resolved child manifests, excluding the board's own server. */
export function requiredMcpServersForManifests(manifests: readonly Pick<ExecManifest, 'mcpServers'>[]): string[] {
  return [...new Set(manifests.flatMap((manifest) => manifest.mcpServers))]
    .filter((name) => name !== BOARD_MCP_NAME)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Fail closed unless every required server has been confirmed configured and ready on the live ACP session.
 * `configuredReady` must come from session state/handshake evidence, not merely the proposed mcpConfig.
 */
export function preflightStoryChildMcp(
  required: readonly string[],
  configured: readonly string[] | null | undefined,
  ready: readonly string[] | null | undefined,
): StorySessionMcpPreflight {
  const normalizedRequired = [...new Set(required.filter((name) => name && name !== BOARD_MCP_NAME))].sort((a, b) => a.localeCompare(b));
  const configuredNames = configured == null ? new Set<string>() : new Set(configured);
  const readyNames = ready == null ? new Set<string>() : new Set(ready);
  const missing = normalizedRequired.filter((name) => !configuredNames.has(name) || !readyNames.has(name));
  if (missing.length) {
    const reason = `Delegação bloqueada: a sessão principal ainda não tem MCP(s) configurado(s) e pronto(s): ${missing.join(', ')}.`;
    return { required: normalizedRequired, missing, allowed: false, reason };
  }
  return { required: normalizedRequired, missing: [], allowed: true, reason: null };
}
