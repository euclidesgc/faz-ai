import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_TOOLS,
  TOOL_EXPORT_MAP,
  allowedToolsOf,
  boardFrontmatter,
  categoriesFromNeutral,
  effectiveTools,
  isFolderPath,
  isSemver,
  mappingLabel,
  missingTools,
  nativeTools,
  neutralFromCategories,
  neutralFromNative,
  normalizeTools,
  supportsToolList,
  toolsFor,
  type NeutralTool,
} from '../src/shared/artifactTools';

describe('tools neutras: lista e normalização', () => {
  it('a lista fechada tem os oito ids na ordem da tela, e só o agente concede delegate', () => {
    expect(NEUTRAL_TOOLS.map((x) => x.id)).toEqual(['read', 'search', 'write', 'edit', 'shell', 'network', 'mcp', 'delegate']);
    expect(toolsFor('agent').map((x) => x.id)).toContain('delegate');
    expect(toolsFor('skill').map((x) => x.id)).not.toContain('delegate');
    expect(NEUTRAL_TOOLS.filter((x) => x.sensitive).map((x) => x.id)).toEqual(['shell', 'network']);
  });

  it('normalizeTools tira repetidas, desconhecidas e delegate da skill, na ordem da lista', () => {
    expect(normalizeTools('skill', ['shell', 'read', 'read', 'delegate', 'foo', 3])).toEqual(['read', 'shell']);
    expect(normalizeTools('agent', ['delegate', 'read'])).toEqual(['read', 'delegate']);
    expect(normalizeTools('agent', 'read')).toEqual([]);
    expect(normalizeTools('agent', undefined)).toEqual([]);
  });
});

describe('tools neutras: mapa por ferramenta', () => {
  it('Claude: cada id vira os nomes oficiais (Edit, não MultiEdit; Agent para delegar)', () => {
    const claude = TOOL_EXPORT_MAP.claude!;
    expect(claude).toEqual({
      read: ['Read'],
      search: ['Glob', 'Grep'],
      write: ['Write'],
      edit: ['Edit', 'NotebookEdit'],
      shell: ['Bash'],
      network: ['WebFetch', 'WebSearch'],
      mcp: [],
      delegate: ['Agent'],
    });
    expect(nativeTools('claude', ['read', 'search', 'shell'])).toEqual(['Read', 'Glob', 'Grep', 'Bash']);
    expect(nativeTools('claude', ['delegate', 'network'])).toEqual(['Agent', 'WebFetch', 'WebSearch']);
    expect(nativeTools('claude', [])).toEqual([]);
  });

  it('mcp vira um glob por servidor e some sem servidor', () => {
    expect(nativeTools('claude', ['read', 'mcp'], ['github', 'memoria'])).toEqual(['Read', 'mcp__github__*', 'mcp__memoria__*']);
    expect(nativeTools('claude', ['mcp'])).toEqual([]);
    expect(mappingLabel('claude', 'mcp')).toBe('mcp__<servidor>__*');
    expect(mappingLabel('claude', 'mcp', ['gh'])).toBe('mcp__gh__*');
    expect(mappingLabel('claude', 'search')).toBe('Glob, Grep');
  });

  it('Cursor e Kimi não têm lista: nativeTools e o rótulo devolvem null', () => {
    for (const tool of ['cursor', 'kimi'] as const) {
      expect(supportsToolList(tool)).toBe(false);
      expect(nativeTools(tool, ['read'])).toBeNull();
      expect(mappingLabel(tool, 'read')).toBeNull();
    }
    expect(supportsToolList('claude')).toBe(true);
  });
});

describe('tools neutras: do arquivo e das categorias para os ids', () => {
  it('neutralFromNative lê Task e Agent como delegate, mcp__ como mcp e ignora o que não conhece', () => {
    expect(neutralFromNative(['Read', 'Grep', 'Task'])).toEqual(['read', 'search', 'delegate']);
    expect(neutralFromNative(['Agent', 'mcp__github__issues', 'Bash'])).toEqual(['shell', 'mcp', 'delegate']);
    expect(neutralFromNative(['Edit', 'WebFetch', 'Inventada'])).toEqual(['edit', 'network']);
    expect(neutralFromNative([])).toEqual([]);
  });

  it('as categorias antigas viram ids e voltam às categorias', () => {
    expect(neutralFromCategories(['read', 'edit', 'run', 'net', 'agents'])).toEqual([
      'read',
      'search',
      'write',
      'edit',
      'shell',
      'network',
      'delegate',
    ]);
    expect(neutralFromCategories(['read'], ['github'])).toEqual(['read', 'search', 'mcp']);
    expect(neutralFromCategories([], ['github'])).toEqual(['mcp']);
    expect(categoriesFromNeutral(['search', 'edit', 'mcp', 'delegate'])).toEqual(['read', 'edit', 'agents']);
    expect(categoriesFromNeutral(['shell', 'network'])).toEqual(['run', 'net']);
  });
});

describe('tools neutras: compatibilidade entre skill e agente', () => {
  const agent: NeutralTool[] = ['read', 'search', 'shell'];

  it('missingTools lista o que a skill pede e o agente não concede', () => {
    expect(missingTools(agent, ['read', 'write', 'network'])).toEqual(['write', 'network']);
    expect(missingTools(agent, ['read'])).toEqual([]);
    expect(missingTools([], ['read'])).toEqual(['read']);
  });

  it('effectiveTools: sem skills valem as do agente; com skills, as do agente que alguma pede', () => {
    expect(effectiveTools(agent, [])).toEqual(agent);
    expect(effectiveTools(agent, [['read'], ['write', 'shell']])).toEqual(['read', 'shell']);
    expect(effectiveTools(agent, [[]])).toEqual([]);
  });
});

describe('tools neutras: frontmatter do board e allowed-tools', () => {
  it('boardFrontmatter da skill leva a pasta; o do agente leva skills e model (inherit quando vazio)', () => {
    expect(
      boardFrontmatter({
        kind: 'skill',
        name: 'deploy',
        description: 'Faz deploy',
        version: '1.0.0',
        tools: ['read', 'shell'],
        folder: 'ops/ci',
      }),
    ).toBe('---\nname: deploy\ndescription: "Faz deploy"\nversion: 1.0.0\ntools: [read, shell]\nfolder: ops/ci\n---');
    const agent = boardFrontmatter({
      kind: 'agent',
      name: 'dev',
      description: 'd',
      version: '1.0.0',
      tools: [],
      skills: ['a', 'b'],
      model: '',
    });
    expect(agent).toBe('---\nname: dev\ndescription: d\nversion: 1.0.0\ntools: []\nskills: [a, b]\nmodel: inherit\n---');
    expect(
      boardFrontmatter({ kind: 'agent', name: 'dev', description: 'd', version: '1.0.0', tools: [], model: 'claude:opus@high' }),
    ).toContain('model: "claude:opus@high"');
    expect(boardFrontmatter({ kind: 'skill', name: 's', description: 'd', version: '1.0.0', tools: [] })).toContain('folder: ""');
  });

  it('allowedToolsOf aceita espaço, vírgula e lista em linha, e some sem a linha ou sem frontmatter', () => {
    const md = (line: string) => `---\nname: s\n${line}\n---\nCorpo`;
    expect(allowedToolsOf(md('allowed-tools: Read Grep Bash'))).toEqual(['Read', 'Grep', 'Bash']);
    expect(allowedToolsOf(md('allowed-tools: Read, Grep, Bash'))).toEqual(['Read', 'Grep', 'Bash']);
    expect(allowedToolsOf(md('allowed-tools: [Read, "Grep", \'Bash\']'))).toEqual(['Read', 'Grep', 'Bash']);
    expect(allowedToolsOf(md('description: d'))).toEqual([]);
    expect(allowedToolsOf('allowed-tools: Read')).toEqual([]);
    expect(allowedToolsOf('---\r\nallowed-tools: Read Grep\r\n---\r\nX')).toEqual(['Read', 'Grep']);
  });

  it('versão semver e caminho de pasta', () => {
    expect(['1.0.0', ' 10.20.30 '].map(isSemver)).toEqual([true, true]);
    expect(['1.0', 'v1.0.0', '1.0.0-beta', ''].map(isSemver)).toEqual([false, false, false, false]);
    expect(['', 'a', 'a-b/c1'].map(isFolderPath)).toEqual([true, true, true]);
    expect(['A', 'a/', '/a', 'a//b', 'a_b', '../a', '-a'].map(isFolderPath)).toEqual([false, false, false, false, false, false, false]);
  });
});
