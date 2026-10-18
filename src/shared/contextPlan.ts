// Composição do plano em rascunho. A execução e o modelo continuam nos mecanismos existentes.
import type { BoardState, Card } from './model';
import type { ActivityContextSelection, ActivityContextWrite, ContextAction, ContextActivityTarget } from './contextPlanning';
import { resolveContextDraft, type ContextDraftResolution } from './contextDraftResolution';
import { tokensOf } from './contextEstimate';

export const CONTEXT_ACTION_LABELS: Record<ContextAction, string> = {
  work: 'Trabalho',
  refine: 'Refino',
  summary: 'Resumo',
  conflict: 'Resolução de conflitos',
  chat: 'Conversa do board',
  'harness-agent': 'Assistente de agentes',
  'harness-rule': 'Assistente de rules',
  'harness-skill': 'Assistente de skills',
  'harness-suggest': 'Sugestões do Harness',
};
export const CARD_CONTEXT_ACTIONS: ContextAction[] = ['work', 'refine', 'summary', 'conflict'];
export const contextTargetKey = (t: ContextActivityTarget): string => JSON.stringify([t.cardId, t.workflowId, t.phaseId, t.action]);
export const emptyActivityContext = (): ActivityContextSelection => ({
  version: 1,
  agent: { mode: 'inherit' },
  model: { mode: 'inherit' },
  additionalSkillIds: { mode: 'inherit' },
  activeMcpIds: { mode: 'inherit' },
  inputAttachmentIds: [],
  expectedResult: '',
});
export function activityDraft(s: BoardState, target: ContextActivityTarget): ActivityContextWrite {
  const row = s.contextPlanning?.activities.find((r) => contextTargetKey(r) === contextTargetKey(target));
  return {
    kind: 'activity',
    target: { ...target },
    expectedRevision: row?.revision ?? 0,
    selection: structuredClone(row?.selection ?? emptyActivityContext()),
    reason: row?.reason ?? '',
  };
}
export function withContextDrafts(s: BoardState, drafts: readonly ActivityContextWrite[]): BoardState {
  const keys = new Set(drafts.map((d) => contextTargetKey(d.target)));
  return {
    ...s,
    contextPlanning: {
      runtime: 'legacy',
      legacy: s.contextPlanning?.legacy ?? { version: 0, agents: [], cards: [] },
      agents: s.contextPlanning?.agents ?? [],
      activities: [
        ...(s.contextPlanning?.activities ?? []).filter((r) => !keys.has(contextTargetKey(r))),
        ...drafts.map((d) => ({
          ...d.target,
          id: `draft:${contextTargetKey(d.target)}`,
          revision: d.expectedRevision + 1,
          updatedAt: 0,
          selection: structuredClone(d.selection),
          ...(d.reason ? { reason: d.reason } : {}),
        })),
      ],
    },
  };
}
export function cardContextTargets(s: BoardState, card: Card): ContextActivityTarget[] {
  const targets: ContextActivityTarget[] = CARD_CONTEXT_ACTIONS.map((action) => ({
    cardId: card.id,
    workflowId: null,
    phaseId: '',
    action,
  }));
  if (s.workflows.find((w) => w.id === card.workflowId)?.kind === 'parent')
    targets.splice(
      1,
      0,
      ...s.columns
        .filter((p) => p.workflowId === card.workflowId && !p.isTerminal)
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ cardId: card.id, workflowId: null, phaseId: p.id, action: 'work' as const })),
    );
  return targets;
}
/** A tarefa guarda uma seleção por ação, mas mostra os padrões da fase atual no caminho de herança. */
export function previewTarget(s: BoardState, target: ContextActivityTarget): ContextActivityTarget {
  const card = s.cards.find((c) => c.id === target.cardId);
  const isTask = card && s.workflows.find((w) => w.id === card.workflowId)?.kind === 'child';
  return card && !target.phaseId && (isTask || target.action !== 'work') ? { ...target, phaseId: card.columnId } : target;
}
export function planPreview(
  s: BoardState,
  target: ContextActivityTarget,
  drafts: readonly ActivityContextWrite[] = [],
): ContextDraftResolution {
  return resolveContextDraft(withContextDrafts(s, drafts), previewTarget(s, target));
}
/** Somente a parcela conhecida do contexto inicial. MCP, anexos e apoios sem medida ficam explícitos. */
export function estimateContextDraft(s: BoardState, resolved: ContextDraftResolution): { knownTokens: number; unknownIds: string[] } {
  const card = s.cards.find((c) => c.id === resolved.target.cardId);
  let chars = card
    ? card.title.length +
      card.description.length +
      s.checklistItems.filter((i) => i.cardId === card.id).reduce((n, i) => n + i.text.length, 0)
    : 0;
  chars += resolved.expectedResult.length + (s.columns.find((p) => p.id === resolved.target.phaseId)?.aiInstruction.length ?? 0);
  const unknown = new Set(resolved.inputAttachmentIds);
  const contract = s.contextPlanning?.agents.find((a) => a.artifactId === resolved.agent?.artifactId)?.contract;
  if (contract) chars += contract.role.length + contract.instructions.length;
  for (const item of resolved.items) {
    if (item.kind === 'agent') continue;
    const a = s.harness.library?.artifacts.find((a) => a.id === item.artifactId);
    if (item.kind === 'mcp' || a?.size === undefined) unknown.add(item.artifactId);
    else chars += a.size;
    if (a?.files.length) unknown.add(item.artifactId);
  }
  return { knownTokens: tokensOf(chars), unknownIds: [...unknown] };
}
