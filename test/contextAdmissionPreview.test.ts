import { describe, expect, it } from 'vitest';
import { resolveContextDraft } from '../src/shared/contextDraftResolution';
import { applyAdmissionDecision, strictRequestFromDraft } from '../src/shared/contextAdmissionPreview';
import { admitExecution } from '../src/shared/executionAdmission';
import type { BoardArtifact } from '../src/shared/artifacts';
import type { ContextActivityTarget } from '../src/shared/contextPlanning';
import { boardState, card, sub } from './fakes/board';

const art = (id: string, kind: BoardArtifact['kind'], over: Partial<BoardArtifact> = {}): BoardArtifact => ({
  id,
  name: id,
  kind,
  description: '',
  body: '',
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
const target: ContextActivityTarget = { cardId: 'task', workflowId: null, phaseId: 'todo', action: 'work' };
const explicit = <T>(value: T) => ({ mode: 'explicit' as const, value });
function state() {
  const s = boardState({ cards: [card('story'), sub('task', 'story', 'todo')] });
  s.harness = { ...s.harness, library: { directory: '', artifacts: [art('dev', 'agent'), art('mcp', 'mcp')] } };
  s.contextPlanning = {
    runtime: 'legacy',
    legacy: { version: 0, agents: [], cards: [] },
    agents: [
      {
        artifactId: 'dev',
        revision: 1,
        updatedAt: 0,
        contract: {
          version: 1,
          role: 'Dev',
          instructions: '',
          essentialSkillIds: [],
          availableSkillIds: [],
          allowedMcpIds: ['mcp'],
          tools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
        },
      },
    ],
    activities: [
      {
        id: 'board',
        cardId: null,
        workflowId: null,
        phaseId: '',
        action: 'work',
        revision: 1,
        updatedAt: 0,
        selection: {
          version: 1,
          agent: explicit('dev'),
          model: { mode: 'inherit' },
          additionalSkillIds: { mode: 'inherit' },
          activeMcpIds: explicit(['mcp']),
          inputAttachmentIds: [],
          expectedResult: '',
        },
      },
    ],
  };
  return s;
}

describe('prévia com a admissão real (#729)', () => {
  it('sem agente não há pedido de admissão', () => {
    const s = state();
    s.contextPlanning!.activities = [];
    expect(strictRequestFromDraft(s, resolveContextDraft(s, target))).toBeNull();
  });

  it('monta o pedido só com o selecionado e explica as razões, sem autorizar', () => {
    const s = state();
    const resolved = resolveContextDraft(s, target);
    const request = strictRequestFromDraft(s, resolved)!;
    expect(request.activeMcpIds).toEqual(['mcp']);
    expect(request.allowedMcpIds).toEqual(['mcp']);
    expect(request.regime).toBe('exclusive');
    const decision = admitExecution('claude', 'board', request, 'a'.repeat(64), [], 1000);
    const out = applyAdmissionDecision(resolved, decision);
    expect(out.admission.state).toBe('evaluated');
    expect(out.canExecute).toBe(false);
    expect(out.diagnostics.some((d) => d.code === 'admission-unavailable')).toBe(false);
    expect(out.diagnostics).toContainEqual({ code: 'admission-blocked', reason: 'capability-not-verified', capability: 'mcp' });
  });

  it('MCP fora do limite do agente aponta o recurso', () => {
    const s = state();
    s.contextPlanning!.agents[0]!.contract.allowedMcpIds = [];
    const resolved = resolveContextDraft(s, target);
    expect(resolved.items.some((i) => i.artifactId === 'mcp')).toBe(false);
    s.harness.library!.artifacts.push(art('mcp2', 'mcp'));
    const request = { ...strictRequestFromDraft(s, resolved)!, activeMcpIds: ['mcp2'], mcpServers: [{ artifactId: 'mcp2', name: 'mcp2' }] };
    const out = applyAdmissionDecision(resolved, admitExecution('claude', 'board', request, 'a'.repeat(64), [], 1000));
    expect(out.diagnostics).toContainEqual({ code: 'admission-blocked', reason: 'mcp-outside-boundary', artifactId: 'mcp2' });
  });
});
