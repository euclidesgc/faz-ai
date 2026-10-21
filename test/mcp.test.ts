import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_REWORK } from '../src/shared/metrics';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { SUBTASKS_NOW_NOTE } from '../src/extension/mcp/format';
import { FLOW_SKILLS } from '../src/extension/flowSkill';
import { createMcpServer, MCP_INSTRUCTIONS, startMcpServer } from '../src/extension/mcp/server';
import { boardServerFootprint } from '../src/extension/mcp/footprint';
import { toolDefinitions } from '../src/extension/mcp/tools';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { forgetModels, parseCursorModels, rememberModels } from '../src/extension/models';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

// O Claude Code corta as instruções de cada servidor e a descrição de cada ferramenta neste tamanho
// (https://code.claude.com/docs/en/mcp, "Tool search for MCP server authors", lida em 2026-10-13): o resto a IA não lê.
const CLAUDE_CODE_CUT = 2048;
// teto das notas fixas do get_card de uma história autônoma com rodadas (#588): eram 2.515 caracteres numa história de teste, de 4.573 no total
const MAX_NOTES = 1500;

let dir: string;
let router: MessageRouter;
let client: Client;
let changes: number;

const libraryPath = (kind: 'skill' | 'agent', name: string) => {
  const a = router.snapshot().harness.library!.artifacts.find((a) => a.kind === kind && a.name === name)!;
  expect(a.path.startsWith(router.snapshot().harness.library!.directory)).toBe(true);
  return a.path;
};
const copiedSkill = (name: string) => ({ name, scope: 'board', path: libraryPath('skill', name) });

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
  it('as definições medidas sem servidor são as que o tools/list entrega, na mesma ordem', async () => {
    const listed = (await client.listTools()).tools;
    const defined = toolDefinitions();
    expect(defined.map((t) => t.name)).toEqual(listed.map((t) => t.name));
    for (const [i, t] of defined.entries()) {
      expect(t.description).toBe(listed[i]!.description);
      expect(t.inputSchema).toEqual(listed[i]!.inputSchema);
    }
  });

  it('o tamanho do servidor do board para o contexto estimado: nomes com prefixo, instruções e definições', () => {
    const f = boardServerFootprint();
    const defined = toolDefinitions();
    expect(f.server).toBe('faz-ai');
    expect(f.tools).toBe(defined.length);
    expect(f.names).toBe(defined.reduce((n, t) => n + `mcp__faz-ai__${t.name}\n`.length, 0));
    expect(f.instructions).toBe(MCP_INSTRUCTIONS.length);
    expect(f.definitions).toBeGreaterThan(defined.reduce((n, t) => n + t.description.length, 0));
    // o snapshot leva a medida para a tela
    expect(router.snapshot().boardServer).toEqual(f);
  });

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
      ['Backlog', 'Discovery', 'PRD', 'Spec', 'Plan', 'Implementação', 'Revisão', 'Homologação', 'Concluído', 'Cancelado'],
      ['A fazer', 'Em andamento', 'Concluído'],
    ]);
  });

  it('instruções e descrições das ferramentas cabem no corte do Claude Code, com o ciclo do card nas instruções', async () => {
    const instructions = client.getInstructions() ?? '';
    expect(instructions.length).toBeLessThanOrEqual(CLAUDE_CODE_CUT);
    for (const part of [
      'get_pending_work',
      'start_work',
      '`requiresApproval`',
      'request_review e PARE',
      '"approved"',
      '`model`',
      'subagente',
      '`requiredRules`',
      '`requiredSkills`',
      'request_review e `pending`',
    ])
      expect(instructions).toContain(part);
    const tooLong = (await client.listTools()).tools
      .filter((t) => (t.description ?? '').length > CLAUDE_CODE_CUT)
      .map((t) => `${t.name} (${t.description!.length})`);
    expect(tooLong).toEqual([]);
  });

  it('o que não cabe nas instruções está na descrição da ferramenta em que a IA precisa dele', async () => {
    const tools = (await client.listTools()).tools;
    const description = (name: string) => tools.find((t) => t.name === name)!.description;
    expect(description('get_card')).toContain('`attachment:<nome>`');
    expect(description('get_card')).toContain('colado numa mensagem ou na descrição aparece como `attachment:<nome>`');
    expect(description('get_card')).toContain('`subtasksNow`');
    expect(description('get_board')).toContain('Configurações → Harness: não indique nada fora deles');
    expect(description('get_models')).toContain('"Esforço da atividade" do card é o tamanho da tarefa');
    expect(description('link_cards')).toMatch(/usa o que a outra produz ou quando as duas alteram os mesmos arquivos/);
    expect(description('add_attachment')).toContain('`artifact: true`');
    expect(description('get_harness')).toContain('contexto vazio');
  });

  it('nenhum texto do MCP nem da skill do fluxo diz que o board lê os agentes da pasta da ferramenta (o board guarda a própria cópia)', async () => {
    const tools = (await client.listTools()).tools;
    const texts = [MCP_INSTRUCTIONS, ...tools.map((t) => t.description ?? ''), ...FLOW_SKILLS.map((k) => k.body)];
    for (const text of texts) {
      expect(text).not.toContain('referencia, não copia');
      expect(text).not.toMatch(/arquivo de agente da ferramenta|pasta de agentes global/);
    }
    const description = (name: string) => tools.find((t) => t.name === name)!.description;
    expect(description('create_agent')).toContain('fica guardado no próprio board (não na pasta da ferramenta de IA)');
    expect(description('update_agent')).toContain('vale para as próximas execuções; as já iniciadas seguem com a versão delas');
    expect(description('delete_agent')).toContain('o arquivo de origem de um agente copiado não é apagado');
  });

  it('o pull request é aberto com --base em workspace.prBase: instruções, prepare_workspace, set_pull_request e nota do modo autônomo (#462)', async () => {
    const tools = (await client.listTools()).tools;
    const description = (name: string) => tools.find((t) => t.name === name)!.description;
    expect(client.getInstructions()).toContain('Pull request: sempre com --base em workspace.prBase do get_card.');
    expect(description('prepare_workspace')).toMatch(/parte da base do fluxo[\s\S]*`prBase`/);
    expect(description('set_pull_request')).toContain('`--base` em `workspace.prBase`');
    // a história ainda sem branch não sabe a base: a nota manda ler workspace.prBase do get_card
    await call('create_card', { title: 'Login', column: 'Backlog' });
    router.handle({ type: 'card.yolo.set', cardId: router.snapshot().cards[0]!.id, enabled: true });
    await call('move_card', { card: 1, column: 'Homologação' });
    expect((await call('get_card', { card: 1 })).data.phase.autonomousNote).toContain(
      'abra o pull request com --base em workspace.prBase do get_card',
    );
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
    // a resposta é o resumo: a descrição e o detalhe vêm pelo get_card
    expect(story).toMatchObject({ id: '#1', type: 'História', column: 'Backlog' });
    expect(story).not.toHaveProperty('description');
    expect((await call('get_card', { card: 1 })).data.description).toBe('# PRD');
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
    expect(board.workflows[0].columns[8].name).toBe('Feito');
    board = (await call('create_field', { name: 'Estimativa', kind: 'number', applies_to_types: ['História'] })).data;
    expect(board.fields.at(-1)).toMatchObject({ name: 'Estimativa', appliesTo: ['História'] });
    expect(board.fields.at(-1).board).toBeUndefined();
    // os campos do board vêm marcados, e o que as regras usam deles não muda pelo MCP
    expect(board.fields.find((f: any) => f.name === 'Fase').board).toBe(true);
    const rename = await call('update_field', { field: 'Fase', name: 'Etapa' });
    expect(rename.error).toBe(true);
    expect(rename.text).toContain('não pode ser renomeado');
    expect((await call('delete_field', { field: 'Esforço da atividade' })).text).toContain('não pode ser apagado');
    expect((await call('create_field', { name: 'skills', kind: 'text' })).text).toContain('é o nome de um campo do board');
    board = (await call('update_field', { field: 'Tags', options: ['web', 'mobile'], display: 'inline' })).data;
    expect(board.fields.find((f: any) => f.name === 'Tags')).toMatchObject({ board: true, options: ['web', 'mobile'], display: 'inline' });
    expect((await call('update_rules', { blockDoneWithOpenChildren: false })).data.blockDoneWithOpenChildren).toBe(false);
  });
});

describe('instalar skills pelo board', () => {
  it('mostra o que foi encontrado e descarta a origem ao cancelar', async () => {
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
    router.clearInstall();
    expect(router.snapshot().harnessInstall).toBeNull();
    expect(cleaned).toBe(true);
  });
});

describe('modelos e referências nas skills', () => {
  it('a skill de modelos nasce só quando indicada, e o card entrega os arquivos dela', async () => {
    await call('create_skill', { name: 'modelos-do-projeto', description: 'Modelos e exemplos de código', content: 'Passos' });

    const written = (
      await call('write_skill_file', { skill: 'modelos-do-projeto', file: 'references/repositorio.ts', content: 'export class Repo {}' })
    ).data;
    expect(written.files).toEqual(['references/repositorio.ts']);
    expect((await call('write_skill_file', { skill: 'modelos-do-projeto', file: '../fora.ts', content: 'x' })).error).toBe(true);
    expect((await call('write_skill_file', { skill: 'nao-existe', file: 'references/a.ts', content: 'x' })).error).toBe(true);

    const created = (await call('create_card', { title: 'História', fields: { Skills: ['modelos-do-projeto'] } })).data;
    const card = (await call('get_card', { card: created.id })).data;
    expect(card.requiredSkills).toEqual([
      {
        name: 'modelos-do-projeto',
        scope: 'board',
        path: libraryPath('skill', 'modelos-do-projeto'),
        files: [path.join(path.dirname(libraryPath('skill', 'modelos-do-projeto')), 'references/repositorio.ts')],
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
    // os agentes nascem no board (não na pasta da ferramenta), disponíveis para os cards
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
    expect(fs.existsSync(path.join(home, '.claude/agents/planejador.md'))).toBe(false);
    // o servidor que o agente libera também precisa estar no board
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: 'gh' } } }));
    router.refreshHarness();
    await call('set_harness_selection', { items: [{ kind: 'mcp', name: 'github' }], usage: 'contextual' });
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
      agentFile: libraryPath('agent', 'planejador'),
      mcpServers: ['faz-ai', 'github'],
      deniedTools: ['WebFetch'],
    });
    expect(card.execution.enforcedByBoardRun).toEqual(['agent', 'mcp', 'tools', 'model', 'context']);
    expect(card.requiredSkills.map((k: any) => k.name)).toEqual(['planejar', 'testar']);
    await call('create_card', { title: 'Sub', type: 'Sub-tarefa', parent: 1 });
    expect((await call('get_card', { card: 2 })).data.execution.profile).toBe('planejador');

    // o card pode trocar de agente, e voltar ao da coluna
    expect((await call('set_card_profile', { card: 1, profile: 'geral' })).data).toMatchObject({ id: '#1', column: expect.any(String) });
    expect((await call('get_card', { card: 1 })).data.execution.profile).toBe('geral');
    await call('set_card_profile', { card: 1 });
    expect((await call('get_card', { card: 1 })).data.execution.profile).toBe('planejador');

    // desmarcar um agente solta as colunas e os cards que o usavam
    await call('set_card_profile', { card: 1, profile: 'planejador' });
    await call('set_harness_selection', { items: [{ kind: 'agent', name: 'planejador' }], usage: null });
    const s = router.snapshot();
    expect(s.columns.every((c) => c.execProfile === null)).toBe(true);
    expect(s.cards.every((c) => c.execProfile === null)).toBe(true);
    expect((await call('get_card', { card: 1 })).data.execution.profile).toBe('geral');
    // tirar do board um agente criado no board o apaga: ele não tinha arquivo na pasta da ferramenta
    expect((await call('get_harness', { onlySelected: false })).data.agents.map((a: any) => [a.name, a.usage])).toEqual([
      ['geral', 'contextual'],
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
    expect(field.options).toEqual(['commit', 'critica', 'revisar-spec']);
    const created = (await call('create_card', { title: 'História', fields: { Skills: ['commit', 'critica', 'revisar-spec'] } })).data;
    const card = (await call('get_card', { card: created.id })).data;
    expect(card.requiredSkills).toEqual(['commit', 'critica', 'revisar-spec'].map(copiedSkill));
    const inventory = (await call('get_harness')).data.inventory;
    expect(inventory.find((i: any) => i.name === 'commit')).toEqual({
      id: expect.any(String),
      kind: 'skill',
      group: 'skill',
      scope: 'project',
      usage: 'contextual',
      key: '~/.claude/skills/commit/SKILL.md',
      name: 'commit',
      description: 'Escreve o commit',
      path: libraryPath('skill', 'commit'),
    });
  });

  it('gerencia regras e skills do board e sincroniza o campo Skills', async () => {
    const usageOf = async (list: 'rules' | 'skills', name: string) =>
      (await call('get_harness')).data[list].find((r: any) => r.name === name)?.usage;
    expect((await call('get_harness')).data.rules).toEqual([]);
    // a regra tem nome livre e nasce desligada (a pessoa revisa); nada é gravado no projeto
    await call('write_rule_file', { file: 'convencoes', content: '# Regras\n' });
    expect(await usageOf('rules', 'convencoes')).toBe('off');
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(false);
    expect((await call('read_rule_file', { file: 'convencoes' })).text).toBe('# Regras\n');
    // reescrever troca o texto e mantém o modo
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'instructions', location: 'convencoes' }], usage: 'always' });
    await call('write_rule_file', { file: 'convencoes', content: 'novo' });
    expect((await call('read_rule_file', { file: 'convencoes' })).text).toBe('novo');
    expect(await usageOf('rules', 'convencoes')).toBe('always');
    expect((await call('write_rule_file', { file: '../fora.md', content: 'x' })).error).toBe(true);
    expect((await call('write_rule_file', { file: 'Maiuscula', content: 'x' })).error).toBe(true);
    expect((await call('read_rule_file', { file: 'nao-existe' })).error).toBe(true);
    await call('delete_rule_file', { file: 'convencoes' });
    expect((await call('get_harness')).data.rules).toEqual([]);
    expect((await call('delete_rule_file', { file: 'convencoes' })).error).toBe(true);

    expect((await call('create_skill', { name: 'Nome Ruim', description: 'd', content: 'c' })).error).toBe(true);
    const h = (await call('create_skill', { name: 'revisar-spec', description: 'Use ao revisar uma spec', content: 'Passos…' })).data;
    expect(h.skills).toEqual([
      { name: 'revisar-spec', usage: 'contextual', description: 'Use ao revisar uma spec', path: libraryPath('skill', 'revisar-spec') },
    ]);
    expect((await call('create_skill', { name: 'revisar-spec', description: 'd', content: 'c' })).error).toBe(true);
    expect((await call('get_skill', { skill: 'revisar-spec' })).text).toContain('name: "revisar-spec"');
    const skillsField = () => router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!;
    expect(skillsField().options).toEqual(['revisar-spec']);
    expect(fs.existsSync(path.join(dir, '.claude', 'skills'))).toBe(false);

    // skill marcada no card aparece como obrigatória, com o caminho do SKILL.md
    const created = (await call('create_card', { title: 'História', fields: { Skills: ['revisar-spec'], Modelo: 'Claude Haiku 4.5' } }))
      .data;
    const card = (await call('get_card', { card: created.id })).data;
    expect(card.requiredSkills).toEqual([{ name: 'revisar-spec', scope: 'board', path: libraryPath('skill', 'revisar-spec') }]);
    expect(card.model).toMatchObject({ tool: 'claude', model: 'haiku', effort: null, value: 'claude:haiku' });

    // update_skill troca o SKILL.md inteiro e mantém o modo
    await call('update_skill', { skill: 'revisar-spec', content: '---\nname: revisar-spec\ndescription: Outra\n---\nNovo' });
    expect((await call('get_skill', { skill: 'revisar-spec' })).text).toContain('Novo');
    expect((await call('update_skill', { skill: 'nao-existe', content: 'x' })).error).toBe(true);

    // set_skill_enabled é atalho de modo: false desliga; true religa em "Pelo card"; ligada, não muda nada
    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: false });
    expect(await usageOf('skills', 'revisar-spec')).toBe('off');
    // desligada, a skill não vale mais para o card
    expect((await call('get_card', { card: 1 })).data.requiredSkills ?? []).toEqual([]);
    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: true });
    expect((await call('get_card', { card: 1 })).data.requiredSkills[0]).toEqual(copiedSkill('revisar-spec'));
    expect(await usageOf('skills', 'revisar-spec')).toBe('contextual');
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'skill', location: 'board:revisar-spec' }], usage: 'always' });
    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: true });
    expect(await usageOf('skills', 'revisar-spec')).toBe('always');
    expect((await call('set_skill_enabled', { skill: 'nao-existe', enabled: true })).error).toBe(true);

    await call('delete_skill', { skill: 'revisar-spec' });
    expect((await call('get_harness')).data.skills).toEqual([]);
    expect(skillsField().options).toEqual([]);
    expect((await call('delete_skill', { skill: 'revisar-spec' })).error).toBe(true);
  });

  it('o que a tela cria aparece em get_harness e o que o MCP cria aparece no snapshot; o importável traz a key', async () => {
    await call('create_skill', { name: 'pelo-mcp', description: 'd', content: 'c' });
    expect(router.snapshot().harness.library!.artifacts.map((a) => [a.kind, a.name, a.usage])).toContainEqual([
      'skill',
      'pelo-mcp',
      'contextual',
    ]);
    router.handle({ type: 'harness.artifact.save', kind: 'rule', name: 'pela-tela', body: 'x', via: 'manual' });
    expect((await call('get_harness')).data.rules.map((r: any) => [r.name, r.usage])).toEqual([['pela-tela', 'contextual']]);
    expect((await call('read_rule_file', { file: 'pela-tela' })).text).toBe('x');

    // o que está só na pasta da ferramenta aparece como importável, com a key; depois de importado, sai da lista
    const file = path.join(dir, 'home-do-usuario', '.claude', 'skills', 'externa', 'SKILL.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '---\nname: externa\ndescription: Veio de fora\n---\nx');
    router.refreshHarness();
    const importable = async () => (await call('get_harness', { onlySelected: false })).data;
    const found = (await importable()).inventory.find((i: any) => i.name === 'externa');
    expect(found).toMatchObject({ kind: 'skill', usage: null, key: expect.any(String) });
    expect((await call('get_harness')).data.inventory.some((i: any) => i.name === 'externa')).toBe(false);
    expect((await importable()).inventory.some((i: any) => i.name === 'pelo-mcp')).toBe(false);
    await call('set_harness_selection', { items: [{ kind: 'skill', location: found.key }], usage: 'contextual' });
    expect((await importable()).inventory.some((i: any) => i.name === 'externa')).toBe(false);
    expect((await call('get_skill', { skill: 'externa' })).text).toContain('Veio de fora');
    expect((await call('get_harness')).data.note).not.toContain('onlySelected = false: ');
    expect((await importable()).note).toContain('dá para importar');
  });

  it('escreve arquivos de apoio na skill do board e respeita os limites', async () => {
    await call('create_skill', { name: 'com-apoio', description: 'd', content: 'c' });
    const item = (await call('write_skill_file', { skill: 'com-apoio', file: 'references/a.ts', content: 'export {}' })).data;
    expect(item).toMatchObject({ kind: 'skill', name: 'com-apoio' });
    expect(item.files).toHaveLength(1);
    expect(
      (await call('write_skill_file', { skill: 'com-apoio', file: 'references/grande.ts', content: 'x'.repeat(600 * 1024) })).error,
    ).toBe(true);
    expect((await call('write_skill_file', { skill: 'com-apoio', file: '../fora', content: 'x' })).error).toBe(true);
    expect((await call('write_skill_file', { skill: 'nao-existe', file: 'a.ts', content: 'x' })).error).toBe(true);
    expect(fs.existsSync(path.join(dir, '.claude'))).toBe(false);
  });

  it('o agente padrão e a skill do fluxo não saem do board', async () => {
    await call('create_agent', { name: 'padrao', description: 'd', content: 'c' });
    router.handle({ type: 'settings.board.update', patch: { runner: { ...router.snapshot().board.runner, defaultAgent: 'padrao' } } });
    expect((await call('delete_agent', { agent: 'padrao' })).error).toBe(true);
    expect((await call('set_harness_selection', { items: [{ kind: 'agent', name: 'padrao' }], usage: null })).error).toBe(true);
    expect((await call('get_agent', { agent: 'padrao' })).error).toBe(false);
    expect((await call('delete_agent', { agent: 'nao-existe' })).error).toBe(true);
    expect((await call('update_agent', { agent: 'nao-existe', description: 'x' })).error).toBe(true);

    await call('install_flow_skill');
    expect((await call('delete_skill', { skill: 'faz-ai-fluxo' })).error).toBe(true);
    expect((await call('set_harness_selection', { items: [{ kind: 'skill', name: 'faz-ai-fluxo' }], usage: null })).error).toBe(true);
    // só o modo dela muda
    await call('set_skill_enabled', { skill: 'faz-ai-fluxo', enabled: false });
    expect((await call('get_harness')).data.skills.find((k: any) => k.name === 'faz-ai-fluxo').usage).toBe('off');
  });

  it('nenhuma ferramenta de artefato grava nas pastas das ferramentas, nem manda criar arquivo nelas', async () => {
    await call('write_rule_file', { file: 'r', content: 'x' });
    await call('create_skill', { name: 's', description: 'd', content: 'c' });
    await call('write_skill_file', { skill: 's', file: 'references/a.md', content: 'x' });
    await call('create_agent', { name: 'a', description: 'd', content: 'c' });
    for (const rel of ['.claude', '.cursor', '.agents', 'AGENTS.md', 'CLAUDE.md']) expect(fs.existsSync(path.join(dir, rel))).toBe(false);
    const tools = (await client.listTools()).tools;
    const description = (name: string) => tools.find((t) => t.name === name)!.description;
    const names = [
      'get_harness',
      'set_harness_selection',
      'read_rule_file',
      'write_rule_file',
      'delete_rule_file',
      'get_skill',
      'create_skill',
      'update_skill',
      'set_skill_enabled',
      'delete_skill',
      'write_skill_file',
      'get_agent',
      'create_agent',
      'update_agent',
      'delete_agent',
    ];
    for (const n of names) expect(description(n)).not.toMatch(/\.claude|\.cursor|CLAUDE\.md|AGENTS\.md|pasta de skills/);
    expect(description('write_rule_file')).toContain('do board');
    expect(client.getInstructions()).toContain('do board: get_harness');
    expect(client.getInstructions()).not.toMatch(/\.claude|\.cursor|pasta da ferramenta/);
  });

  it('aplica os padrões do tipo aos cards novos e recria o board', async () => {
    // a Fase não tem padrão por tipo: ela é a fase da história a que cada sub-tarefa pertence
    const phase = await call('update_card_type', { type: 'Sub-tarefa', default_fields: { Fase: 'Implementação' } });
    expect(phase.text).toContain('não tem valor padrão por tipo');
    const board = (
      await call('update_card_type', {
        type: 'Sub-tarefa',
        default_fields: { Modelo: 'claude sonnet 5.5 high', 'Esforço da atividade': 'Médio' },
      })
    ).data;
    expect(board.cardTypes.find((t: any) => t.name === 'Sub-tarefa').defaultFields).toEqual({
      Modelo: 'claude:sonnet@high',
      'Esforço da atividade': 'Médio',
    });
    await call('create_card', { title: 'História' });
    const sub = (await call('create_card', { title: 'Tarefa', parent: 1, fields: { Fase: 'Spec', 'Esforço da atividade': 'Alto' } })).data;
    // o valor informado vence o padrão, e a IA grava a Fase
    expect(sub.fields).toEqual({ Fase: 'Spec', 'Esforço da atividade': 'Alto', Modelo: 'Claude Code · Sonnet 5.5 · high' });
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

    const created = (await call('create_card', { title: 'H', fields: { Esforço: 'Baixo' } })).data;
    const card = (await call('get_card', { card: created.id })).data;
    expect(card.model.value).toBe('claude:haiku');
    // a nota diz o que fazer com o modelo e separa o esforço do modelo do "Esforço da atividade"
    expect(card.model.note).toMatch(/delegue o trabalho a um subagente[\s\S]*avise a pessoa/);
    expect(card.model.note).toContain('"Esforço da atividade" é o tamanho da tarefa');
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
    // o resumo do create_card traz o campo Modelo gravado; o valor normalizado vem pelo get_card
    const doc = (await call('create_card', { title: 'Doc', fields: { Tags: ['docs'], Esforço: 'Alto' } })).data;
    expect((await call('get_card', { card: doc.id })).data.model.value).toBe('claude:haiku');
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
  const modelOf = async (fields: Record<string, unknown>, type?: string) => {
    const created = (await call('create_card', { title: 'x', type, fields })).data;
    return (await call('get_card', { card: created.id })).data.model?.value;
  };

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

  it('aceita um modelo reserva por regra; sem reserva fica igual a antes da história', async () => {
    const res = await call('set_model_rules', {
      rules: [
        { name: 'Com reserva', when: [[{ field: 'Tags', value: 'docs' }]], model: 'haiku', fallback: 'opus high' },
        { name: 'Sem reserva', when: [[{ field: 'Esforço', value: 'Alto' }]], model: 'opus low' },
      ],
    });
    expect(res.data.rules[0]).toMatchObject({
      name: 'Com reserva',
      value: 'claude:haiku',
      fallbackSuggest: expect.stringContaining('Opus'),
      fallbackValue: 'claude:opus@high',
    });
    expect(res.data.rules[1]).not.toHaveProperty('fallbackValue');
    expect(res.data.rules[1]).not.toHaveProperty('fallbackSuggest');

    const rules = router.snapshot().board.modelRules;
    expect(rules[0]?.fallback).toBe('claude:opus@high');
    expect(rules[1]?.fallback).toBe(null);

    const fromGet = (await call('get_models')).data.rules;
    expect(fromGet[0]).toMatchObject({ fallbackValue: 'claude:opus@high' });
    expect(fromGet[1]).not.toHaveProperty('fallbackValue');
  });

  it('com o preenchimento automático desligado, só sugere', async () => {
    await call('update_rules', { autoApplyModelSuggestion: false });
    const created = (await call('create_card', { title: 'x', fields: { Esforço: 'Alto' } })).data;
    const card = (await call('get_card', { card: created.id })).data;
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

describe('get_board enxuto (#598)', () => {
  it('traz uma só lista de agentes, sem aparência nem o bloco harness; o inventário fica no get_harness', async () => {
    const res = await call('get_board');
    const b = res.data;
    expect(b.appearance).toBeUndefined();
    expect(b.harness).toBeUndefined();
    expect(res.text).not.toContain('inventory');
    expect(b.agents.filter((a: any) => a.default)).toHaveLength(1);
    const h = (await call('get_harness')).data;
    for (const key of ['inventory', 'skills', 'rules', 'agents']) expect(h[key]).toBeDefined();
  });
});

describe('aparência', () => {
  it('guarda tema, fonte e tamanho, recusando valores fora do permitido', async () => {
    expect(router.snapshot().board.appearance).toMatchObject({ theme: 'system', font: 'sans', fontSize: 14 });
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
    // a aprovação da pessoa leva o card à coluna seguinte na hora, e o status recomeça lá (#441)
    expect((await call('get_card', { card: 1 })).data).toMatchObject({ column: 'Spec', work: { status: 'ready' } });

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
    await call('create_card', { title: 'Escrever PRD', parent: 1, fields: { Fase: 'PRD' } });
    const sub = (await call('get_card', { card: 2 })).data;
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

    // aprovado vai para a coluna seguinte (Spec), pronto, no topo da fila por estar mais à direita; bloqueio feito pela própria pessoa não gera aviso
    human(1, 'approved');
    p = await pending();
    expect(ids(p.forYou.approved)).toEqual([]);
    expect(ids(p.forYou.ready)).toEqual(['#2', '#1', '#4']);
    // next não cita mais os nomes dos grupos (approved/unanswered/ready), manda seguir `order`
    expect(p.next).toContain('order');
    const quiet = humanQueueStatuses(router.snapshot());
    human(2, 'blocked', 'Sem acesso');
    expect(turnsPassedToHuman(quiet, router.snapshot())).toEqual([]);
    expect(ids((await pending()).withPerson)).toEqual(['#2']);
    expect((await call('list_cards', { work_status: 'blocked' })).data.total).toBe(1);
  });

  it('order traz a fila inteira em ordem, com o bug na frente mesmo vindo de outro grupo', async () => {
    // o bug está pronto e mais abaixo no board; a história está aprovada e mais acima. A aprovação da pessoa
    // moveria o card (#441); aqui o status é gravado direto, para o grupo "approved" existir na fila
    await call('create_card', { title: 'Falha', type: 'Bug', column: 'Plan' }); // #1, pronto
    await call('create_card', { title: 'Login', column: 'PRD' }); // #2, aprovado
    (router as any).ctx.cards.setStatus(card(2).id, 'approved', '', 'Pessoa');

    const p = await pending();
    expect(ids(p.forYou.ready)).toEqual(['#1']);
    expect(ids(p.forYou.approved)).toEqual(['#2']);
    // o bug vence as duas coisas que o venciam antes: a categoria "approved" e a coluna mais à esquerda
    expect(p.order).toEqual(['#1', '#2']);
    expect(p.next).toContain('order');
  });

  it('cria, edita e apaga agentes no board, sem gravar na pasta da ferramenta; o agente só da ferramenta segue no arquivo', async () => {
    const home = path.join(dir, 'home-do-usuario');
    const stored = (name: string) => router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'agent' && a.name === name);
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
      expect.objectContaining({
        name: 'revisor-de-spec',
        description: 'Revisa uma Spec antes do Plan',
        usage: 'contextual',
        path: libraryPath('agent', 'revisor-de-spec'),
      }),
    ]);
    // o escopo é ignorado: nada vai para a pasta de agentes do projeto nem da pessoa
    expect(fs.existsSync(path.join(dir, '.claude/agents'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude/agents'))).toBe(false);
    expect(stored('revisor-de-spec')).toMatchObject({ origin: '', body: 'Leia a spec e aponte lacunas.' });
    expect(stored('revisor-de-spec')!.agent).toMatchObject({ model: 'claude:opus@high', tools: { native: { allow: ['Read', 'Grep'] } } });
    expect((await call('get_agent', { agent: 'revisor-de-spec' })).text).toContain('aponte lacunas');
    expect((await call('create_agent', { name: 'revisor-de-spec', description: 'd', content: 'c', scope: 'project' })).text).toContain(
      'Já existe',
    );
    expect((await call('create_agent', { name: 'Nome Inválido', description: 'd', content: 'c' })).error).toBe(true);

    // o patch regrava só o que vier; o conteúdo inteiro substitui tudo
    await call('update_agent', { agent: 'revisor-de-spec', description: 'Nova descrição', skills: ['x'] });
    expect(stored('revisor-de-spec')).toMatchObject({ description: 'Nova descrição', body: 'Leia a spec e aponte lacunas.' });
    expect(stored('revisor-de-spec')!.agent).toMatchObject({ skills: ['x'], model: 'claude:opus@high' });
    await call('update_agent', {
      agent: 'revisor-de-spec',
      content: '---\nname: revisor-de-spec\ndescription: Outra\n---\nNovo corpo',
    });
    expect(stored('revisor-de-spec')).toMatchObject({ description: 'Outra', body: 'Novo corpo' });
    expect(fs.existsSync(path.join(dir, '.claude/agents'))).toBe(false);

    // agente criado por fora aparece no inventário completo, mas só entra no board depois de enviado
    fs.mkdirSync(path.join(dir, '.claude/agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude/agents/planejador.md'), '---\nname: planejador\ndescription: Quebra a spec em passos\n---\nx');
    router.refreshHarness();
    expect((await call('get_harness')).data.agents.map((a: any) => a.name)).toEqual(['revisor-de-spec']);
    expect((await call('get_harness', { onlySelected: false })).data.inventory.map((a: any) => [a.kind, a.name])).toEqual([
      ['agent', 'planejador'],
    ]);

    // no Cursor o agente guarda somente leitura e segundo plano; update_agent liga e desliga
    await call('set_ai_tool', { tool: 'cursor' });
    await call('create_agent', { name: 'leitor', description: 'd', content: 'c', scope: 'project', readonly: true });
    expect(stored('leitor')!.agent).toMatchObject({ readonly: true });
    await call('update_agent', { agent: 'leitor', readonly: false, background: true });
    expect(stored('leitor')!.agent).toMatchObject({ background: true });
    expect(stored('leitor')!.agent!.readonly).toBeUndefined();
    expect(fs.existsSync(path.join(dir, '.cursor/agents'))).toBe(false);
    await call('set_ai_tool', { tool: 'claude' });

    // o agente só da pasta da ferramenta não é do board: as ferramentas de agente não mexem no arquivo dele
    expect((await call('delete_agent', { agent: 'planejador' })).error).toBe(true);
    expect((await call('update_agent', { agent: 'planejador', description: 'x' })).error).toBe(true);
    expect((await call('get_agent', { agent: 'planejador' })).error).toBe(true);
    expect(fs.existsSync(path.join(dir, '.claude/agents/planejador.md'))).toBe(true);
    await call('delete_agent', { agent: 'revisor-de-spec' });
    expect(stored('revisor-de-spec')).toBeUndefined();
  });

  it('instala a skill do fluxo sempre no global da ferramenta, sem sobrescrever', async () => {
    const file = path.join(dir, 'home-do-usuario', '.claude', 'skills', 'faz-ai-fluxo', 'SKILL.md');
    expect((await call('install_flow_skill')).data).toMatchObject({
      installed: true,
      skill: expect.stringContaining('.claude/skills/faz-ai-fluxo'),
    });
    expect(fs.readFileSync(file, 'utf8')).toContain('get_pending_work');
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'faz-ai-fluxo'))).toBe(false);
    // os artefatos padrão do board não entram no projeto: o escopo deixou de ser um parâmetro
    expect((await call('install_flow_skill', { scope: 'project' })).error).toBe(true);
    expect(fs.existsSync(path.join(dir, '.claude', 'skills', 'faz-ai-fluxo'))).toBe(false);

    fs.writeFileSync(file, '---\nname: faz-ai-fluxo\ndescription: minha versão\n---\nmeu texto');
    expect((await call('install_flow_skill')).data.installed).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toContain('meu texto');
    // só com replace a versão da pessoa é trocada
    expect((await call('install_flow_skill', { replace: true })).data).toMatchObject({ note: 'Skill substituída.' });
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
      (await call('get_harness')).data.inventory.find((i: any) => i.kind === 'skill' && i.name === 'faz-ai-fluxo')?.usage;
    expect((await call('get_harness', { onlySelected: false })).data.inventory.find((i: any) => i.name === 'faz-ai-fluxo')).toMatchObject({
      usage: null,
      key: expect.any(String),
    });
    expect(await usage()).toBeUndefined();
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

  it('cria só no board e mantém as cópias ao trocar de ferramenta', async () => {
    const names = async () => (await call('get_harness')).data.skills.map((k: any) => k.name);
    await call('create_skill', { name: 'revisar-spec', description: 'd', content: 'c' });
    expect(fs.existsSync(skillMd('.claude/skills'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.agents'))).toBe(false);

    // a troca de ferramenta não mexe no que está no board
    const h = (await call('set_ai_tool', { tool: 'cursor' })).data;
    expect(h.aiTool).toBe('cursor');
    expect(h.skills.map((k: any) => k.name)).toEqual(['revisar-spec']);
    expect(router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['revisar-spec']);
    await call('create_skill', { name: 'do-cursor', description: 'd', content: 'c' });
    expect(fs.existsSync(path.join(dir, '.cursor'))).toBe(false);
    expect(await names()).toEqual(['do-cursor', 'revisar-spec']);
    await call('set_skill_enabled', { skill: 'do-cursor', enabled: false });
    expect((await call('get_harness')).data.skills.find((k: any) => k.name === 'do-cursor').usage).toBe('off');

    await call('set_ai_tool', { tool: 'claude' });
    expect(await names()).toEqual(['do-cursor', 'revisar-spec']);
    // desligada, a skill sai das opções do campo
    expect(router.snapshot().fieldDefs.find((f) => f.name === 'Skills')!.options).toEqual(['revisar-spec']);
  });

  it('registra o servidor MCP no formato de cada ferramenta: o Claude Code no global, o Cursor no projeto', async () => {
    const { registerClients } = await import('../src/extension/mcp/clientConfig');
    const home = path.join(dir, 'home');
    fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { outro: { command: 'x' } } }));
    const bridge = '/b/com espaço/bridge.js';
    const done = registerClients(['claude', 'cursor'], { bridgePath: bridge, workspaceDir: dir, homeDir: home });
    // o Claude Code vai pela CLI dele, sem arquivo no projeto; o Cursor é a exceção: `.cursor/mcp.json` do projeto, com a pasta fixa
    expect(done.map((d) => d.projectFile)).toEqual([null, '.cursor/mcp.json']);
    expect(done[0]!.run!.map((s) => s.args[1])).toEqual(['remove', 'add-json']);
    expect(fs.existsSync(path.join(dir, '.mcp.json'))).toBe(false);

    const json = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')).mcpServers;
    expect(json(path.join(dir, '.cursor', 'mcp.json'))['faz-ai']).toEqual({ type: 'stdio', command: 'node', args: [bridge, dir] });
    // o global do Cursor não é usado: o que a pessoa tem lá fica como está
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
    const stop = await startMcpServer(address, {
      getRouter: async () => router,
      getRunner: async () => undefined,
      workspaceDir: dir,
      version: 'test',
    });
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
      const stop = await startMcpServer(address, {
        getRouter: async () => router,
        getRunner: async () => undefined,
        workspaceDir: project,
        version: 'test',
      });
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
    expect(api.waitingFor).toEqual([base.id]);
    expect((await call('get_card', { card: api.id })).data.links.dependsOn).toMatchObject([{ id: base.id }]);
    expect(router.snapshot().links).toMatchObject([{ kind: 'precedes' }]);

    // a história mostra o que roda junto agora e o que espera
    const before = (await call('get_card', { card: story.id })).data;
    expect(before.subtasksNow).toEqual({ canRunTogether: [base.id, tela.id], waiting: [api.id] });
    expect(before.subtaskList.find((k: { id: string }) => k.id === api.id).waitingFor).toEqual([base.id]);

    // a que espera não começa; as independentes começam ao mesmo tempo
    const refused = await call('start_work', { card: api.id });
    expect(refused.error).toBe(true);
    expect(refused.text).toContain(`depende de ${base.id}`);
    expect((await call('get_card', { card: api.id })).data.column).toBe('A fazer'); // a recusa não move a sub-tarefa
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
    const got = (await call('get_card', { card: story.id })).data;
    expect(got.subtasksNow).toEqual({ canRunTogether: [a.id, d.id], waiting: [], withPerson: [b.id], running: [c.id] });
    // a nota das rodadas vem junto, porque não cabe nas instruções do servidor
    expect(got.subtasksNowNote).toBe(SUBTASKS_NOW_NOTE);
    // sub-tarefa sem rodada não traz nem as rodadas nem a nota
    const single = (await call('get_card', { card: a.id })).data;
    expect(single.subtasksNow).toBeUndefined();
    expect(single.subtasksNowNote).toBeUndefined();
  });

  it('get_card de uma história em modo autônomo com sub-tarefas fica enxuto: as notas fixas vão para as skills (#588)', async () => {
    await call('create_card', { title: 'História', column: 'Backlog', description: 'Descrição curta.' });
    router.handle({ type: 'card.yolo.set', cardId: router.snapshot().cards[0]!.id, enabled: true });
    await call('move_card', { card: 1, column: 'Implementação' });
    const a = (await call('create_card', { title: 'A', parent: 1 })).data;
    await call('create_card', { title: 'B', parent: 1, depends_on: [a.id] });
    const got = (await call('get_card', { card: 1 })).data;
    const size = JSON.stringify(got).length;
    console.log(`MEDIDA get_card #588: ${size} caracteres`);
    const notes = JSON.stringify(got, (k, v) => (k.endsWith('Note') ? v : typeof v === 'object' ? v : undefined));
    expect(notes.length).toBeLessThan(MAX_NOTES);
    expect(got.harnessNote).toBeDefined();
    expect(got.subtasksNowNote).toBeDefined();
    expect(got.phase.autonomousNote).toContain('faz-ai-modo-autonomo');
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

describe('registro de decisão na Homologação', () => {
  it('com a pasta ligada, a última coluna da IA diz onde gravar o registro da história; desligada, não diz nada', async () => {
    await call('create_card', { title: 'Exportar CSV', column: 'Homologação' });
    await call('create_card', { title: 'Outra', column: 'Spec' });
    expect((await call('get_card', { card: 1 })).data.phase.decisionRecord).toBeUndefined();
    router.handle({ type: 'settings.board.update', patch: { git: { decisionRecords: 'docs/decisoes' } } });
    const record = (await call('get_card', { card: 1 })).data.phase.decisionRecord;
    expect(record.path).toBe('docs/decisoes/0001-exportar-csv.md');
    expect(record.note).toContain('Alternativas descartadas');
    expect((await call('get_card', { card: 2 })).data.phase.decisionRecord).toBeUndefined();
  });
});

describe('retrabalho pelo get_metrics e no painel', () => {
  const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;

  it('conta a revisão devolvida com ajuste, a aprovada de primeira e o bug vinculado a uma história concluída', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    await call('create_card', { title: 'Exportar', column: 'PRD' });
    // #1: devolvida com ajuste, aprovada na segunda
    await call('request_review', { card: 1, summary: 'PRD pronto' });
    router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'ready', note: 'Falta o caso de erro' });
    await call('request_review', { card: 1, summary: 'PRD com o caso de erro' });
    router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'approved' });
    // #2: aprovada de primeira, e concluída; depois aparece um bug vinculado a ela
    await call('request_review', { card: 2, summary: 'PRD pronto' });
    router.handle({ type: 'card.status.set', cardId: card(2).id, status: 'approved' });
    const done = router.snapshot().columns.find((c) => c.workflowId === card(2).workflowId && c.category === 'done')!;
    router.handle({ type: 'card.move', cardId: card(2).id, columnId: done.id, position: 0 });
    await call('create_card', { title: 'Exportar falha com acento', type: 'Bug' });
    router.handle({ type: 'link.add', fromId: card(3).id, toId: card(2).id, kind: 'related' });

    // #4: a pessoa arrasta para a Spec o card que aguardava revisão: não aprovou nem pediu ajuste
    await call('create_card', { title: 'Importar', column: 'PRD' });
    await call('request_review', { card: 4, summary: 'PRD pronto' });
    const spec = router.snapshot().columns.find((c) => c.workflowId === card(4).workflowId && c.name === 'Spec')!;
    router.handle({ type: 'card.move', cardId: card(4).id, columnId: spec.id, position: 0 });

    // #6 veio corrigir o Bug #5, que já existia: o bug não escapou de #6. E o próprio Bug, concluído, não é história
    await call('create_card', { title: 'Acento quebra o CSV', type: 'Bug' });
    await call('create_card', { title: 'Corrigir acento' });
    router.handle({ type: 'link.add', fromId: card(5).id, toId: card(6).id, kind: 'related' });
    router.handle({ type: 'card.move', cardId: card(6).id, columnId: done.id, position: 0 });
    router.handle({ type: 'card.move', cardId: card(5).id, columnId: done.id, position: 0 });

    const rework = router.panelMetrics({}).sections.rework;
    expect(rework.phases).toEqual([
      { phase: 'PRD', reviews: 4, approved: 2, adjusted: 1, resolved: 2, firstPass: 1, ...EMPTY_REWORK.aiSignals },
    ]);
    expect(rework.escapes).toEqual({ stories: 2, withBugs: 1, bugs: 1, autonomousStories: 0, autonomousWithBugs: 0, autonomousBugs: 0 });

    const text = (await call('get_metrics', { rework: true })).text;
    expect(text).toContain('retrabalho por fase');
    expect(text).toContain('1 de 2');
    expect(text).toContain('histórias concluídas no período: 2; com bug vinculado: 1 (1 bug(s))');
  });
});

describe('histórias derivadas e caminho curto', () => {
  const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;

  it('create_card com derived_from marca a origem, vincula as duas e explica a pilha na conversa', async () => {
    const origem = (await call('create_card', { title: 'Exportar CSV', column: 'Plan' })).data;
    const derivada = (await call('create_card', { title: 'Exportar CSV: filtros', derived_from: origem.id })).data;
    expect(derivada.derivedFrom).toBe(`${origem.id} Exportar CSV`);
    expect(card(2).derivedFrom).toBe(card(1).id);
    expect(card(2).yolo).toBe(false);
    expect(router.snapshot().links).toMatchObject([{ kind: 'related' }]);
    const comments = router.snapshot().comments.filter((m) => m.cardId === card(2).id);
    expect(comments.at(-1)!.body).toContain(`Derivada de ${origem.id} Exportar CSV`);
    expect((await call('get_card', { card: derivada.id })).data.derivedFrom).toBe(`${origem.id} Exportar CSV`);
  });

  it('a derivada não cria branch enquanto a parte anterior, aberta, ainda não tem a dela', async () => {
    await call('create_card', { title: 'Parte 1', column: 'Plan' });
    await call('create_card', { title: 'Parte 2', column: 'Implementação', derived_from: 1 });
    expect(() => router.handle({ type: 'card.workspace.prepare', cardId: card(2).id })).toThrow(/#1, que ainda não tem branch/);
  });

  it('derived_from só vale entre histórias, sem ciclo e antes de a derivada ter branch', async () => {
    const a = (await call('create_card', { title: 'A' })).data;
    const sub = (await call('create_card', { title: 'Sub', parent: a.id })).data;
    expect((await call('create_card', { title: 'Sub derivada', parent: a.id, derived_from: a.id })).error).toBe(true);
    expect((await call('create_card', { title: 'De sub-tarefa', derived_from: sub.id })).error).toBe(true);
    const b = (await call('create_card', { title: 'B', derived_from: a.id })).data;
    // A já não pode derivar de B: a pilha viraria um ciclo
    expect(() => router.handle({ type: 'card.derive', cardId: card(1).id, fromId: card(3).id })).toThrow(/já deriva/);
    expect(() => router.handle({ type: 'card.derive', cardId: card(1).id, fromId: card(1).id })).toThrow(/dela mesma/);
    expect(b.derivedFrom).toBe(`${a.id} A`);
  });

  it('a história criada direto numa fase adiante sabe quais documentos das fases anteriores não existem', async () => {
    const curta = (await call('create_card', { title: 'Ajuste de texto', column: 'Plan' })).data;
    const phase = (await call('get_card', { card: curta.id })).data.phase;
    expect(phase.missingArtifacts).toEqual(['DISCOVERY.md', 'PRD.md', 'SPEC.md']);
    expect(phase.missingArtifactsNote).toContain('não os crie');

    const longa = (await call('create_card', { title: 'Do começo', column: 'Discovery' })).data;
    expect((await call('get_card', { card: longa.id })).data.phase.missingArtifacts).toBeUndefined();
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

  it('até onde: a IA segue sozinha até a fase escolhida, pede a revisão nela e o modo se desliga', async () => {
    await call('create_card', { title: 'Login', column: 'Discovery' });
    router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true, until: column('Spec').id });
    expect(card(1).yoloUntil).toBe(column('Spec').id);
    expect((await call('get_card', { card: 1 })).data).toMatchObject({ autonomous: true, autonomousUntil: 'Spec' });
    expect((await call('get_card', { card: 1 })).data.comments.at(-1).body).toContain('Modo autônomo ligado até Spec');

    // antes da parada, as aprovações não seguram
    expect((await call('request_review', { card: 1, summary: 'Discovery pronto' })).data.card.work.status).toBe('approved');
    await call('move_card', { card: 1, column: 'PRD' });
    await call('move_card', { card: 1, column: 'Spec' });

    // na parada, a coluna segura como se exigisse aprovação
    const phase = (await call('get_card', { card: 1 })).data.phase;
    expect(phase.requiresApproval).toBe(true);
    expect(phase.autonomousNote).toContain('até Spec');
    const early = await call('move_card', { card: 1, column: 'Plan' });
    expect(early.error).toBe(true);
    expect(early.text).toContain('última fase que a pessoa liberou');

    const res = (await call('request_review', { card: 1, summary: 'Spec pronta' })).data;
    expect(res.card.work.status).toBe('waiting_review');
    expect(res.next).toContain('o modo foi desligado');
    // o modo se desliga, mas a história guarda até onde foi: a entrega dela segue na pilha do modo
    expect(card(1)).toMatchObject({ yolo: false, yoloUntil: column('Spec').id, status: 'waiting_review' });
    expect((await call('get_card', { card: 1 })).data.comments.at(-1).body).toContain('O modo autônomo chegou até Spec');
    // daqui em diante valem as aprovações de sempre
    expect((await call('move_card', { card: 1, column: 'Plan' })).error).toBe(true);
  });

  it('até onde: só colunas da IA da atual em diante; a última vale como "até o fim"; com o modo ligado, só muda a parada', async () => {
    await call('create_card', { title: 'Login', column: 'Spec' });
    expect(() => router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true, until: column('PRD').id })).toThrow(
      /de Spec em diante/,
    );
    const done = router.snapshot().columns.find((c) => c.workflowId === card(1).workflowId && c.category === 'done')!;
    expect(() => router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true, until: done.id })).toThrow();
    const childTodo = router.snapshot().columns.find((c) => c.name === 'A fazer')!;
    expect(() => router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true, until: childTodo.id })).toThrow(
      /não tem a coluna/,
    );
    router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true, until: column('Homologação').id });
    expect(card(1)).toMatchObject({ yolo: true, yoloUntil: null });
    expect((await call('get_card', { card: 1 })).data.autonomousUntil).toBeUndefined();

    router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true, until: column('Plan').id });
    expect(card(1)).toMatchObject({ yolo: true, yoloUntil: column('Plan').id });
    expect((await call('get_card', { card: 1 })).data.comments.at(-1).body).toBe('O modo autônomo agora vai até Plan.');
  });

  it('até onde: a história já aguardando revisão na coluna atual não pode parar nela', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    await call('request_review', { card: 1, summary: 'PRD pronto' });
    expect(() => router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true, until: column('PRD').id })).toThrow();
    router.handle({ type: 'card.yolo.set', cardId: card(1).id, enabled: true, until: column('Spec').id });
    // ligar libera a revisão pendente, e a IA segue até a Spec
    expect(card(1)).toMatchObject({ yolo: true, status: 'approved' });
  });

  it('até onde em lote vale para cada história, e a história criada a partir de outra vai até o mesmo ponto', async () => {
    await call('create_card', { title: 'A', column: 'Discovery' });
    await call('create_card', { title: 'B', column: 'PRD' });
    router.handle({ type: 'card.yolo.setMany', cardIds: [card(1).id, card(2).id], enabled: true, until: column('Plan').id });
    expect([card(1).yoloUntil, card(2).yoloUntil]).toEqual([column('Plan').id, column('Plan').id]);
    await call('create_card', { title: 'A2', autonomous_from: 1 });
    expect(card(3)).toMatchObject({ yolo: true, yoloUntil: column('Plan').id });
  });

  it('no modo autônomo nada segura a história (#441); fora dele, ela espera a aprovação', async () => {
    await call('create_card', { title: 'Migração', column: 'PRD' });
    setYolo(1, true);
    const before = (await call('get_card', { card: 1 })).data;
    expect(before.criticalAreas).toBeUndefined();
    expect(before.phase.requiresApproval).toBe(false);
    expect(before.phase.autonomousNote).toContain('nem com pendência');
    expect((await call('move_card', { card: 1, column: 'Spec' })).error).toBe(false);
    expect((await call('move_card', { card: 1, column: 'PRD' })).error).toBe(false);

    // o pedido de revisão vira aprovação na hora, e a IA segue sozinha
    const res = (await call('request_review', { card: 1, summary: 'PRD pronto' })).data;
    expect(res.card.work.status).toBe('approved');
    expect(card(1).yolo).toBe(true);
    expect((await call('move_card', { card: 1, column: 'Spec' })).error).toBe(false);

    // fora do modo, a revisão é da pessoa; ligar o modo libera a história que aguardava revisão
    setYolo(1, false);
    await call('request_review', { card: 1, summary: 'Spec pronta' });
    expect(card(1).status).toBe('waiting_review');
    setYolo(1, true);
    expect(card(1).status).toBe('approved');

    // na última coluna da IA, a entrega é o pull request: a fase não pede aprovação
    await call('create_card', { title: 'Entrega', column: 'Homologação' });
    setYolo(2, true);
    expect((await call('get_card', { card: 2 })).data.phase.requiresApproval).toBe(false);
  });

  it('request_review com pending em YOLO não segura o card (#441): vira aprovação, a pendência fica registrada e a IA é mandada decidir', async () => {
    await call('create_card', { title: 'Login', column: 'PRD' });
    setYolo(1, true);
    const approvals: string[] = [];
    router.onDidApprove((id) => approvals.push(id));

    const res = (await call('request_review', { card: 1, summary: 'PRD pronto', pending: 'Decidir se o limite fica em 5 ou 10' })).data;
    expect(res.card.work).toMatchObject({ status: 'approved', with: 'ai' });
    expect(card(1).status).toBe('approved');
    const comments = (await call('get_card', { card: 1 })).data.comments;
    expect(comments.at(-2).body).toContain('**Travado em mim**');
    expect(comments.at(-2).body).toContain('Decidir se o limite fica em 5 ou 10');
    expect(comments.at(-1).body).toContain('Decida você mesmo');
    expect(approvals).toEqual([]);
    expect((await call('get_pending_work', {})).data.withPerson.map((c: any) => c.id)).not.toContain('#1');
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

  it('get_card com `only` devolve só os blocos pedidos; o essencial do card vem sempre', async () => {
    await call('create_card', { title: 'Login', column: 'PRD', description: 'Tela de login' });
    await call('add_comment', { card: 1, body: 'Comecei.' });
    await call('add_checklist_item', { card: 1, text: 'testes' });
    const full = (await call('get_card', { card: 1 })).data;
    expect(Object.keys(full)).toEqual(expect.arrayContaining(['phase', 'subtaskList', 'checklistItems', 'comments', 'attachments']));

    const part = (await call('get_card', { card: 1, only: ['conversation'] })).data;
    expect(part).toMatchObject({ title: 'Login', description: 'Tela de login' });
    expect(part.comments.map((c: any) => c.body)).toEqual(['Comecei.']);
    for (const key of ['phase', 'subtaskList', 'subtasksNow', 'checklistItems', 'attachments', 'links'])
      expect(part).not.toHaveProperty(key);

    const checklist = (await call('get_card', { card: 1, only: ['checklist', 'phase'] })).data;
    expect(checklist.checklistItems).toHaveLength(1);
    expect(checklist.phase).toBeDefined();
    expect(checklist).not.toHaveProperty('comments');
    const tools = (await client.listTools()).tools;
    expect(tools.find((t) => t.name === 'get_card')!.description).toContain('`only`');
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
    expect(asked.text).toContain('segue os padrões do projeto');
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

      expect(() => setMany([card(1).id, card(2).id, card(3).id, card(4).id, 'id-inexistente'], true)).not.toThrow();

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
    const server = createMcpServer({
      getRouter: async () => r,
      getRunner: async () => runner as never,
      workspaceDir: dir,
      version: 'test',
    });
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

describe('biblioteca neutra pelo MCP', () => {
  it('a prévia v1 pelo MCP reutiliza o host sem corpos, credenciais, escrita ou inferência', async () => {
    router.handle({
      type: 'harness.library.save',
      input: { kind: 'agent', name: 'revisor', description: 'Revisor', body: 'instrucoes-privadas' },
    });
    const agent = router.snapshot().harness.library!.artifacts.find((a) => a.name === 'revisor')!;
    router.handle({
      type: 'contextPlanning.save',
      input: {
        kind: 'agent',
        artifactId: agent.id,
        expectedRevision: 0,
        contract: {
          version: 1,
          role: 'papel-privado',
          instructions: 'instrucoes-do-contrato',
          essentialSkillIds: [],
          availableSkillIds: [],
          allowedMcpIds: [],
          tools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
        },
      },
    });
    const target = { cardId: null, workflowId: null, phaseId: '', action: 'work' as const };
    router.handle({
      type: 'contextPlanning.save',
      input: {
        kind: 'activity',
        target,
        expectedRevision: 0,
        selection: {
          version: 1,
          agent: { mode: 'explicit', value: agent.id },
          model: { mode: 'inherit' },
          additionalSkillIds: { mode: 'inherit' },
          activeMcpIds: { mode: 'inherit' },
          inputAttachmentIds: [],
          expectedResult: '',
        },
      },
    });
    const before = changes;
    const expected = router.previewContextDraft(target);
    const result = await call('preview_context_draft', { target });
    expect(result.error).toBe(false);
    expect(result.data).toEqual(expected);
    expect(result.data.agent).toEqual({ artifactId: agent.id, revision: 1 });
    expect(result.data.canExecute).toBe(false);
    expect(result.data.admission).toEqual({ state: 'unavailable', dependency: 729 });
    expect(result.text).not.toContain('instrucoes-privadas');
    expect(result.text).not.toContain('instrucoes-do-contrato');
    expect(result.text).not.toContain('papel-privado');
    expect(changes).toBe(before);
    expect((await client.listTools()).tools.find((t) => t.name === 'preview_context_draft')!.annotations!.readOnlyHint).toBe(true);
  });

  it('a prévia MCP recusa parâmetros extras e explica alvos que não existem', async () => {
    const target = { cardId: null, workflowId: null, phaseId: '', action: 'work' };
    expect((await call('preview_context_draft', { target: { ...target, contract: {} } })).error).toBe(true);
    expect((await call('preview_context_draft', { target: { ...target, action: 'execute' } })).error).toBe(true);
    const result = await call('preview_context_draft', { target: { ...target, cardId: 'ausente' } });
    expect(result.data.diagnostics).toContainEqual({ code: 'invalid-target' });
    expect(result.data.canExecute).toBe(false);
  });

  it('a IA cria e edita artefatos do board sem gravar fontes nativas', async () => {
    const created = await call('save_board_artifact', {
      kind: 'rule',
      name: 'AGENTS.md',
      description: 'Convenções',
      body: 'Use os testes.',
    });
    expect(created.error).toBe(false);
    expect(created.data).toMatchObject({ kind: 'rule', name: 'AGENTS.md', usage: 'off' });
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(false);
    expect((await call('get_board_artifact', { id: created.data.id })).data.body).toBe('Use os testes.');
    expect(
      (
        await call('save_board_artifact', {
          id: created.data.id,
          kind: 'rule',
          name: 'AGENTS.md',
          description: 'Convenções',
          body: 'Use lint e testes.',
        })
      ).error,
    ).toBe(false);
    expect((await call('get_board_artifact', { id: created.data.id })).data.body).toBe('Use lint e testes.');
    expect((await call('get_harness')).data.library.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.data.id })]),
    );
    expect((await call('get_project_profile')).error).toBe(false);
  });

  it('a ponte lista e chama um MCP stdio real e respeita o modo Pelo card', async () => {
    const sdk = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/esm');
    const fixture = path.join(dir, 'fixture.mjs');
    fs.writeFileSync(
      fixture,
      `import { McpServer } from ${JSON.stringify('file://' + sdk + '/server/mcp.js')};
import { StdioServerTransport } from ${JSON.stringify('file://' + sdk + '/server/stdio.js')};
const server = new McpServer({ name: 'fixture', version: '1' });
server.registerTool('ping', { inputSchema: {} }, async () => ({ content: [{ type: 'text', text: process.env.SAMPLE === 'segredo-local' ? 'pong' : 'erro' }] }));
server.registerTool('echo', { inputSchema: {} }, async () => ({ content: [{ type: 'text', text: process.env.SAMPLE }] }));
await server.connect(new StdioServerTransport());`,
    );
    router.handle({
      type: 'harness.library.save',
      input: {
        kind: 'mcp',
        name: 'memoria',
        description: 'Fixture',
        body: '',
        server: { command: process.execPath, args: [fixture], env: { SAMPLE: 'segredo-local' } },
      },
    });
    expect((await call('list_board_mcp_tools', { server: 'memoria' })).error).toBe(true);
    const state = router.snapshot();
    const id = router.createCard({ title: 'Usar memória', typeId: state.cardTypes[0]!.id, columnId: state.columns[0]!.id, parentId: null });
    const field = router.snapshot().fieldDefs.find((f) => f.name === 'MCPs')!;
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field.id, value: ['memoria'] });
    const card = router.snapshot().cards.find((c) => c.id === id)!.number;
    const listed = await call('list_board_mcp_tools', { server: 'memoria', card });
    expect(listed.error).toBe(false);
    expect(listed.data.tools[0].name).toBe('ping');
    const result = await call('call_board_mcp_tool', { server: 'memoria', name: 'ping', arguments: {}, card });
    expect(result.error).toBe(false);
    expect(result.text).toBe('pong');
    const echo = await call('call_board_mcp_tool', { server: 'memoria', name: 'echo', arguments: {}, card });
    expect(echo.error).toBe(false);
    expect(echo.text).toBe('[credencial local]');
    expect(JSON.stringify(router.snapshot())).not.toContain('segredo-local');
    const mcp = router.snapshot().harness.library!.artifacts.find((a) => a.kind === 'mcp')!;
    expect((await call('get_board_artifact', { id: mcp.id })).error).toBe(true);
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'mcp', location: 'board:memoria' }], usage: 'off' });
    expect((await call('call_board_mcp_tool', { server: 'memoria', name: 'ping', arguments: {}, card })).error).toBe(true);
  });
});

describe('ponte HTTP da biblioteca', () => {
  it('conecta por Streamable HTTP, envia cabeçalhos locais e preserva erros MCP remotos', async () => {
    let authorized = false;
    const remote = createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405).end();
        return;
      }
      let body = '';
      for await (const chunk of req) body += String(chunk);
      const message = JSON.parse(body);
      authorized ||= req.headers.authorization === 'Bearer segredo-http';
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      const result =
        message.method === 'initialize'
          ? {
              protocolVersion: message.params.protocolVersion,
              capabilities: { tools: {} },
              serverInfo: { name: 'http-fixture', version: '1' },
            }
          : message.method === 'tools/list'
            ? { tools: [{ name: 'ping', inputSchema: { type: 'object', properties: {} } }] }
            : { isError: true, content: [{ type: 'text', text: 'Falha remota preservada' }] };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    });
    await new Promise<void>((resolve) => remote.listen(0, '127.0.0.1', resolve));
    try {
      const address = remote.address() as { port: number };
      router.handle({
        type: 'harness.library.save',
        input: {
          kind: 'mcp',
          name: 'remoto',
          description: '',
          body: '',
          server: { url: `http://127.0.0.1:${address.port}/mcp`, headers: { Authorization: 'Bearer segredo-http' } },
        },
      });
      router.handle({ type: 'harness.selection.set', items: [{ kind: 'mcp', location: 'board:remoto' }], usage: 'always' });
      const listed = await call('list_board_mcp_tools', { server: 'remoto' });
      expect(listed.error).toBe(false);
      expect(listed.data.tools[0].name).toBe('ping');
      const result = await call('call_board_mcp_tool', { server: 'remoto', name: 'ping', arguments: {} });
      expect(result).toMatchObject({ error: true, text: 'Falha remota preservada' });
      expect(authorized).toBe(true);
      expect(JSON.stringify(router.snapshot())).not.toContain('segredo-http');
    } finally {
      remote.closeAllConnections();
      await new Promise<void>((resolve) => remote.close(() => resolve()));
    }
  });
});

describe('ciclo do card em menos chamadas (#601)', () => {
  const conversation = async (card: string) => (await call('get_card', { card, only: ['conversation'] })).data.comments;

  it('start_work numa sub-tarefa em "A fazer" já a leva para "Em andamento"; numa história, ou fora da primeira coluna, só marca running', async () => {
    const story = (await call('create_card', { title: 'História' })).data;
    const sub = (await call('create_card', { title: 'Sub', parent: story.id })).data;
    const started = (await call('start_work', { card: sub.id })).data;
    expect(started.card).toMatchObject({ id: sub.id, column: 'Em andamento', work: { status: 'running' } });
    // chamar de novo, já em "Em andamento", não muda a coluna
    expect((await call('start_work', { card: sub.id })).data.card.column).toBe('Em andamento');
    // a história fica onde está
    const onStory = (await call('start_work', { card: story.id })).data;
    expect(onStory.card).toMatchObject({ id: story.id, column: 'Backlog', work: { status: 'running' } });
  });

  it('start_work não move a sub-tarefa quando a coluna seguinte do workflow filho não é aberta ou exige aprovação', async () => {
    const story = (await call('create_card', { title: 'História' })).data;
    const a = (await call('create_card', { title: 'A', parent: story.id })).data;
    expect((await call('update_column', { column: 'Em andamento', workflow: 'child', requires_approval: true })).error).toBe(false);
    expect((await call('start_work', { card: a.id })).data.card).toMatchObject({ column: 'A fazer', work: { status: 'running' } });
    await call('update_column', { column: 'Em andamento', workflow: 'child', requires_approval: false, category: 'done' });
    const b = (await call('create_card', { title: 'B', parent: story.id })).data;
    expect((await call('start_work', { card: b.id })).data.card).toMatchObject({ column: 'A fazer', work: { status: 'running' } });
  });

  it('move_card com comment grava a mensagem na conversa, assinada pela IA, só depois do movimento aceito', async () => {
    const story = (await call('create_card', { title: 'História' })).data;
    const sub = (await call('create_card', { title: 'Sub', parent: story.id })).data;
    const moved = await call('move_card', { card: sub.id, column: 'Concluído', comment: 'Feito: arquivo X alterado.' });
    expect(moved.error).toBe(false);
    expect(moved.data.card.column).toBe('Concluído');
    expect(moved.data.hint).toContain('saíram de aberto');
    const after = await conversation(sub.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ body: 'Feito: arquivo X alterado.', from: 'ai' });
    // sem comment, nada entra na conversa
    await call('move_card', { card: sub.id, column: 'A fazer' });
    expect(await conversation(sub.id)).toHaveLength(1);
    // movimento recusado (história com sub-tarefa em aberto rumo à conclusão) não grava o comentário
    const refused = await call('move_card', { card: story.id, column: 'Concluído', comment: 'não deveria entrar' });
    expect(refused.error).toBe(true);
    expect(await conversation(story.id)).toHaveLength(0);
    expect((await call('get_card', { card: story.id })).data.column).toBe('Backlog');
  });

  it('create_card com profile e checklist devolve o card resumido, com os itens criados na ordem', async () => {
    await call('create_agent', { name: 'planejador', description: 'Planeja', content: '# Planejador' });
    const story = (await call('create_card', { title: 'História' })).data;
    const sub = (await call('create_card', { title: 'Sub', parent: story.id, profile: 'planejador', checklist: ['um', 'dois', 'três'] }))
      .data;
    expect(sub).toMatchObject({ id: '#2', title: 'Sub', column: 'A fazer', parent: '#1 História', checklist: '0/3' });
    expect(sub.checklistItems.map((i: any) => i.text)).toEqual(['um', 'dois', 'três']);
    for (const i of sub.checklistItems) expect(i).toMatchObject({ itemId: expect.any(String), done: false });
    // só o resumo: o detalhe vem pelo get_card
    for (const key of ['phase', 'description', 'comments', 'execution', 'model', 'workspace', 'links']) expect(sub).not.toHaveProperty(key);
    expect((await call('get_card', { card: sub.id })).data.execution.profile).toBe('planejador');
    // sem checklist, a resposta não traz checklistItems e cabe em menos de mil caracteres (antes, ~4,7 mil)
    const plain = await call('create_card', { title: 'Outra', parent: story.id, checklist: [] });
    expect(plain.data).not.toHaveProperty('checklistItems');
    expect(JSON.stringify(plain.data).length).toBeLessThan(1000);
  });

  it('create_card com profile desconhecido é recusado antes de criar o card', async () => {
    const bad = await call('create_card', { title: 'x', profile: 'inexistente' });
    expect(bad.error).toBe(true);
    expect(bad.text).toContain('Agente "inexistente" não encontrado');
    expect((await call('list_cards')).data.cards).toEqual([]);
  });

  it('add_checklist_item aceita text, items ou os dois, e recusa a chamada sem nenhum', async () => {
    const card = (await call('create_card', { title: 'H' })).data;
    const many = (await call('add_checklist_item', { card: card.id, items: ['a', 'b', 'c'] })).data;
    expect(many.map((i: any) => i.text)).toEqual(['a', 'b', 'c']);
    const one = (await call('add_checklist_item', { card: card.id, text: 'd' })).data;
    expect(one.map((i: any) => i.text)).toEqual(['a', 'b', 'c', 'd']);
    const both = (await call('add_checklist_item', { card: card.id, text: 'e', items: ['f'] })).data;
    expect(both.map((i: any) => i.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const none = await call('add_checklist_item', { card: card.id });
    expect(none.error).toBe(true);
    expect(none.text).toContain('Informe `text` ou `items`');
  });

  it('as instruções e as descrições ensinam o ciclo novo', async () => {
    expect(MCP_INSTRUCTIONS).toContain('start_work (numa sub-tarefa, já a move para a coluna de andamento)');
    expect(MCP_INSTRUCTIONS).toContain('conclua com move_card e `comment`');
    const tools = (await client.listTools()).tools;
    const desc = (name: string) => tools.find((t) => t.name === name)!.description ?? '';
    expect(desc('start_work')).toContain('já a leva para a coluna seguinte');
    expect(desc('move_card')).toContain('`comment`');
    expect(desc('create_card')).toContain('Devolve o card resumido');
    expect(desc('add_checklist_item')).toContain('`items`');
    expect(desc('set_card_profile')).toContain('Devolve o card resumido');
  });
});
