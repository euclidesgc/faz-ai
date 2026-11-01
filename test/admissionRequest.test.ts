// O pedido de admissão montado para um card e para uma execução sem card (#1091).
import { describe, expect, it } from 'vitest';
import { cardAdmissionRequest, closedAdmissionRequest } from '../src/extension/ai/admissionRequest';
import { admitExecution } from '../src/shared/executionAdmission';
import { DEFAULT_RUNNER } from '../src/shared/runner';

const REVIEWED = { ...DEFAULT_RUNNER, admissionRegime: 'compatible' as const, compatibilityReviewRevision: 1 };

describe('cardAdmissionRequest', () => {
  it('as categorias seguem o nível de permissão', () => {
    expect(cardAdmissionRequest(DEFAULT_RUNNER, 'board', []).agentTools.categories).toEqual(['read']);
    expect(cardAdmissionRequest(DEFAULT_RUNNER, 'edits', []).agentTools.categories).toEqual(['read', 'edit']);
    expect(cardAdmissionRequest(DEFAULT_RUNNER, 'full', []).agentTools.categories).toEqual(['read', 'edit', 'run', 'net']);
  });
  it('MCPs duplicados viram um só e herdam as ferramentas do board', () => {
    const request = cardAdmissionRequest(REVIEWED, 'edits', ['memoria', 'memoria']);
    expect(request.activeMcpIds).toEqual(['memoria']);
    expect(request.allowedMcpIds).toEqual(['memoria']);
    expect(request.boardMcpIds).toEqual(['memoria']);
    expect(request.mcpServers).toEqual([{ artifactId: 'memoria', name: 'memoria' }]);
    expect(request.boardTools).toEqual({ mode: 'inherit' });
    expect(request).toMatchObject({
      regime: 'compatible',
      compatibilityReview: { actor: 'person', revision: 1 },
      mcpLevel: { permission: 'edits' },
    });
  });
  it('a admissão o aceita', () => {
    const request = cardAdmissionRequest(REVIEWED, 'edits', ['memoria', 'memoria']);
    const codes = admitExecution('generic', 'edits', request, 'a'.repeat(64), [], 1000, 'acp').reasons.map((r) => r.code);
    expect(codes).not.toContain('invalid-request');
    expect(codes).not.toContain('mcp-outside-boundary');
  });
});

describe('closedAdmissionRequest', () => {
  it('sem leitura por padrão e só leitura quando pedido', () => {
    expect(closedAdmissionRequest(DEFAULT_RUNNER).agentTools.categories).toEqual([]);
    expect(closedAdmissionRequest(DEFAULT_RUNNER, true).agentTools.categories).toEqual(['read']);
  });
  it('sem MCP, com ferramentas do board explícitas e vazias; a permissão segue o argumento', () => {
    const request = closedAdmissionRequest(REVIEWED);
    expect(request.boardTools).toEqual({ mode: 'explicit', value: [] });
    expect(request.activeMcpIds).toEqual([]);
    expect(request.allowedMcpIds).toEqual([]);
    expect(request.boardMcpIds).toEqual([]);
    expect(request.mcpServers).toEqual([]);
    expect(request.mcpLevel.permission).toBe('board');
    expect(closedAdmissionRequest(REVIEWED, false, 'edits').mcpLevel.permission).toBe('edits');
    expect(request).toMatchObject({ regime: 'compatible', compatibilityReview: { actor: 'person', revision: 1 } });
  });
});
