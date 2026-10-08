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
import { forgetModels, parseCursorModels, rememberModels } from '../src/extension/models';

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
  const server = createMcpServer({ getRouter: async () => router, getRunner: async () => undefined, workspaceDir: dir, version: 'test' });
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
        'get_metrics',
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

  it('parâmetro desconhecido é erro com o nome dele, e nada é criado', async () => {
    // um nome errado não pode virar o comportamento padrão: `story` no lugar de `parent` criaria uma história
    const res = await call('create_card', { title: 'Subtrair', story: 1 });
    expect(res.error).toBe(true);
    expect(res.text).toContain('story');
    expect(router.snapshot().cards).toHaveLength(0);
    // e o schema publicado diz que não há outros parâmetros
    const create = (await client.listTools()).tools.find((t) => t.name === 'create_card')!;
    expect(create.inputSchema.additionalProperties).toBe(false);
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

    // move_card não oferece allowOpenChildren: tentar a opção é recusado antes de mover qualquer coisa
    const stillBlocked = await call('move_card', { card: 1, column: 'Concluído', allowOpenChildren: true });
    expect(stillBlocked.error).toBe(true);
    expect(stillBlocked.text).toContain('allowOpenChildren');
    expect((await call('get_card', { card: 1 })).data.column).not.toBe('Concluído');

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

  it('add_comment grava `kind` quando informado; sem ele, o comportamento é o de hoje', async () => {
    await call('create_card', { title: 'Card' });
    await call('add_comment', { card: 1, body: 'Resumo da conversa.', kind: 'summary' });
    expect(router.snapshot().comments.at(-1)).toMatchObject({ body: 'Resumo da conversa.', kind: 'summary' });

    await call('add_comment', { card: 1, body: 'Mensagem comum.' });
    const last = router.snapshot().comments.at(-1)!;
    expect(last.body).toBe('Mensagem comum.');
    expect(last.kind).toBeUndefined();

    // o schema só aceita "summary": outro valor é rejeitado antes de gravar
    const invalid = await call('add_comment', { card: 1, body: 'x', kind: 'nota' });
    expect(invalid.error).toBe(true);
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

  it('get_metrics responde em texto, aceita card como string ou número, e rejeita group_by inválido', async () => {
    await call('create_card', { title: 'História' });
    const empty = await call('get_metrics', {});
    expect(empty.error).toBeFalsy();
    expect(typeof empty.text).toBe('string');
    expect(empty.text).not.toMatch(/^\s*[{[]/); // nunca JSON (RF-08)

    expect((await call('get_metrics', { card: '#1' })).error).toBeFalsy();
    expect((await call('get_metrics', { card: 1 })).error).toBeFalsy();
    expect((await call('get_metrics', { group_by: 'phase' })).error).toBeFalsy();
    expect((await call('get_metrics', { group_by: 'nao-existe' })).error).toBe(true);
    expect((await call('get_metrics', { start_date: '2026-02-01', end_date: '2026-01-01' })).error).toBe(true);
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
  it('resolve o agente do card, da coluna e o padrão, e entrega em get_card', async () => {
    const home = path.join(dir, 'home-do-usuario');
    await call('create_skill', { name: 'planejar', description: 'Planeja', content: 'Passos' });
    await call('create_skill', { name: 'testar', description: 'Testa', content: 'Passos' });
    // as skills criadas pelo board já nascem marcadas; marcar de novo não muda nada
    await call('set_harness_selection', {
      items: [
        { kind: 'skill', name: 'planejar' },
        { kind: 'skill', name: 'testar' },
      ],
      usage: 'contextual',
    });
    // os agentes são arquivos na pasta global da ferramenta, e nascem disponíveis no board
    await call('create_agent', { name: 'geral', description: 'Geral', content: 'Instruções gerais', skills: ['testar'] });
    await call('create_agent', {
      name: 'planejador',
      description: 'Planeja',
      content: 'Instruções',
      skills: ['planejar'],
      mcp: ['github'],
      deniedTools: ['WebFetch'],
      model: 'claude:opus@high',
    });
    expect(fs.existsSync(path.join(home, '.claude/agents/planejador.md'))).toBe(true);
    router.handle({ type: 'settings.board.update', patch: { runner: { defaultAgent: 'geral' } } });
    await call('create_card', { title: 'História', fields: { Skills: ['testar'] } });
    // sem escolha no card nem na coluna: vale o padrão do board, e as skills do card somam às do agente sem repetir
    let card = (await call('get_card', { card: 1 })).data;
    expect(card.execution).toMatchObject({ profile: 'geral' });
    expect(card.requiredSkills.map((k: any) => k.name)).toEqual(['testar']);

    // o agente da coluna vale para os cards dela, e também para as sub-tarefas da história
    expect((await call('update_column', { column: 'Backlog', exec_profile: 'Não existe' })).error).toBe(true);
    const board = (await call('update_column', { column: 'Backlog', exec_profile: 'planejador' })).data;
    expect(board.agents.map((p: any) => p.name)).toEqual(['geral', 'planejador']);
    expect(board.agents.find((p: any) => p.name === 'geral').default).toBe(true);
    expect(board.workflows[0].columns[0].execProfile).toBe('planejador');
    card = (await call('get_card', { card: 1 })).data;
    expect(card.execution).toMatchObject({
      profile: 'planejador',
      agentFile: path.join(home, '.claude/agents/planejador.md'),
      mcpServers: ['faz-ai', 'github'],
      deniedTools: ['WebFetch'],
    });
    expect(card.execution.enforcedByBoardRun).toEqual(['agent', 'mcp', 'tools', 'model', 'context']);
    expect(card.requiredSkills.map((k: any) => k.name)).toEqual(['planejar', 'testar']);
    await call('create_card', { title: 'Sub', type: 'Sub-tarefa', parent: 1 });
    expect((await call('get_card', { card: 2 })).data.execution.profile).toBe('planejador');

    // o card pode trocar de agente, e voltar ao da coluna
    expect((await call('set_card_profile', { card: 1, profile: 'geral' })).data.execution.profile).toBe('geral');
    expect((await call('set_card_profile', { card: 1 })).data.execution.profile).toBe('planejador');

    // desmarcar um agente solta as colunas e os cards que o usavam
    await call('set_card_profile', { card: 1, profile: 'planejador' });
    await call('set_harness_selection', { items: [{ kind: 'agent', name: 'planejador' }], usage: null });
    const s = router.snapshot();
    expect(s.columns.every((c) => c.execProfile === null)).toBe(true);
    expect(s.cards.every((c) => c.execProfile === null)).toBe(true);
    expect((await call('get_card', { card: 1 })).data.execution.profile).toBe('geral');
    // o arquivo continua no disco: só saiu da marcação
    expect(fs.existsSync(path.join(home, '.claude/agents/planejador.md'))).toBe(true);
    expect((await call('get_harness', { onlySelected: false })).data.agents.map((a: any) => [a.name, a.usage])).toEqual([
      ['geral', 'contextual'],
      ['planejador', null],
    ]);
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
    put('.cursor/skills/de-outra-ferramenta/SKILL.md', '---\nname: x\ndescription: x\n---\n');
    await call('create_skill', { name: 'revisar-spec', description: 'Revisa', content: 'Passos' });
    router.refreshHarness();
    // a skill criada pelo board já nasce marcada; as que estão no disco por fora precisam ser marcadas
    expect(router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['revisar-spec']);
    await call('set_harness_selection', {
      items: [
        { kind: 'skill', name: 'commit' },
        { kind: 'skill', name: 'critica' },
      ],
      usage: 'contextual',
    });
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
      usage: 'contextual',
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
    // desligada, a skill sai do inventário (e das opções), mas o card que já a indicava ainda recebe o caminho
    expect(skillsField().options).toEqual([]);
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
    expect((await set('cursor:composer-2.5')).text).toContain('não está no catálogo'); // modelo de outra ferramenta

    // trocar de ferramenta traz os modelos e as regras de esforço dela
    await call('set_ai_tool', { tool: 'cursor' });
    const cursor = (await call('get_models')).data;
    expect(cursor.catalog.some((o: any) => o.tool === 'cursor')).toBe(true);
    expect(cursor.rules.map((r: any) => r.value)).toEqual(['cursor:auto', 'cursor:auto', 'cursor:auto']);
    expect((await set('cursor:composer-2.5')).data.model).toMatchObject({ tool: 'cursor', model: 'composer-2.5' });
    await call('set_ai_tool', { tool: 'claude' });
    expect((await set('opus turbo')).text).toContain('não aceita o esforço');
    expect((await set('modelo-que-nao-existe')).text).toContain('não está no catálogo');
  });

  it('upsert_model grava o modelo; get_models não devolve preço nenhum, e o board não aceita preço', async () => {
    const entry = async (value: string) => (await call('get_models')).data.catalog.find((o: any) => o.value === value);
    expect(await entry('claude:opus')).not.toHaveProperty('price');
    expect(await entry('claude:opus')).not.toHaveProperty('priceSource');

    await call('upsert_model', { tool: 'claude', model: 'opus', label: 'Opus', efforts: ['low', 'high'], default_effort: 'high' });
    expect(await entry('claude:opus')).toMatchObject({ label: 'Opus', efforts: ['low', 'high'], defaultEffort: 'high' });
    expect(JSON.stringify(router.snapshot().board.modelCatalog)).not.toContain('price');

    // "Detectar modelos" e a remoção continuam como antes
    await call('detect_models');
    expect(await entry('claude:opus')).toBeDefined();
    expect(JSON.stringify(router.snapshot().board.modelCatalog)).not.toContain('price');
    const after = await call('delete_model', { model: 'claude:opus' });
    expect(after.data.catalog.some((o: any) => o.value === 'claude:opus')).toBe(false);
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
    const cursor = (await call('suggest_model_rules', { tool: 'cursor' })).data.rules;
    expect(cursor.filter((r: any) => r.when.startsWith('Esforço')).map((r: any) => r.value)).toEqual([
      'cursor:auto',
      'cursor:auto',
      'cursor:auto',
    ]);
    expect(cursor[0].when).toBe('Tags = docs'); // regras de outros campos são preservadas
  });
});

describe('modos rápidos do Cursor', () => {
  afterEach(() => forgetModels('cursor'));

  it('ligar a regra traz as variantes rápidas ao catálogo; desligar as tira, e o resto fica', async () => {
    rememberModels('cursor', parseCursorModels(fs.readFileSync(path.join(__dirname, 'fixtures', 'cursor-models.txt'), 'utf8')));
    await call('set_ai_tool', { tool: 'cursor' });
    const cursorModels = async () =>
      ((await call('get_models')).data.catalog as { tool: string; model: string }[]).filter((o) => o.tool === 'cursor').map((o) => o.model);
    await call('detect_models', {});
    expect(await cursorModels()).toContain('claude-opus-5-5');
    expect(await cursorModels()).not.toContain('claude-opus-5-5-fast');

    expect((await call('update_rules', { includeFastModels: true })).data.includeFastModels).toBe(true);
    expect(await cursorModels()).toEqual(expect.arrayContaining(['claude-opus-5-5', 'claude-opus-5-5-fast', 'composer-2.5-fast']));

    await call('update_rules', { includeFastModels: false });
    const after = await cursorModels();
    expect(after).toContain('claude-opus-5-5');
    expect(after.filter((m) => m.endsWith('-fast') && after.includes(m.slice(0, -5)))).toEqual([]);
  });

  it('ligar a regra não traz de volta o que a pessoa tirou do catálogo, nem a versão rápida dele', async () => {
    rememberModels('cursor', parseCursorModels(fs.readFileSync(path.join(__dirname, 'fixtures', 'cursor-models.txt'), 'utf8')));
    await call('set_ai_tool', { tool: 'cursor' });
    await call('detect_models', {});
    const catalog = async () => ((await call('get_models')).data.catalog as { value: string }[]).map((o) => o.value);
    await call('delete_model', { model: 'cursor:claude-opus-5-5' });
    const before = await catalog();
    await call('update_rules', { includeFastModels: true });
    const after = await catalog();
    expect(after).not.toContain('cursor:claude-opus-5-5');
    expect(after).not.toContain('cursor:claude-opus-5-5-fast');
    // só entraram versões rápidas, cada uma logo depois do modelo dela
    const added = after.filter((id) => !before.includes(id));
    expect(added.length).toBeGreaterThan(0);
    for (const id of added) {
      expect(id.endsWith('-fast')).toBe(true);
      expect(after[after.indexOf(id) - 1]).toBe(id.slice(0, -5));
    }
  });

  it('num board de outra ferramenta, ligar a regra não enche o catálogo de modelos do Cursor', async () => {
    rememberModels('cursor', parseCursorModels(fs.readFileSync(path.join(__dirname, 'fixtures', 'cursor-models.txt'), 'utf8')));
    await call('set_ai_tool', { tool: 'claude' });
    const before = ((await call('get_models')).data.catalog as unknown[]).length;
    await call('update_rules', { includeFastModels: true });
    expect(((await call('get_models')).data.catalog as unknown[]).length).toBe(before);
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
      [
        {
          id: 'a',
          name: '',
          enabled: true,
          groups: [[{ fieldId: 'f1', op: 'is', value: 'Alto' }]],
          model: 'claude:opus@high',
          fallback: null,
        },
      ],
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
    // ordem de execução: a coluna mais à direita primeiro, não por número; a sub-tarefa vem logo depois da história dela
    expect(ids(p.forYou.ready)).toEqual(['#2', '#1', '#4']);
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
    // #1 está no PRD, à direita do #3 no Backlog: a ordem de execução segue a coluna mais adiantada
    expect(ids(p.forYou.unanswered)).toEqual(['#1', '#3']);
    expect(p.forYou.unanswered[1].lastMessage).toMatchObject({ author: 'Pessoa', body: 'Isso depende do #2?' });
    expect((await call('get_card', { card: 3 })).data.comments[0].from).toBe('human');
    await call('add_comment', { card: 3, body: 'Não depende.' });
    expect(ids((await pending()).forYou.unanswered)).toEqual(['#1']);

    // aprovado vai para o topo da fila; bloqueio feito pela própria pessoa não gera aviso
    human(1, 'approved');
    p = await pending();
    expect(ids(p.forYou.approved)).toEqual(['#1']);
    expect(ids(p.forYou.ready)).toEqual(['#2', '#4']);
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

  it('cria, edita e apaga agentes na pasta da ferramenta em uso, global por padrão ou no projeto', async () => {
    const home = path.join(dir, 'home-do-usuario');
    expect((await call('get_harness')).data.agents).toEqual([]);
    const h = (
      await call('create_agent', {
        name: 'revisor-de-spec',
        description: 'Revisa uma Spec antes do Plan',
        content: 'Leia a spec e aponte lacunas.',
        model: 'claude:opus@high',
        tools: ['Read', 'Grep'],
        scope: 'project',
      })
    ).data;
    expect(h.agents).toEqual([
      {
        name: 'revisor-de-spec',
        scope: 'project',
        description: 'Revisa uma Spec antes do Plan',
        model: 'claude:opus@high',
        tools: ['Read', 'Grep'],
        usage: 'contextual',
        path: '.claude/agents/revisor-de-spec.md',
      },
    ]);
    const file = path.join(dir, '.claude/agents/revisor-de-spec.md');
    expect(fs.readFileSync(file, 'utf8')).toBe(
      '---\nname: "revisor-de-spec"\ndescription: "Revisa uma Spec antes do Plan"\ntools: Read, Grep, mcp__faz-ai__*\nmodel: opus\nfaz-ai-model: "claude:opus@high"\n---\n\nLeia a spec e aponte lacunas.\n',
    );
    expect((await call('get_agent', { agent: 'revisor-de-spec' })).text).toContain('aponte lacunas');
    expect((await call('create_agent', { name: 'revisor-de-spec', description: 'd', content: 'c', scope: 'project' })).text).toContain(
      'Já existe',
    );
    expect((await call('create_agent', { name: 'Nome Inválido', description: 'd', content: 'c' })).error).toBe(true);

    // o patch regrava só o que vier; o arquivo inteiro substitui tudo
    await call('update_agent', { agent: 'revisor-de-spec', description: 'Nova descrição', skills: ['x'] });
    expect(fs.readFileSync(file, 'utf8')).toContain(
      'description: "Nova descrição"\ntools: Read, Grep, mcp__faz-ai__*\nmodel: opus\nskills: x\n',
    );
    await call('update_agent', {
      agent: 'revisor-de-spec',
      content: '---\nname: revisor-de-spec\ndescription: Outra\n---\nNovo corpo',
    });
    expect((await call('get_harness')).data.agents[0]).toEqual({
      name: 'revisor-de-spec',
      scope: 'project',
      description: 'Outra',
      usage: 'contextual',
      path: '.claude/agents/revisor-de-spec.md',
    });

    // agente criado por fora aparece no inventário completo, mas só entra no board depois de marcado
    fs.writeFileSync(path.join(dir, '.claude/agents/planejador.md'), '---\nname: planejador\ndescription: Quebra a spec em passos\n---\nx');
    router.refreshHarness();
    expect((await call('get_harness')).data.agents.map((a: any) => a.name)).toEqual(['revisor-de-spec']);
    expect((await call('get_harness', { onlySelected: false })).data.agents.map((a: any) => a.name)).toEqual([
      'planejador',
      'revisor-de-spec',
    ]);
    // sem escopo, o padrão é a pasta global da ferramenta
    await call('create_agent', { name: 'global', description: 'd', content: 'c' });
    expect(fs.existsSync(path.join(home, '.claude/agents/global.md'))).toBe(true);

    await call('set_ai_tool', { tool: 'cursor' });
    await call('create_agent', { name: 'verificador', description: 'd', content: 'c', scope: 'project' });
    expect(fs.existsSync(path.join(dir, '.cursor/agents/verificador.md'))).toBe(true);
    await call('set_ai_tool', { tool: 'claude' });

    await call('delete_agent', { agent: 'planejador' });
    expect(fs.existsSync(path.join(dir, '.claude/agents/planejador.md'))).toBe(false);
    expect((await call('delete_agent', { agent: 'planejador' })).text).toContain('não encontrado');
  });

  it('instala a skill do fluxo no global por padrão, ou no projeto, sem sobrescrever', async () => {
    const global = path.join(dir, 'home-do-usuario', '.claude', 'skills', 'faz-ai-fluxo', 'SKILL.md');
    expect((await call('install_flow_skill')).data).toMatchObject({ installed: true });
    expect(fs.readFileSync(global, 'utf8')).toContain('get_pending_work');
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'faz-ai-fluxo'))).toBe(false);

    const file = path.join(dir, '.claude', 'skills', 'faz-ai-fluxo', 'SKILL.md');
    expect((await call('install_flow_skill', { scope: 'project' })).data).toMatchObject({ installed: true });
    expect(fs.readFileSync(file, 'utf8')).toContain('get_pending_work');
    fs.writeFileSync(file, '---\nname: faz-ai-fluxo\ndescription: minha versão\n---\nmeu texto');
    expect((await call('install_flow_skill', { scope: 'project' })).data.installed).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toContain('meu texto');
    // só com replace a versão da pessoa é trocada
    expect((await call('install_flow_skill', { scope: 'project', replace: true })).data).toMatchObject({ note: 'Skill substituída.' });
    expect(fs.readFileSync(file, 'utf8')).toContain('get_pending_work');
  });

  it('a skill do fluxo que já estava no disco, sem marcação, fica marcada em todo contexto ao "instalar" de novo', async () => {
    // a skill foi instalada antes de a marcação existir (ou a pessoa a desmarcou): o Diagnóstico avisa, e o
    // botão de instalar precisa resolver o aviso sem sobrescrever o arquivo
    const dirOf = path.join(dir, 'home-do-usuario', '.claude', 'skills', 'faz-ai-fluxo');
    fs.mkdirSync(dirOf, { recursive: true });
    fs.writeFileSync(path.join(dirOf, 'SKILL.md'), '---\nname: faz-ai-fluxo\ndescription: minha versão\n---\nmeu texto');
    router.refreshHarness();
    const usage = async () =>
      (await call('get_harness', { onlySelected: false })).data.inventory.find((i: any) => i.kind === 'skill' && i.name === 'faz-ai-fluxo')
        ?.usage;
    expect(await usage()).toBeNull();
    expect((await call('install_flow_skill')).data).toMatchObject({
      installed: false,
      note: expect.stringContaining('marcada em todo contexto'),
    });
    expect(await usage()).toBe('always');
    expect(fs.readFileSync(path.join(dirOf, 'SKILL.md'), 'utf8')).toContain('meu texto');
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

    // Cursor: a pasta do Claude sai da lista de skills do board, mas o Cursor também a carrega
    // (`.claude/skills` está no catálogo dele), então a marcação segue valendo e a skill continua opção do campo
    const h = (await call('set_ai_tool', { tool: 'cursor' })).data;
    expect(h.aiTool).toBe('cursor');
    expect(h.skills).toEqual([]);
    expect(router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['revisar-spec']);
    await call('create_skill', { name: 'do-cursor', description: 'd', content: 'c' });
    expect(fs.existsSync(path.join(dir, '.cursor/skills/do-cursor/SKILL.md'))).toBe(true);
    expect(fs.existsSync(skillMd('.claude/skills'))).toBe(true);
    expect(await names()).toEqual(['do-cursor']);
    await call('set_skill_enabled', { skill: 'do-cursor', enabled: false });
    expect(fs.existsSync(path.join(dir, '.cursor/skills-disabled/do-cursor/SKILL.md'))).toBe(true);
    expect((await call('set_skill_enabled', { skill: 'revisar-spec', enabled: false })).error).toBe(true); // skill de outra ferramenta

    await call('set_ai_tool', { tool: 'claude' });
    expect(await names()).toEqual(['revisar-spec']);
    expect(router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['revisar-spec']);
  });

  it('registra o servidor MCP no formato de cada ferramenta', async () => {
    const { registerClients } = await import('../src/extension/mcp/clientConfig');
    const home = path.join(dir, 'home');
    fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { outro: { command: 'x' } } }));
    const bridge = '/b/com espaço/bridge.js';
    const done = registerClients(['claude', 'cursor'], { bridgePath: bridge, workspaceDir: dir, homeDir: home });
    expect(done.map((d) => d.projectFile)).toEqual(['.mcp.json', '.cursor/mcp.json']);

    const json = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')).mcpServers;
    expect(json(path.join(dir, '.mcp.json'))['faz-ai']).toEqual({ type: 'stdio', command: 'node', args: [bridge, dir] });
    expect(json(path.join(dir, '.cursor', 'mcp.json'))['faz-ai']).toEqual({ type: 'stdio', command: 'node', args: [bridge, dir] });
    // no escopo do projeto, nada vai para a pasta do usuário
    expect(json(path.join(home, '.cursor', 'mcp.json'))).toEqual({ outro: { command: 'x' } });
  });

  it('registra o servidor no global do Claude Code, sem a pasta do projeto', async () => {
    const { registerClients } = await import('../src/extension/mcp/clientConfig');
    const home = path.join(dir, 'home-global');
    const project = path.join(dir, 'projeto-global');
    fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { outro: { command: 'x' } } }));
    const bridge = '/b/bridge.js';
    const done = registerClients(['claude'], {
      bridgePath: bridge,
      workspaceDir: project,
      homeDir: home,
      scope: 'user',
    });
    // o projeto fica sem arquivo nenhum
    expect(fs.existsSync(project)).toBe(false);
    expect(done.every((d) => d.projectFile === null)).toBe(true);

    // o ~/.claude.json é do Claude Code: o registro sai pela linha de comando dele
    expect(fs.existsSync(path.join(home, '.claude.json'))).toBe(false);
    expect(done[0]!.run).toEqual([
      { command: 'claude', args: ['mcp', 'remove', '--scope', 'user', 'faz-ai'], mayFail: true },
      {
        command: 'claude',
        args: ['mcp', 'add-json', '--scope', 'user', 'faz-ai', JSON.stringify({ type: 'stdio', command: 'node', args: [bridge] })],
      },
    ]);

    const json = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')).mcpServers;
    // o Cursor não tem global que funcione: fica como estava
    expect(json(path.join(home, '.cursor', 'mcp.json'))).toEqual({ outro: { command: 'x' } });
  });

  it('a execução do Cursor usa o registro global quando ele leva a este board', async () => {
    const { ensureProjectServer } = await import('../src/extension/mcp/clientConfig');
    const home = path.join(dir, 'home-cursor');
    const project = path.join(dir, 'proj-cursor');
    fs.mkdirSync(path.join(project, 'sub'), { recursive: true });
    const entry = { command: process.execPath, args: ['/b/bridge.js', project] };
    // o global que a cursor-agent lê (cada execução é um processo na pasta do projeto)
    fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'faz-ai': { command: process.execPath, args: ['/b/bridge.js', '${workspaceFolder}'] } } }),
    );
    expect(ensureProjectServer(project, '.cursor/mcp.json', entry, home)).toBe('global');
    expect(ensureProjectServer(path.join(project, 'sub'), '.cursor/mcp.json', entry, home)).toBe('global');
    expect(fs.existsSync(path.join(project, '.cursor'))).toBe(false);
    // a worktree de uma história fica fora da pasta do board: ali o projeto precisa do registro dele
    const worktree = path.join(dir, 'worktree-cursor');
    fs.mkdirSync(worktree);
    expect(ensureProjectServer(worktree, '.cursor/mcp.json', entry, home)).toBe('added');
    // outro bridge no global não leva a este board
    expect(ensureProjectServer(project, '.cursor/mcp.json', { ...entry, args: ['/outro/bridge.js', project] }, home)).toBe('added');
  });

  it('tira só o registro do board do arquivo do projeto, em JSON', async () => {
    const { removeProjectServer, registerClients } = await import('../src/extension/mcp/clientConfig');
    const project = path.join(dir, 'proj-remove');
    fs.mkdirSync(path.join(project, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(project, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { outro: { command: 'x' } } }));
    registerClients(['cursor'], { bridgePath: '/b/bridge.js', workspaceDir: project, homeDir: path.join(dir, 'home-remove') });

    expect(removeProjectServer(project, '.cursor/mcp.json')).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'mcp.json'), 'utf8'))).toEqual({
      mcpServers: { outro: { command: 'x' } },
    });
    // nada a tirar: arquivo sem o registro, ou que não existe
    expect(removeProjectServer(project, '.cursor/mcp.json')).toBe(false);
    expect(removeProjectServer(project, '.mcp.json')).toBe(false);
  });

  it('detecta as ferramentas instaladas pelas pastas de configuração na home', async () => {
    const { detectTools } = await import('../src/extension/models');
    const home = path.join(dir, 'home-detecta');
    fs.mkdirSync(path.join(home, '.vscode', 'extensions'), { recursive: true });
    expect(detectTools(home)).toEqual([]);
    expect(detectTools('')).toEqual([]);
    fs.mkdirSync(path.join(home, '.cursor'));
    expect(detectTools(home)).toEqual(['cursor']);
    fs.mkdirSync(path.join(home, '.claude'));
    expect(detectTools(home)).toEqual(['claude', 'cursor']);
  });
});

describe('ponte stdio', () => {
  it('repassa uma sessão MCP pelo socket local', async () => {
    const bridge = path.resolve(__dirname, '../dist/mcp-bridge.js');
    if (!fs.existsSync(bridge)) throw new Error('rode `npm run build:ext` antes deste teste');
    const address = process.platform === 'win32' ? `\\\\.\\pipe\\fazai-test-${process.pid}` : path.join(dir, 'mcp.sock');
    const stop = await startMcpServer(address, { getRouter: async () => router, getRunner: async () => undefined, workspaceDir: dir, version: 'test' });
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

describe('ponte stdio: onde acha o projeto', () => {
  // o registro global não fixa a pasta: o Cursor troca `${workspaceFolder}`, o Claude Code passa
  // CLAUDE_PROJECT_DIR, e as outras abrem a ponte dentro do projeto
  it.skipIf(process.platform === 'win32').each([
    ['pela pasta nos argumentos', (d: string) => ({ args: [d], cwd: os.tmpdir(), env: {} })],
    [
      'pelo diretório atual, com a variável que a ferramenta não trocou',
      (d: string) => ({ args: ['${workspaceFolder}'], cwd: d, env: {} }),
    ],
    ['pelo CLAUDE_PROJECT_DIR', (d: string) => ({ args: [], cwd: os.tmpdir(), env: { CLAUDE_PROJECT_DIR: d } })],
    ['subindo de uma subpasta do projeto', (d: string) => ({ args: [], cwd: path.join(d, 'sub'), env: {} })],
  ])(
    '%s',
    async (_name, how) => {
      const bridge = path.resolve(__dirname, '../dist/mcp-bridge.js');
      if (!fs.existsSync(bridge)) throw new Error('rode `npm run build:ext` antes deste teste');
      const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fz-proj-')));
      fs.mkdirSync(path.join(project, 'sub'));
      const address = path.join(project, 'mcp.sock');
      const stop = await startMcpServer(address, { getRouter: async () => router, getRunner: async () => undefined, workspaceDir: project, version: 'test' });
      const { socketPath } = await import('../src/extension/mcp/socketPath');
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fz-'));
      const prev = process.env.HOME;
      process.env.HOME = home;
      const expected = socketPath(project);
      process.env.HOME = prev;
      fs.mkdirSync(path.dirname(expected), { recursive: true });
      fs.symlinkSync(address, expected);
      const { args, cwd, env } = how(project);
      const clean = { ...process.env };
      delete clean.CLAUDE_PROJECT_DIR;
      delete clean.FAZAI_WORKSPACE;
      const child = spawn(process.execPath, [bridge, ...args], {
        cwd,
        env: { ...clean, HOME: home, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      try {
        child.stdin.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } },
          }) + '\n',
        );
        for (let i = 0; i < 100 && !out.includes('\n'); i++) await new Promise((r) => setTimeout(r, 50));
        expect(JSON.parse(out.split('\n')[0]!).result.serverInfo.name).toBe('faz-ai');
      } finally {
        child.kill();
        stop();
        fs.rmSync(home, { recursive: true, force: true });
        fs.rmSync(project, { recursive: true, force: true });
      }
    },
    15000,
  );
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

  it('dependência entre sub-tarefas: depends_on, rodadas em subtasksNow e start_work recusando a que espera', async () => {
    const story = (await call('create_card', { title: 'História' })).data;
    const base = (await call('create_card', { title: 'Modelo de dados', parent: story.id })).data;
    const tela = (await call('create_card', { title: 'Tela', parent: story.id })).data;
    const api = (await call('create_card', { title: 'API', parent: story.id, depends_on: [base.id] })).data;
    expect(api.links.dependsOn).toMatchObject([{ id: base.id }]);
    expect(router.snapshot().links).toMatchObject([{ kind: 'precedes' }]);

    // a história mostra o que roda junto agora e o que espera
    const before = (await call('get_card', { card: story.id })).data;
    expect(before.subtasksNow).toEqual({ canRunTogether: [base.id, tela.id], waiting: [api.id] });
    expect(before.subtaskList.find((k: { id: string }) => k.id === api.id).waitingFor).toEqual([base.id]);

    // a que espera não começa; as independentes começam ao mesmo tempo
    const refused = await call('start_work', { card: api.id });
    expect(refused.error).toBe(true);
    expect(refused.text).toContain(`depende de ${base.id}`);
    expect((await call('start_work', { card: base.id })).error).toBe(false);
    expect((await call('start_work', { card: tela.id })).error).toBe(false);

    // concluir a dependência libera a seguinte
    const done = router.snapshot().columns.find((c) => c.workflowId === router.snapshot().workflows[1]!.id && c.category === 'done')!;
    await call('move_card', { card: base.id, column: done.name });
    expect((await call('get_card', { card: api.id })).data.waitingFor).toBeUndefined();
    expect((await call('start_work', { card: api.id })).error).toBe(false);

    // link_cards também registra a dependência, e recusa o ciclo
    expect((await call('link_cards', { card: tela.id, other: api.id, relation: 'depends_on' })).error).toBe(false);
    expect((await call('link_cards', { card: api.id, other: tela.id, relation: 'depends_on' })).error).toBe(true);
    // depends_on só vale em sub-tarefa
    expect((await call('create_card', { title: 'Solta', depends_on: [base.id] })).error).toBe(true);
  });

  it('subtasksNow separa as sub-tarefas com a pessoa e as já em execução das que podem rodar juntas', async () => {
    const story = (await call('create_card', { title: 'História' })).data;
    const a = (await call('create_card', { title: 'A', parent: story.id })).data;
    const b = (await call('create_card', { title: 'B', parent: story.id })).data;
    const c = (await call('create_card', { title: 'C', parent: story.id })).data;
    const d = (await call('create_card', { title: 'D', parent: story.id })).data;
    const byRef = (ref: string) => router.snapshot().cards.find((k) => `#${k.number}` === ref)!;
    router.handle({ type: 'card.status.set', cardId: byRef(b.id).id, status: 'waiting_answer' });
    router.handle({ type: 'card.status.set', cardId: byRef(c.id).id, status: 'running' }, { source: 'ai' });
    const now = (await call('get_card', { card: story.id })).data.subtasksNow;
    expect(now).toEqual({ canRunTogether: [a.id, d.id], waiting: [], withPerson: [b.id], running: [c.id] });
  });

  it('create_card com depends_on valida os vínculos antes de criar e ignora repetidos', async () => {
    const story = (await call('create_card', { title: 'História' })).data;
    const base = (await call('create_card', { title: 'Base', parent: story.id })).data;
    const before = router.snapshot().cards.length;
    // depender da própria história travaria as duas: recusa sem deixar card pela metade
    const own = await call('create_card', { title: 'Depende da história', parent: story.id, depends_on: [story.id] });
    expect(own.error).toBe(true);
    expect(router.snapshot().cards).toHaveLength(before);
    // a mesma dependência repetida vira um vínculo só
    const dup = await call('create_card', { title: 'Repetida', parent: story.id, depends_on: [base.id, base.id] });
    expect(dup.error).toBe(false);
    expect(router.snapshot().links.filter((l) => l.kind === 'precedes')).toHaveLength(1);
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

  it('should link the new card to the origin when autonomous_from is used', async () => {
    const story = (await call('create_card', { title: 'Grande', column: 'Discovery' })).data;
    setYolo(1, true);
    const part = (await call('create_card', { title: 'Parte 2', autonomous_from: 1 })).data;

    expect((await call('get_card', { card: 1 })).data.links.related).toMatchObject([{ id: part.id }]);
    expect((await call('get_card', { card: part.id })).data.links.related).toMatchObject([{ id: story.id }]);
    expect(router.snapshot().links).toHaveLength(1);
  });

  it('should not duplicate the link when one already exists between the cards', async () => {
    const story = (await call('create_card', { title: 'Grande', column: 'Discovery' })).data;
    const part = (await call('create_card', { title: 'Parte 2' })).data;
    setYolo(1, true);
    await call('link_cards', { card: story.id, other: part.id, relation: 'parent' });
    expect(router.snapshot().links).toHaveLength(1);

    // reproduz o caso #19/#48: o vínculo já existe (manual) quando a herança do modo autônomo roda
    expect(() => router.handle({ type: 'card.yolo.inherit', cardId: card(2).id, fromId: card(1).id }, { source: 'ai' })).not.toThrow();
    expect(router.snapshot().links).toHaveLength(1);
  });

  it('ligar libera o que esperava uma pessoa', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    await call('request_review', { card: 1, summary: 'PRD pronto' });
    expect(card(1).status).toBe('waiting_review');
    setYolo(1, true);
    expect(card(1).status).toBe('approved');
    expect(column('PRD').requiresApproval).toBe(true); // a coluna não muda: só o card deixa de depender dela
  });

  describe('card.yolo.setMany', () => {
    const setMany = (cardIds: string[], enabled: boolean) => router.handle({ type: 'card.yolo.setMany', cardIds, enabled });

    it('liga só as histórias válidas da lista, ignora sub-tarefa e card arquivado sem lançar erro', async () => {
      await call('create_card', { title: 'A', column: 'PRD' });
      await call('create_card', { title: 'Sub', parent: 1 });
      await call('create_card', { title: 'B', column: 'PRD' });
      await call('create_card', { title: 'Arquivada', column: 'PRD' });
      router.handle({ type: 'card.archive', cardId: card(4).id });

      expect(() =>
        setMany([card(1).id, card(2).id, card(3).id, card(4).id, 'id-inexistente'], true),
      ).not.toThrow();

      expect(card(1).yolo).toBe(true);
      expect(card(2).yolo).toBe(false); // sub-tarefa ignorada
      expect(card(3).yolo).toBe(true);
      expect(card(4).yolo).toBe(false); // arquivada ignorada
    });

    it('chamar com { source: "ai" } lança o mesmo erro de permissão que card.yolo.set', async () => {
      await call('create_card', { title: 'A', column: 'PRD' });
      expect(() => router.handle({ type: 'card.yolo.setMany', cardIds: [card(1).id], enabled: true }, { source: 'ai' })).toThrow(
        'Só uma pessoa liga o modo autônomo.',
      );
    });

    it('ligar em lote libera waiting_review/waiting_answer pendente em cada história afetada', async () => {
      await call('create_card', { title: 'A', column: 'PRD' });
      await call('create_card', { title: 'B', column: 'PRD' });
      await call('request_review', { card: 1, summary: 'PRD pronto' });
      await call('ask_question', { card: 2, question: 'Qual provedor?' });
      expect(card(1).status).toBe('waiting_review');
      expect(card(2).status).toBe('waiting_answer');

      setMany([card(1).id, card(2).id], true);

      expect(card(1).status).toBe('approved');
      expect(card(2).status).toBe('ready');
    });

    it('ligar em lote grava o comentário "Modo autônomo ligado..." em cada história afetada', async () => {
      await call('create_card', { title: 'A', column: 'PRD' });
      await call('create_card', { title: 'B', column: 'PRD' });

      setMany([card(1).id, card(2).id], true);

      expect((await call('get_card', { card: 1 })).data.comments.at(-1).body).toContain('Modo autônomo ligado');
      expect((await call('get_card', { card: 2 })).data.comments.at(-1).body).toContain('Modo autônomo ligado');
    });

    it('uma história já no estado pedido não gera comentário duplicado', async () => {
      await call('create_card', { title: 'A', column: 'PRD' });
      setYolo(1, true);
      const before = (await call('get_card', { card: 1 })).data.comments.length;

      setMany([card(1).id], true);

      const after = (await call('get_card', { card: 1 })).data.comments.length;
      expect(after).toBe(before);
    });
  });
});

/**
 * `generate_summary` precisa de um `AiRunner` que de fato dispare e termine uma execução: aqui um
 * executor falso (sem CLI real) substitui o `getRunner` do servidor, para testar só o contrato da
 * ferramenta (quando chama `start`, com que `mode`, e como propaga o erro) sem subir um processo.
 */
describe('generate_summary (ferramenta MCP)', () => {
  /** o que a ferramenta vê do AiRunner: start/onDidFinish, com o que o teste decidir fazer */
  function fakeRunner(opts: { onStart?: (cardId: string) => void; throws?: Error } = {}) {
    let listeners: ((cardId: string, mode: string) => void)[] = [];
    const calls: { cardId: string; origin: string; mode: string }[] = [];
    const runner = {
      calls,
      start(cardId: string, origin: string, mode: string) {
        calls.push({ cardId, origin, mode });
        if (opts.throws) throw opts.throws;
        opts.onStart?.(cardId);
      },
      onDidFinish(listener: (cardId: string, mode: string) => void) {
        listeners.push(listener);
        return () => {
          listeners = listeners.filter((l) => l !== listener);
        };
      },
      finish(cardId: string, mode = 'summarize') {
        listeners.forEach((l) => l(cardId, mode));
      },
    };
    return runner;
  }

  /** um router novo, isolado, numa pasta própria (devolvida para limpar depois) */
  async function makeRouter() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-mcp-summary-'));
    const db = await openInMemory(WASM_DIR);
    const r = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'ws',
      folderName: 'Projeto',
      author: 'Pessoa',
      attachmentsDir: path.join(d, 'attachments'),
      workspaceDir: d,
    });
    return { router: r, dir: d };
  }

  /** conecta um client MCP novo ao router, com o runner falso no lugar do de verdade */
  async function connect(r: MessageRouter, runner: unknown, dir: string) {
    const server = createMcpServer({ getRouter: async () => r, getRunner: async () => runner as never, workspaceDir: dir, version: 'test' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const c = new Client({ name: 'claude-code', version: '1' });
    await c.connect(b);
    return c;
  }

  const callOn = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
    const res = await c.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[])[0]!.text;
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* resposta em texto simples */
    }
    return { error: res.isError === true, text, data };
  };

  it('com 0 ou 1 mensagem na conversa, lança erro sem chamar AiRunner.start', async () => {
    const runner = fakeRunner();
    const { router: r, dir: d } = await makeRouter();
    const c = await connect(r, runner, d);
    try {
      await callOn(c, 'create_card', { title: 'Card' });
      const zero = await callOn(c, 'generate_summary', { card: 1 });
      expect(zero.error).toBe(true);
      expect(zero.text).toContain('menos de 2 mensagens');
      expect(runner.calls).toHaveLength(0);

      await callOn(c, 'add_comment', { card: 1, body: 'Só uma mensagem.' });
      const one = await callOn(c, 'generate_summary', { card: 1 });
      expect(one.error).toBe(true);
      expect(one.text).toContain('menos de 2 mensagens');
      expect(runner.calls).toHaveLength(0);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('com 2 ou mais mensagens, chama AiRunner.start com mode "summarize", espera o término e devolve o último comentário', async () => {
    const { router: r, dir: d } = await makeRouter();
    const runner = fakeRunner({
      onStart: (cardId) => {
        // o que a IA faria: grava o resumo e só então a execução termina
        r.handle({ type: 'comment.add', cardId, body: 'Resumo gerado.', kind: 'summary' }, { author: 'Claude Code', source: 'ai' });
        setImmediate(() => runner.finish(cardId));
      },
    });
    const c = await connect(r, runner, d);
    try {
      await callOn(c, 'create_card', { title: 'Card' });
      await callOn(c, 'add_comment', { card: 1, body: 'Mensagem 1.' });
      await callOn(c, 'add_comment', { card: 1, body: 'Mensagem 2.' });
      const res = await callOn(c, 'generate_summary', { card: 1 });
      expect(res.error).toBeFalsy();
      expect(res.data).toMatchObject({ body: 'Resumo gerado.' });
      expect(runner.calls).toEqual([{ cardId: expect.any(String), origin: 'manual', mode: 'summarize' }]);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('com o card já em execução, propaga o erro de AiRunner.start', async () => {
    const { router: r, dir: d } = await makeRouter();
    const runner = fakeRunner({ throws: new Error('A IA já está trabalhando em #1.') });
    const c = await connect(r, runner, d);
    try {
      await callOn(c, 'create_card', { title: 'Card' });
      await callOn(c, 'add_comment', { card: 1, body: 'Mensagem 1.' });
      await callOn(c, 'add_comment', { card: 1, body: 'Mensagem 2.' });
      const res = await callOn(c, 'generate_summary', { card: 1 });
      expect(res.error).toBe(true);
      expect(res.text).toContain('A IA já está trabalhando em #1.');
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
});
