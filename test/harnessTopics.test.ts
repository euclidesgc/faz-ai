import { describe, expect, it } from 'vitest';
import { HARNESS_TOPICS, matchesQuery, resolveHarnessTab, usageCounts } from '../src/shared/harnessTopics';
import type { BoardArtifact } from '../src/shared/artifacts';

describe('harnessTopics: assuntos', () => {
  it('conta somente o tipo pedido em cada modo', () => {
    const artifacts = [
      { kind: 'rule', usage: 'off' },
      { kind: 'rule', usage: 'always' },
      { kind: 'rule', usage: 'contextual' },
      { kind: 'rule', usage: 'off' },
      { kind: 'skill', usage: 'off' },
    ] as BoardArtifact[];
    expect(usageCounts(artifacts, 'rule')).toEqual({ always: 1, contextual: 1, off: 2 });
    expect(usageCounts(artifacts, 'mcp')).toEqual({ always: 0, contextual: 0, off: 0 });
  });

  it('a ordem é regras, skills, agentes e servidores MCP', () => {
    expect(HARNESS_TOPICS.map((t) => t.id)).toEqual(['rules', 'skill', 'agent', 'mcp']);
    expect(HARNESS_TOPICS.map((t) => t.kind)).toEqual(['rule', 'skill', 'agent', 'mcp']);
  });
});

describe('harnessTopics: busca e abas', () => {
  it('a busca casa parte do nome ou da descrição, sem acento nem maiúsculas', () => {
    expect(matchesQuery('', 'qualquer')).toBe(true);
    expect(matchesQuery('REVIS', 'revisar-spec', 'x')).toBe(true);
    expect(matchesQuery('migracao', 'db', 'Escreve uma migração nova')).toBe(true);
    expect(matchesQuery('zzz', 'revisar-spec', undefined)).toBe(false);
  });

  it('só as duas abas novas valem; um valor antigo cai em Ferramenta e execução', () => {
    expect(resolveHarnessTab('artifacts')).toBe('artifacts');
    expect(resolveHarnessTab('tool')).toBe('tool');
    for (const old of ['claude', 'cursor', 'project', 'user', 'library', 'all', undefined, null])
      expect(resolveHarnessTab(old)).toBe('tool');
  });
});
