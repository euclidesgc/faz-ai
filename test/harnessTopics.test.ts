import { describe, expect, it } from 'vitest';
import { HARNESS_TOPICS, matchesQuery, resolveHarnessTab } from '../src/shared/harnessTopics';

describe('harnessTopics: assuntos', () => {
  it('a ordem é regras, skills, sub-agentes, MCPs, comandos, hooks e demais', () => {
    expect(HARNESS_TOPICS.map((t) => t.id)).toEqual(['rules', 'skill', 'agent', 'mcp', 'command', 'hook', 'other']);
  });

  it('só os quatro tipos do board têm a origem Board', () => {
    expect(HARNESS_TOPICS.filter((t) => t.kind).map((t) => t.kind)).toEqual(['instructions', 'skill', 'agent', 'mcp']);
  });
});

describe('harnessTopics: busca e abas', () => {
  it('a busca casa parte do nome ou da descrição, sem acento nem maiúsculas', () => {
    expect(matchesQuery('', 'qualquer')).toBe(true);
    expect(matchesQuery('REVIS', 'revisar-spec', 'x')).toBe(true);
    expect(matchesQuery('migracao', 'db', 'Escreve uma migração nova')).toBe(true);
    expect(matchesQuery('zzz', 'revisar-spec', undefined)).toBe(false);
  });

  it('valores antigos de aba caem na ferramenta do projeto', () => {
    expect(resolveHarnessTab('tool', 'cursor')).toBe('tool');
    expect(resolveHarnessTab('claude', 'cursor')).toBe('claude');
    expect(resolveHarnessTab('project', 'cursor')).toBe('cursor');
    expect(resolveHarnessTab('user', 'claude')).toBe('claude');
    expect(resolveHarnessTab(undefined, 'claude')).toBe('claude');
  });
});
