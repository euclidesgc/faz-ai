// O harness como pendência do Diagnóstico: o que falta no banco de artefatos, e como isso vira
// recomendação no aviso do topo (nunca bloqueio).
import { describe, expect, it } from 'vitest';
import { checkEnvironment } from '../src/extension/environment';
import { checkRequirements, type RequirementProbe } from '../src/extension/requirements';
import { profileOfAgent } from '../src/shared/execution';
import type { Agent, HarnessItem } from '../src/shared/harness';
import { harnessIssues } from '../src/shared/harnessStatus';
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

const state = (over: Parameters<typeof boardState>[0] = {}, tool: 'claude' | 'cursor' = 'claude') =>
  boardState({
    ...over,
    board: { ...boardState().board, aiTool: tool, ...(over.board ?? {}) },
  });

describe('harnessIssues', () => {
  it('board vazio: faltam artefatos e agente; nada de regras, ausentes ou Cursor', () => {
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

  it('regra desligada, artefato ausente e, no Cursor, artefatos do projeto fora do board', () => {
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
                item({ kind: 'mcp', name: 'faz-ai', location: '.cursor/mcp.json', layout: 'entry' }),
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
    expect(harnessIssues(s)).toEqual(['rules', 'missing', 'cursor']);
    // só o servidor do board no projeto não conta como artefato fora do board
    const clean = {
      ...s,
      harness: { ...s.harness, inventory: [{ ...s.harness.inventory[0]!, items: s.harness.inventory[0]!.items.slice(1) }] },
    };
    expect(harnessIssues(clean)).toEqual(['missing']);
  });
});

describe('o harness no aviso e no Diagnóstico', () => {
  const probe = (over: Partial<RequirementProbe> = {}): RequirementProbe => ({
    tool: 'claude',
    permission: 'full',
    workspaceDir: '/nao-existe',
    homeDir: '/nao-existe-home',
    bridgePath: '/b.js',
    nodePath: process.execPath,
    resolve: (command) => (command === 'node' ? process.execPath : `/usr/bin/${command}`),
    signedIn: async () => true,
    skillInstalled: true,
    ...over,
  });

  it('o requisito é recomendação (optional), com o que falta e o atalho para o Harness; sem faltas ou sem inventário, nada', async () => {
    const list = await checkRequirements(probe({ harnessIssues: ['artifacts', 'agents'] }));
    expect(list.find((r) => r.id === 'harness')).toMatchObject({
      tool: 'claude',
      optional: true,
      harnessIssues: ['artifacts', 'agents'],
      action: { kind: 'settings' },
    });
    expect((await checkRequirements(probe({ harnessIssues: [] }))).some((r) => r.id === 'harness')).toBe(false);
    expect((await checkRequirements(probe())).some((r) => r.id === 'harness')).toBe(false);
  });

  it('no Diagnóstico, o item fica depois da skill, com um filho por falta; não pesa no bloco da ferramenta nem na contagem', async () => {
    const env = (issues: string[] | null, cli = true) =>
      checkEnvironment({
        tool: 'claude',
        requirements: [
          ...(cli ? [] : [{ id: 'cli' as const, tool: 'claude' as const, cli: 'claude', action: null }]),
          ...(issues?.length
            ? [
                {
                  id: 'harness' as const,
                  tool: 'claude' as const,
                  optional: true as const,
                  harnessIssues: issues as never,
                  action: { kind: 'settings' as const },
                },
              ]
            : []),
        ],
        workspaceDir: '/proj',
        skillInstalled: true,
        harnessIssues: issues as never,
        other: null,
        crgMcp: false,
        platform: 'linux',
        homeDir: '/home/u',
        pathDirs: [],
        linux: null,
        resolve: (c) => (cli || c !== 'claude' ? `/usr/bin/${c}` : null),
        run: async () => null,
        firstLine: () => null,
        exists: () => false,
      });
    const report = await env(['rules', 'missing']);
    const own = report.required[1]!;
    const ids = own.children!.map((c) => c.id);
    expect(ids.indexOf('harness')).toBe(ids.indexOf('skill') + 1);
    const harness = own.children!.find((c) => c.id === 'harness')!;
    expect(harness.status).toBe('missing');
    expect(harness.requirement?.id).toBe('harness');
    expect(harness.children!.map((c) => [c.id, c.status])).toEqual([
      ['harness-artifacts', 'ok'],
      ['harness-agents', 'ok'],
      ['harness-rules', 'missing'],
      ['harness-missing', 'missing'],
      ['harness-cursor', 'ok'],
    ]);
    // recomendação: o bloco da ferramenta continua pronto, e só as faltas contam
    expect(own.status).toBe('ok');
    expect(missingCount([own])).toBe(2);
    expect((await env([])).required[1]!.children!.find((c) => c.id === 'harness')!.status).toBe('ok');
    // sem a CLI (ou sem o inventário), fica pulado, como o login sem a CLI
    const skipped = (await env(['agents'], false)).required[1]!.children!.find((c) => c.id === 'harness')!;
    expect(skipped.status).toBe('skipped');
    expect(skipped.children!.every((c) => c.status === 'skipped')).toBe(true);
    expect((await env(null)).required[1]!.children!.find((c) => c.id === 'harness')!.status).toBe('skipped');
  });
});
