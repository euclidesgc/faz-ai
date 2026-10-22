// O harness como pendência do Diagnóstico: o que falta no banco de artefatos, e como isso vira
// recomendação no aviso do topo (nunca bloqueio).
import { describe, expect, it } from 'vitest';
import { checkEnvironment } from '../src/extension/environment';
import { BUILTIN_PROFILES } from '../src/shared/aiProfiles';
import { profileHealth } from '../src/shared/profileHealth';
import { checkRequirements } from '../src/extension/requirements';
import { profileOfAgent } from '../src/shared/execution';
import type { Agent, HarnessItem } from '../src/shared/harness';
import { harnessIssues, type HarnessIssue } from '../src/shared/harnessStatus';
import { missingCount } from '../src/shared/environment';
import { boardState } from './fakes/board';

const item = (over: Partial<HarnessItem> & Pick<HarnessItem, 'kind' | 'name' | 'location'>): HarnessItem => ({
  scope: 'project',
  description: '',
  path: `/abs/${over.location}`,
  layout: 'file',
  ...over,
});

const agent: Agent = {
  name: 'revisor',
  description: 'Revisa',
  model: '',
  modelValue: '',
  scope: 'user',
  path: '/h/.claude/agents/revisor.md',
  location: '~/.claude/agents/revisor.md',
  content: '',
  body: '',
  tools: [],
  deniedTools: [],
  skills: [],
  mcp: [],
  seed: false,
  readonly: false,
  background: false,
};

const state = (over: Parameters<typeof boardState>[0] = {}, tool: 'claude' | 'cursor' | 'kimi' = 'claude') =>
  boardState({
    ...over,
    board: { ...boardState().board, aiTool: tool, ...(over.board ?? {}) },
  });

describe('harnessIssues', () => {
  it('board vazio: faltam artefatos e agente; nada de regras, ausentes ou isolamento', () => {
    expect(harnessIssues(state())).toEqual(['artifacts', 'agents']);
  });

  it('com uma skill Pelo card e um agente disponível, está em ordem; só a skill do fluxo em Sempre não basta', () => {
    const inventory = [
      {
        tool: 'claude' as const,
        installed: true,
        items: [
          item({
            kind: 'skill',
            name: 'faz-ai-fluxo',
            location: '~/.claude/skills/faz-ai-fluxo/SKILL.md',
            scope: 'user',
            layout: 'skills',
          }),
          item({ kind: 'skill', name: 'sql', location: '.claude/skills/sql/SKILL.md', layout: 'skills' }),
          item({ kind: 'agent', name: 'revisor', location: agent.location, scope: 'user', layout: 'files', path: agent.path }),
        ],
      },
    ];
    const onlyFlow = state({
      harness: { rules: [], skills: [], agents: [], inventory },
      harnessSelection: [{ kind: 'skill', location: '~/.claude/skills/faz-ai-fluxo/SKILL.md', usage: 'always' }],
    });
    expect(harnessIssues(onlyFlow)).toEqual(['artifacts', 'agents']);
    const ready = state({
      harness: { rules: [], skills: [], agents: [agent], inventory },
      harnessSelection: [
        { kind: 'skill', location: '~/.claude/skills/faz-ai-fluxo/SKILL.md', usage: 'always' },
        { kind: 'skill', location: '.claude/skills/sql/SKILL.md', usage: 'contextual' },
        { kind: 'agent', location: agent.location, usage: 'contextual' },
      ],
      board: { ...boardState().board, execProfiles: [profileOfAgent(agent, true)] },
    });
    expect(harnessIssues(ready)).toEqual([]);
  });

  it('regra desligada, artefato ausente e, no Cursor, artefato que a CLI carrega sozinha', () => {
    const s = state(
      {
        harness: {
          rules: [],
          skills: [],
          agents: [agent],
          inventory: [
            {
              tool: 'cursor',
              installed: true,
              items: [
                item({ kind: 'instructions', name: 'AGENTS.md', location: 'AGENTS.md' }),
                item({ kind: 'mcp', name: 'outro', location: '.cursor/mcp.json', layout: 'entry' }),
                item({ kind: 'skill', name: 'sql', location: '.cursor/skills/sql/SKILL.md', layout: 'skills' }),
              ],
            },
          ],
        },
        harnessSelection: [
          { kind: 'instructions', location: 'AGENTS.md', usage: 'off' },
          { kind: 'skill', location: '.cursor/skills/sql/SKILL.md', usage: 'contextual' },
          { kind: 'skill', location: '.cursor/skills/sumiu/SKILL.md', usage: 'contextual' },
        ],
        board: { ...boardState().board, aiTool: 'cursor', execProfiles: [profileOfAgent(agent, true)] },
      },
      'cursor',
    );
    expect(harnessIssues(s)).toEqual(['rules', 'missing', 'isolation']);
    // só o servidor do board no projeto não conta como artefato fora do board
    const clean = {
      ...s,
      harness: { ...s.harness, inventory: [{ ...s.harness.inventory[0]!, items: s.harness.inventory[0]!.items.slice(1, 2) }] },
    };
    expect(harnessIssues(clean)).toEqual(['missing', 'isolation']);
  });
});

describe('harnessIssues: problema isolation pela lista do perfil ativo', () => {
  const inv = (tool: 'claude' | 'cursor' | 'kimi', items: HarnessItem[]) => ({
    harness: { rules: [], skills: [], agents: [agent], inventory: [{ tool, installed: true, items }] },
    board: { ...boardState().board, aiTool: tool, execProfiles: [profileOfAgent(agent, true)] },
  });
  const rule = item({ kind: 'instructions', name: 'AGENTS.md', location: 'AGENTS.md' });
  const userSkill = item({ kind: 'skill', name: 'sql', location: '~/.kimi/skills/sql/SKILL.md', scope: 'user', layout: 'skills' });

  it('Cursor com regra do projeto acusa', () => {
    expect(harnessIssues(state(inv('cursor', [rule]), 'cursor'))).toContain('isolation');
  });
  it('Kimi com skill do usuário acusa', () => {
    expect(harnessIssues(state(inv('kimi', [userSkill]), 'kimi'))).toContain('isolation');
  });
  it('Claude (lista vazia) nunca acusa, com tudo isso no disco', () => {
    const s = state(inv('claude', [rule, userSkill]), 'claude');
    expect(harnessIssues(s)).not.toContain('isolation');
  });
  it('Cursor sem nada da lista (origem que o perfil não lista) não acusa', () => {
    const plugin = item({ kind: 'skill', name: 'p', location: 'p', scope: 'plugin' });
    const userRule = item({ kind: 'instructions', name: 'r', location: '~/r', scope: 'user' });
    expect(harnessIssues(state(inv('cursor', [plugin, userRule]), 'cursor'))).not.toContain('isolation');
  });
});

describe('o harness no aviso e no Diagnóstico', () => {
  const health = [
    profileHealth({
      profile: BUILTIN_PROFILES[0]!,
      isDefault: true,
      pendingReview: false,
      probe: { id: 'claude', found: true, login: 'signed-in' },
      authExpired: false,
      validationRequired: false,
      credentials: [],
      capabilities: [],
      admission: null,
      evidence: { state: 'never' },
      install: null,
    }),
  ];

  it('o requisito é recomendação (optional), com o que falta e o atalho para o Harness; sem faltas ou sem inventário, nada', () => {
    const list = checkRequirements({ nodePath: '/n', health, harnessIssues: ['artifacts', 'agents'] });
    expect(list.find((r) => r.id === 'harness')).toMatchObject({
      optional: true,
      harnessIssues: ['artifacts', 'agents'],
      action: { kind: 'settings' },
    });
    expect(checkRequirements({ nodePath: '/n', health, harnessIssues: [] }).some((r) => r.id === 'harness')).toBe(false);
    expect(checkRequirements({ nodePath: '/n', health }).some((r) => r.id === 'harness')).toBe(false);
  });

  it('no Diagnóstico, o banco de artefatos é um bloco à parte, com um filho por falta, que não depende de ferramenta', async () => {
    const env = (issues: HarnessIssue[] | null) =>
      checkEnvironment({
        requirements: issues?.length ? [{ id: 'harness', optional: true, harnessIssues: issues, action: { kind: 'settings' } }] : [],
        health,
        workspaceDir: '/proj',
        harnessIssues: issues,
        platform: 'linux',
        homeDir: '/home/u',
        pathDirs: [],
        linux: null,
        resolve: () => null,
        run: async () => null,
        firstLine: () => null,
        exists: () => false,
      });
    const { harness, required } = await env(['rules', 'missing']);
    expect(harness.status).toBe('missing');
    expect(harness.requirement?.id).toBe('harness');
    expect(harness.children!.map((c) => [c.id, c.status])).toEqual([
      ['harness-artifacts', 'ok'],
      ['harness-agents', 'ok'],
      ['harness-rules', 'missing'],
      ['harness-missing', 'missing'],
      ['harness-isolation', 'ok'],
    ]);
    // recomendação: não está entre os necessários, e só as faltas dentro dele contam
    expect(required.some((c) => c.id === 'harness')).toBe(false);
    expect(missingCount([harness])).toBe(2);
    expect((await env([])).harness.status).toBe('ok');
    expect((await env(null)).harness.status).toBe('skipped');
  });
});
