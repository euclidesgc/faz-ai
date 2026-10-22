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
  it('regra: modo inicial por origem, edição mantém o modo, renomear e nome repetido', () => {
    lib().saveRule('estilo', 'a', { via: 'manual' });
    lib().saveRule('revisao', 'b', { via: 'wizard' });
    lib().saveRule('ia', 'c', { via: 'ai' });
    expect([get('rule', 'estilo')!.usage, get('rule', 'revisao')!.usage, get('rule', 'ia')!.usage]).toEqual(['contextual', 'off', 'off']);
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

  it('skill: cria "Pelo card", edita mantendo o modo e os arquivos, renomeia e recusa nome repetido', () => {
    lib().saveSkill('deploy', '---\nname: deploy\ndescription: Faz deploy\n---\nCorpo', { via: 'manual' });
    expect(get('skill', 'deploy')).toMatchObject({ usage: 'contextual', description: 'Faz deploy' });
    lib().writeSkillFile('deploy', 'ref/a.md', 'apoio');
    lib().repo.setUsage(ctx.boardId, get('skill', 'deploy')!.id, 'always');
    lib().saveSkill('deploy', '---\nname: deploy\ndescription: Novo\n---\nC2', { via: 'manual' });
    expect(get('skill', 'deploy')).toMatchObject({ usage: 'always', description: 'Novo', files: ['ref/a.md'] });
    lib().saveSkill('publicar', '---\nname: deploy\ndescription: Novo\n---\nC2', { previous: 'deploy', via: 'manual' });
    expect(get('skill', 'deploy')).toBeUndefined();
    const renamed = get('skill', 'publicar')!;
    expect(renamed).toMatchObject({ usage: 'always', files: ['ref/a.md'] });
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
    expect(() => lib().select(sel('padrao'), null)).toThrow('Escolha outro agente padrão antes de apagar este');
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
