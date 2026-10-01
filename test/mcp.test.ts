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
    expect((await call('get_harness')).data.ruleFiles.map((r: any) => [r.name, r.exists])).toEqual([['CLAUDE.md', false], ['AGENTS.md', false], ['GEMINI.md', false]]);
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
    expect(card.model).toContain('Claude Haiku 4.5');

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
    const board = (await call('update_card_type', { type: 'Sub-tarefa', default_fields: { Modelo: 'claude sonnet 5.5', Fase: 'Implementação' } })).data;
    expect(board.cardTypes.find((t: any) => t.name === 'Sub-tarefa').defaultFields).toEqual({ Modelo: 'Claude Sonnet 5.5', Fase: 'Implementação' });
    await call('create_card', { title: 'História' });
    const sub = (await call('create_card', { title: 'Tarefa', parent: 1, fields: { Fase: 'Spec' } })).data;
    expect(sub.fields).toEqual({ Modelo: 'Claude Sonnet 5.5', Fase: 'Spec' }); // o valor informado vence o padrão
    expect((await call('get_card', { card: 1 })).data.fields).toBeUndefined();

    const fresh = (await call('reset_board')).data;
    expect(fresh.workflows[0].columns.every((c: any) => c.cards === 0)).toBe(true);
    expect(fresh.cardTypes.find((t: any) => t.name === 'Sub-tarefa').defaultFields).toBeUndefined();
    expect((await call('create_card', { title: 'Nova' })).data.id).toBe('#1');
  });
});

describe('ferramentas de IA', () => {
  const skillMd = (base: string) => path.join(dir, base, 'revisar-spec', 'SKILL.md');
  const isLink = (p: string) => fs.lstatSync(p).isSymbolicLink();

  it('grava as skills onde cada ferramenta lê', async () => {
    // padrão: as quatro ferramentas → principal em .claude/skills com atalho em .agents/skills (Codex)
    await call('create_skill', { name: 'revisar-spec', description: 'd', content: 'c' });
    expect(fs.existsSync(skillMd('.claude/skills'))).toBe(true);
    expect(isLink(path.join(dir, '.agents/skills/revisar-spec'))).toBe(true);
    expect(fs.readFileSync(skillMd('.agents/skills'), 'utf8')).toContain('name: revisar-spec');
    expect((await call('get_harness')).data.skills).toHaveLength(1); // o atalho não conta em dobro

    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: false });
    expect(fs.existsSync(path.join(dir, '.agents/skills/revisar-spec'))).toBe(false);
    expect(fs.existsSync(skillMd('.claude/skills-disabled'))).toBe(true);
    await call('set_skill_enabled', { skill: 'revisar-spec', enabled: true });
    expect(isLink(path.join(dir, '.agents/skills/revisar-spec'))).toBe(true);

    // sem Codex o atalho some; sem Claude as skills novas vão para .agents/skills
    await call('set_ai_tools', { tools: ['claude', 'cursor'] });
    expect(fs.existsSync(path.join(dir, '.agents/skills/revisar-spec'))).toBe(false);
    const h = (await call('set_ai_tools', { tools: ['codex', 'kimi'] })).data;
    expect(h.aiTools).toEqual(['codex', 'kimi']);
    expect(h.skills.map((k: any) => k.name)).toEqual(['revisar-spec']); // a que já existia continua visível
    await call('create_skill', { name: 'outra', description: 'd', content: 'c' });
    expect(fs.existsSync(path.join(dir, '.agents/skills/outra/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.claude/skills/outra'))).toBe(false);
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
