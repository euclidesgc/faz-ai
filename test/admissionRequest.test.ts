// O pedido de admissão montado para um card e para uma execução sem card (#1091).
import { describe, expect, it } from 'vitest';
import { cardAdmissionRequest, closedAdmissionRequest } from '../src/extension/ai/admissionRequest';
import { admitExecution } from '../src/shared/executionAdmission';
import { DEFAULT_RUNNER } from '../src/shared/runner';

const REVIEWED = { ...DEFAULT_RUNNER, admissionRegime: 'compatible' as const, compatibilityReviewRevision: 1 };

describe('cardAdmissionRequest', () => {
  it('as categorias seguem o nível de permissão', () => {
    expect(cardAdmissionRequest(DEFAULT_RUNNER, 'board', [], 'acp').agentTools.categories).toEqual(['read']);
    expect(cardAdmissionRequest(DEFAULT_RUNNER, 'edits', [], 'acp').agentTools.categories).toEqual(['read', 'edit']);
    expect(cardAdmissionRequest(DEFAULT_RUNNER, 'full', [], 'acp').agentTools.categories).toEqual(['read', 'edit', 'run', 'net']);
  });
  it('MCPs duplicados viram um só e herdam as ferramentas do board', () => {
    const request = cardAdmissionRequest(REVIEWED, 'edits', ['memoria', 'memoria'], 'acp');
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
  it('leva as ferramentas do servidor do board pelo nome, as mesmas em todo nível (a CLI recebe mcp__faz-ai__*)', () => {
    for (const permission of ['board', 'edits', 'full'] as const) {
      const request = cardAdmissionRequest(REVIEWED, permission, [], 'acp');
      expect(request.mcpTools).toContain('mcp__faz-ai__get_card');
      expect(request.mcpTools).toContain('mcp__faz-ai__move_card');
      expect(request.mcpTools.every((t) => t.startsWith('mcp__faz-ai__'))).toBe(true);
      expect(request.boardMcpTools).toEqual(request.mcpTools);
      expect(request.mcpLevel).toEqual({ permission, tools: request.mcpTools });
      // a admissão do ACP as leva à decisão, que vira o contrato da ponte
      const decision = admitExecution('generic', permission, request, 'a'.repeat(64), [], 1000, 'acp');
      expect(decision.mcpTools).toEqual(request.mcpTools);
    }
  });
  it('pela CLI (a cópia de uma CLI pronta) não leva as ferramentas do board, que lá exigem a tradução nativa', () => {
    const request = cardAdmissionRequest(REVIEWED, 'full', [], 'cli');
    expect(request.mcpTools).toEqual([]);
    expect(request.mcpLevel).toEqual({ permission: 'full', tools: [] });
    expect(admitExecution('claude', 'full', request, 'a'.repeat(64), [], 1000, 'cli').reasons.map((r) => r.code)).not.toContain(
      'mcp-operation-outside-boundary',
    );
  });
  it('a admissão o aceita', () => {
    const request = cardAdmissionRequest(REVIEWED, 'edits', ['memoria', 'memoria'], 'acp');
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
