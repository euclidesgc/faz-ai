import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openInMemory, type DbHandle } from '../src/extension/db/database';
import { BoardContext } from '../src/extension/panel/handlers/context';
import type { McpServerInput } from '../src/shared/harnessCatalog';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
let root: string;
let handle: DbHandle;
let ctx: BoardContext;
const lib = () => ctx.library;
const get = (kind: 'rule' | 'skill' | 'agent' | 'mcp', name: string) => lib().repo.get(ctx.boardId, kind, name);
const stdio = (over: Partial<McpServerInput> = {}): McpServerInput => ({
  name: 'x',
  transport: 'stdio',
  command: 'memoria',
  args: ['--a'],
  env: { TOKEN: 'segredo-1' },
  url: '',
  headers: {},
  ...over,
});

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-save-'));
  for (const d of ['project', 'home', 'data/attachments']) fs.mkdirSync(path.join(root, d), { recursive: true });
  const db = await openInMemory(WASM_DIR);
  handle = { db, scheduleSave: () => {}, close: async () => db.close() } as DbHandle;
  ctx = new BoardContext(handle, {
    workspaceKey: 'save-test',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'data/attachments'),
    workspaceDir: path.join(root, 'project'),
    homeDir: path.join(root, 'home'),
  });
});
afterEach(async () => {
  await handle.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('BoardLibrary: gravar regra, skill e MCP no board', () => {
  it('regra: nasce inativa em qualquer origem, edição mantém o modo, renomear e nome repetido', () => {
    lib().saveRule('estilo', 'a', { via: 'manual' });
    lib().saveRule('revisao', 'b', { via: 'wizard' });
    lib().saveRule('ia', 'c', { via: 'ai' });
    expect([get('rule', 'estilo')!.usage, get('rule', 'revisao')!.usage, get('rule', 'ia')!.usage]).toEqual(['off', 'off', 'off']);
    const id = get('rule', 'revisao')!.id;
    lib().saveRule('revisao', 'b2', { via: 'manual' });
    expect(get('rule', 'revisao')).toMatchObject({ id, usage: 'off', body: 'b2' });
    lib().saveRule('revisao-2.md', 'b2', { previous: 'revisao', via: 'manual' });
    expect(get('rule', 'revisao')).toBeUndefined();
    expect(get('rule', 'revisao-2.md')).toMatchObject({ usage: 'off' });
    expect(() => lib().saveRule('estilo', 'x', { previous: 'ia', via: 'manual' })).toThrow(/Já existe/);
    expect(() => lib().saveRule('estilo', 'x', { via: 'manual' })).not.toThrow();
    expect(() => lib().saveRule('Nome Ruim', 'x', { via: 'manual' })).toThrow(/inválido/);
    expect(lib().content('rule', 'estilo')).toEqual({ text: 'x' });
  });

  it('skill: cria ativa (vinculável), edita mantendo o estado e os arquivos, renomeia e recusa nome repetido', () => {
    lib().saveSkill('deploy', '---\nname: deploy\ndescription: Faz deploy\n---\nCorpo', { via: 'manual' });
    expect(get('skill', 'deploy')).toMatchObject({ usage: 'contextual', description: 'Faz deploy' });
    lib().writeSkillFile('deploy', 'ref/a.md', 'apoio');
    lib().repo.setUsage(ctx.boardId, get('skill', 'deploy')!.id, 'off');
    lib().saveSkill('deploy', '---\nname: deploy\ndescription: Novo\n---\nC2', { via: 'manual' });
    expect(get('skill', 'deploy')).toMatchObject({ usage: 'off', description: 'Novo', files: ['ref/a.md'] });
    lib().saveSkill('publicar', '---\nname: deploy\ndescription: Novo\n---\nC2', { previous: 'deploy', via: 'manual' });
    expect(get('skill', 'deploy')).toBeUndefined();
    const renamed = get('skill', 'publicar')!;
    expect(renamed).toMatchObject({ usage: 'off', files: ['ref/a.md'] });
    expect(lib().content('skill', 'publicar').text).toContain('name: "publicar"');
    expect(lib().content('skill', 'publicar', 'ref/a.md')).toEqual({ text: 'apoio' });
    lib().saveSkill('outra', 'x', { via: 'manual' });
    expect(() => lib().saveSkill('outra', 'x', { previous: 'publicar', via: 'manual' })).toThrow(/Já existe/);
    lib().saveSkill('publicar', 'x', { via: 'manual', files: [] });
    expect(get('skill', 'publicar')!.files).toEqual([]);
  });

  it('mcp: cria, mantém segredos com keepSecrets e o conteúdo não devolve valores', () => {
    lib().saveMcp('memoria', stdio(), { keepSecrets: [] });
    expect(get('mcp', 'memoria')).toMatchObject({ usage: 'contextual' });
    lib().saveMcp('memoria', stdio({ args: ['--b'], env: { TOKEN: '' } }), { keepSecrets: ['TOKEN'] });
    expect(lib().mcpDefinitions().memoria).toMatchObject({ command: 'memoria', args: ['--b'], env: { TOKEN: 'segredo-1' } });
    lib().saveMcp('memoria', stdio({ env: { TOKEN: 'segredo-novo-xyz' } }), { keepSecrets: ['TOKEN'] });
    expect(lib().mcpDefinitions().memoria).toMatchObject({ env: { TOKEN: 'segredo-novo-xyz' } });
    const view = lib().content('mcp', 'memoria').server!;
    expect(JSON.stringify(view)).not.toContain('segredo-novo-xyz');
    expect(view).toMatchObject({ transport: 'stdio', command: 'memoria', env: { TOKEN: '' } });
    expect(JSON.stringify(ctx.state())).not.toContain('segredo-novo-xyz');
    lib().saveMcp('remoto', stdio({ transport: 'http', command: '', url: 'https://x.dev/mcp', headers: { Authorization: 'Bearer z' } }), {
      keepSecrets: [],
    });
    lib().saveMcp('remoto2', stdio({ transport: 'http', command: '', url: 'https://x.dev/mcp', headers: { Authorization: '' } }), {
      previous: 'remoto',
      keepSecrets: ['Authorization'],
    });
    expect(get('mcp', 'remoto')).toBeUndefined();
    expect(lib().mcpDefinitions().remoto2).toMatchObject({ headers: { Authorization: 'Bearer z' } });
    expect(() => lib().saveMcp('memoria', stdio(), { previous: 'remoto2', keepSecrets: [] })).toThrow(/Já existe/);
    expect(() => lib().saveMcp('faz-ai', stdio(), { keepSecrets: [] })).toThrow(/reservado/);
    expect(() => lib().saveMcp('nome ruim', stdio(), { keepSecrets: [] })).toThrow(/inválido/);
  });

  it('arquivos de apoio: dentro e acima de cada limite', () => {
    lib().saveSkill('s', '---\nname: s\n---\n', { via: 'manual' });
    lib().writeSkillFile('s', 'ok.txt', 'a'.repeat(512 * 1024));
    expect(() => lib().writeSkillFile('s', 'grande.txt', 'a'.repeat(512 * 1024 + 1))).toThrow('Arquivo maior que 512 KB.');
    expect(() => lib().writeSkillFile('s', 'bin.dat', Buffer.alloc(512 * 1024 + 1).toString('base64'), 'base64')).toThrow(/512 KB/);
    lib().writeSkillFile('s', 'bin.dat', Buffer.from([0, 1, 2]).toString('base64'), 'base64');
    expect(() => lib().writeSkillFile('s', '../fora', 'x')).toThrow(/inválido/);
    lib().deleteSkillFile('s', 'bin.dat');
    for (let i = 0; i < 98; i++) lib().writeSkillFile('s', `f${i}.txt`, 'x');
    expect(get('skill', 's')!.files).toHaveLength(99);
    lib().writeSkillFile('s', 'ultimo.txt', 'x');
    expect(() => lib().writeSkillFile('s', 'cem-e-um.txt', 'x')).toThrow(/100/);
    lib().writeSkillFile('s', 'ultimo.txt', 'y'); // substituir não conta de novo
    lib().deleteSkillFile('s', 'ultimo.txt');
    expect(() => lib().deleteSkillFile('s', 'ultimo.txt')).toThrow(/não encontrado/);
  });

  it('limite de 5 MB no total', () => {
    lib().saveSkill('t', '---\nname: t\n---\n', { via: 'manual' });
    for (let i = 0; i < 9; i++) lib().writeSkillFile('t', `b${i}.txt`, 'a'.repeat(512 * 1024));
    lib().writeSkillFile('t', 'b9.txt', 'a'.repeat(512 * 1024 - 100));
    expect(() => lib().writeSkillFile('t', 'b10.txt', 'a'.repeat(1024))).toThrow(/5 MB/);
  });

  it('apagar recusa o agente padrão e a skill do fluxo, sem apagar nada', () => {
    lib().createAgent({ name: 'padrao', description: 'd', body: 'b', model: '', tools: [], deniedTools: [], skills: [], mcp: [] } as never);
    lib().createAgent({ name: 'outro', description: 'd', body: 'b', model: '', tools: [], deniedTools: [], skills: [], mcp: [] } as never);
    ctx.boards.updateBoard(ctx.boardId, { runner: { defaultAgent: 'padrao' } });
    const sel = (name: string) => [{ kind: 'agent' as const, location: `board:${name}` }];
    expect(() => lib().select(sel('padrao'), null)).toThrow('Escolha outro agente padrão das instruções antes de apagar este');
    expect(get('agent', 'padrao')).toBeDefined();
    lib().select(sel('outro'), null);
    expect(get('agent', 'outro')).toBeUndefined();
    lib().repo.upsert(ctx.boardId, {
      kind: 'skill',
      name: 'faz-ai-fluxo',
      description: '',
      body: 'x',
      meta: { generated: true },
      origin: '',
      originTool: '',
      missing: false,
      skipped: [],
      files: [],
    });
    expect(() => lib().select([{ kind: 'skill', location: 'board:faz-ai-fluxo' }], null)).toThrow(/do fluxo/);
    expect(() => lib().writeSkillFile('faz-ai-fluxo', 'a.md', 'x')).toThrow(/do fluxo/);
    expect(get('skill', 'faz-ai-fluxo')).toBeDefined();
  });

  it('nada é criado em .claude, .cursor, .kimi-code nem no home; a cópia de leitura é gravada fora do projeto', () => {
    lib().saveRule('r', 'x', { via: 'manual' });
    lib().saveSkill('s', '---\nname: s\n---\n', { via: 'manual' });
    lib().writeSkillFile('s', 'a.md', 'x');
    lib().saveMcp('m', stdio(), { keepSecrets: [] });
    expect(fs.readdirSync(path.join(root, 'project'))).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'home')).filter((n) => /^\.(claude|cursor|kimi-code)/.test(n))).toEqual([]);
    const mirrored = lib()
      .materialize()
      .find((a) => a.name === 's')!;
    expect(fs.existsSync(path.join(path.dirname(mirrored.path), 'a.md'))).toBe(true);
    expect(mirrored.path.startsWith(path.join(root, 'project'))).toBe(false);
  });
});

describe('BoardLibrary.saveArtifact: ativo/inativo, versão, pasta e tools', () => {
  const save = (over: Record<string, unknown>) =>
    lib().saveArtifact({ kind: 'skill', name: 'deploy', description: 'Faz deploy', body: 'Corpo', ...over } as never);

  it('ao criar, active define o modo pelo tipo: regra ativa em todo pedido, skill e agente pelo card, inativa fora de tudo', () => {
    save({ kind: 'rule', name: 'r-ativa', active: true });
    save({ kind: 'rule', name: 'r-inativa', active: false });
    save({ kind: 'rule', name: 'r-padrao' });
    save({ name: 's-ativa', active: true });
    save({ name: 's-inativa', active: false });
    save({ kind: 'agent', name: 'a-ativo', active: true });
    save({ kind: 'agent', name: 'a-inativo', active: false });
    const usage = (kind: 'rule' | 'skill' | 'agent', name: string) => get(kind, name)!.usage;
    expect([usage('rule', 'r-ativa'), usage('rule', 'r-inativa'), usage('rule', 'r-padrao')]).toEqual(['always', 'off', 'off']);
    expect([usage('skill', 's-ativa'), usage('skill', 's-inativa')]).toEqual(['contextual', 'off']);
    expect([usage('agent', 'a-ativo'), usage('agent', 'a-inativo')]).toEqual(['contextual', 'off']);
  });

  it('editar não muda o modo, mesmo com active no pedido', () => {
    save({ kind: 'rule', name: 'r', active: true });
    const id = get('rule', 'r')!.id;
    save({ id, kind: 'rule', name: 'r', body: 'novo', active: false });
    expect(get('rule', 'r')).toMatchObject({ usage: 'always', body: 'novo' });
    save({ name: 's', active: false });
    save({ id: get('skill', 's')!.id, name: 's', active: true });
    expect(get('skill', 's')!.usage).toBe('off');
  });

  it('grava versão, pasta e tools da skill; delegate sai; o padrão de versão é do tipo', () => {
    save({ version: '1.2.0', folder: '/frontend/react/', tools: ['shell', 'read', 'delegate', 'read'] });
    expect(get('skill', 'deploy')).toMatchObject({ version: '1.2.0', folder: 'frontend/react', tools: ['read', 'shell'] });
    save({ kind: 'rule', name: 'r.md', version: '3' });
    expect(get('rule', 'r.md')!.version).toBe('3');
    save({ kind: 'rule', name: 'r2.md' });
    save({ name: 'outra' });
    expect([get('rule', 'r2.md')!.version, get('skill', 'outra')!.version]).toEqual(['1', '1.0.0']);
    expect(lib().skillFolders()).toEqual(['frontend', 'frontend/react']);
  });

  it('recusa versão, pasta e tool inválidas sem gravar nada', () => {
    expect(() => save({ version: '1.0' })).toThrow(/Versão inválida/);
    expect(() => save({ kind: 'agent', name: 'a', version: 'v1' })).toThrow(/Versão inválida/);
    expect(() => save({ kind: 'rule', name: 'r', version: 'com espaço' })).toThrow(/Versão inválida/);
    expect(() => save({ folder: 'Frontend' })).toThrow(/pasta inválido/);
    expect(() => save({ folder: 'a//b' })).toThrow(/pasta inválido/);
    expect(() => save({ folder: '../fora' })).toThrow(/pasta inválido/);
    expect(() => save({ tools: ['read', 'rm-rf'] })).toThrow(/Tools inválidas/);
    expect(() => save({ tools: 'read' })).toThrow(/Tools inválidas/);
    expect(get('skill', 'deploy')).toBeUndefined();
    expect(get('rule', 'r')).toBeUndefined();
  });

  it('o agente guarda as categorias derivadas das tools e limpa a lista nativa da origem', () => {
    save({
      kind: 'agent',
      name: 'dev',
      tools: ['read', 'search', 'shell', 'delegate'],
      agent: {
        skills: [],
        mcpServers: [],
        model: '',
        tools: { categories: ['edit'], native: { tool: 'claude', allow: ['Read', 'Bash'], deny: ['Write'] } },
      },
    });
    const row = get('agent', 'dev')!;
    expect(row.tools).toEqual(['read', 'search', 'shell', 'delegate']);
    expect(row.agent!.tools).toEqual({ categories: ['read', 'run', 'agents'], native: { tool: '', allow: [], deny: [] } });
  });

  it('sem tools no pedido, o agente mantém as categorias e a lista nativa como vieram', () => {
    const agent = {
      skills: [],
      mcpServers: [],
      model: '',
      tools: { categories: ['read'], native: { tool: 'claude', allow: ['Read'], deny: [] } },
    };
    save({ kind: 'agent', name: 'dev', agent });
    expect(get('agent', 'dev')!.agent!.tools).toEqual(agent.tools);
    // a derivação continua: categorias read viram read e search
    expect(get('agent', 'dev')!.tools).toEqual(['read', 'search']);
  });

  it('addSkillFolder valida o caminho, aceita níveis e não duplica', () => {
    lib().addSkillFolder(' /docs/guias/ ');
    lib().addSkillFolder('docs/guias');
    expect(lib().skillFolders()).toEqual(['docs', 'docs/guias']);
    for (const bad of ['', '  ', 'Docs', 'a b', 'a//b', '../x', 'a_b']) expect(() => lib().addSkillFolder(bad)).toThrow(/pasta inválido/);
    expect(lib().skillFolders()).toEqual(['docs', 'docs/guias']);
  });
});
