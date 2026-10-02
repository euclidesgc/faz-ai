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
    workspaceKey: 'ws', folderName: 'Projeto', author: 'Pessoa', attachmentsDir: path.join(dir, 'attachments'), workspaceDir: dir,
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
    expect(names).toEqual(expect.arrayContaining(['get_board', 'list_cards', 'get_card', 'create_card', 'move_card', 'add_comment', 'add_attachment', 'update_rules']));
    const board = (await call('get_board')).data;
    expect(board.workflows.map((w: any) => w.columns.map((c: any) => c.name))).toEqual([
      ['Backlog', 'PRD', 'Spec', 'Plan', 'Implementação', 'Concluído', 'Cancelado'],
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
    expect((await call('add_comment', { card: 1, body: 'Plano pronto' })).data).toMatchObject({ author: 'Claude Code', body: 'Plano pronto' });
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
    expect(board.workflows[1].columns.map((c: any) => c.name)).toContain('Em revisão');
    expect((await call('update_column', { column: 'Concluído', name: 'Feito' })).text).toContain('informe também o workflow');
    board = (await call('update_column', { column: 'Concluído', workflow: 'parent', name: 'Feito' })).data;
    expect(board.workflows[0].columns[5].name).toBe('Feito');
    board = (await call('create_field', { name: 'Estimativa', kind: 'number', applies_to_types: ['História'] })).data;
    expect(board.fields.at(-1)).toMatchObject({ name: 'Estimativa', appliesTo: ['História'] });
    expect((await call('update_rules', { blockDoneWithOpenChildren: false })).data.blockDoneWithOpenChildren).toBe(false);
  });
});

describe('harness e padrões pelo MCP', () => {
  it('gerencia regras e skills do projeto e sincroniza o campo Skills', async () => {
    expect((await call('get_harness')).data.ruleFiles.map((r: any) => [r.name, r.exists])).toEqual([['CLAUDE.md', false], ['AGENTS.md', false]]);
    await call('write_rule_file', { file: 'AGENTS.md', content: '# Regras\n' });
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toBe('# Regras\n');
    expect((await call('read_rule_file', { file: 'AGENTS.md' })).text).toBe('# Regras\n');
    expect((await call('write_rule_file', { file: '../fora.md', content: 'x' })).error).toBe(true);

    expect((await call('create_skill', { name: 'Nome Ruim', description: 'd', content: 'c' })).error).toBe(true);
    const h = (await call('create_skill', { name: 'revisar-spec', description: 'Use ao revisar uma spec', content: 'Passos…' })).data;
    expect(h.skills).toEqual([{ name: 'revisar-spec', enabled: true, description: 'Use ao revisar uma spec', path: '.claude/skills/revisar-spec/SKILL.md' }]);
    expect((await call('get_skill', { skill: 'revisar-spec' })).text).toContain('name: revisar-spec');
    const skillsField = () => router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!;
    expect(skillsField().options).toEqual(['revisar-spec']);

    // skill marcada no card aparece como obrigatória, com o caminho do SKILL.md
    const card = (await call('create_card', { title: 'História', fields: { Skills: ['revisar-spec'], Modelo: 'Claude Haiku 4.5' } })).data;
    expect(card.requiredSkills).toEqual([{ name: 'revisar-spec', path: '.claude/skills/revisar-spec/SKILL.md' }]);
    expect(card.model).toMatchObject({ tool: 'claude', model: 'haiku', effort: null, value: 'claude:haiku' });

    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: false });
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'revisar-spec'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.claude', 'skills-disabled', 'revisar-spec', 'SKILL.md'))).toBe(true);
    expect(skillsField().options).toEqual([]);
    expect((await call('get_card', { card: 1 })).data.requiredSkills[0].note).toContain('desligada');
    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: true });
    await call('delete_skill', { skill: 'revisar-spec' });
    expect((await call('get_harness')).data.skills).toEqual([]);

    // arquivo criado por fora aparece depois de refreshHarness
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'oi');
    router.refreshHarness();
    expect((await call('read_rule_file', { file: 'CLAUDE.md' })).text).toBe('oi');
  });

  it('aplica os padrões do tipo aos cards novos e recria o board', async () => {
    const board = (await call('update_card_type', { type: 'Sub-tarefa', default_fields: { Modelo: 'claude sonnet 5.5 high', Fase: 'Implementação' } })).data;
    expect(board.cardTypes.find((t: any) => t.name === 'Sub-tarefa').defaultFields).toEqual({ Modelo: 'claude:sonnet@high', Fase: 'Implementação' });
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
    expect(m.catalog.find((o: any) => o.value === 'claude:opus')).toMatchObject({ tool: 'claude', model: 'opus', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' });
    expect(new Set(m.catalog.map((o: any) => o.tool))).toEqual(new Set(['claude'])); // só a ferramenta em uso

    await call('create_card', { title: 'História' });
    const set = async (modelo: string) => (await call('update_card', { card: 1, fields: { Modelo: modelo } }));
    expect((await set('Fable 5.1 low')).data.model).toMatchObject({ tool: 'claude', model: 'fable', effort: 'low' });
    expect((await set('claude:opus@high')).data.model).toMatchObject({ model: 'opus', effort: 'high', label: 'Claude Code · Opus 5.5 · high' });
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
    expect(rules.map((r: any) => [r.when, r.value])).toEqual([['Esforço da atividade = Baixo', 'claude:haiku'], ['Esforço da atividade = Médio', 'claude:sonnet@medium'], ['Esforço da atividade = Alto', 'claude:opus@high']]);

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
    await call('set_model_rules', { rules: [{ when: [[{ field: 'Tags', value: 'docs' }]], model: 'haiku' }, { when: [[{ field: 'Esforço', value: 'Alto' }]], model: 'Opus 5.5 max' }] });
    expect((await call('create_card', { title: 'Doc', fields: { Tags: ['docs'], Esforço: 'Alto' } })).data.model.value).toBe('claude:haiku');
    const kimi = (await call('suggest_model_rules', { tool: 'kimi' })).data.rules;
    expect(kimi.filter((r: any) => r.when.startsWith('Esforço')).map((r: any) => r.value)).toEqual(['kimi:kimi-code/k3@low', 'kimi:kimi-code/k3@high', 'kimi:kimi-code/k3@max']);
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
    expect(effortTiers('kimi', found).map(([, v]) => v)).toEqual(['kimi:kimi-code/k3@low', 'kimi:kimi-code/k3@high', 'kimi:kimi-code/k3@max']);
    expect(modelsFor('kimi', path.join(dir, 'vazio')).length).toBeGreaterThan(0); // sem config local, lista embutida
  });
});

describe('regras de modelo com E e OU', () => {
  const modelOf = async (fields: Record<string, unknown>, type?: string) => (await call('create_card', { title: 'x', type, fields })).data.model?.value;

  it('avalia grupos E/OU, negação, tipo do card, ordem e regras desligadas', async () => {
    const res = await call('set_model_rules', {
      rules: [
        { name: 'Backend pesado', when: [[{ field: 'Esforço', value: 'Alto' }, { field: 'Tags', value: 'backend' }], [{ field: 'Tipo', value: 'Bug' }, { field: 'Esforço', value: 'Baixo', not: true }]], model: 'fable max' },
        { name: 'Desligada', when: [[{ field: 'Tags', value: 'docs' }]], model: 'opus low', enabled: false },
        { name: 'Docs', when: [[{ field: 'Tags', value: 'docs' }]], model: 'haiku' },
        { name: 'Alto', when: [[{ field: 'Esforço', value: 'Alto' }]], model: 'opus high' },
      ],
    });
    expect(res.data.rules[0]).toMatchObject({ name: 'Backend pesado', when: 'Esforço da atividade = Alto E Tags = backend OU Tipo = Bug E Esforço da atividade ≠ Baixo', enabled: true });

    expect(await modelOf({ Esforço: 'Alto', Tags: ['backend', 'frontend'] })).toBe('claude:fable@max'); // E: as duas condições
    expect(await modelOf({ Esforço: 'Alto', Tags: ['frontend'] })).toBe('claude:opus@high'); // só uma: cai na regra seguinte
    expect(await modelOf({ Esforço: 'Médio' }, 'Bug')).toBe('claude:fable@max'); // OU: segundo grupo, com negação
    expect(await modelOf({ Esforço: 'Baixo' }, 'Bug')).toBeUndefined(); // a negação falha e nenhuma outra casa
    expect(await modelOf({ Tags: ['docs'] })).toBe('claude:haiku'); // a regra desligada é pulada
    expect((await call('set_model_rules', { rules: [{ when: [[{ field: 'Inexistente', value: 'x' }]], model: 'haiku' }] })).error).toBe(true);
  });

  it('com o preenchimento automático desligado, só sugere', async () => {
    await call('update_rules', { autoApplyModelSuggestion: false });
    const card = (await call('create_card', { title: 'x', fields: { Esforço: 'Alto' } })).data;
    expect(card.model).toBeUndefined();
    expect(card.suggestedModel.value).toBe('claude:opus@high');
  });

  it('converte regras salvas no formato antigo', async () => {
    const { parseModelRules } = await import('../src/shared/models');
    expect(parseModelRules(JSON.stringify([{ id: 'a', fieldId: 'f1', value: 'Alto', model: 'claude:opus@high' }, { nada: true }]))).toEqual([
      { id: 'a', name: '', enabled: true, groups: [[{ fieldId: 'f1', op: 'is', value: 'Alto' }]], model: 'claude:opus@high' },
    ]);
  });
});

describe('linhas e colunas colapsadas por padrão', () => {
  it('guarda o padrão de cada coluna, da linha e da coluna de arquivados', async () => {
    let b = (await call('get_board')).data;
    expect(b.workflows[0].archivedColumnCollapsed).toBe(true); // arquivados começa colapsada
    expect(b.workflows[0].collapsed).toBeUndefined();
    expect(b.workflows[0].columns.every((c: any) => c.collapsed === undefined)).toBe(true);
    await call('update_column', { column: 'Cancelado', collapsed: true });
    b = (await call('set_workflow_layout', { workflow: 'child', collapsed: true, archive_collapsed: false })).data;
    expect(b.workflows[0].columns.find((c: any) => c.name === 'Cancelado').collapsed).toBe(true);
    expect(b.workflows[1]).toMatchObject({ collapsed: true, archivedColumnCollapsed: false });
    const s = router.snapshot();
    expect(s.columns.find((c) => c.name === 'Cancelado')!.collapsed).toBe(true);
    expect(s.workflows.find((w) => w.kind === 'child')).toMatchObject({ collapsed: true, archiveCollapsed: false });
  });
});

describe('aparência', () => {
  it('guarda tema, fonte e tamanho, recusando valores fora do permitido', async () => {
    expect((await call('get_board')).data.appearance).toMatchObject({ theme: 'system', font: 'sans', fontSize: 14 });
    expect((await call('set_appearance', { theme: 'dark', font_size: 16 })).data).toMatchObject({ theme: 'dark', font: 'sans', fontSize: 16 });
    expect((await call('set_appearance', { font: 'serif' })).data).toMatchObject({ theme: 'dark', font: 'serif', fontSize: 16 });
    expect((await call('set_appearance', { font_size: 40 })).error).toBe(true);
    router.handle({ type: 'settings.board.update', patch: { appearance: { fontSize: 99, theme: 'neon' as never } } });
    expect(router.snapshot().board.appearance).toMatchObject({ theme: 'system', font: 'serif', fontSize: 22 });

    // rótulo e cor dos status: o que for inválido volta ao padrão
    const statuses = router.snapshot().board.appearance.statuses;
    router.handle({ type: 'settings.board.update', patch: { appearance: { statuses: { ...statuses, ready: { label: 'Na fila', color: 'vermelho' } } } } });
    expect(router.snapshot().board.appearance.statuses.ready).toEqual({ label: 'Na fila', color: '#4c8dff' });
    expect(router.snapshot().board.appearance.statuses.blocked.label).toBe('Bloqueado');
  });
});

describe('status do card e checkpoint de revisão', () => {
  const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
  const human = (n: number, status: any, note?: string) => router.handle({ type: 'card.status.set', cardId: card(n).id, status, note });

  it('a IA pede revisão e só avança depois da aprovação de uma pessoa', async () => {
    const story = (await call('create_card', { title: 'Login' })).data;
    expect(story.work).toBeUndefined(); // Backlog: a IA não atua
    expect((await call('get_board')).data.workflows[0].columns.find((c: any) => c.name === 'PRD')).toMatchObject({ aiActive: true, requiresApproval: true });

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
    expect((await call('get_card', { card: 1 })).data.comments.at(-1)).toMatchObject({ author: 'Pessoa', body: 'Faltou o critério de aceite' });
    expect((await call('move_card', { card: 1, column: 'Spec' })).error).toBe(true);

    // a IA não aprova; a pessoa sim
    await call('request_review', { card: 1, summary: 'Ajustado' });
    expect(() => router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'approved' }, { source: 'ai' })).toThrow('Só uma pessoa');
    human(1, 'approved');
    expect(card(1)).toMatchObject({ status: 'approved', statusBy: 'Pessoa' });
    const moved = (await call('move_card', { card: 1, column: 'Spec' })).data.card;
    expect(moved).toMatchObject({ column: 'Spec', work: { status: 'ready' } }); // o status recomeça na coluna nova

    // voltar e cancelar são livres; a pessoa move sem aprovação
    expect((await call('move_card', { card: 1, column: 'PRD' })).error).toBe(false);
    router.handle({ type: 'card.move', cardId: card(1).id, columnId: router.snapshot().columns.find((c) => c.name === 'Plan')!.id, position: 0 });
    expect(card(1).status).toBe('ready');
    expect((await call('move_card', { card: 1, column: 'Cancelado' })).data.card.work).toBeUndefined();
  });

  it('pergunta, bloqueio e colunas configuráveis', async () => {
    await call('create_card', { title: 'Login', column: 'Implementação' });
    expect((await call('ask_question', { card: 1, question: 'Qual provedor de login?' })).data.card.work).toMatchObject({ status: 'waiting_answer', with: 'human' });
    await call('add_comment', { card: 1, body: 'Enquanto isso, li o código.' });
    expect(card(1).status).toBe('waiting_answer'); // mensagem da IA não devolve a vez
    router.handle({ type: 'comment.add', cardId: card(1).id, body: 'Google' });
    expect(card(1).status).toBe('ready');

    expect((await call('block_card', { card: 1, reason: 'Sem acesso ao ambiente' })).data.card.work).toMatchObject({ status: 'blocked', with: 'human', reason: 'Sem acesso ao ambiente' });
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

    for (const [tool, base] of [['cursor', '.cursor/skills'], ['kimi', '.kimi/skills'], ['copilot', '.github/skills']] as const) {
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
    fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), 'model = "x"\n\n[mcp_servers.faz-ai]\ncommand = "velho"\nargs = ["a"]\n\n[mcp_servers.outro]\ncommand = "y"\n');
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
    expect(vscode).toEqual({ servers: { outro: { command: 'x' }, 'faz-ai': { type: 'stdio', command: 'node', args: [bridge, dir] } }, inputs: [] });
    expect(json(path.join(dir, '.mcp.json'))['faz-ai']).toEqual({ type: 'stdio', command: 'node', args: [bridge, dir], tools: ['*'] });
  });

  it('sugere modelos do Copilot e o detecta pela CLI ou pela extensão do VS Code', async () => {
    const { detectTools, modelsFor, effortTiers } = await import('../src/extension/models');
    const home = path.join(dir, 'home-copilot');
    expect(effortTiers('copilot', modelsFor('copilot', home)).map(([, v]) => v)).toEqual(['copilot:gpt-5.6-luna@low', 'copilot:gpt-5.6-terra@medium', 'copilot:gpt-5.6-sol@high']);
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
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } } });
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
