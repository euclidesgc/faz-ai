import { describe, expect, it } from 'vitest';
import { resolveContextDraft } from '../src/shared/contextDraftResolution';
import type {
  ActivityContextSelection,
  ActivitySelectionRecord,
  AgentContextContract,
  ContextActivityTarget,
} from '../src/shared/contextPlanning';
import type { BoardArtifact } from '../src/shared/artifacts';
import { boardState, card, sub } from './fakes/board';

const contract = (over: Partial<AgentContextContract> = {}): AgentContextContract => ({
  version: 1,
  role: 'Dev',
  instructions: 'Instruções privadas',
  essentialSkillIds: ['essential'],
  availableSkillIds: ['optional'],
  allowedMcpIds: ['mcp'],
  tools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
  ...over,
});
const selection = (over: Partial<ActivityContextSelection> = {}): ActivityContextSelection => ({
  version: 1,
  agent: { mode: 'inherit' },
  model: { mode: 'inherit' },
  additionalSkillIds: { mode: 'inherit' },
  activeMcpIds: { mode: 'inherit' },
  inputAttachmentIds: [],
  expectedResult: '',
  ...over,
});
const artifact = (id: string, kind: BoardArtifact['kind'], over: Partial<BoardArtifact> = {}): BoardArtifact => ({
  id,
  name: id,
  kind,
  description: '',
  body: 'Conteúdo privado',
  usage: 'contextual',
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  path: '',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});
const row = (
  id: string,
  value: Partial<ActivityContextSelection>,
  target: Partial<ContextActivityTarget> = {},
): ActivitySelectionRecord => ({
  id,
  cardId: null,
  workflowId: null,
  phaseId: '',
  action: 'work',
  revision: 1,
  updatedAt: 0,
  selection: selection(value),
  ...target,
});
const target: ContextActivityTarget = { cardId: 'task', workflowId: null, phaseId: 'todo', action: 'work' };
function state() {
  const s = boardState({ cards: [card('story', { execProfile: 'legacy' }), sub('task', 'story', 'todo', { execProfile: 'legacy' })] });
  s.harness = {
    ...s.harness,
    library: {
      directory: '',
      artifacts: [
        artifact('dev', 'agent'),
        artifact('reviewer', 'agent'),
        artifact('essential', 'skill'),
        artifact('optional', 'skill'),
        artifact('extra', 'skill'),
        artifact('rule', 'rule', { usage: 'always' }),
        artifact('mcp', 'mcp'),
      ],
    },
  };
  s.contextPlanning = {
    runtime: 'legacy',
    legacy: { version: 0, agents: [], cards: [] },
    agents: [
      { artifactId: 'dev', revision: 2, updatedAt: 0, contract: contract() },
      { artifactId: 'reviewer', revision: 1, updatedAt: 0, contract: contract({ allowedMcpIds: [] }) },
    ],
    activities: [row('board', { agent: { mode: 'explicit', value: 'dev' } })],
  };
  return s;
}
const explicit = <T>(value: T): { mode: 'explicit'; value: T } => ({ mode: 'explicit', value });

describe('resolução pura dos rascunhos de contexto', () => {
  it('resolve precedência por campo e publica caminho sem usar a herança legada da história', () => {
    const s = state();
    s.contextPlanning!.activities.push(
      row('workflow', { agent: explicit('reviewer'), additionalSkillIds: explicit(['optional']) }, { workflowId: 'wc' }),
      row('phase', { agent: explicit('dev'), activeMcpIds: explicit(['mcp']) }, { workflowId: 'wc', phaseId: 'todo' }),
      row('task', { model: explicit('claude:opus@high') }, { cardId: 'task' }),
    );
    const result = resolveContextDraft(s, target);
    expect(result.agent).toEqual({ artifactId: 'dev', revision: 2 });
    expect(result.model).toEqual({ choice: explicit('claude:opus@high'), origin: 'card-action' });
    expect(result.trace.map((x) => [x.origin, x.selectionId])).toEqual([
      ['card-phase', null],
      ['card-action', 'task'],
      ['workflow-phase', 'phase'],
      ['workflow-action', 'workflow'],
      ['board-phase', null],
      ['board-action', 'board'],
    ]);
    expect(result.items.find((i) => i.artifactId === 'optional')?.origins).toEqual(['workflow-action']);
    expect(result.items.find((i) => i.artifactId === 'mcp')?.origins).toEqual(['workflow-phase']);
    expect(result.diagnostics).toEqual([{ code: 'admission-unavailable' }]);
  });

  it('não carrega disponíveis nem MCPs permitidos antes da seleção e não promete admissão', () => {
    const r = resolveContextDraft(state(), target);
    expect(r.items.map((i) => i.artifactId)).toEqual(['dev', 'essential', 'rule']);
    expect(r.admission).toEqual({ state: 'unavailable', dependency: 729 });
    expect(r.canExecute).toBe(false);
    expect(JSON.stringify(r)).not.toContain('Instruções privadas');
    expect(JSON.stringify(r)).not.toContain('Conteúdo privado');
  });

  it('vazio explícito remove complementos herdados, mantendo essenciais e Sempre', () => {
    const s = state();
    s.contextPlanning!.activities.push(
      row('workflow', { additionalSkillIds: explicit(['optional']), activeMcpIds: explicit(['mcp']) }, { workflowId: 'wc' }),
      row('task', { additionalSkillIds: explicit([]), activeMcpIds: explicit([]) }, { cardId: 'task', phaseId: 'todo' }),
    );
    expect(resolveContextDraft(s, target).items.map((i) => i.artifactId)).toEqual(['dev', 'essential', 'rule']);
  });

  it('agente vazio ou ausente bloqueia sem usar agente legado ou condutor da história', () => {
    const s = state();
    s.contextPlanning!.activities.push(row('task', { agent: explicit(null) }, { cardId: 'task' }));
    expect(resolveContextDraft(s, target).diagnostics).toContainEqual({ code: 'agent-required' });
    s.contextPlanning!.activities = [];
    expect(resolveContextDraft(s, target).agent).toBeNull();
    expect(resolveContextDraft(s, target).diagnostics).toContainEqual({ code: 'agent-required' });
  });

  it('elimina duplicatas por ID com todas as origens e permite skill adicional fora das sugestões', () => {
    const s = state();
    s.harness.library!.artifacts.find((a) => a.id === 'essential')!.usage = 'always';
    s.contextPlanning!.activities.push(row('task', { additionalSkillIds: explicit(['essential', 'extra']) }, { cardId: 'task' }));
    const r = resolveContextDraft(s, target);
    expect(r.items.filter((i) => i.artifactId === 'essential')).toEqual([
      { artifactId: 'essential', kind: 'skill', name: 'essential', origins: ['agent-essential', 'card-action', 'board-always'] },
    ]);
    expect(r.items.some((i) => i.artifactId === 'extra')).toBe(true);
    expect(r.diagnostics).toEqual([{ code: 'admission-unavailable' }]);
  });

  it('não ativa MCP fora do contrato, inclusive Sempre e após troca de agente', () => {
    const s = state();
    s.harness.library!.artifacts.find((a) => a.id === 'mcp')!.usage = 'always';
    s.contextPlanning!.activities.push(row('task', { agent: explicit('reviewer'), activeMcpIds: explicit(['mcp']) }, { cardId: 'task' }));
    const r = resolveContextDraft(s, target);
    expect(r.items.some((i) => i.artifactId === 'mcp')).toBe(false);
    expect(r.diagnostics).toEqual([{ code: 'admission-unavailable' }, { code: 'mcp-outside-agent', artifactId: 'mcp' }]);
    expect(s.contextPlanning!.activities[1]!.selection.activeMcpIds).toEqual(explicit(['mcp']));
  });

  it('explica recurso ausente, desligado ou de tipo incompatível sem removê-lo do rascunho', () => {
    const s = state();
    s.harness.library!.artifacts.find((a) => a.id === 'essential')!.missing = true;
    s.harness.library!.artifacts.find((a) => a.id === 'optional')!.usage = 'off';
    s.contextPlanning!.activities.push(row('task', { additionalSkillIds: explicit(['optional', 'mcp', 'removido']) }, { cardId: 'task' }));
    expect(resolveContextDraft(s, target).diagnostics).toEqual([
      { code: 'admission-unavailable' },
      { code: 'missing-artifact', artifactId: 'essential' },
      { code: 'disabled-artifact', artifactId: 'optional' },
      { code: 'wrong-kind', artifactId: 'mcp' },
      { code: 'missing-artifact', artifactId: 'removido' },
    ]);
  });

  it('não reutiliza trabalho em resumo, refino ou assistentes sem card', () => {
    const s = state();
    s.contextPlanning!.activities[0]!.selection.additionalSkillIds = explicit(['optional']);
    for (const action of ['refine', 'summary', 'conflict', 'harness-agent'] as const) {
      const t = { cardId: action === 'harness-agent' ? null : 'task', workflowId: null, phaseId: '', action };
      expect(resolveContextDraft(s, t).items).toEqual([]);
      expect(resolveContextDraft(s, t).diagnostics).toContainEqual({ code: 'agent-required' });
    }
  });

  it('renomear fase preserva identidade; fase removida ou de outro workflow bloqueia', () => {
    const s = state();
    const before = resolveContextDraft(s, target);
    s.columns.find((c) => c.id === 'todo')!.name = 'Implementação';
    expect(resolveContextDraft(s, target)).toEqual(before);
    expect(resolveContextDraft(s, { ...target, phaseId: 'doing' }).diagnostics).toContainEqual({ code: 'invalid-target' });
    s.columns = s.columns.filter((c) => c.id !== 'todo');
    expect(resolveContextDraft(s, target).diagnostics).toContainEqual({ code: 'invalid-target' });
  });

  it('valida contrato e seleção mesmo quando alguém contorna a tipagem', () => {
    const s = state();
    s.contextPlanning!.agents[0]!.contract.version = 4 as 1;
    expect(resolveContextDraft(s, target).diagnostics).toContainEqual({ code: 'invalid-contract', artifactId: 'dev' });
    s.contextPlanning!.activities[0]!.selection.activeMcpIds = { mode: 'all' } as never;
    expect(resolveContextDraft(s, target).diagnostics).toContainEqual({ code: 'invalid-selection' });
  });

  it('é determinístico, não altera a entrada e não compartilha arrays editáveis com ela', () => {
    const s = state();
    s.contextPlanning!.activities[0]!.selection.model = explicit('claude:opus');
    const before = JSON.stringify(s);
    const r = resolveContextDraft(s, target);
    expect(resolveContextDraft(s, target)).toEqual(r);
    expect(JSON.stringify(s)).toBe(before);
    r.requestedTools!.categories.push('edit');
    r.model.choice.mode = 'inherit';
    expect(JSON.stringify(s)).toBe(before);
  });

  it('exige revisão do contrato novo e dos anexos ausentes', () => {
    const s = state();
    s.contextPlanning!.activities[0]!.selection.inputAttachmentIds = ['anexo-removido'];
    expect(resolveContextDraft(s, target).diagnostics).toContainEqual({ code: 'missing-input', artifactId: 'anexo-removido' });
    s.contextPlanning!.agents = [];
    expect(resolveContextDraft(s, target).diagnostics).toContainEqual({ code: 'contract-required', artifactId: 'dev' });
  });
});
