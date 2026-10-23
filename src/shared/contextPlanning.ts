// Contratos preparados para revisão: a execução continua no manifesto legado até a entrega E5.
import type { BoardArtifact, ToolCategory } from './artifacts';
import type { BoardState } from './model';
import type { AiTool } from './harness';
import { NATIVE_AGENT_TOOLS } from './agentTools';

export const CONTEXT_ACTIONS = [
  'work',
  'refine',
  'summary',
  'conflict',
  'chat',
  'harness-agent',
  'harness-rule',
  'harness-skill',
  'harness-suggest',
] as const;
export type ContextAction = (typeof CONTEXT_ACTIONS)[number];
/** Vazio explícito é diferente de herança, inclusive para listas. */
export type ContextChoice<T> = { mode: 'inherit' } | { mode: 'explicit'; value: T };
export interface AgentContextContract {
  version: 1;
  role: string;
  instructions: string;
  essentialSkillIds: string[];
  availableSkillIds: string[];
  allowedMcpIds: string[];
  tools: { categories: ToolCategory[]; native: { tool: AiTool | ''; allow: string[]; deny: string[] } };
}
export interface ActivityContextSelection {
  version: 1;
  agent: ContextChoice<string | null>;
  model: ContextChoice<string>;
  additionalSkillIds: ContextChoice<string[]>;
  activeMcpIds: ContextChoice<string[]>;
  /** Referências aos anexos do board; critérios e dependências continuam em suas estruturas atuais. */
  inputAttachmentIds: string[];
  expectedResult: string;
}
export interface ContextActivityTarget {
  cardId: string | null;
  workflowId: string | null;
  /** ID estável da coluna; ausente nas ações sem fase. */
  phaseId: string;
  action: ContextAction;
}
export interface AgentContractRecord {
  artifactId: string;
  revision: number;
  updatedAt: number;
  contract: AgentContextContract;
}
export interface ActivitySelectionRecord extends ContextActivityTarget {
  reason?: string;
  id: string;
  revision: number;
  updatedAt: number;
  selection: ActivityContextSelection;
}
export interface LegacyContextReference {
  /** Não inventa identidade para uma origem ainda ausente do board. */
  artifactId: string | null;
  name: string;
}
export interface LegacyContextPlanning {
  version: 0;
  agents: { artifactId: string; essentialSkills: LegacyContextReference[]; legacyMcps: LegacyContextReference[] }[];
  cards: { cardId: string; selectedSkills: LegacyContextReference[]; legacyMcps: LegacyContextReference[] }[];
}
export interface ContextPlanningState {
  runtime: 'legacy';
  legacy: LegacyContextPlanning;
  /** Contratos novos são rascunhos; gravá-los não modifica as permissões nem a execução atual. */
  agents: AgentContractRecord[];
  activities: ActivitySelectionRecord[];
}
export type ContextPlanningWrite =
  | { kind: 'agent'; artifactId: string; expectedRevision: number; contract: AgentContextContract }
  | { kind: 'activity'; target: ContextActivityTarget; expectedRevision: number; selection: ActivityContextSelection; reason?: string };
export type ActivityContextWrite = Extract<ContextPlanningWrite, { kind: 'activity' }>;

/** Projeção de compatibilidade, sempre lida dos campos originais para não criar duas cópias divergentes. */
export function legacyContextPlanning(
  s: Pick<BoardState, 'cards' | 'fieldDefs' | 'fieldValues'>,
  artifacts: readonly Pick<BoardArtifact, 'id' | 'kind' | 'name' | 'agent'>[],
): LegacyContextPlanning {
  const refs = (kind: 'skill' | 'mcp', names: string[]): LegacyContextReference[] =>
    names.map((name) => ({
      artifactId: artifacts.find((a) => a.kind === kind && a.name === name)?.id ?? null,
      name,
    }));
  const field = (cardId: string, name: string): string[] => {
    const def = s.fieldDefs.find((f) => f.kind === 'multiselect' && f.name.toLowerCase() === name);
    const v = s.fieldValues.find((v) => v.cardId === cardId && v.fieldId === def?.id)?.value;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  };
  return {
    version: 0,
    agents: artifacts
      .filter((a) => a.kind === 'agent')
      .map((a) => ({
        artifactId: a.id,
        essentialSkills: refs('skill', a.agent?.skills ?? []),
        legacyMcps: refs('mcp', a.agent?.mcpServers ?? []),
      })),
    cards: s.cards.map((c) => ({
      cardId: c.id,
      selectedSkills: refs('skill', field(c.id, 'skills')),
      legacyMcps: refs('mcp', field(c.id, 'mcps')),
    })),
  };
}

function fail(): never {
  throw new Error('Configuração de contexto inválida ou versão não suportada.');
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function keys(v: unknown, expected: string[]): asserts v is Record<string, unknown> {
  if (!object(v) || Object.keys(v).length !== expected.length || expected.some((k) => !Object.hasOwn(v, k))) fail();
}
const text = (v: unknown, max = 524288): v is string => typeof v === 'string' && v.length <= max && !v.includes('\0');
export const contextId = (v: unknown): v is string => text(v, 240) && !!v.trim();
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 1000 && v.every(contextId) && new Set(v).size === v.length;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 1000 && v.every((x) => text(x, 1000));
function choice(v: unknown, valid: (v: unknown) => boolean): void {
  if (!object(v)) fail();
  if (v.mode === 'inherit') keys(v, ['mode']);
  else if (v.mode === 'explicit') {
    keys(v, ['mode', 'value']);
    if (!valid(v.value)) fail();
  } else fail();
}
/** Valida também chaves desconhecidas: definições/credenciais MCP não fazem parte deste contrato. */
export function validateAgentContext(v: unknown): asserts v is AgentContextContract {
  keys(v, ['version', 'role', 'instructions', 'essentialSkillIds', 'availableSkillIds', 'allowedMcpIds', 'tools']);
  if (
    v.version !== 1 ||
    !text(v.role, 2000) ||
    !text(v.instructions) ||
    !ids(v.essentialSkillIds) ||
    !ids(v.availableSkillIds) ||
    !ids(v.allowedMcpIds)
  )
    fail();
  keys(v.tools, ['categories', 'native']);
  if (
    !Array.isArray(v.tools.categories) ||
    v.tools.categories.some((c) => !['read', 'edit', 'run', 'net', 'agents'].includes(c)) ||
    new Set(v.tools.categories).size !== v.tools.categories.length
  )
    fail();
  keys(v.tools.native, ['tool', 'allow', 'deny']);
  if (
    typeof v.tools.native.tool !== 'string' ||
    !NATIVE_AGENT_TOOLS.includes(v.tools.native.tool) ||
    !strings(v.tools.native.allow) ||
    !strings(v.tools.native.deny)
  )
    fail();
}
export function validateActivityContext(v: unknown): asserts v is ActivityContextSelection {
  keys(v, ['version', 'agent', 'model', 'additionalSkillIds', 'activeMcpIds', 'inputAttachmentIds', 'expectedResult']);
  if (v.version !== 1 || !ids(v.inputAttachmentIds) || !text(v.expectedResult, 16000)) fail();
  choice(v.agent, (x) => x === null || contextId(x));
  choice(v.model, (x) => text(x, 240));
  choice(v.additionalSkillIds, ids);
  choice(v.activeMcpIds, ids);
}
export function validateContextReason(value: unknown): void {
  if (value !== undefined && !text(value, 4000)) throw new Error('Justificativa de contexto inválida.');
}
export function validateContextTarget(v: unknown): asserts v is ContextActivityTarget {
  keys(v, ['cardId', 'workflowId', 'phaseId', 'action']);
  if (
    (v.cardId !== null && !contextId(v.cardId)) ||
    (v.workflowId !== null && !contextId(v.workflowId)) ||
    (v.cardId !== null && v.workflowId !== null) ||
    (v.phaseId !== '' && !contextId(v.phaseId)) ||
    !CONTEXT_ACTIONS.includes(v.action as ContextAction)
  )
    fail();
}
