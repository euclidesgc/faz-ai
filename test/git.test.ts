import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { headlessCommand } from '../src/extension/headless';
import { createMcpServer } from '../src/extension/mcp/server';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { branchName, parseGit, slug } from '../src/shared/git';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let base: string;
let repo: string;
let router: MessageRouter;
let client: Client;

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* texto simples */
  }
  return { error: res.isError === true, text, data };
};
const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;

beforeEach(async () => {
  // realpath: no macOS a pasta temporária é um link, e o git devolve o caminho resolvido
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-git-')));
  repo = path.join(base, 'projeto');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'teste@exemplo.com');
  git(repo, 'config', 'user.name', 'Teste');
  fs.writeFileSync(path.join(repo, 'README.md'), 'oi');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'inicial');

  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(base, 'attachments'),
    workspaceDir: repo,
  });
  const server = createMcpServer({ getRouter: async () => router, workspaceDir: repo, version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
});

afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('nome da branch', () => {
  it('monta o nome a partir do tipo, número e título', () => {
    expect(slug('Login com Google: 2ª tentativa!')).toBe('login-com-google-2-tentativa');
    expect(branchName('{tipo}/{numero}-{titulo}', { type: 'Débito técnico', number: 7, title: 'Atualizar SDK' })).toBe(
      'debito-tecnico/7-atualizar-sdk',
    );
    expect(branchName('feat/{numero}', { type: 'História', number: 3, title: 'x' })).toBe('feat/3');
    expect(branchName('{numero}-{titulo}', { type: 'Bug', number: 9, title: '???' })).toBe('9-sem-titulo');
    // sem o número o padrão é recusado
    expect(parseGit(JSON.stringify({ branchPattern: '{titulo}', mode: 'nada' }))).toMatchObject({
      branchPattern: '{tipo}/{numero}-{titulo}',
      mode: 'worktree',
    });
  });
});

describe('parseGit', () => {
  it('retorna valores padrão para JSON vazio', () => {
    expect(parseGit('{}')).toMatchObject({
      watchMerges: true,
      watchMergeMinutes: 15,
    });
  });

  it('limita watchMergeMinutes ao range [5, 1440]', () => {
    expect(parseGit(JSON.stringify({ watchMergeMinutes: 2 }))).toMatchObject({ watchMergeMinutes: 5 });
    expect(parseGit(JSON.stringify({ watchMergeMinutes: 9999 }))).toMatchObject({ watchMergeMinutes: 1440 });
  });

  it('usa o padrão para watchMergeMinutes inválido (string, 0, ausente)', () => {
    expect(parseGit(JSON.stringify({ watchMergeMinutes: 'abc' }))).toMatchObject({ watchMergeMinutes: 15 });
    expect(parseGit(JSON.stringify({ watchMergeMinutes: 0 }))).toMatchObject({ watchMergeMinutes: 15 });
    expect(parseGit('{}')).toMatchObject({ watchMergeMinutes: 15 });
  });

  it('preserva watchMerges: true para git_json antigo de board (sem as chaves novas)', () => {
    expect(parseGit(JSON.stringify({ mode: 'worktree', branchPattern: '{tipo}/{numero}-{titulo}', autoMerge: true })))
      .toMatchObject({ watchMerges: true });
  });

  it('respeita watchMerges: false', () => {
    expect(parseGit(JSON.stringify({ watchMerges: false }))).toMatchObject({ watchMerges: false });
  });
});

describe('branch e worktree por história', () => {
  it('cria a worktree da história com a branch nova, sem tocar na pasta do projeto', async () => {
    await call('create_card', { title: 'Login com Google', column: 'Implementação' });
    expect((await call('get_card', { card: 1 })).data.workspaceNote).toContain('prepare_workspace');

    const ws = (await call('prepare_workspace', { card: 1 })).data;
    const dir = path.join(base, 'projeto.worktrees', '1-login-com-google');
    expect(ws).toMatchObject({ branch: 'historia/1-login-com-google', path: dir });
    expect(ws.note).toContain(dir);
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('historia/1-login-com-google');
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main'); // a pasta do projeto continua onde estava
    expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
    expect(card(1)).toMatchObject({ branch: 'historia/1-login-com-google', worktreePath: dir });

    // chamar de novo, mesmo depois de renomear a história, reaproveita a mesma branch e pasta
    await call('update_card', { card: 1, title: 'Outro título' });
    expect((await call('prepare_workspace', { card: 1 })).data).toMatchObject({ branch: ws.branch, path: dir });
    expect(git(repo, 'worktree', 'list').split('\n')).toHaveLength(2);

    // a sub-tarefa usa a branch e a pasta da história
    await call('create_card', { title: 'Tela', parent: 1 });
    expect((await call('get_card', { card: 2 })).data.workspace).toMatchObject({ branch: ws.branch, path: dir });
    expect((await call('prepare_workspace', { card: 2 })).data.path).toBe(dir);
    expect(card(2).branch).toBe('');
  });

  it('histórias em modo autônomo se empilham: cada branch parte da anterior', async () => {
    const yolo = (n: number) => router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled: true });
    await call('create_card', { title: 'Base', column: 'Implementação' });
    await call('create_card', { title: 'Segunda', column: 'Implementação' });
    await call('create_card', { title: 'Terceira', column: 'Implementação' });
    await call('create_card', { title: 'Fora da pilha', column: 'Implementação' });
    yolo(1);
    yolo(2);
    yolo(3);

    // a primeira parte da principal
    const first = (await call('prepare_workspace', { card: 1 })).data;
    expect(first.baseBranch).toBeUndefined();
    const dir1 = first.path;
    fs.writeFileSync(path.join(dir1, 'base.txt'), 'da primeira');
    git(dir1, 'add', '.');
    git(dir1, 'commit', '-q', '-m', 'primeira');

    // a segunda parte da branch da primeira e enxerga o trabalho dela
    const second = (await call('prepare_workspace', { card: 2 })).data;
    expect(second.baseBranch).toBe(first.branch);
    expect(second.stackNote).toContain(`--base ${first.branch}`);
    expect(fs.readFileSync(path.join(second.path, 'base.txt'), 'utf8')).toBe('da primeira');
    expect(card(2).baseBranch).toBe(first.branch);
    git(second.path, 'config', 'user.email', 'teste@exemplo.com');
    git(second.path, 'config', 'user.name', 'Teste');
    git(second.path, 'commit', '-q', '--allow-empty', '-m', 'segunda');

    // a terceira se apoia na segunda; chamar de novo mantém a base escolhida
    expect((await call('prepare_workspace', { card: 3 })).data.baseBranch).toBe(second.branch);
    expect((await call('prepare_workspace', { card: 2 })).data.baseBranch).toBe(first.branch);

    // quem não está em modo autônomo parte da principal
    const outside = (await call('prepare_workspace', { card: 4 })).data;
    expect(outside.baseBranch).toBeUndefined();
    expect(() => git(repo, 'merge-base', '--is-ancestor', 'main', outside.branch)).not.toThrow();
  });

  it('modo branch cria a branch sem trocar a atual; desligado recusa', async () => {
    await call('create_card', { title: 'Corrigir crash', type: 'Bug', column: 'Implementação' });
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch', branchPattern: 'fix/{numero}-{titulo}' } } });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(ws).toMatchObject({ branch: 'fix/1-corrigir-crash', path: repo });
    expect(ws.note).toContain('git switch');
    expect(git(repo, 'branch', '--list', 'fix/1-corrigir-crash')).toContain('fix/1-corrigir-crash');
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');

    await call('create_card', { title: 'Outra', column: 'Implementação' });
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    const off = await call('prepare_workspace', { card: 2 });
    expect(off.error).toBe(true);
    expect(off.text).toContain('desligada');
    expect((await call('get_card', { card: 2 })).data.workspaceNote).toBeUndefined();
  });

  it('explica quando a pasta não é um repositório git', async () => {
    fs.rmSync(path.join(repo, '.git'), { recursive: true, force: true });
    await call('create_card', { title: 'X', column: 'Implementação' });
    expect((await call('prepare_workspace', { card: 1 })).text).toContain('não é um repositório git');
  });

  it('a execução da IA recebe a pasta das worktrees como pasta de trabalho extra', () => {
    const root = path.join(base, 'projeto.worktrees');
    expect(router.aiWorkDirs()).toEqual([root]);
    expect(fs.existsSync(root)).toBe(true);
    expect(headlessCommand('claude', { prompt: 'P', permission: 'edits', addDirs: [root] })).toMatchObject({
      args: ['-p', '--permission-mode', 'acceptEdits', '--allowedTools', 'mcp__faz-ai__*', '--add-dir', root],
    });
    expect(headlessCommand('copilot', { prompt: 'P', permission: 'board', addDirs: [root] })).toMatchObject({
      args: ['-p', 'P', '--allow-tool=faz-ai', '--allow-tool=read', `--add-dir=${root}`, '--no-ask-user'],
    });
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch' } } });
    expect(router.aiWorkDirs()).toEqual([]);
  });
});
