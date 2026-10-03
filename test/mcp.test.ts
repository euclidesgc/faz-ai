import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer, startMcpServer } from '../src/extension/mcp/server';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let router: MessageRouter;
let client: Client;
let changes: number;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* resposta em texto simples */
  }
  return { error: res.isError === true, text, data };
};

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-mcp-'));
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home-do-usuario'),
  });
  changes = 0;
  router.onDidChange(() => changes++);
  const server = createMcpServer({ getRouter: async () => router, workspaceDir: dir, version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('servidor MCP', () => {
  it('expõe as ferramentas e descreve o board', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'get_board',
        'list_cards',
        'get_card',
        'create_card',
        'move_card',
        'add_comment',
        'add_attachment',
        'update_rules',
      ]),
    );
    const board = (await call('get_board')).data;
    expect(board.workflows.map((w: any) => w.columns.map((c: any) => c.name))).toEqual([
      ['Backlog', 'Discovery', 'PRD', 'Spec', 'Plan', 'Implementação', 'Homologação', 'Concluído', 'Cancelado'],
      ['A fazer', 'Em andamento', 'Concluído'],
    ]);
  });

  it('cria história e sub-tarefas, com campos por nome, e avisa o board', async () => {
    const story = (await call('create_card', { title: 'Login', description: '# PRD' })).data;
    expect(story).toMatchObject({ id: '#1', type: 'História', column: 'Backlog', description: '# PRD' });
    const sub = (await call('create_card', { title: 'Escrever spec', parent: '#1', fields: { fase: 'spec' } })).data;
    expect(sub).toMatchObject({ id: '#2', type: 'Sub-tarefa', column: 'A fazer', parent: '#1 Login', fields: { Fase: 'Spec' } });
    expect(changes).toBeGreaterThan(0);

    const bad = await call('create_card', { title: 'x', parent: 1, fields: { Fase: 'Inexistente' } });
    expect(bad.error).toBe(true);
    expect(bad.text).toContain('Opções');
    expect(router.snapshot().cards).toHaveLength(2); // nada criado pela metade

    const listed = (await call('list_cards', { parent: 1, fields: { Fase: ['Spec'] } })).data;
    expect(listed.cards.map((c: any) => c.id)).toEqual(['#2']);
    expect((await call('list_cards', { text: 'login' })).data.total).toBe(1);
  });

  it('aplica a regra de conclusão e sugere concluir a história', async () => {
    await call('create_card', { title: 'História' });
    await call('create_card', { title: 'Tarefa', parent: 1 });
    const blocked = await call('move_card', { card: 1, column: 'Concluído' });
    expect(blocked.error).toBe(true);
    expect(blocked.text).toContain('sub-tarefa(s) ainda em aberto');

    const moved = (await call('move_card', { card: 2, column: 'concluido' })).data;
    expect(moved.card).toMatchObject({ column: 'Concluído', status: 'done' });
    expect(moved.hint).toContain('#1');
    expect((await call('move_card', { card: 1, column: 'Concluído' })).data.card.status).toBe('done');

    const unknown = await call('move_card', { card: 2, column: 'Backlog' });
    expect(unknown.text).toContain('Existentes: "A fazer"');
  });

  it('assina comentários com o cliente e cuida de checklist e lixeira', async () => {
    await call('create_card', { title: 'História' });
    expect((await call('add_comment', { card: 1, body: 'Plano pronto' })).data).toMatchObject({
      author: 'Claude Code',
      body: 'Plano pronto',
    });
    const items = (await call('add_checklist_item', { card: 1, text: 'testes' })).data;
    const done = (await call('update_checklist_item', { item_id: items[0].itemId, done: true })).data;
    expect(done[0]).toMatchObject({ text: 'testes', done: true });

    await call('trash_card', { card: 1 });
    expect((await call('list_cards')).data.total).toBe(0);
    expect((await call('move_card', { card: 1, column: 'PRD' })).text).toContain('lixeira');
    await call('restore_card', { card: 1 });
    expect((await call('list_cards')).data.total).toBe(1);
    expect((await call('get_card', { card: 99 })).error).toBe(true);

    await call('create_card', { title: 'Outra' });
    await call('trash_card', { card: 2 });
    expect((await call('empty_trash')).text).toContain('1 card(s)');
    await call('delete_card_permanently', { card: 1 });
    expect(router.snapshot().cards).toHaveLength(0);
  });

  it('grava e lê anexos de texto e de arquivo', async () => {
    await call('create_card', { title: 'História' });
    const att = (await call('add_attachment', { card: 1, filename: 'spec.md', content: '# Spec\nação' })).data;
    expect(att).toMatchObject({ filename: 'spec.md', mime: 'text/markdown' });
    expect((await call('read_attachment', { attachment_id: att.attachmentId })).text).toBe('# Spec\nação');

    fs.writeFileSync(path.join(dir, 'plan.md'), 'plano');
    const fromFile = (await call('add_attachment', { card: 1, path: 'plan.md' })).data;
    expect(fs.readFileSync(fromFile.path, 'utf8')).toBe('plano');
    expect((await call('get_card', { card: 1 })).data.attachments).toHaveLength(2);
    await call('delete_attachment', { attachment_id: att.attachmentId });
    expect((await call('get_card', { card: 1 })).data.attachments).toHaveLength(1);
  });

  it('configura colunas, campos e regras', async () => {
    let board = (await call('create_column', { workflow: 'child', name: 'Em revisão' })).data;
    // sem posição, a coluna entra antes da conclusão
    expect(board.workflows[1].columns.map((c: any) => c.name)).toEqual(['A fazer', 'Em andamento', 'Em revisão', 'Concluído']);
    board = (await call('create_column', { workflow: 'child', name: 'Triagem', position: 0 })).data;
    expect(board.workflows[1].columns[0].name).toBe('Triagem');
    expect((await call('update_column', { column: 'Concluído', name: 'Feito' })).text).toContain('informe também o workflow');
    board = (await call('update_column', { column: 'Concluído', workflow: 'parent', name: 'Feito' })).data;
    expect(board.workflows[0].columns[7].name).toBe('Feito');
    board = (await call('create_field', { name: 'Estimativa', kind: 'number', applies_to_types: ['História'] })).data;
    expect(board.fields.at(-1)).toMatchObject({ name: 'Estimativa', appliesTo: ['História'] });
    expect((await call('update_rules', { blockDoneWithOpenChildren: false })).data.blockDoneWithOpenChildren).toBe(false);
  });
});

describe('instalar skills pelo board', () => {
  it('mostra o que foi encontrado, instala as escolhidas e as oferece nos cards', async () => {
    const src = path.join(dir, 'origem');
    for (const name of ['commit', 'deploy']) {
      fs.mkdirSync(path.join(src, name), { recursive: true });
      fs.writeFileSync(path.join(src, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Skill ${name}\n---\n`);
    }
    let cleaned = false;
    router.setInstall('origem', src, () => {
      cleaned = true;
    });
    expect(router.snapshot().harnessInstall).toEqual({
      source: 'origem',
      skills: [
        { rel: 'commit', name: 'commit', description: 'Skill commit', files: 0, valid: true },
        { rel: 'deploy', name: 'deploy', description: 'Skill deploy', files: 0, valid: true },
      ],
    });
    router.handle({ type: 'harness.install.apply', tool: 'claude', to: 'project', rels: ['commit'] });
    expect(fs.existsSync(path.join(dir, '.claude/skills/commit/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.claude/skills/deploy'))).toBe(false);
    expect(router.snapshot().harnessInstall).toBeNull();
    expect(cleaned).toBe(true);
    expect(router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.options).toContain('commit');
    expect(() => router.handle({ type: 'harness.install.apply', tool: 'claude', to: 'project', rels: ['deploy'] })).toThrow(
      'Procure de novo',
    );
  });
});

describe('modelos e referências nas skills', () => {
  it('a skill de modelos nasce só quando indicada, e o card entrega os arquivos dela', async () => {
    router.handle({ type: 'harness.referenceSkill.create' });
    const skill = router.snapshot().harness.skills.find((k) => k.name === 'modelos-do-projeto')!;
    expect(skill).toMatchObject({ enabled: true, mode: 'manual' });
    expect(fs.existsSync(path.join(dir, '.claude/skills/modelos-do-projeto/references'))).toBe(true);

    const written = (
      await call('write_skill_file', { skill: 'modelos-do-projeto', file: 'references/repositorio.ts', content: 'export class Repo {}' })
    ).data;
    expect(written.files).toEqual(['references/repositorio.ts']);
    expect((await call('write_skill_file', { skill: 'modelos-do-projeto', file: '../fora.ts', content: 'x' })).error).toBe(true);
    expect((await call('write_skill_file', { skill: 'nao-existe', file: 'references/a.ts', content: 'x' })).error).toBe(true);

    const card = (await call('create_card', { title: 'História', fields: { Skills: ['modelos-do-projeto'] } })).data;
    expect(card.requiredSkills).toEqual([
      {
        name: 'modelos-do-projeto',
        scope: 'project',
        path: '.claude/skills/modelos-do-projeto/SKILL.md',
        files: ['.claude/skills/modelos-do-projeto/references/repositorio.ts'],
      },
    ]);
  });
});

describe('perfis de execução', () => {
  const profile = (over: Record<string, unknown>) => ({
    id: 'p',
    name: 'Perfil',
    purpose: '',
    agent: '',
    skills: [],
    mcpServers: null,
    tools: [],
    deniedTools: [],
    model: '',
    clean: false,
    isDefault: false,
    ...over,
  });

  it('resolve o perfil do card, da coluna e o padrão, e entrega em get_card', async () => {
    await call('create_skill', { name: 'planejar', description: 'Planeja', content: 'Passos' });
    await call('create_skill', { name: 'testar', description: 'Testa', content: 'Passos' });
    await call('create_agent', { name: 'planejador', description: 'Planeja', content: 'Instruções' });
    router.handle({
      type: 'settings.execProfiles.set',
      profiles: [
        profile({ id: 'geral', name: 'Geral', isDefault: true, skills: ['testar'] }),
        profile({
          id: 'plan',
          name: 'Planejamento',
          agent: 'planejador',
          skills: ['planejar'],
          mcpServers: ['github'],
          deniedTools: ['WebFetch'],
          model: 'claude:opus@high',
          clean: true,
        }),
      ],
    });
    await call('create_card', { title: 'História', fields: { Skills: ['testar'] } });
    // sem escolha no card nem na coluna: vale o padrão do board, e as skills do card somam às do perfil sem repetir
    let card = (await call('get_card', { card: 1 })).data;
    expect(card.execution).toMatchObject({ profile: 'Geral' });
    expect(card.requiredSkills.map((k: any) => k.name)).toEqual(['testar']);

    // o perfil da coluna vale para os cards dela, e também para as sub-tarefas da história
    expect((await call('update_column', { column: 'Backlog', exec_profile: 'Não existe' })).error).toBe(true);
    const board = (await call('update_column', { column: 'Backlog', exec_profile: 'Planejamento' })).data;
    expect(board.execProfiles.map((p: any) => p.name)).toEqual(['Geral', 'Planejamento']);
    expect(board.workflows[0].columns[0].execProfile).toBe('Planejamento');
    card = (await call('get_card', { card: 1 })).data;
    expect(card.execution).toMatchObject({
      profile: 'Planejamento',
      agent: { name: 'planejador', path: path.join(dir, '.claude/agents/planejador.md') },
      mcpServers: ['faz-ai', 'github'],
      deniedTools: ['WebFetch'],
      clean: true,
    });
    expect(card.execution.enforcedByBoardRun).toEqual(['agent', 'mcp', 'tools', 'model', 'clean']);
    expect(card.requiredSkills.map((k: any) => k.name)).toEqual(['planejar', 'testar']);
    await call('create_card', { title: 'Sub', type: 'Sub-tarefa', parent: 1 });
    expect((await call('get_card', { card: 2 })).data.execution.profile).toBe('Planejamento');

    // o card pode trocar de perfil, e voltar ao da coluna
    expect((await call('set_card_profile', { card: 1, profile: 'Geral' })).data.execution.profile).toBe('Geral');
    expect((await call('set_card_profile', { card: 1 })).data.execution.profile).toBe('Planejamento');

    // apagar um perfil solta as colunas e os cards que o usavam
    await call('set_card_profile', { card: 1, profile: 'Planejamento' });
    router.handle({ type: 'settings.execProfiles.set', profiles: [profile({ id: 'geral', name: 'Geral', isDefault: true })] });
    const s = router.snapshot();
    expect(s.columns.every((c) => c.execProfile === null)).toBe(true);
    expect(s.cards.every((c) => c.execProfile === null)).toBe(true);
    expect((await call('get_card', { card: 1 })).data.execution.profile).toBe('Geral');
  });
});

describe('harness e padrões pelo MCP', () => {
  it('oferece nos cards as skills globais e de plugins da ferramenta em uso', async () => {
    const home = path.join(dir, 'home-do-usuario');
    const put = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      fs.writeFileSync(path.join(home, rel), text);
    };
    put('.claude/skills/commit/SKILL.md', '---\nname: commit\ndescription: Escreve o commit\n---\n');
    put('.claude/plugins/cache/loja/design/.claude-plugin/plugin.json', '{"name":"design"}');
    put('.claude/plugins/cache/loja/design/skills/critica/SKILL.md', '---\nname: critica\ndescription: Critica\n---\n');
    put('.codex/skills/de-outra-ferramenta/SKILL.md', '---\nname: x\ndescription: x\n---\n');
    await call('create_skill', { name: 'revisar-spec', description: 'Revisa', content: 'Passos' });
    router.refreshHarness();
    const field = router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!;
    expect(field.options).toEqual(['revisar-spec', 'commit', 'critica']);
    const card = (await call('create_card', { title: 'História', fields: { Skills: ['commit', 'critica', 'revisar-spec'] } })).data;
    expect(card.requiredSkills).toEqual([
      { name: 'commit', scope: 'user', path: path.join(home, '.claude/skills/commit/SKILL.md') },
      {
        name: 'critica',
        scope: 'plugin',
        path: path.join(home, '.claude/plugins/cache/loja/design/skills/critica/SKILL.md'),
        plugin: 'design',
      },
      { name: 'revisar-spec', scope: 'project', path: '.claude/skills/revisar-spec/SKILL.md' },
    ]);
    // copiar a skill global para o projeto: ela passa a existir nos dois escopos e o card usa a do projeto
    const global = router
      .snapshot()
      .harness.inventory.find((t) => t.tool === 'claude')!
      .items.find((i) => i.name === 'commit')!;
    router.handle({ type: 'harness.item.copy', tool: 'claude', items: [{ kind: 'skill', path: global.path }], to: 'project' });
    expect((await call('get_card', { card: 1 })).data.requiredSkills[0]).toEqual({
      name: 'commit',
      scope: 'project',
      path: '.claude/skills/commit/SKILL.md',
    });
    expect(() => router.handle({ type: 'harness.item.delete', tool: 'claude', kind: 'skill', path: '/etc/passwd' })).toThrow(
      'não encontrado',
    );
    const inventory = (await call('get_harness')).data.inventory;
    expect(inventory.find((i: any) => i.name === 'commit' && i.scope === 'user')).toEqual({
      kind: 'skill',
      scope: 'user',
      name: 'commit',
      mode: 'auto',
      description: 'Escreve o commit',
      path: '~/.claude/skills/commit/SKILL.md',
    });
  });

  it('gerencia regras e skills do projeto e sincroniza o campo Skills', async () => {
    expect((await call('get_harness')).data.ruleFiles.map((r: any) => [r.name, r.exists])).toEqual([
      ['CLAUDE.md', false],
      ['AGENTS.md', false],
    ]);
    await call('write_rule_file', { file: 'AGENTS.md', content: '# Regras\n' });
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toBe('# Regras\n');
    expect((await call('read_rule_file', { file: 'AGENTS.md' })).text).toBe('# Regras\n');
    expect((await call('write_rule_file', { file: '../fora.md', content: 'x' })).error).toBe(true);

    expect((await call('create_skill', { name: 'Nome Ruim', description: 'd', content: 'c' })).error).toBe(true);
    const h = (await call('create_skill', { name: 'revisar-spec', description: 'Use ao revisar uma spec', content: 'Passos…' })).data;
    expect(h.skills).toEqual([
      {
        name: 'revisar-spec',
        enabled: true,
        mode: 'auto',
        description: 'Use ao revisar uma spec',
        path: '.claude/skills/revisar-spec/SKILL.md',
      },
    ]);
    expect((await call('get_skill', { skill: 'revisar-spec' })).text).toContain('name: revisar-spec');
    const skillsField = () => router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!;
    expect(skillsField().options).toEqual(['revisar-spec']);

    // skill marcada no card aparece como obrigatória, com o caminho do SKILL.md
    const card = (await call('create_card', { title: 'História', fields: { Skills: ['revisar-spec'], Modelo: 'Claude Haiku 4.5' } })).data;
    expect(card.requiredSkills).toEqual([{ name: 'revisar-spec', scope: 'project', path: '.claude/skills/revisar-spec/SKILL.md' }]);
    expect(card.model).toMatchObject({ tool: 'claude', model: 'haiku', effort: null, value: 'claude:haiku' });

    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: false });
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'revisar-spec'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.claude', 'skills-disabled', 'revisar-spec', 'SKILL.md'))).toBe(true);
    // desligada, a skill continua podendo ser indicada: o card entrega o caminho do arquivo
    expect(skillsField().options).toEqual(['revisar-spec']);
    expect((await call('get_card', { card: 1 })).data.requiredSkills[0]).toEqual({
      name: 'revisar-spec',
      scope: 'project',
      path: '.claude/skills-disabled/revisar-spec/SKILL.md',
    });
    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: true });
    await call('delete_skill', { skill: 'revisar-spec' });
    expect((await call('get_harness')).data.skills).toEqual([]);

    // arquivo criado por fora aparece depois de refreshHarness
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'oi');
    router.refreshHarness();
    expect((await call('read_rule_file', { file: 'CLAUDE.md' })).text).toBe('oi');
  });

  it('aplica os padrões do tipo aos cards novos e recria o board', async () => {
    const board = (
      await call('update_card_type', { type: 'Sub-tarefa', default_fields: { Modelo: 'claude sonnet 5.5 high', Fase: 'Implementação' } })
    ).data;
    expect(board.cardTypes.find((t: any) => t.name === 'Sub-tarefa').defaultFields).toEqual({
      Modelo: 'claude:sonnet@high',
      Fase: 'Implementação',
    });
    await call('create_card', { title: 'História' });
    const sub = (await call('create_card', { title: 'Tarefa', parent: 1, fields: { Fase: 'Spec' } })).data;
    expect(sub.fields).toEqual({ Modelo: 'Claude Code · Sonnet 5.5 · high', Fase: 'Spec' }); // o valor informado vence o padrão
    expect((await call('get_card', { card: 1 })).data.fields).toBeUndefined();

    const fresh = (await call('reset_board')).data;
    expect(fresh.workflows[0].columns.every((c: any) => c.cards === 0)).toBe(true);
    expect(fresh.cardTypes.find((t: any) => t.name === 'Sub-tarefa').defaultFields).toBeUndefined();
    expect((await call('create_card', { title: 'Nova' })).data.id).toBe('#1');
  });
});

describe('modelos de IA', () => {
  it('monta o catálogo por ferramenta e interpreta modelo + esforço', async () => {
    const m = (await call('get_models')).data;
    expect(m.catalog.find((o: any) => o.value === 'claude:opus')).toMatchObject({
      tool: 'claude',
      model: 'opus',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'medium',
    });
    expect(new Set(m.catalog.map((o: any) => o.tool))).toEqual(new Set(['claude'])); // só a ferramenta em uso

    await call('create_card', { title: 'História' });
    const set = async (modelo: string) => await call('update_card', { card: 1, fields: { Modelo: modelo } });
    expect((await set('Fable 5.1 low')).data.model).toMatchObject({ tool: 'claude', model: 'fable', effort: 'low' });
    expect((await set('claude:opus@high')).data.model).toMatchObject({
      model: 'opus',
      effort: 'high',
      label: 'Claude Code · Opus 5.5 · high',
    });
    expect((await set('opus')).data.model.effort).toBe('medium'); // sem esforço informado, vale o padrão do modelo
    expect((await set('Kimi Code K3 max')).text).toContain('não está no catálogo'); // modelo de outra ferramenta

    // trocar de ferramenta traz os modelos e as regras de esforço dela
    await call('set_ai_tool', { tool: 'kimi' });
    const kimi = (await call('get_models')).data;
    expect(kimi.catalog.some((o: any) => o.tool === 'kimi')).toBe(true);
    expect(kimi.rules.map((r: any) => r.value)).toEqual(['kimi:kimi-code/k3@low', 'kimi:kimi-code/k3@high', 'kimi:kimi-code/k3@max']);
    expect((await set('Kimi Code K3 max')).data.model).toMatchObject({ tool: 'kimi', effort: 'max' });
    await call('set_ai_tool', { tool: 'claude' });
    expect((await set('opus turbo')).text).toContain('não aceita o esforço');
    expect((await set('modelo-que-nao-existe')).text).toContain('não está no catálogo');
  });

  it('sugere o modelo pelo esforço da tarefa sem trocar uma escolha manual', async () => {
    // regras iniciais: Esforço Baixo/Médio/Alto → modelo leve/intermediário/forte da primeira ferramenta
    const rules = (await call('get_models')).data.rules;
    expect(rules.map((r: any) => [r.when, r.value])).toEqual([
      ['Esforço da atividade = Baixo', 'claude:haiku'],
      ['Esforço da atividade = Médio', 'claude:sonnet@medium'],
      ['Esforço da atividade = Alto', 'claude:opus@high'],
    ]);

    const card = (await call('create_card', { title: 'H', fields: { Esforço: 'Baixo' } })).data;
    expect(card.model.value).toBe('claude:haiku');
    // o modelo veio da sugestão, então acompanha a mudança de esforço
    expect((await call('update_card', { card: 1, fields: { Esforço: 'Alto' } })).data.model.value).toBe('claude:opus@high');
    // escolhido à mão: não é mais trocado, mas a sugestão continua visível
    await call('update_card', { card: 1, fields: { Modelo: 'fable low' } });
    const manual = (await call('update_card', { card: 1, fields: { Esforço: 'Médio' } })).data;
    expect(manual.model.value).toBe('claude:fable@low');
    expect(manual.suggestedModel.value).toBe('claude:sonnet@medium');

    // regras por tag e por ferramenta
    await call('set_model_rules', {
      rules: [
        { when: [[{ field: 'Tags', value: 'docs' }]], model: 'haiku' },
        { when: [[{ field: 'Esforço', value: 'Alto' }]], model: 'Opus 5.5 max' },
      ],
    });
    expect((await call('create_card', { title: 'Doc', fields: { Tags: ['docs'], Esforço: 'Alto' } })).data.model.value).toBe(
      'claude:haiku',
    );
    const kimi = (await call('suggest_model_rules', { tool: 'kimi' })).data.rules;
    expect(kimi.filter((r: any) => r.when.startsWith('Esforço')).map((r: any) => r.value)).toEqual([
      'kimi:kimi-code/k3@low',
      'kimi:kimi-code/k3@high',
      'kimi:kimi-code/k3@max',
    ]);
    expect(kimi[0].when).toBe('Tags = docs'); // regras de outros campos são preservadas
  });

  it('lê os modelos e esforços reais do config.toml do Kimi', async () => {
    const { parseKimiModels, modelsFor, effortTiers } = await import('../src/extension/models');
    const toml = `default_model = "kimi-code/k3"
[providers."managed:kimi-code"]
api_key = "segredo"

[models."kimi-code/k3"]
provider = "managed:kimi-code"
model = "k3"
display_name = "K3"
support_efforts = [ "low", "high", "max" ]
default_effort = "high"

[models."kimi-code/rapido"]
model = "rapido"
display_name = "K2.7 Highspeed"

[thinking]
effort = "high"
`;
    expect(parseKimiModels(toml)).toEqual([
      { id: 'kimi:kimi-code/k3', tool: 'kimi', model: 'kimi-code/k3', label: 'K3', efforts: ['low', 'high', 'max'], defaultEffort: 'high' },
      { id: 'kimi:kimi-code/rapido', tool: 'kimi', model: 'kimi-code/rapido', label: 'K2.7 Highspeed', efforts: [], defaultEffort: null },
    ]);
    const home = path.join(dir, 'home');
    fs.mkdirSync(path.join(home, '.kimi-code'), { recursive: true });
    fs.writeFileSync(path.join(home, '.kimi-code', 'config.toml'), toml);
    const found = modelsFor('kimi', home);
    expect(found.map((o) => o.label)).toEqual(['K3', 'K2.7 Highspeed']);
    expect(effortTiers('kimi', found).map(([, v]) => v)).toEqual([
      'kimi:kimi-code/k3@low',
      'kimi:kimi-code/k3@high',
      'kimi:kimi-code/k3@max',
    ]);
    expect(modelsFor('kimi', path.join(dir, 'vazio')).length).toBeGreaterThan(0); // sem config local, lista embutida
  });
});

describe('regras de modelo com E e OU', () => {
  const modelOf = async (fields: Record<string, unknown>, type?: string) =>
    (await call('create_card', { title: 'x', type, fields })).data.model?.value;

  it('avalia grupos E/OU, negação, tipo do card, ordem e regras desligadas', async () => {
    const res = await call('set_model_rules', {
      rules: [
        {
          name: 'Backend pesado',
          when: [
            [
              { field: 'Esforço', value: 'Alto' },
              { field: 'Tags', value: 'backend' },
            ],
            [
              { field: 'Tipo', value: 'Bug' },
              { field: 'Esforço', value: 'Baixo', not: true },
            ],
          ],
          model: 'fable max',
        },
        { name: 'Desligada', when: [[{ field: 'Tags', value: 'docs' }]], model: 'opus low', enabled: false },
        { name: 'Docs', when: [[{ field: 'Tags', value: 'docs' }]], model: 'haiku' },
        { name: 'Alto', when: [[{ field: 'Esforço', value: 'Alto' }]], model: 'opus high' },
      ],
    });
    expect(res.data.rules[0]).toMatchObject({
      name: 'Backend pesado',
      when: 'Esforço da atividade = Alto E Tags = backend OU Tipo = Bug E Esforço da atividade ≠ Baixo',
      enabled: true,
    });

    expect(await modelOf({ Esforço: 'Alto', Tags: ['backend', 'frontend'] })).toBe('claude:fable@max'); // E: as duas condições
    expect(await modelOf({ Esforço: 'Alto', Tags: ['frontend'] })).toBe('claude:opus@high'); // só uma: cai na regra seguinte
    expect(await modelOf({ Esforço: 'Médio' }, 'Bug')).toBe('claude:fable@max'); // OU: segundo grupo, com negação
    expect(await modelOf({ Esforço: 'Baixo' }, 'Bug')).toBeUndefined(); // a negação falha e nenhuma outra casa
    expect(await modelOf({ Tags: ['docs'] })).toBe('claude:haiku'); // a regra desligada é pulada
    expect((await call('set_model_rules', { rules: [{ when: [[{ field: 'Inexistente', value: 'x' }]], model: 'haiku' }] })).error).toBe(
      true,
    );
  });

  it('com o preenchimento automático desligado, só sugere', async () => {
    await call('update_rules', { autoApplyModelSuggestion: false });
    const card = (await call('create_card', { title: 'x', fields: { Esforço: 'Alto' } })).data;
    expect(card.model).toBeUndefined();
    expect(card.suggestedModel.value).toBe('claude:opus@high');
  });

  it('converte regras salvas no formato antigo', async () => {
    const { parseModelRules } = await import('../src/shared/models');
    expect(parseModelRules(JSON.stringify([{ id: 'a', fieldId: 'f1', value: 'Alto', model: 'claude:opus@high' }, { nada: true }]))).toEqual(
      [{ id: 'a', name: '', enabled: true, groups: [[{ fieldId: 'f1', op: 'is', value: 'Alto' }]], model: 'claude:opus@high' }],
    );
  });
});

describe('workflows', () => {
  it('cria um workflow com as colunas padrão, renomeia e exclui quando vazio', async () => {
    let b = (await call('create_workflow', { name: 'Suporte', kind: 'parent' })).data;
    const created = b.workflows.find((w: any) => w.name === 'Suporte');
    expect(created.columns.map((c: any) => c.name)).toEqual(['A fazer', 'Em andamento', 'Concluído']);
    expect(created.columns.map((c: any) => c.category)).toEqual(['open', 'open', 'done']);
    expect(router.snapshot().workflows.find((w) => w.name === 'Suporte')).toMatchObject({ kind: 'parent' });
    // não dá para escolher um papel que não existe
    expect((await call('create_workflow', { name: 'X', kind: 'irmão' })).error).toBe(true);

    b = (await call('rename_workflow', { workflow: 'Suporte', name: 'Atendimento' })).data;
    expect(b.workflows.map((w: any) => w.name)).toContain('Atendimento');

    b = (await call('delete_workflow', { workflow: 'Atendimento' })).data;
    expect(b.workflows.map((w: any) => w.name)).not.toContain('Atendimento');
  });

  it('muda a posição de um workflow e renumera os outros', async () => {
    await call('create_workflow', { name: 'Último', kind: 'parent' });
    const order = () => router.snapshot().workflows.map((w) => w.name);
    const before = order();
    expect(before[before.length - 1]).toBe('Último');
    await call('move_workflow', { workflow: 'Último', position: 0 });
    expect(order()).toEqual(['Último', ...before.slice(0, -1)]);
    expect(router.snapshot().workflows.map((w) => w.position)).toEqual(before.map((_, i) => i));
    // posição além do fim vai para o fim
    await call('move_workflow', { workflow: 'Último', position: 99 });
    expect(order()).toEqual(before);
    await call('delete_workflow', { workflow: 'Último' });
  });

  it('recusa excluir um workflow em que nascem tipos de card, e exclui depois que eles saem', async () => {
    const story = router.snapshot().workflows.find((w) => w.kind === 'parent')!;
    expect((await call('delete_workflow', { workflow: story.name })).error).toBe(true);

    await call('create_workflow', { name: 'Sozinho', kind: 'child' });
    const lone = router.snapshot().workflows.find((w) => w.name === 'Sozinho')!;
    expect(lone.position).toBe(router.snapshot().workflows.length - 1);
    router.handle({ type: 'settings.type.create', name: 'Preso', color: '#123456', defaultWorkflowId: lone.id });
    const blocked = await call('delete_workflow', { workflow: 'Sozinho' });
    expect(blocked.error).toBe(true);
    expect(blocked.text).toContain('tipo(s) de card nascem neste workflow');

    router.handle({ type: 'settings.type.delete', typeId: router.snapshot().cardTypes.find((t) => t.name === 'Preso')!.id });
    expect((await call('delete_workflow', { workflow: 'Sozinho' })).error).toBe(false);
    expect(router.snapshot().workflows.some((w) => w.name === 'Sozinho')).toBe(false);
  });

  it('não expõe mais "começa colapsada" na coluna, na linha nem nos arquivados', async () => {
    const b = (await call('get_board')).data;
    expect(JSON.stringify(b)).not.toContain('ollapsed');
  });
});

describe('aparência', () => {
  it('guarda tema, fonte e tamanho, recusando valores fora do permitido', async () => {
    expect((await call('get_board')).data.appearance).toMatchObject({ theme: 'system', font: 'sans', fontSize: 14 });
    expect((await call('set_appearance', { theme: 'dark', font_size: 16 })).data).toMatchObject({
      theme: 'dark',
      font: 'sans',
      fontSize: 16,
    });
    expect((await call('set_appearance', { font: 'serif' })).data).toMatchObject({ theme: 'dark', font: 'serif', fontSize: 16 });
    expect((await call('set_appearance', { font_size: 40 })).error).toBe(true);
    router.handle({ type: 'settings.board.update', patch: { appearance: { fontSize: 99, theme: 'neon' as never } } });
    expect(router.snapshot().board.appearance).toMatchObject({ theme: 'system', font: 'serif', fontSize: 22 });

    // rótulo e cor dos status: o que for inválido volta ao padrão
    const statuses = router.snapshot().board.appearance.statuses;
    router.handle({
      type: 'settings.board.update',
      patch: { appearance: { statuses: { ...statuses, ready: { label: 'Na fila', color: 'vermelho' } } } },
    });
    expect(router.snapshot().board.appearance.statuses.ready).toEqual({ label: 'Na fila', color: '#4c8dff' });
    expect(router.snapshot().board.appearance.statuses.blocked.label).toBe('Bloqueado');
  });
});

describe('status do card e checkpoint de revisão', () => {
  const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
  const human = (n: number, status: any, note?: string) => router.handle({ type: 'card.status.set', cardId: card(n).id, status, note });
  const pending = async () => (await call('get_pending_work')).data;
  const ids = (list: any[]) => list.map((c) => c.id);

  it('a IA pede revisão e só avança depois da aprovação de uma pessoa', async () => {
    const story = (await call('create_card', { title: 'Login' })).data;
    expect(story.work).toBeUndefined(); // Backlog: a IA não atua
    expect((await call('get_board')).data.workflows[0].columns.find((c: any) => c.name === 'PRD')).toMatchObject({
      aiActive: true,
      requiresApproval: true,
    });

    // sair do Backlog não exige aprovação; ao entrar numa coluna em que a IA atua o card fica pronto
    expect((await call('move_card', { card: 1, column: 'PRD' })).data.card.work).toEqual({ status: 'ready', label: 'Pronto', with: 'ai' });
    const early = await call('move_card', { card: 1, column: 'Spec' });
    expect(early.error).toBe(true);
    expect(early.text).toContain('aprovação de uma pessoa');
    expect(card(1).columnId).toBe(router.snapshot().columns.find((c) => c.name === 'PRD')!.id);

    expect((await call('start_work', { card: 1 })).data.card.work.status).toBe('running');
    const asked = (await call('request_review', { card: 1, summary: 'PRD anexado' })).data;
    expect(asked.card.work).toMatchObject({ status: 'waiting_review', with: 'human' });
    expect(asked.next).toContain('Pare aqui');
    expect((await call('get_card', { card: 1 })).data.comments.at(-1)).toMatchObject({ author: 'Claude Code', body: 'PRD anexado' });
    expect((await call('list_cards', { work_status: 'waiting_review' })).data.cards.map((c: any) => c.id)).toEqual(['#1']);

    // pedir ajustes: volta para a IA, com o pedido na conversa
    human(1, 'ready', 'Faltou o critério de aceite');
    expect((await call('get_card', { card: 1 })).data).toMatchObject({ work: { status: 'ready', with: 'ai' } });
    expect((await call('get_card', { card: 1 })).data.comments.at(-1)).toMatchObject({
      author: 'Pessoa',
      body: 'Faltou o critério de aceite',
    });
    expect((await call('move_card', { card: 1, column: 'Spec' })).error).toBe(true);

    // a IA não aprova; a pessoa sim
    await call('request_review', { card: 1, summary: 'Ajustado' });
    expect(() => router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'approved' }, { source: 'ai' })).toThrow(
      'Só uma pessoa',
    );
    human(1, 'approved');
    expect(card(1)).toMatchObject({ status: 'approved', statusBy: 'Pessoa' });
    const moved = (await call('move_card', { card: 1, column: 'Spec' })).data.card;
    expect(moved).toMatchObject({ column: 'Spec', work: { status: 'ready' } }); // o status recomeça na coluna nova

    // voltar e cancelar são livres; a pessoa move sem aprovação
    expect((await call('move_card', { card: 1, column: 'PRD' })).error).toBe(false);
    router.handle({
      type: 'card.move',
      cardId: card(1).id,
      columnId: router.snapshot().columns.find((c) => c.name === 'Plan')!.id,
      position: 0,
    });
    expect(card(1).status).toBe('ready');
    expect((await call('move_card', { card: 1, column: 'Cancelado' })).data.card.work).toBeUndefined();
  });

  it('entrega a fase do card e guarda o artefato na história, mesmo vindo da sub-tarefa', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    const story = (await call('get_card', { card: 1 })).data;
    expect(story.phase).toMatchObject({ name: 'PRD', artifact: { filename: 'PRD.md' }, requiresApproval: true });
    expect(story.phase.instruction).toContain('requisitos');
    expect(story.phase.artifact.template).toContain('# PRD');
    expect(story.phase.reviewNote).toContain('#1');

    // a sub-tarefa da fase enxerga a fase da história e grava o artefato nela
    const sub = (await call('create_card', { title: 'Escrever PRD', parent: 1, fields: { Fase: 'PRD' } })).data;
    expect(sub.phase.name).toBe('PRD');
    expect(sub.storyArtifacts).toEqual([]);
    const first = (await call('add_attachment', { card: 2, filename: 'PRD.md', content: 'v1', artifact: true })).data;
    expect(first).toMatchObject({ filename: 'PRD.md', artifact: true, attachedTo: '#1' });
    await call('add_attachment', { card: 2, filename: 'rascunho.md', content: 'notas' }); // anexo comum fica na sub-tarefa
    const second = (await call('add_attachment', { card: 2, filename: 'PRD.md', content: 'v2', artifact: true })).data;
    expect(fs.existsSync(first.path)).toBe(false); // a revisão substitui o arquivo anterior

    const after = (await call('get_card', { card: 1 })).data;
    expect(after.attachments.map((a: any) => [a.filename, a.artifact])).toEqual([['PRD.md', true]]);
    expect((await call('read_attachment', { attachment_id: second.attachmentId })).text).toBe('v2');
    const subAfter = (await call('get_card', { card: 2 })).data;
    expect(subAfter.attachments.map((a: any) => a.filename)).toEqual(['rascunho.md']);
    expect(subAfter.storyArtifacts.map((a: any) => a.attachmentId)).toEqual([second.attachmentId]);

    // a fase é configurável por coluna
    await call('update_column', {
      column: 'PRD',
      ai_instruction: 'Escreva um one-pager',
      artifact_name: 'ONEPAGER.md',
      artifact_template: '# One-pager',
    });
    expect((await call('get_card', { card: 1 })).data.phase).toMatchObject({
      instruction: 'Escreva um one-pager',
      artifact: { filename: 'ONEPAGER.md', template: '# One-pager' },
    });
    await call('create_card', { title: 'No backlog' });
    expect((await call('get_card', { card: 3 })).data.phase).toBeUndefined();
  });

  it('fila de pendências: o que está com a IA e o que está com a pessoa', async () => {
    const { humanQueueStatuses, turnsPassedToHuman } = await import('../src/shared/pending');
    expect((await pending()).next).toContain('Nada pendente');

    await call('create_card', { title: 'A', column: 'PRD' }); // #1
    await call('create_card', { title: 'B', column: 'Spec' }); // #2
    await call('create_card', { title: 'C' }); // #3, no Backlog: a IA não atua
    await call('create_card', { title: 'Sub de A', parent: 1 }); // #4
    let p = await pending();
    // ordem de execução: de cima para baixo no board, não por número (#4 está na primeira coluna)
    expect(ids(p.forYou.ready)).toEqual(['#4', '#1', '#2']);
    expect(p.withPerson).toEqual([]);

    // a IA entrega #1 para revisão: sai da fila dela, entra na da pessoa, e a sub-tarefa espera junto
    const before = humanQueueStatuses(router.snapshot());
    await call('request_review', { card: 1, summary: 'pronto' });
    expect(turnsPassedToHuman(before, router.snapshot()).map((c) => c.number)).toEqual([1]);
    expect(turnsPassedToHuman(humanQueueStatuses(router.snapshot()), router.snapshot())).toEqual([]); // já avisado
    p = await pending();
    expect(ids(p.forYou.ready)).toEqual(['#2']);
    expect(ids(p.withPerson)).toEqual(['#1']);

    // a pessoa escreve num card do Backlog e num que aguarda revisão: são mensagens sem resposta
    router.handle({ type: 'comment.add', cardId: card(3).id, body: 'Isso depende do #2?' });
    router.handle({ type: 'comment.add', cardId: card(1).id, body: 'Por que essa abordagem?' });
    p = await pending();
    // #3 está no Backlog, acima do #1 no PRD: a ordem de execução segue a posição no board
    expect(ids(p.forYou.unanswered)).toEqual(['#3', '#1']);
    expect(p.forYou.unanswered[0].lastMessage).toMatchObject({ author: 'Pessoa', body: 'Isso depende do #2?' });
    expect((await call('get_card', { card: 3 })).data.comments[0].from).toBe('human');
    await call('add_comment', { card: 3, body: 'Não depende.' });
    expect(ids((await pending()).forYou.unanswered)).toEqual(['#1']);

    // aprovado vai para o topo da fila; bloqueio feito pela própria pessoa não gera aviso
    human(1, 'approved');
    p = await pending();
    expect(ids(p.forYou.approved)).toEqual(['#1']);
    expect(ids(p.forYou.ready)).toEqual(['#4', '#2']);
    // next não cita mais os nomes dos grupos (approved/unanswered/ready), manda seguir `order`
    expect(p.next).toContain('order');
    const quiet = humanQueueStatuses(router.snapshot());
    human(2, 'blocked', 'Sem acesso');
    expect(turnsPassedToHuman(quiet, router.snapshot())).toEqual([]);
    expect(ids((await pending()).withPerson)).toEqual(['#2']);
    expect((await call('list_cards', { work_status: 'blocked' })).data.total).toBe(1);
  });

  it('order traz a fila inteira em ordem, com o bug na frente mesmo vindo de outro grupo', async () => {
    // o bug está pronto e mais abaixo no board; a história está aprovada e mais acima
    await call('create_card', { title: 'Falha', type: 'Bug', column: 'Plan' }); // #1, pronto
    await call('create_card', { title: 'Login', column: 'PRD' }); // #2, vai ser aprovado
    human(2, 'approved');

    const p = await pending();
    expect(ids(p.forYou.ready)).toEqual(['#1']);
    expect(ids(p.forYou.approved)).toEqual(['#2']);
    // o bug vence as duas coisas que o venciam antes: a categoria "approved" e a coluna mais à esquerda
    expect(p.order).toEqual(['#1', '#2']);
    expect(p.next).toContain('order');
  });

  it('cria, edita e apaga agentes na pasta da ferramenta em uso', async () => {
    expect((await call('get_harness')).data.agents).toEqual([]);
    const h = (
      await call('create_agent', {
        name: 'revisor-de-spec',
        description: 'Revisa uma Spec antes do Plan',
        content: 'Leia a spec e aponte lacunas.',
        model: 'opus',
      })
    ).data;
    expect(h.agents).toEqual([
      { name: 'revisor-de-spec', description: 'Revisa uma Spec antes do Plan', model: 'opus', path: '.claude/agents/revisor-de-spec.md' },
    ]);
    const file = path.join(dir, '.claude/agents/revisor-de-spec.md');
    expect(fs.readFileSync(file, 'utf8')).toBe(
      '---\nname: revisor-de-spec\ndescription: Revisa uma Spec antes do Plan\nmodel: opus\n---\n\nLeia a spec e aponte lacunas.\n',
    );
    expect((await call('get_agent', { agent: 'revisor-de-spec' })).text).toContain('aponte lacunas');
    expect((await call('create_agent', { name: 'revisor-de-spec', description: 'd', content: 'c' })).text).toContain('Já existe');
    expect((await call('create_agent', { name: 'Nome Inválido', description: 'd', content: 'c' })).error).toBe(true);

    await call('update_agent', {
      agent: 'revisor-de-spec',
      content: '---\nname: revisor-de-spec\ndescription: Nova descrição\n---\nNovo corpo',
    });
    expect((await call('get_harness')).data.agents[0]).toEqual({
      name: 'revisor-de-spec',
      description: 'Nova descrição',
      path: '.claude/agents/revisor-de-spec.md',
    });

    // agente criado por fora aparece; cada ferramenta tem a sua pasta e extensão
    fs.writeFileSync(path.join(dir, '.claude/agents/planejador.md'), '---\nname: planejador\ndescription: Quebra a spec em passos\n---\nx');
    router.refreshHarness();
    expect((await call('get_harness')).data.agents.map((a: any) => a.name)).toEqual(['planejador', 'revisor-de-spec']);
    await call('set_ai_tool', { tool: 'copilot' });
    expect((await call('get_harness')).data.agents).toEqual([]);
    await call('create_agent', { name: 'do-copilot', description: 'd', content: 'c' });
    expect(fs.existsSync(path.join(dir, '.github/agents/do-copilot.agent.md'))).toBe(true);
    // Codex guarda agentes em TOML; o Kimi não tem modelo por agente
    await call('set_ai_tool', { tool: 'codex' });
    const codex = (
      await call('create_agent', {
        name: 'explorador',
        description: 'Explora o código "antes" de mudar',
        content: 'Só leia.',
        model: 'gpt-6-luna',
      })
    ).data;
    expect(codex.agents).toEqual([
      { name: 'explorador', description: 'Explora o código "antes" de mudar', model: 'gpt-6-luna', path: '.codex/agents/explorador.toml' },
    ]);
    expect(fs.readFileSync(path.join(dir, '.codex/agents/explorador.toml'), 'utf8')).toBe(
      'name = "explorador"\ndescription = "Explora o código \\"antes\\" de mudar"\nmodel = "gpt-6-luna"\ndeveloper_instructions = """\nSó leia.\n"""\n',
    );
    await call('set_ai_tool', { tool: 'kimi' });
    expect((await call('create_agent', { name: 'revisor', description: 'd', content: 'c', model: 'k3' })).text).toContain(
      'não permite fixar o modelo',
    );
    await call('create_agent', { name: 'revisor', description: 'd', content: 'c' });
    expect(fs.existsSync(path.join(dir, '.kimi-code/agents/revisor.md'))).toBe(true);
    await call('set_ai_tool', { tool: 'cursor' });
    await call('create_agent', { name: 'verificador', description: 'd', content: 'c' });
    expect(fs.existsSync(path.join(dir, '.cursor/agents/verificador.md'))).toBe(true);
    await call('set_ai_tool', { tool: 'claude' });

    await call('delete_agent', { agent: 'planejador' });
    expect(fs.existsSync(path.join(dir, '.claude/agents/planejador.md'))).toBe(false);
    expect((await call('delete_agent', { agent: 'planejador' })).text).toContain('não encontrado');
  });

  it('instala a skill do fluxo sem sobrescrever', async () => {
    const first = (await call('install_flow_skill')).data;
    expect(first).toMatchObject({ installed: true, skill: '.claude/skills/faz-ai-fluxo/SKILL.md' });
    const file = path.join(dir, first.skill);
    expect(fs.readFileSync(file, 'utf8')).toContain('get_pending_work');
    fs.writeFileSync(file, '---\nname: faz-ai-fluxo\ndescription: minha versão\n---\nmeu texto');
    expect((await call('install_flow_skill')).data.installed).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toContain('meu texto');
  });

  it('pergunta, bloqueio e colunas configuráveis', async () => {
    await call('create_card', { title: 'Login', column: 'Implementação' });
    expect((await call('ask_question', { card: 1, question: 'Qual provedor de login?' })).data.card.work).toMatchObject({
      status: 'waiting_answer',
      with: 'human',
    });
    await call('add_comment', { card: 1, body: 'Enquanto isso, li o código.' });
    expect(card(1).status).toBe('waiting_answer'); // mensagem da IA não devolve a vez
    router.handle({ type: 'comment.add', cardId: card(1).id, body: 'Google' });
    expect(card(1).status).toBe('ready');

    expect((await call('block_card', { card: 1, reason: 'Sem acesso ao ambiente' })).data.card.work).toMatchObject({
      status: 'blocked',
      with: 'human',
      reason: 'Sem acesso ao ambiente',
    });
    expect(() => human(1, 'blocked')).toThrow('motivo');
    human(1, 'ready');
    expect(card(1)).toMatchObject({ status: 'ready', statusReason: '' });

    // Implementação não exige aprovação por padrão; ligando, passa a exigir
    const cols = (await call('update_column', { column: 'Implementação', requires_approval: true })).data.workflows[0].columns;
    expect(cols.find((c: any) => c.name === 'Implementação').requiresApproval).toBe(true);
    expect((await call('move_card', { card: 1, column: 'Concluído' })).text).toContain('aprovação de uma pessoa');
    await call('update_column', { column: 'Implementação', requires_approval: false, ai_active: false });
    expect((await call('move_card', { card: 1, column: 'Concluído' })).error).toBe(false);
    // sub-tarefas nascem prontas na coluna "A fazer"
    await call('create_card', { title: 'H2' });
    expect((await call('create_card', { title: 'Tarefa', parent: 2 })).data.work).toMatchObject({ status: 'ready' });
  });
});

describe('ferramentas de IA', () => {
  const skillMd = (base: string) => path.join(dir, base, 'revisar-spec', 'SKILL.md');

  it('trabalha só com a pasta de skills da ferramenta em uso', async () => {
    const names = async () => (await call('get_harness')).data.skills.map((k: any) => k.name);
    await call('create_skill', { name: 'revisar-spec', description: 'd', content: 'c' });
    expect(fs.existsSync(skillMd('.claude/skills'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.agents'))).toBe(false); // nada de cópia ou atalho em outra pasta

    // Codex: a pasta do Claude continua no disco, mas fica fora do board
    const h = (await call('set_ai_tool', { tool: 'codex' })).data;
    expect(h.aiTool).toBe('codex');
    expect(h.skills).toEqual([]);
    expect(router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual([]);
    await call('create_skill', { name: 'do-codex', description: 'd', content: 'c' });
    expect(fs.existsSync(path.join(dir, '.agents/skills/do-codex/SKILL.md'))).toBe(true);
    expect(fs.existsSync(skillMd('.claude/skills'))).toBe(true);
    await call('set_skill_enabled', { skill: 'do-codex', enabled: false });
    expect(fs.existsSync(path.join(dir, '.agents/skills-disabled/do-codex/SKILL.md'))).toBe(true);
    expect((await call('set_skill_enabled', { skill: 'revisar-spec', enabled: false })).error).toBe(true); // skill de outra ferramenta

    for (const [tool, base] of [
      ['cursor', '.cursor/skills'],
      ['kimi', '.kimi-code/skills'],
      ['copilot', '.github/skills'],
    ] as const) {
      await call('set_ai_tool', { tool });
      await call('create_skill', { name: `do-${tool}`, description: 'd', content: 'c' });
      expect(fs.existsSync(path.join(dir, base, `do-${tool}`, 'SKILL.md'))).toBe(true);
      expect(await names()).toEqual([`do-${tool}`]);
    }
    await call('set_ai_tool', { tool: 'claude' });
    expect(await names()).toEqual(['revisar-spec']);
    expect(router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['revisar-spec']);
  });

  it('registra o servidor MCP no formato de cada ferramenta', async () => {
    const { registerClients } = await import('../src/extension/mcp/clientConfig');
    const home = path.join(dir, 'home');
    fs.mkdirSync(path.join(home, '.kimi-code'), { recursive: true });
    fs.writeFileSync(path.join(home, '.kimi-code', 'mcp.json'), JSON.stringify({ mcpServers: { outro: { command: 'x' } } }));
    fs.mkdirSync(path.join(dir, '.codex'));
    fs.writeFileSync(
      path.join(dir, '.codex', 'config.toml'),
      'model = "x"\n\n[mcp_servers.faz-ai]\ncommand = "velho"\nargs = ["a"]\n\n[mcp_servers.outro]\ncommand = "y"\n',
    );
    const bridge = '/b/com espaço/bridge.js';
    const done = registerClients(['claude', 'codex', 'cursor', 'kimi'], { bridgePath: bridge, workspaceDir: dir, homeDir: home });
    expect(done.map((d) => d.projectFile)).toEqual(['.mcp.json', '.codex/config.toml', '.cursor/mcp.json', null]);

    const json = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')).mcpServers;
    expect(json(path.join(dir, '.mcp.json'))['faz-ai']).toEqual({ type: 'stdio', command: 'node', args: [bridge, dir] });
    expect(json(path.join(dir, '.cursor', 'mcp.json'))['faz-ai']).toEqual({ type: 'stdio', command: 'node', args: [bridge, dir] });
    const kimi = json(path.join(home, '.kimi-code', 'mcp.json'));
    expect(kimi.outro).toEqual({ command: 'x' });
    expect(kimi['faz-ai']).toEqual({ transport: 'stdio', command: 'node', args: [bridge] });
    expect(fs.existsSync(path.join(home, '.kimi'))).toBe(false);

    const toml = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');
    expect(toml).toContain('model = "x"');
    expect(toml).toContain('[mcp_servers.outro]\ncommand = "y"');
    expect(toml).not.toContain('velho');
    expect(toml.match(/\[mcp_servers\.faz-ai\]/g)).toHaveLength(1);
    expect(toml).toContain(`args = ["${bridge}", "${dir}"]`);

    // Copilot: .vscode/mcp.json (chave `servers`) para o VS Code e .mcp.json para a Copilot CLI
    fs.mkdirSync(path.join(dir, '.vscode'));
    fs.writeFileSync(path.join(dir, '.vscode', 'mcp.json'), JSON.stringify({ servers: { outro: { command: 'x' } }, inputs: [] }));
    const copilot = registerClients(['copilot'], { bridgePath: bridge, workspaceDir: dir, homeDir: home });
    expect(copilot.map((d) => d.projectFile)).toEqual(['.vscode/mcp.json', '.mcp.json']);
    const vscode = JSON.parse(fs.readFileSync(path.join(dir, '.vscode', 'mcp.json'), 'utf8'));
    expect(vscode).toEqual({
      servers: { outro: { command: 'x' }, 'faz-ai': { type: 'stdio', command: 'node', args: [bridge, dir] } },
      inputs: [],
    });
    expect(json(path.join(dir, '.mcp.json'))['faz-ai']).toEqual({ type: 'stdio', command: 'node', args: [bridge, dir], tools: ['*'] });
  });

  it('sugere modelos do Copilot e o detecta pela CLI ou pela extensão do VS Code', async () => {
    const { detectTools, modelsFor, effortTiers } = await import('../src/extension/models');
    const home = path.join(dir, 'home-copilot');
    expect(effortTiers('copilot', modelsFor('copilot', home)).map(([, v]) => v)).toEqual([
      'copilot:gpt-5.6-luna@low',
      'copilot:gpt-5.6-terra@medium',
      'copilot:gpt-5.6-sol@high',
    ]);
    fs.mkdirSync(path.join(home, '.vscode', 'extensions', 'ms-python.python-1.0.0'), { recursive: true });
    expect(detectTools(home)).toEqual([]);
    fs.mkdirSync(path.join(home, '.vscode', 'extensions', 'github.copilot-chat-0.40.0'));
    expect(detectTools(home)).toEqual(['copilot']);
  });
});

describe('ponte stdio', () => {
  it('repassa uma sessão MCP pelo socket local', async () => {
    const bridge = path.resolve(__dirname, '../dist/mcp-bridge.js');
    if (!fs.existsSync(bridge)) throw new Error('rode `npm run build:ext` antes deste teste');
    const address = process.platform === 'win32' ? `\\\\.\\pipe\\fazai-test-${process.pid}` : path.join(dir, 'mcp.sock');
    const stop = await startMcpServer(address, { getRouter: async () => router, workspaceDir: dir, version: 'test' });
    // a ponte calcula o endereço a partir da pasta; aqui o HOME aponta para um diretório de teste
    const { socketPath } = await import('../src/extension/mcp/socketPath');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fz-'));
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const prev = process.env.HOME;
    process.env.HOME = home;
    const expected = socketPath(dir);
    process.env.HOME = prev;
    if (process.platform !== 'win32') {
      fs.mkdirSync(path.dirname(expected), { recursive: true });
      fs.symlinkSync(address, expected);
    }
    const child = spawn(process.execPath, [bridge, dir], { env, stdio: ['pipe', 'pipe', 'inherit'] });
    const lines: any[] = [];
    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        lines.push(JSON.parse(buf.slice(0, i)));
        buf = buf.slice(i + 1);
      }
    });
    const send = (m: unknown) => child.stdin.write(JSON.stringify(m) + '\n');
    const reply = async (id: number) => {
      for (let i = 0; i < 100; i++) {
        const m = lines.find((l) => l.id === id);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`sem resposta para ${id}`);
    };
    try {
      send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } },
      });
      expect((await reply(1)).result.serverInfo.name).toBe('faz-ai');
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_card', arguments: { title: 'Pela ponte' } } });
      expect((await reply(2)).result.content[0].text).toContain('"#1"');
      expect(router.snapshot().cards[0]?.title).toBe('Pela ponte');
    } finally {
      child.kill();
      stop();
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 15000);
});

describe('vínculos entre cards', () => {
  it('link_cards vincula pai, filho e relativo; get_card mostra, e unlink_cards remove', async () => {
    const pai = (await call('create_card', { title: 'Pai' })).data;
    const filho = (await call('create_card', { title: 'Filho' })).data;
    const outro = (await call('create_card', { title: 'Outro' })).data;
    const ok = await call('link_cards', { card: pai.id, other: filho.id, relation: 'child' });
    expect(ok.error).toBe(false);
    expect(ok.data.children).toMatchObject([{ id: filho.id, title: 'Filho' }]);
    expect(ok.data.childrenProgress).toBe('0/1 encerrados');
    await call('link_cards', { card: pai.id, other: outro.id, relation: 'related' });

    // visto do filho, o card de origem aparece como pai
    expect((await call('get_card', { card: filho.id })).data.links.parents).toMatchObject([{ id: pai.id }]);
    expect((await call('get_card', { card: outro.id })).data.links.related).toMatchObject([{ id: pai.id }]);
    expect(router.snapshot().links).toHaveLength(2);

    // não repete e não fecha ciclo
    expect((await call('link_cards', { card: filho.id, other: pai.id, relation: 'child' })).error).toBe(true);
    expect((await call('link_cards', { card: pai.id, other: pai.id, relation: 'related' })).error).toBe(true);

    expect((await call('unlink_cards', { card: filho.id, other: pai.id })).error).toBe(false);
    expect(router.snapshot().links).toHaveLength(1);
    expect((await call('unlink_cards', { card: filho.id, other: pai.id })).error).toBe(true);
  });

  it('`parent` faz de other o pai do card', async () => {
    const a = (await call('create_card', { title: 'A' })).data;
    const b = (await call('create_card', { title: 'B' })).data;
    await call('link_cards', { card: a.id, other: b.id, relation: 'parent' });
    expect(router.snapshot().links[0]).toMatchObject({ kind: 'child' });
    expect((await call('get_card', { card: a.id })).data.links.parents).toMatchObject([{ id: b.id }]);
  });
});

describe('modo autônomo (YOLO)', () => {
  const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
  const column = (name: string) => router.snapshot().columns.find((c) => c.name === name)!;
  const setYolo = (n: number, enabled: boolean) => router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled });

  it('só uma pessoa liga, e só na história', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    await call('create_card', { title: 'Tela', parent: 1 });
    expect(card(1).yolo).toBe(false);
    expect(() => router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true }, { source: 'ai' })).toThrow('Só uma pessoa');
    expect(() => setYolo(2, true)).toThrow('não para uma sub-tarefa');

    setYolo(1, true);
    expect(card(1).yolo).toBe(true);
    expect(card(2).yolo).toBe(false); // a flag fica na história; a sub-tarefa herda
    expect((await call('get_card', { card: 2 })).data.autonomous).toBe(true);
    expect((await call('get_card', { card: 1 })).data.comments.at(-1).body).toContain('Modo autônomo ligado');
    setYolo(1, false);
    expect(card(1).yolo).toBe(false);
  });

  it('a IA avança uma coluna que exige aprovação sem esperar por ela', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    expect((await call('move_card', { card: 1, column: 'Spec' })).error).toBe(true); // sem YOLO, trava
    setYolo(1, true);
    expect((await call('move_card', { card: 1, column: 'Spec' })).data.card).toMatchObject({ column: 'Spec', work: { status: 'ready' } });
    // as outras regras do board continuam valendo
    await call('create_card', { title: 'Passo', parent: 1, fields: { Fase: 'Spec' } });
    expect((await call('move_card', { card: 1, column: 'Plan' })).error).toBe(true);
  });

  it('request_review vira aprovação na hora, com o resumo na conversa, e não dispara o merge automático', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    setYolo(1, true);
    const approvals: string[] = [];
    router.onDidApprove((id) => approvals.push(id));

    const res = (await call('request_review', { card: 1, summary: 'PRD pronto' })).data;
    expect(res.card.work).toMatchObject({ status: 'approved' });
    expect(res.next).toContain('Modo autônomo');
    expect(card(1).status).toBe('approved');
    expect((await call('get_card', { card: 1 })).data.comments.at(-1).body).toBe('PRD pronto');
    expect(approvals).toEqual([]);
  });

  it('set_pull_request na última coluna da IA entrega a história YOLO: waiting_review (não approved) e aviso na conversa', async () => {
    await call('create_card', { title: 'Login', column: 'Backlog' });
    setYolo(1, true);
    await call('move_card', { card: 1, column: 'Homologação' });
    const approvals: string[] = [];
    router.onDidApprove((id) => approvals.push(id));

    const res = (await call('set_pull_request', { card: 1, url: 'https://github.com/org/repo/pull/1' })).data;
    expect(card(1).status).toBe('waiting_review');
    expect(card(1).prUrl).toBe('https://github.com/org/repo/pull/1');
    expect((await call('get_card', { card: 1 })).data.comments.at(-1).body).toContain('entregue');
    expect((await call('get_card', { card: 1 })).data.comments.at(-1).body).toContain('https://github.com/org/repo/pull/1');
    expect(res.next).toContain('entregue');
    expect(approvals).toEqual([]); // o merge só sai da aprovação de uma pessoa, não da entrega automática
  });

  it('set_pull_request numa coluna anterior à última da IA não entrega: status inalterado', async () => {
    await call('create_card', { title: 'Login', column: 'Backlog' });
    setYolo(1, true);
    await call('move_card', { card: 1, column: 'Implementação' });
    const before = card(1).status;

    await call('set_pull_request', { card: 1, url: 'https://github.com/org/repo/pull/1' });
    expect(card(1).status).toBe(before);
    expect(card(1).prUrl).toBe('https://github.com/org/repo/pull/1');
  });

  it('set_pull_request na última coluna sem modo autônomo não entrega: status inalterado', async () => {
    await call('create_card', { title: 'Login', column: 'Backlog' });
    await call('move_card', { card: 1, column: 'Homologação' });
    const before = card(1).status;

    await call('set_pull_request', { card: 1, url: 'https://github.com/org/repo/pull/1' });
    expect(card(1).status).toBe(before);
    expect(card(1).prUrl).toBe('https://github.com/org/repo/pull/1');
  });

  it('get_card: autonomousNote na última coluna da IA manda registrar o pull request e parar, sem mover para a conclusão', async () => {
    await call('create_card', { title: 'Login', column: 'Backlog' });
    setYolo(1, true);
    await call('move_card', { card: 1, column: 'Homologação' });

    const note = (await call('get_card', { card: 1 })).data.phase.autonomousNote;
    expect(note).toContain('set_pull_request');
    expect(note).toMatch(/pare/);
    expect(note).not.toContain('próxima coluna');
  });

  it('get_card: autonomousNote numa coluna do meio continua mandando mover para a próxima coluna', async () => {
    await call('create_card', { title: 'Login', column: 'Backlog' });
    setYolo(1, true);
    await call('move_card', { card: 1, column: 'Implementação' });

    const note = (await call('get_card', { card: 1 })).data.phase.autonomousNote;
    expect(note).toContain('próxima coluna');
  });

  it('set_pull_request numa história bloqueada não entrega: o impedimento continua de pé', async () => {
    await call('create_card', { title: 'Login', column: 'Backlog' });
    setYolo(1, true);
    await call('move_card', { card: 1, column: 'Homologação' });
    await call('block_card', { card: 1, reason: 'Sem acesso ao repositório remoto' });

    await call('set_pull_request', { card: 1, url: 'https://github.com/org/repo/pull/1' });
    expect(card(1).status).toBe('blocked');
    expect(card(1).prUrl).toBe('https://github.com/org/repo/pull/1');
  });

  it('ask_question é recusada: a IA decide sozinha', async () => {
    await call('create_card', { title: 'Login', column: 'Discovery' });
    setYolo(1, true);
    const asked = await call('ask_question', { card: 1, question: 'Qual provedor?' });
    expect(asked.error).toBe(true);
    expect(asked.text).toContain('Decida por conta própria');
    expect(card(1).status).toBe('ready');
    // impedimento de verdade continua possível
    expect((await call('block_card', { card: 1, reason: 'Sem acesso' })).error).toBe(false);
  });

  it('a IA divide o trabalho em outras histórias, que herdam o modo; sem o modo, ela não amplia a própria autonomia', async () => {
    await call('create_card', { title: 'Grande', column: 'Discovery' });
    const refused = await call('create_card', { title: 'Parte 2', autonomous_from: 1 });
    expect(refused.error).toBe(true);
    expect(refused.text).toContain('só uma pessoa liga');
    expect(router.snapshot().cards).toHaveLength(1); // nada foi criado pela metade

    setYolo(1, true);
    const part = (await call('create_card', { title: 'Parte 2', autonomous_from: 1 })).data;
    expect(part).toMatchObject({ column: 'Backlog', autonomous: true });
    expect(card(2).yolo).toBe(true);
    expect((await call('get_card', { card: 2 })).data.comments[0].body).toContain('a partir de #1');
    expect((await call('create_card', { title: 'Passo', parent: 1, autonomous_from: 1 })).error).toBe(true);
    // a mensagem só vale vinda da IA
    expect(() => router.handle({ type: 'card.yolo.inherit', cardId: card(2).id, fromId: card(1).id })).toThrow('card.yolo.set');
  });

  it('ligar libera o que esperava uma pessoa', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    await call('request_review', { card: 1, summary: 'PRD pronto' });
    expect(card(1).status).toBe('waiting_review');
    setYolo(1, true);
    expect(card(1).status).toBe('approved');
    expect(column('PRD').requiresApproval).toBe(true); // a coluna não muda: só o card deixa de depender dela
  });
});
