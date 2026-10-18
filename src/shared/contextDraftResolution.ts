// Prévia dos rascunhos de E3: não é uma autorização de execução nem substitui a admissão de #729.
import type { BoardArtifact } from './artifacts';
import {
  validateActivityContext,
  validateAgentContext,
  validateContextTarget,
  type ActivityContextSelection,
  type ActivitySelectionRecord,
  type AgentContextContract,
  type ContextActivityTarget,
  type ContextChoice,
} from './contextPlanning';
import type { BoardState } from './model';

export type ContextDraftOrigin =
  'card-phase' | 'card-action' | 'workflow-phase' | 'workflow-action' | 'board-phase' | 'board-action' | 'agent-essential' | 'board-always';
type SelectionField = 'agent' | 'model' | 'additionalSkillIds' | 'activeMcpIds';
export interface ContextDraftDiagnostic {
  code:
    | 'admission-unavailable'
    | 'invalid-target'
    | 'invalid-selection'
    | 'agent-required'
    | 'contract-required'
    | 'invalid-contract'
    | 'missing-artifact'
    | 'disabled-artifact'
    | 'wrong-kind'
    | 'mcp-outside-agent'
    | 'missing-input'
    | 'input-outside-board';
  artifactId?: string;
}
export interface ContextDraftItem {
  artifactId: string;
  kind: BoardArtifact['kind'];
  name: string;
  origins: ContextDraftOrigin[];
}
export interface ContextDraftTrace {
  origin: ContextDraftOrigin;
  selectionId: string | null;
  revision: number | null;
  fields: Record<SelectionField, 'absent' | 'inherit' | 'explicit'>;
}
export interface ContextDraftResolution {
  target: ContextActivityTarget;
  agent: { artifactId: string; revision: number } | null;
  /** Escolha solicitada; a decisão do modelo/fallback continua no motor de políticas existente. */
  model: { choice: ContextChoice<string>; origin: ContextDraftOrigin | null };
  items: ContextDraftItem[];
  inputAttachmentIds: string[];
  expectedResult: string;
  activityOrigin: ContextDraftOrigin | null;
  /** São restrições solicitadas, não um mapeamento imposto pelo executor. */
  requestedTools: AgentContextContract['tools'] | null;
  trace: ContextDraftTrace[];
  diagnostics: ContextDraftDiagnostic[];
  /** Não aceita um booleano do cliente como prova de capacidade ou admissão. */
  admission: { state: 'unavailable'; dependency: 729 };
  canExecute: false;
}

const FIELDS: SelectionField[] = ['agent', 'model', 'additionalSkillIds', 'activeMcpIds'];
type Source = { origin: ContextDraftOrigin; row: ActivitySelectionRecord | undefined };

/** Mesmas entradas produzem a mesma prévia; nenhuma seleção legada é reinterpretada como contrato v1. */
export function resolveContextDraft(s: BoardState, target: ContextActivityTarget): ContextDraftResolution {
  const result: ContextDraftResolution = {
    target: { ...target },
    agent: null,
    model: { choice: { mode: 'inherit' }, origin: null },
    items: [],
    inputAttachmentIds: [],
    expectedResult: '',
    activityOrigin: null,
    requestedTools: null,
    trace: [],
    diagnostics: [{ code: 'admission-unavailable' }],
    admission: { state: 'unavailable', dependency: 729 },
    canExecute: false,
  };
  const diagnostic = (code: ContextDraftDiagnostic['code'], artifactId?: string) => {
    if (!result.diagnostics.some((d) => d.code === code && d.artifactId === artifactId))
      result.diagnostics.push({ code, ...(artifactId === undefined ? {} : { artifactId }) });
  };
  try {
    validateContextTarget(target);
  } catch {
    diagnostic('invalid-target');
    return result;
  }
  const card = target.cardId === null ? undefined : s.cards.find((c) => c.id === target.cardId && c.boardId === s.board.id);
  const workflowId = card?.workflowId ?? target.workflowId;
  const workflow = workflowId === null ? undefined : s.workflows.find((w) => w.id === workflowId && w.boardId === s.board.id);
  const phase = target.phaseId ? s.columns.find((p) => p.id === target.phaseId) : undefined;
  if (
    (target.cardId !== null && !card) ||
    (workflowId !== null && !workflow) ||
    (target.phaseId &&
      (!phase ||
        !s.workflows.some((w) => w.id === phase.workflowId && w.boardId === s.board.id) ||
        (workflowId !== null && phase.workflowId !== workflowId)))
  ) {
    diagnostic('invalid-target');
    return result;
  }
  const records = s.contextPlanning?.activities ?? [];
  const source = (origin: ContextDraftOrigin, cardId: string | null, wf: string | null, phaseId: string): Source => ({
    origin,
    row: records.find((r) => r.cardId === cardId && r.workflowId === wf && r.phaseId === phaseId && r.action === target.action),
  });
  const sources: Source[] = [];
  if (card) {
    if (target.phaseId) sources.push(source('card-phase', card.id, null, target.phaseId));
    sources.push(source('card-action', card.id, null, ''));
  }
  if (workflow) {
    if (target.phaseId) sources.push(source('workflow-phase', null, workflow.id, target.phaseId));
    sources.push(source('workflow-action', null, workflow.id, ''));
  }
  if (target.phaseId) sources.push(source('board-phase', null, null, target.phaseId));
  sources.push(source('board-action', null, null, ''));
  for (const src of sources) {
    const row = src.row;
    if (row) {
      try {
        validateActivityContext(row.selection);
      } catch {
        diagnostic('invalid-selection');
        return result;
      }
    }
    result.trace.push({
      origin: src.origin,
      selectionId: row?.id ?? null,
      revision: row?.revision ?? null,
      fields: Object.fromEntries(FIELDS.map((field) => [field, row?.selection[field].mode ?? 'absent'])) as ContextDraftTrace['fields'],
    });
  }
  const choose = <K extends SelectionField>(field: K): { choice: ActivityContextSelection[K]; origin: ContextDraftOrigin | null } => {
    const winner = sources.find((src) => src.row?.selection[field].mode === 'explicit');
    return { choice: winner ? winner.row!.selection[field] : { mode: 'inherit' }, origin: winner?.origin ?? null };
  };
  const model = choose('model');
  result.model = { choice: { ...model.choice }, origin: model.origin };
  // Entradas e resultado pertencem à atividade mais específica, sem unir prompts de outras ações.
  const activitySource = sources.find((src) => src.row);
  const activity = activitySource?.row?.selection;
  result.activityOrigin = activitySource?.origin ?? null;
  result.inputAttachmentIds = [...(activity?.inputAttachmentIds ?? [])];
  result.expectedResult = activity?.expectedResult ?? '';
  for (const id of result.inputAttachmentIds) {
    const attachment = s.attachments.find((a) => a.id === id);
    if (!attachment) diagnostic('missing-input', id);
    else if (!s.cards.some((c) => c.id === attachment.cardId && c.boardId === s.board.id)) diagnostic('input-outside-board', id);
  }
  const artifacts = s.harness.library?.artifacts ?? [];
  const artifact = (id: string, kind: BoardArtifact['kind']): BoardArtifact | undefined => {
    const a = artifacts.find((a) => a.id === id);
    if (!a || a.missing) {
      diagnostic('missing-artifact', id);
      return undefined;
    }
    if (a.kind !== kind) {
      diagnostic('wrong-kind', id);
      return undefined;
    }
    if (a.usage === 'off') {
      diagnostic('disabled-artifact', id);
      return undefined;
    }
    return a;
  };
  const add = (a: BoardArtifact, origin: ContextDraftOrigin) => {
    const current = result.items.find((i) => i.artifactId === a.id);
    if (current) {
      if (!current.origins.includes(origin)) current.origins.push(origin);
    } else result.items.push({ artifactId: a.id, kind: a.kind, name: a.name, origins: [origin] });
  };
  const agent = choose('agent');
  if (agent.choice.mode !== 'explicit' || agent.choice.value === null) {
    diagnostic('agent-required');
    return result;
  }
  const selectedAgent = artifact(agent.choice.value, 'agent');
  if (!selectedAgent) return result;
  const contract = s.contextPlanning?.agents.find((a) => a.artifactId === selectedAgent.id);
  if (!contract) {
    diagnostic('contract-required', selectedAgent.id);
    return result;
  }
  try {
    validateAgentContext(contract.contract);
  } catch {
    diagnostic('invalid-contract', selectedAgent.id);
    return result;
  }
  result.agent = { artifactId: selectedAgent.id, revision: contract.revision };
  // Copia os arrays: editar o retorno nunca muda o rascunho usado como entrada.
  result.requestedTools = {
    categories: [...contract.contract.tools.categories],
    native: {
      ...contract.contract.tools.native,
      allow: [...contract.contract.tools.native.allow],
      deny: [...contract.contract.tools.native.deny],
    },
  };
  add(selectedAgent, agent.origin!);
  for (const id of contract.contract.essentialSkillIds) {
    const a = artifact(id, 'skill');
    if (a) add(a, 'agent-essential');
  }
  const additional = choose('additionalSkillIds');
  // Disponíveis são catálogo de sugestões, não proibição de skills adicionais da atividade.
  if (additional.choice.mode === 'explicit')
    for (const id of additional.choice.value) {
      const a = artifact(id, 'skill');
      if (a) add(a, additional.origin!);
    }
  const allowedMcps = new Set(contract.contract.allowedMcpIds);
  const mcp = (id: string, origin: ContextDraftOrigin) => {
    const a = artifact(id, 'mcp');
    if (!allowedMcps.has(id)) diagnostic('mcp-outside-agent', id);
    else if (a) add(a, origin);
  };
  const activeMcps = choose('activeMcpIds');
  if (activeMcps.choice.mode === 'explicit') for (const id of activeMcps.choice.value) mcp(id, activeMcps.origin!);
  for (const a of artifacts)
    if (a.usage === 'always') {
      if (a.kind === 'mcp') mcp(a.id, 'board-always');
      else if (a.kind === 'skill' || a.kind === 'rule') {
        const valid = artifact(a.id, a.kind);
        if (valid) add(valid, 'board-always');
      }
    }
  // O MCP obrigatório do board também precisará da admissão de operações de #729; não o libera implicitamente.
  return result;
}
