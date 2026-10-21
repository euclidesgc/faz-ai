import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentInputOf, parseAgentFile } from '../src/extension/artifactSource';
import { AGENT_SEEDS, CONDUCTOR_AGENT } from '../src/extension/agentSeeds';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { baseInfo } from '../src/shared/harness';
import type { AgentInput } from '../src/shared/messages';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

const input: AgentInput = {
  name: 'frontend-web',
  description: 'Frontend web em React',
  body: 'Siga os padrões.\n\nTeste tudo.',
  model: 'claude:sonnet@medium',
  tools: ['Read', 'Edit'],
  deniedTools: ['WebFetch'],
  skills: ['faz-ai-fluxo', 'modelos'],
  mcp: ['github'],
};

const file = () =>
  [
    '---',
    'name: "frontend-web"',
    'description: "Frontend web em React"',
    'tools: Read, Edit, mcp__faz-ai__*',
    'disallowedTools: WebFetch',
    'model: sonnet',
    'skills: faz-ai-fluxo, modelos',
    'faz-ai-model: "claude:sonnet@medium"',
    'faz-ai-mcp: github',
    'faz-ai-seed: true',
    '---',
    '',
    'Siga os padrões.',
    '',
    'Teste tudo.',
    '',
  ].join('\n');

describe('leitura de arquivos de agente (importação)', () => {
  const found = {
    name: 'frontend-web',
    scope: 'user' as const,
    path: '/h/.claude/agents/frontend-web.md',
    location: '~/.claude/agents/frontend-web.md',
  };

  it('markdown: lê as chaves da ferramenta e as do board, sem as ferramentas do servidor do board', () => {
    const agent = parseAgentFile(baseInfo('claude').agents, found, file());
    expect(agentInputOf(agent)).toEqual(input);
    expect(agent).toMatchObject({ model: 'sonnet', seed: true, scope: 'user', body: 'Siga os padrões.\n\nTeste tudo.' });
  });

  it('markdown escrito por fora: lista em bloco YAML, sem as chaves do board', () => {
    const spec = baseInfo('claude').agents;
    const text = '---\nname: x\ndescription: "Entre aspas"\ntools:\n  - Read\n  - Grep\nmodel: opus\n---\nCorpo\n';
    const agent = parseAgentFile(
      spec,
      { name: 'x', scope: 'project', path: '/p/.claude/agents/x.md', location: '.claude/agents/x.md' },
      text,
    );
    expect(agent).toMatchObject({
      description: 'Entre aspas',
      tools: ['Read', 'Grep'],
      model: 'opus',
      modelValue: '',
      skills: [],
      mcp: [],
      seed: false,
      body: 'Corpo',
    });
  });

  it('no Cursor, readonly e is_background são lidos; no Claude Code não existem', () => {
    const cursor = baseInfo('cursor').agents;
    const text = '---\nname: x\ndescription: "d"\nreadonly: true\nis_background: true\n---\nC\n';
    const agent = parseAgentFile(cursor, found, text);
    expect(agent).toMatchObject({ readonly: true, background: true });
    expect(agentInputOf(agent)).toMatchObject({ readonly: true, background: true });
    expect(parseAgentFile(baseInfo('claude').agents, found, text)).toMatchObject({ readonly: false, background: false });
  });
});

describe('agentes de fábrica e migração dos perfis do banco', () => {
  let root: string;
  let project: string;
  let home: string;
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-seeds-')));
    project = path.join(root, 'p');
    home = path.join(root, 'h');
    fs.mkdirSync(project);
    fs.mkdirSync(home);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  type Handle = { db: Awaited<ReturnType<typeof openInMemory>>; scheduleSave: () => void; close: () => Promise<void> };
  const handleOf = async (): Promise<Handle> => ({ db: await openInMemory(WASM_DIR), scheduleSave: () => {}, close: async () => {} });
  const open = async (handle: Handle, seedAgents: boolean) =>
    new MessageRouter(handle as never, {
      workspaceKey: 'ws',
      folderName: 'P',
      author: 'Pessoa',
      attachmentsDir: path.join(root, 'a'),
      workspaceDir: project,
      homeDir: home,
      seedAgents,
    });

  it('na primeira abertura cria os agentes de fábrica no board, sem arquivo na pasta da ferramenta, com o condutor como padrão; o apagado não volta, salvo por pedido', async () => {
    const handle = await handleOf();
    const router = await open(handle, true);
    expect(fs.existsSync(path.join(home, '.claude', 'agents'))).toBe(false);
    const s = router.snapshot();
    const agents = s.harness.library!.artifacts.filter((a) => a.kind === 'agent');
    expect(agents.map((a) => a.name).sort()).toEqual(AGENT_SEEDS.map((a) => a.name).sort());
    expect(agents.every((a) => a.usage === 'contextual' && a.origin === '' && a.agent?.seed)).toBe(true);
    expect(s.board.execProfiles.map((p) => p.id)).toEqual(AGENT_SEEDS.map((a) => a.name).sort());
    expect(s.board.execProfiles.every((p) => p.scope === 'board')).toBe(true);
    expect(s.board.execProfiles.find((p) => p.isDefault)?.id).toBe(CONDUCTOR_AGENT);
    // o modelo vem das regras de esforço do board
    expect(s.board.execProfiles.find((p) => p.id === CONDUCTOR_AGENT)?.model).toMatch(/^claude:/);
    expect(s.board.execProfiles.find((p) => p.id === CONDUCTOR_AGENT)?.tools).toEqual(
      AGENT_SEEDS.find((a) => a.name === CONDUCTOR_AGENT)!.tools,
    );

    router.handle({ type: 'harness.agent.delete', name: 'dados-sql', scope: 'user' });
    expect(router.snapshot().harness.library!.artifacts.some((a) => a.name === 'dados-sql')).toBe(false);
    const reopened = await open(handle, true);
    expect(reopened.snapshot().harness.library!.artifacts.some((a) => a.name === 'dados-sql')).toBe(false);
    reopened.handle({ type: 'harness.agents.seed', force: true });
    expect(reopened.snapshot().harness.library!.artifacts.some((a) => a.name === 'dados-sql')).toBe(true);
    expect(fs.existsSync(path.join(home, '.claude', 'agents'))).toBe(false);
  });

  it('cada board tem os próprios agentes de fábrica: tirar um do board não é desfeito na próxima abertura nem afeta outro board', async () => {
    const first = await open(await handleOf(), true);
    const second = await handleOf();
    const router = await open(second, true);
    const s = router.snapshot();
    expect(s.harnessSelection.filter((x) => x.kind === 'agent')).toHaveLength(AGENT_SEEDS.length);
    expect(s.board.execProfiles.find((p) => p.isDefault)?.id).toBe(CONDUCTOR_AGENT);
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'agent', location: 'board:dados-sql' }], usage: null });
    const again = await open(second, true);
    expect(again.snapshot().harnessSelection.filter((x) => x.kind === 'agent')).toHaveLength(AGENT_SEEDS.length - 1);
    expect(first.snapshot().harnessSelection.filter((x) => x.kind === 'agent')).toHaveLength(AGENT_SEEDS.length);
  });

  it('os perfis que o banco guardava viram agentes do board, e colunas e cards passam a apontar pelo nome', async () => {
    const handle = await handleOf();
    const first = await open(handle, false);
    const s0 = first.snapshot();
    const cardId = first.createCard({ typeId: s0.cardTypes[0]!.id, columnId: s0.columns[0]!.id, parentId: null, title: 'x' });
    handle.db.run('UPDATE boards SET exec_profiles_json = ? WHERE id = ?', [
      JSON.stringify([
        {
          id: 'p1',
          name: 'Revisor de Spec',
          purpose: 'Revisa',
          skills: ['tdd'],
          mcpServers: ['github'],
          tools: ['Read'],
          deniedTools: [],
          model: 'claude:opus@high',
          isDefault: true,
        },
        { id: 'p2', name: 'Geral', purpose: '', skills: [], mcpServers: null, tools: [], deniedTools: [], model: '', isDefault: false },
      ]),
      s0.board.id,
    ]);
    handle.db.run('UPDATE cards SET exec_profile = ? WHERE id = ?', ['p2', cardId]);
    handle.db.run('UPDATE columns SET exec_profile = ? WHERE id = ?', ['p1', s0.columns[0]!.id]);

    const router = await open(handle, false);
    const s = router.snapshot();
    expect(fs.existsSync(path.join(home, '.claude', 'agents'))).toBe(false);
    expect(s.harness.library!.artifacts.find((a) => a.name === 'revisor-de-spec')).toMatchObject({
      kind: 'agent',
      usage: 'contextual',
      agent: { mcpServers: ['github'], skills: ['tdd'], model: 'claude:opus@high' },
    });
    expect(s.board.execProfiles.map((p) => [p.id, p.isDefault])).toEqual([
      ['geral', false],
      ['revisor-de-spec', true],
    ]);
    expect(s.cards.find((c) => c.id === cardId)?.execProfile).toBe('geral');
    expect(s.columns[0]?.execProfile).toBe('revisor-de-spec');
    expect(s.board.runner.defaultAgent).toBe('revisor-de-spec');
    // a migração não roda de novo
    expect(handle.db.exec('SELECT exec_profiles_json FROM boards')[0]?.values[0]?.[0]).toBe('[]');
  });

  it('o "Agente padrão" embutido das versões anteriores não vira agente: quem apontava para ele segue o padrão do board, que passa a ser o condutor', async () => {
    const handle = await handleOf();
    const first = await open(handle, false);
    const s0 = first.snapshot();
    const cardId = first.createCard({ typeId: s0.cardTypes[0]!.id, columnId: s0.columns[0]!.id, parentId: null, title: 'x' });
    handle.db.run('UPDATE boards SET exec_profiles_json = ? WHERE id = ?', [
      JSON.stringify([
        {
          id: 'padrao',
          name: 'Agente padrão',
          purpose: '',
          skills: [],
          mcpServers: null,
          tools: [],
          deniedTools: [],
          model: '',
          isDefault: true,
        },
      ]),
      s0.board.id,
    ]);
    handle.db.run('UPDATE cards SET exec_profile = ? WHERE id = ?', ['padrao', cardId]);

    const router = await open(handle, true);
    const s = router.snapshot();
    expect(fs.existsSync(path.join(home, '.claude', 'agents', 'agente-padr-o.md'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude', 'agents', 'agente-padrao.md'))).toBe(false);
    expect(s.cards.find((c) => c.id === cardId)?.execProfile ?? '').toBe('');
    expect(s.board.runner.defaultAgent).toBe(CONDUCTOR_AGENT);
    expect(s.board.execProfiles.find((p) => p.isDefault)?.id).toBe(CONDUCTOR_AGENT);
  });
});
