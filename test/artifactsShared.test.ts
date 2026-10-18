import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_LIMITS,
  agentOfArtifact,
  artifactLocation,
  isSafeRelPath,
  itemOfArtifact,
  kindOfSelectable,
  profileOfArtifact,
  selectableOfKind,
  selectionOf,
  toolCategories,
  type BoardArtifact,
} from '../src/shared/artifacts';

const base = (over: Partial<BoardArtifact> = {}): BoardArtifact => ({
  id: 'a1',
  kind: 'skill',
  name: 'minha-skill',
  description: 'faz algo',
  usage: 'contextual',
  origin: '.claude/skills/minha-skill/SKILL.md',
  originTool: 'claude',
  missing: false,
  skipped: [],
  files: ['ref/a.md'],
  body: '',
  path: '/cache/minha-skill/SKILL.md',
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

describe('tipos de artefato', () => {
  it('converte entre o tipo da marcação e o do board', () => {
    expect(kindOfSelectable('instructions')).toBe('rule');
    expect(kindOfSelectable('mcp')).toBe('mcp');
    expect(selectableOfKind('rule')).toBe('instructions');
    expect(selectableOfKind('agent')).toBe('agent');
  });

  it('tem os limites da Spec', () => {
    expect(ARTIFACT_LIMITS).toEqual({ fileBytes: 524288, files: 100, totalBytes: 5242880 });
  });
});

describe('identidade e conversões', () => {
  it('a location é a origem; criado no board, board:<nome>', () => {
    expect(artifactLocation(base())).toBe('.claude/skills/minha-skill/SKILL.md');
    expect(artifactLocation(base({ origin: '' }))).toBe('board:minha-skill');
  });

  it('selectionOf devolve a marcação equivalente', () => {
    expect(selectionOf(base({ kind: 'rule', origin: 'CLAUDE.md', name: 'CLAUDE.md', usage: 'always' }))).toEqual({
      kind: 'instructions',
      location: 'CLAUDE.md',
      usage: 'always',
    });
  });

  it('itemOfArtifact monta o item do inventário', () => {
    const it1 = itemOfArtifact(base());
    expect(it1).toMatchObject({
      kind: 'skill',
      name: 'minha-skill',
      layout: 'skills',
      files: ['ref/a.md'],
      path: '/cache/minha-skill/SKILL.md',
    });
    expect(itemOfArtifact(base({ kind: 'rule', name: 'CLAUDE.md', origin: 'CLAUDE.md' }))).toMatchObject({
      kind: 'instructions',
      layout: 'file',
    });
    const mcp = itemOfArtifact(base({ kind: 'mcp', name: 'gh', origin: '.mcp.json#gh', mcpSummary: 'npx gh', description: '', files: [] }));
    expect(mcp).toMatchObject({ kind: 'mcp', layout: 'entry', location: '.mcp.json#gh', description: 'npx gh' });
    expect(mcp.files).toBeUndefined();
    expect(itemOfArtifact(base({ kind: 'mcp', description: 'Consulta issues', mcpSummary: 'npx' })).description).toBe('Consulta issues');
  });

  const agent = base({
    kind: 'agent',
    name: 'backend',
    description: 'backend',
    origin: '',
    body: 'Você é o backend.',
    agent: {
      skills: ['s'],
      mcpServers: ['m'],
      model: 'sonnet@medium',
      tools: { categories: ['read'], native: { tool: 'claude', allow: ['Read'], deny: ['Bash'] } },
      seed: true,
    },
  });

  it('agentOfArtifact e profileOfArtifact levam o meta do agente', () => {
    expect(agentOfArtifact(agent)).toMatchObject({
      name: 'backend',
      body: 'Você é o backend.',
      modelValue: 'sonnet@medium',
      tools: ['Read'],
      deniedTools: ['Bash'],
      skills: ['s'],
      mcp: ['m'],
      seed: true,
      location: 'board:backend',
    });
    expect(profileOfArtifact(agent, true)).toEqual({
      id: 'backend',
      name: 'backend',
      purpose: 'backend',
      instructions: 'Você é o backend.',
      skills: ['s'],
      mcpServers: ['m'],
      tools: ['Read'],
      deniedTools: ['Bash'],
      model: 'sonnet@medium',
      isDefault: true,
      scope: 'board',
      path: '/cache/minha-skill/SKILL.md',
    });
  });

  it('agente sem meta usa valores vazios', () => {
    expect(profileOfArtifact(base({ kind: 'agent' }), false)).toMatchObject({
      tools: [],
      deniedTools: [],
      skills: [],
      mcpServers: [],
      model: '',
    });
  });
});

describe('toolCategories', () => {
  it('devolve os grupos que têm alguma ferramenta da lista', () => {
    expect(toolCategories('claude', ['Read', 'Bash', 'mcp__x__*'])).toEqual(['read', 'run']);
    expect(toolCategories('claude', ['WebFetch', 'Agent', 'Edit'])).toEqual(['edit', 'net', 'agents']);
  });
  it('ignora o grupo "other" e nomes desconhecidos', () => {
    expect(toolCategories('claude', ['TodoWrite', 'Foo'])).toEqual([]);
  });
  it('sem ferramenta ou sem lista (cursor), nada', () => {
    expect(toolCategories('', ['Read'])).toEqual([]);
    expect(toolCategories('cursor', ['Read'])).toEqual([]);
    expect(toolCategories('kimi', ['FetchURL', 'Read'])).toEqual(['net']);
  });
});

describe('isSafeRelPath', () => {
  it('aceita caminhos relativos comuns', () => {
    expect(isSafeRelPath('a.md')).toBe(true);
    expect(isSafeRelPath('ref/sub/a.md')).toBe(true);
    expect(isSafeRelPath('.hidden/x')).toBe(true);
  });
  it('recusa ..', () => {
    expect(isSafeRelPath('../a')).toBe(false);
    expect(isSafeRelPath('a/../b')).toBe(false);
    expect(isSafeRelPath('..')).toBe(false);
  });
  it('recusa absoluto, vazio, \\0, \\ e segmentos vazios', () => {
    expect(isSafeRelPath('/etc/passwd')).toBe(false);
    expect(isSafeRelPath('C:/x')).toBe(false);
    expect(isSafeRelPath('')).toBe(false);
    expect(isSafeRelPath('a\0b')).toBe(false);
    expect(isSafeRelPath('a\\b')).toBe(false);
    expect(isSafeRelPath('a//b')).toBe(false);
    expect(isSafeRelPath('./a')).toBe(false);
  });
});
