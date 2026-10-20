import { describe, expect, it } from 'vitest';
import type { HarnessItem } from '../src/shared/harness';
import { HARNESS_CATALOG } from '../src/shared/harnessCatalog';
import {
  HARNESS_TOPICS,
  catalogOriginOf,
  groupsFor,
  matchesQuery,
  originsOf,
  resolveHarnessTab,
  toolsInOrder,
  topicCount,
  topicsOf,
  usageCounts,
} from '../src/shared/harnessTopics';
import type { BoardArtifact } from '../src/shared/artifacts';

const item = (over: Partial<HarnessItem>): HarnessItem => ({
  kind: 'skill',
  scope: 'project',
  name: 'x',
  description: '',
  path: '/abs/x',
  location: 'x',
  layout: 'file',
  ...over,
});

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
  it('a ordem é regras, skills, sub-agentes, MCPs, comandos, hooks e demais', () => {
    expect(HARNESS_TOPICS.map((t) => t.id)).toEqual(['rules', 'skill', 'agent', 'mcp', 'command', 'hook', 'other']);
  });

  it('cada grupo do catálogo mora em exatamente um assunto', () => {
    const all = HARNESS_TOPICS.flatMap((t) => t.groups);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of ['claude', 'cursor'] as const)
      for (const src of HARNESS_CATALOG[tool]) {
        const g = src.group ?? (src.kind === 'instructions' ? 'main' : src.kind);
        expect(all, `${tool}: ${src.path}`).toContain(g);
      }
  });

  it('só os assuntos que a ferramenta tem aparecem', () => {
    for (const tool of ['claude', 'cursor'] as const) {
      const ids = topicsOf(tool, []).map((t) => t.id);
      expect(ids).toContain('rules');
      expect(ids).toContain('other');
      expect(ids).toEqual(HARNESS_TOPICS.map((t) => t.id).filter((id) => ids.includes(id)));
    }
  });

  it('o assunto de regras junta as regras principais e as por assunto; só os quatro tipos do board têm a origem Board', () => {
    expect(HARNESS_TOPICS.find((t) => t.id === 'rules')!.groups).toEqual(['main', 'topic']);
    expect(HARNESS_TOPICS.filter((t) => t.kind).map((t) => t.kind)).toEqual(['instructions', 'skill', 'agent', 'mcp']);
  });
});

describe('harnessTopics: fonte e grupos', () => {
  const other = HARNESS_TOPICS.find((t) => t.id === 'other')!;

  it('a memória do Claude Code fica em Projeto, plugins em Global e o importado em Importados', () => {
    const memory = HARNESS_CATALOG.claude.findIndex((s) => s.group === 'memory');
    expect(catalogOriginOf('claude', item({ kind: 'memory', scope: 'user', source: memory }))).toBe('project');
    expect(catalogOriginOf('claude', item({ scope: 'plugin' }))).toBe('user');
    expect(catalogOriginOf('claude', item({ scope: 'user' }))).toBe('user');
    expect(catalogOriginOf('claude', item({ scope: 'imported' }))).toBe('imported');
  });

  it('as origens da aba: Board só na ferramenta do projeto, Importados só com pasta importada', () => {
    expect(originsOf(true, false)).toEqual(['board', 'project', 'user']);
    expect(originsOf(true, true)).toEqual(['board', 'project', 'user', 'imported']);
    expect(originsOf(false, false)).toEqual(['project', 'user']);
  });

  it('a contagem da aba de um assunto é o que a fonte tem naquele assunto', () => {
    const skills = HARNESS_TOPICS.find((t) => t.id === 'skill')!;
    const items = [
      item({ name: 'a', scope: 'project' }),
      item({ name: 'b', scope: 'project' }),
      item({ name: 'c', scope: 'user' }),
      item({ name: 'd', scope: 'plugin' }),
      item({ name: 'e', scope: 'imported' }),
      item({ kind: 'agent', name: 'f', scope: 'project' }),
    ];
    expect(topicCount('claude', items, skills, 'project')).toBe(2);
    // a skill de plugin mora no bloco do plugin, em Demais: não conta em Skills
    expect(topicCount('claude', items, skills, 'user')).toBe(1);
    expect(topicCount('claude', items, other, 'user')).toBe(1);
    expect(topicCount('claude', items, skills, 'imported')).toBe(1);
    expect(topicCount('claude', items, other, 'project')).toBe(0);
  });

  it('plugins e organização só no global; memória só no projeto', () => {
    expect(groupsFor(other, 'project')).toEqual(['memory', 'settings', 'style']);
    expect(groupsFor(other, 'user')).toEqual(['settings', 'style', 'plugin', 'managed']);
    expect(groupsFor(other, 'imported')).toEqual(['settings', 'style']);
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

  it('a ferramenta do projeto vem primeiro', () => {
    expect(toolsInOrder('cursor')).toEqual(['cursor', 'claude', 'kimi']);
    expect(toolsInOrder('claude')).toEqual(['claude', 'cursor', 'kimi']);
    expect(toolsInOrder('kimi')).toEqual(['kimi', 'claude', 'cursor']);
  });
});
