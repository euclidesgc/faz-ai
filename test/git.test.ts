import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { detectMainBranch, prepareWorkspace } from '../src/extension/git';
import { headlessCommand } from '../src/extension/headless';
import { createMcpServer } from '../src/extension/mcp/server';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BOARD_AUTHOR } from '../src/shared/gitflow';
import { DEFAULT_GIT, LEGACY_BRANCH_PATTERN, branchName, cleanDecisionDir, parseGit, slug } from '../src/shared/git';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let base: string;
/** o clone em que o board trabalha (a pasta do projeto) */
let repo: string;
/** o repositório `--bare` que faz o papel do origin */
let origin: string;
let db: Database;
let router: MessageRouter;
let client: Client;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const identity = (cwd: string) => {
  git(cwd, 'config', 'user.email', 'teste@exemplo.com');
  git(cwd, 'config', 'user.name', 'Teste');
};
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
/** os avisos que o board escreveu na conversa da história */
const notices = (n: number) =>
  router
    .snapshot()
    .comments.filter((c) => c.cardId === card(n).id && c.author === BOARD_AUTHOR && c.source === 'ai')
    .map((c) => c.body);
const rev = (cwd: string, ref: string) => git(cwd, 'rev-parse', '--verify', '--quiet', ref);
const hasRef = (cwd: string, ref: string) => {
  try {
    rev(cwd, ref);
    return true;
  } catch {
    return false;
  }
};
/** cada ref com o commit em que está: o retrato para o RF17 (nada apagado, renomeado nem reescrito) */
const refs = (cwd: string) => git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)').split('\n').filter(Boolean);
/** toda ref de antes continua existindo, no mesmo commit; só pode haver refs novas */
const expectRefsKept = (before: string[], after: string[]) => {
  for (const line of before) expect(after).toContain(line);
};

/**
 * Monta o cenário: um origin `--bare` (com a principal `main` e, por padrão, a `develop`) e um clone
 * dele como pasta do projeto. Sem origin, a pasta do projeto é um repositório solto, como antes.
 */
function setupRepos(opts: { origin?: boolean; develop?: boolean; main?: string } = {}): void {
  const main = opts.main ?? 'main';
  repo = path.join(base, 'projeto');
  origin = path.join(base, 'origin.git');
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(origin, { recursive: true, force: true });
  if (opts.origin === false) {
    fs.mkdirSync(repo);
    git(repo, 'init', '-q', '-b', main);
    identity(repo);
    fs.writeFileSync(path.join(repo, 'README.md'), 'oi');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'inicial');
    return;
  }
  git(base, 'init', '-q', '--bare', '-b', main, origin);
  const seed = path.join(base, 'seed');
  fs.rmSync(seed, { recursive: true, force: true });
  fs.mkdirSync(seed);
  git(seed, 'init', '-q', '-b', main);
  identity(seed);
  fs.writeFileSync(path.join(seed, 'README.md'), 'oi');
  git(seed, 'add', '.');
  git(seed, 'commit', '-q', '-m', 'inicial');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', main);
  if (opts.develop !== false) {
    git(seed, 'branch', 'develop', main);
    git(seed, 'push', '-q', 'origin', 'develop');
  }
  fs.rmSync(seed, { recursive: true, force: true });
  // o clone só tem a principal local; a develop (quando existe) fica em origin/develop, como num clone novo
  git(base, 'clone', '-q', origin, repo);
  identity(repo);
}

async function setupBoard(): Promise<void> {
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(base, 'attachments'),
    workspaceDir: repo,
  });
  const server = createMcpServer({ getRouter: async () => router, getRunner: async () => undefined, workspaceDir: repo, version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
}

/** Refaz os repositórios e o board com outro cenário (o padrão do beforeEach é origin com develop). */
async function reset(opts: Parameters<typeof setupRepos>[0]): Promise<void> {
  setupRepos(opts);
  await setupBoard();
}

beforeEach(async () => {
  // realpath: no macOS a pasta temporária é um link, e o git devolve o caminho resolvido
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-git-')));
  setupRepos();
  await setupBoard();
});

afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('nome da branch', () => {
  it('monta o nome a partir do fluxo, tipo, número e título', () => {
    expect(slug('Login com Google: 2ª tentativa!')).toBe('login-com-google-2-tentativa');
    expect(branchName('{tipo}/{numero}-{titulo}', { type: 'Débito técnico', number: 7, title: 'Atualizar SDK', flow: 'feature/' })).toBe(
      'debito-tecnico/7-atualizar-sdk',
    );
    expect(branchName('feat/{numero}', { type: 'História', number: 3, title: 'x', flow: 'feature/' })).toBe('feat/3');
    expect(branchName('{numero}-{titulo}', { type: 'Bug', number: 9, title: '???', flow: 'hotfix/' })).toBe('9-sem-titulo');
    // sem o número o padrão é recusado
    expect(parseGit(JSON.stringify({ branchPattern: '{titulo}', mode: 'nada' }))).toMatchObject({
      branchPattern: '{fluxo}{numero}-{titulo}',
      mode: 'worktree',
    });
  });

  it('{fluxo} recebe o prefixo como veio, com ou sem a barra', () => {
    expect(branchName(DEFAULT_GIT.branchPattern, { type: 'História', number: 462, title: 'Adotar gitflow', flow: 'feature/' })).toBe(
      'feature/462-adotar-gitflow',
    );
    expect(branchName(DEFAULT_GIT.branchPattern, { type: 'Bug', number: 5, title: 'Erro', flow: 'hotfix/' })).toBe('hotfix/5-erro');
    expect(branchName(DEFAULT_GIT.branchPattern, { type: 'História', number: 5, title: 'Erro', flow: 'feat-' })).toBe('feat-5-erro');
    // sem prefixo o nome não começa com barra nem hífen
    expect(branchName(DEFAULT_GIT.branchPattern, { type: 'História', number: 5, title: 'Erro', flow: '' })).toBe('5-erro');
  });
});

describe('parseGit', () => {
  it('ignora as chaves da antiga detecção de merges, que agora acontece em cada rodada do heartbeat', () => {
    const git = parseGit(JSON.stringify({ mode: 'branch', watchMerges: false, watchMergeMinutes: 30 }));
    expect(git).toEqual({ ...DEFAULT_GIT, mode: 'branch' });
  });

  it('gitflow ausente vale ligado, também em board antigo; só false desliga', () => {
    expect(parseGit('{}').gitflow).toBe(true);
    expect(parseGit(null).gitflow).toBe(true);
    expect(parseGit(JSON.stringify({ gitflow: 'não' })).gitflow).toBe(true);
    expect(parseGit(JSON.stringify({ gitflow: false })).gitflow).toBe(false);
    expect(parseGit('{}')).toMatchObject({
      developBranch: 'develop',
      featurePrefix: 'feature/',
      bugfixPrefix: 'bugfix/',
      hotfixPrefix: 'hotfix/',
      releasePrefix: 'release/',
    });
  });

  it('prefixo ou develop vazio ou inválido volta ao padrão; válido é mantido mesmo sem a barra', () => {
    expect(parseGit(JSON.stringify({ featurePrefix: '' })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: '   ' })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: 'feat ure/' })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: '/feat/' })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: 'feat..ure/' })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: 'a//b/' })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: 'a@{b/' })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: '-feat/' })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: 12 })).featurePrefix).toBe('feature/');
    expect(parseGit(JSON.stringify({ featurePrefix: 'feat-' })).featurePrefix).toBe('feat-');
    expect(parseGit(JSON.stringify({ bugfixPrefix: 'fix/', hotfixPrefix: 'hot/', releasePrefix: 'rel/' }))).toMatchObject({
      bugfixPrefix: 'fix/',
      hotfixPrefix: 'hot/',
      releasePrefix: 'rel/',
    });
    // a develop é um nome de branch: não termina em barra
    expect(parseGit(JSON.stringify({ developBranch: 'dev' })).developBranch).toBe('dev');
    expect(parseGit(JSON.stringify({ developBranch: 'dev/' })).developBranch).toBe('develop');
    expect(parseGit(JSON.stringify({ developBranch: '' })).developBranch).toBe('develop');
    expect(parseGit(JSON.stringify({ developBranch: 'a b' })).developBranch).toBe('develop');
  });

  it('converte o padrão de fábrica antigo no novo e mantém um padrão personalizado', () => {
    expect(LEGACY_BRANCH_PATTERN).toBe('{tipo}/{numero}-{titulo}');
    expect(parseGit(JSON.stringify({ branchPattern: LEGACY_BRANCH_PATTERN })).branchPattern).toBe('{fluxo}{numero}-{titulo}');
    expect(parseGit(JSON.stringify({ branchPattern: 'feat/{numero}' })).branchPattern).toBe('feat/{numero}');
    expect(parseGit(JSON.stringify({ branchPattern: '{tipo}/{numero}' })).branchPattern).toBe('{tipo}/{numero}');
  });
});

describe('pasta dos registros de decisão', () => {
  it('desligada por padrão; fica relativa, com barras normais e sem barra nas pontas', () => {
    expect(DEFAULT_GIT.decisionRecords).toBe('');
    expect(parseGit('{}').decisionRecords).toBe('');
    expect(parseGit(JSON.stringify({ decisionRecords: ' ./docs\\decisoes/ ' })).decisionRecords).toBe('docs/decisoes');
  });

  it('fora do repositório não vale: caminho que sobe de pasta ou com letra de unidade', () => {
    for (const dir of ['../fora', 'docs/../../fora', 'C:/docs', 3, null]) expect(cleanDecisionDir(dir)).toBe('');
    expect(cleanDecisionDir('/docs/adr')).toBe('docs/adr');
  });
});

describe('branch e worktree por história', () => {
  it('cria a worktree da história com a branch nova, sem tocar na pasta do projeto', async () => {
    await call('create_card', { title: 'Login com Google', column: 'Implementação' });
    expect((await call('get_card', { card: 1 })).data.workspaceNote).toContain('prepare_workspace');

    const ws = (await call('prepare_workspace', { card: 1 })).data;
    const dir = path.join(base, 'projeto.worktrees', '1-login-com-google');
    expect(ws).toMatchObject({ branch: 'feature/1-login-com-google', path: dir, baseBranch: 'develop', prBase: 'develop' });
    expect(ws.note).toContain(dir);
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feature/1-login-com-google');
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main'); // a pasta do projeto continua onde estava
    expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true);
    expect(card(1)).toMatchObject({ branch: 'feature/1-login-com-google', worktreePath: dir, baseBranch: 'develop' });
    // a branch nova não rastreia a develop: um `git push` sem -u não iria parar nela
    expect(() => git(repo, 'config', '--get', 'branch.feature/1-login-com-google.remote')).toThrow();
    // com origin e develop no lugar, nada a avisar
    expect(notices(1)).toEqual([]);

    // chamar de novo, mesmo depois de renomear a história, reaproveita a mesma branch e pasta
    await call('update_card', { card: 1, title: 'Outro título' });
    expect((await call('prepare_workspace', { card: 1 })).data).toMatchObject({ branch: ws.branch, path: dir, baseBranch: 'develop' });
    expect(git(repo, 'worktree', 'list').split('\n')).toHaveLength(2);

    // a sub-tarefa usa a branch e a pasta da história
    await call('create_card', { title: 'Tela', parent: 1 });
    expect((await call('get_card', { card: 2 })).data.workspace).toMatchObject({ branch: ws.branch, path: dir, prBase: 'develop' });
    expect((await call('prepare_workspace', { card: 2 })).data.path).toBe(dir);
    expect(card(2).branch).toBe('');
  });

  it('RF11: a branch parte da develop como está no origin, mesmo com a local atrasada', async () => {
    // outro clone avança a develop no origin; o projeto só vai saber pelo fetch
    const other = path.join(base, 'outro');
    git(base, 'clone', '-q', origin, other);
    identity(other);
    git(other, 'switch', '-q', '-c', 'develop', 'origin/develop');
    fs.writeFileSync(path.join(other, 'novo.txt'), 'de outro clone');
    git(other, 'add', '.');
    git(other, 'commit', '-q', '-m', 'na develop');
    git(other, 'push', '-q', 'origin', 'develop');
    const tip = rev(other, 'develop');
    expect(rev(repo, 'origin/develop')).not.toBe(tip);

    await call('create_card', { title: 'Com rede', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(rev(repo, 'origin/develop')).toBe(tip);
    expect(() => git(repo, 'merge-base', '--is-ancestor', 'origin/develop', ws.branch)).not.toThrow();
    expect(fs.existsSync(path.join(ws.path, 'novo.txt'))).toBe(true);
    expect(notices(1)).toEqual([]);
  });

  it('RF11 sem rede: cria a branch do que já está nesta máquina e avisa na conversa', async () => {
    const before = refs(repo);
    git(repo, 'remote', 'set-url', 'origin', path.join(base, 'nao-existe.git'));
    await call('create_card', { title: 'Sem rede', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(ws).toMatchObject({ branch: 'feature/1-sem-rede', baseBranch: 'develop' });
    expect(rev(repo, ws.branch)).toBe(rev(repo, 'origin/develop'));
    const msgs = notices(1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('Não foi possível atualizar as refs do origin antes de criar a branch feature/1-sem-rede');
    expect(msgs[0]).toContain('partiu de develop');
    expectRefsKept(before, refs(repo));
  });

  it('RF11 sem origin: a branch parte da base local e a conversa diz isso', async () => {
    await reset({ origin: false });
    git(repo, 'branch', 'develop', 'main');
    await call('create_card', { title: 'Solto', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(ws).toMatchObject({ branch: 'feature/1-solto', baseBranch: 'develop' });
    expect(notices(1)).toEqual(['O repositório não tem origin: a branch feature/1-solto partiu de develop como está nesta máquina.']);
  });

  it('RF12: História parte de origin/develop e Bug de origin/main, nos modos worktree e branch; desligado recusa', async () => {
    // a principal do origin anda para o Bug enxergar a diferença entre as bases
    const other = path.join(base, 'outro');
    git(base, 'clone', '-q', origin, other);
    identity(other);
    git(other, 'commit', '-q', '--allow-empty', '-m', 'na main');
    git(other, 'push', '-q', 'origin', 'main');
    const originMain = rev(other, 'main');
    const originDevelop = rev(other, 'origin/develop');
    expect(originMain).not.toBe(originDevelop);

    await call('create_card', { title: 'Nova tela', column: 'Implementação' });
    await call('create_card', { title: 'Corrigir crash', type: 'Bug', column: 'Implementação' });
    const story = (await call('prepare_workspace', { card: 1 })).data;
    const bug = (await call('prepare_workspace', { card: 2 })).data;
    expect(story).toMatchObject({ branch: 'feature/1-nova-tela', baseBranch: 'develop', prBase: 'develop' });
    expect(bug).toMatchObject({ branch: 'hotfix/2-corrigir-crash', baseBranch: 'main', prBase: 'main' });
    expect(rev(repo, story.branch)).toBe(originDevelop);
    expect(rev(repo, bug.branch)).toBe(originMain);
    expect(card(2).baseBranch).toBe('main');

    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch' } } });
    await call('create_card', { title: 'Outra tela', column: 'Implementação' });
    await call('create_card', { title: 'Outro crash', type: 'Bug', column: 'Implementação' });
    const story2 = (await call('prepare_workspace', { card: 3 })).data;
    const bug2 = (await call('prepare_workspace', { card: 4 })).data;
    expect(story2).toMatchObject({ branch: 'feature/3-outra-tela', path: repo, baseBranch: 'develop' });
    expect(bug2).toMatchObject({ branch: 'hotfix/4-outro-crash', path: repo, baseBranch: 'main' });
    expect(rev(repo, story2.branch)).toBe(originDevelop);
    expect(rev(repo, bug2.branch)).toBe(originMain);
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');

    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    await call('create_card', { title: 'Parada', column: 'Implementação' });
    const off = await call('prepare_workspace', { card: 5 });
    expect(off.error).toBe(true);
    expect(off.text).toContain('desligada');
  });

  it('RF13: sem develop em lugar nenhum, o board a cria a partir da principal e a envia ao origin', async () => {
    await reset({ develop: false });
    const before = refs(repo);
    const beforeOrigin = refs(origin);
    await call('create_card', { title: 'Primeira', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(ws).toMatchObject({ branch: 'feature/1-primeira', baseBranch: 'develop' });
    expect(rev(repo, 'develop')).toBe(rev(repo, 'origin/main'));
    expect(rev(origin, 'develop')).toBe(rev(repo, 'develop'));
    expect(rev(repo, ws.branch)).toBe(rev(repo, 'origin/develop'));
    expect(notices(1)).toEqual(['A branch develop não existia: o board a criou a partir de main e a enviou ao origin.']);
    expectRefsKept(before, refs(repo));
    expectRefsKept(beforeOrigin, refs(origin));

    // a segunda história não cria nem avisa de novo
    await call('create_card', { title: 'Segunda', column: 'Implementação' });
    await call('prepare_workspace', { card: 2 });
    expect(notices(2)).toEqual([]);
  });

  it('RF13: push da develop recusado pelo origin: ela fica local, a história segue e o aviso traz o comando', async () => {
    await reset({ develop: false });
    const hook = path.join(origin, 'hooks', 'pre-receive');
    fs.writeFileSync(hook, '#!/bin/sh\necho "branch protegida" >&2\nexit 1\n', { mode: 0o755 });
    const beforeOrigin = refs(origin);
    await call('create_card', { title: 'Primeira', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(ws).toMatchObject({ branch: 'feature/1-primeira', baseBranch: 'develop' });
    expect(hasRef(repo, 'refs/heads/develop')).toBe(true);
    expect(hasRef(origin, 'refs/heads/develop')).toBe(false);
    expect(rev(repo, ws.branch)).toBe(rev(repo, 'develop'));
    const msgs = notices(1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('A branch develop não existia: o board a criou a partir de main, mas não conseguiu enviá-la ao origin');
    expect(msgs[0]).toContain('branch protegida');
    expect(msgs[0]).toContain('git push -u origin develop');
    expect(refs(origin)).toEqual(beforeOrigin);
  });

  it('RF14: develop só no origin: a branch parte de origin/develop e nenhuma develop local é criada', async () => {
    expect(hasRef(repo, 'refs/heads/develop')).toBe(false);
    await call('create_card', { title: 'Sem develop local', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(rev(repo, ws.branch)).toBe(rev(repo, 'origin/develop'));
    expect(hasRef(repo, 'refs/heads/develop')).toBe(false);
    expect(notices(1)).toEqual([]);
  });

  it('develop só nesta máquina, com origin: é a base, e o aviso pede para enviá-la', async () => {
    await reset({ develop: false });
    git(repo, 'branch', 'develop', 'main');
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'na main local');
    const beforeOrigin = refs(origin);
    await call('create_card', { title: 'Local', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(rev(repo, ws.branch)).toBe(rev(repo, 'develop'));
    expect(hasRef(origin, 'refs/heads/develop')).toBe(false);
    expect(notices(1)).toEqual([
      'A branch develop existe só nesta máquina: o pull request para ela só abre depois de enviá-la ao origin (git push -u origin develop).',
    ]);
    expect(refs(origin)).toEqual(beforeOrigin);
  });

  it('RF02: com o gitflow desligado a branch parte da principal, com o nome de antes, e não há develop', async () => {
    await reset({ develop: false });
    router.handle({ type: 'settings.board.update', patch: { git: { gitflow: false } } });
    await call('create_card', { title: 'Login com Google', column: 'Implementação' });
    await call('create_card', { title: 'Crash', type: 'Bug', column: 'Implementação' });
    const story = (await call('prepare_workspace', { card: 1 })).data;
    const bug = (await call('prepare_workspace', { card: 2 })).data;
    expect(story).toMatchObject({ branch: 'historia/1-login-com-google', baseBranch: 'main', prBase: 'main' });
    expect(bug).toMatchObject({ branch: 'bug/2-crash', baseBranch: 'main' });
    expect(rev(repo, story.branch)).toBe(rev(repo, 'origin/main'));
    expect(hasRef(repo, 'refs/heads/develop')).toBe(false);
    expect(hasRef(origin, 'refs/heads/develop')).toBe(false);
    expect(notices(1)).toEqual([]);
  });

  it('RF03: a develop pode ter outro nome', async () => {
    await reset({ develop: false });
    router.handle({ type: 'settings.board.update', patch: { git: { developBranch: 'dev' } } });
    await call('create_card', { title: 'Com dev', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(ws).toMatchObject({ baseBranch: 'dev', prBase: 'dev' });
    expect(hasRef(origin, 'refs/heads/dev')).toBe(true);
    expect(hasRef(repo, 'refs/heads/develop')).toBe(false);
    expect(rev(repo, ws.branch)).toBe(rev(repo, 'origin/dev'));
    expect(notices(1)).toEqual(['A branch dev não existia: o board a criou a partir de main e a enviou ao origin.']);
  });

  it('RF04, RF05, RF07: o prefixo configurado e o tipo de branch de cada tipo de card decidem o nome', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { featurePrefix: 'feat/' } } });
    const s = router.snapshot();
    const story = s.cardTypes.find((t) => t.name === 'História')!;
    router.handle({ type: 'settings.type.create', name: 'Spike', color: '#123456', defaultWorkflowId: story.defaultWorkflowId });
    await call('create_card', { title: 'Tela', column: 'Implementação' });
    await call('create_card', { title: 'Ajuste', type: 'Retrabalho', column: 'Implementação' });
    await call('create_card', { title: 'SDK', type: 'Débito técnico', column: 'Implementação' });
    await call('create_card', { title: 'Estudo', type: 'Spike', column: 'Implementação' });
    await call('create_card', { title: 'Estudo 2', type: 'Spike', column: 'Implementação' });
    expect((await call('prepare_workspace', { card: 1 })).data).toMatchObject({ branch: 'feat/1-tela', baseBranch: 'develop' });
    expect((await call('prepare_workspace', { card: 2 })).data).toMatchObject({ branch: 'bugfix/2-ajuste', baseBranch: 'develop' });
    expect((await call('prepare_workspace', { card: 3 })).data).toMatchObject({ branch: 'feat/3-sdk', baseBranch: 'develop' });
    // tipo criado nasce feature
    expect((await call('prepare_workspace', { card: 4 })).data).toMatchObject({ branch: 'feat/4-estudo', baseBranch: 'develop' });
    // trocado para bugfix, as histórias novas desse tipo seguem o novo prefixo; a que já tem branch não muda
    const spike = router.snapshot().cardTypes.find((t) => t.name === 'Spike')!;
    router.handle({ type: 'settings.type.update', typeId: spike.id, patch: { branchKind: 'bugfix' } });
    expect((await call('prepare_workspace', { card: 5 })).data).toMatchObject({ branch: 'bugfix/5-estudo-2', baseBranch: 'develop' });
    expect((await call('prepare_workspace', { card: 4 })).data.branch).toBe('feat/4-estudo');
  });

  it('RF06: Bug renomeado continua gerando hotfix a partir da principal', async () => {
    const bug = router.snapshot().cardTypes.find((t) => t.name === 'Bug')!;
    router.handle({ type: 'settings.type.update', typeId: bug.id, patch: { name: 'Defeito' } });
    await call('create_card', { title: 'Crash', type: 'Defeito', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(ws).toMatchObject({ branch: 'hotfix/1-crash', baseBranch: 'main', prBase: 'main' });
    expect(rev(repo, ws.branch)).toBe(rev(repo, 'origin/main'));
  });

  it('RF15: histórias em modo autônomo se empilham: cada branch parte da anterior', async () => {
    const yolo = (n: number) => router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled: true });
    await call('create_card', { title: 'Base', column: 'Implementação' });
    await call('create_card', { title: 'Segunda', column: 'Implementação' });
    await call('create_card', { title: 'Terceira', column: 'Implementação' });
    await call('create_card', { title: 'Fora da pilha', column: 'Implementação' });
    yolo(1);
    yolo(2);
    yolo(3);

    // a primeira parte da base do fluxo (a develop)
    const first = (await call('prepare_workspace', { card: 1 })).data;
    expect(first).toMatchObject({ baseBranch: 'develop', prBase: 'develop' });
    expect(first.stackNote).toBeUndefined();
    expect(card(1).branchCreatedAt).not.toBe('');
    const dir1 = first.path;
    fs.writeFileSync(path.join(dir1, 'base.txt'), 'da primeira');
    git(dir1, 'add', '.');
    git(dir1, 'commit', '-q', '-m', 'primeira');

    // a segunda parte da branch da primeira e enxerga o trabalho dela
    const second = (await call('prepare_workspace', { card: 2 })).data;
    expect(second).toMatchObject({ baseBranch: first.branch, prBase: first.branch });
    expect(second.stackNote).toContain(first.branch);
    expect(fs.readFileSync(path.join(second.path, 'base.txt'), 'utf8')).toBe('da primeira');
    expect(card(2).baseBranch).toBe(first.branch);
    identity(second.path);
    git(second.path, 'commit', '-q', '--allow-empty', '-m', 'segunda');

    // a terceira se apoia na segunda; chamar de novo mantém a base e o momento de criação da branch
    const secondCreatedAt = card(2).branchCreatedAt;
    expect(secondCreatedAt).not.toBe('');
    expect((await call('prepare_workspace', { card: 3 })).data.baseBranch).toBe(second.branch);
    expect((await call('prepare_workspace', { card: 2 })).data.baseBranch).toBe(first.branch);
    expect(card(2).branchCreatedAt).toBe(secondCreatedAt);

    // quem não está em modo autônomo parte da base do fluxo
    const outside = (await call('prepare_workspace', { card: 4 })).data;
    expect(outside.baseBranch).toBe('develop');
    expect(() => git(repo, 'merge-base', '--is-ancestor', 'origin/develop', outside.branch)).not.toThrow();
  });

  it('RF15: a anterior da pilha que só existe no origin também vale', async () => {
    const yolo = (n: number) => router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled: true });
    await call('create_card', { title: 'Base', column: 'Implementação' });
    await call('create_card', { title: 'Segunda', column: 'Implementação' });
    yolo(1);
    yolo(2);
    const first = (await call('prepare_workspace', { card: 1 })).data;
    git(first.path, 'commit', '-q', '--allow-empty', '-m', 'primeira');
    git(first.path, 'push', '-q', '-u', 'origin', first.branch);
    const tip = rev(repo, first.branch);
    // a branch local some (worktree e branch), mas o origin a tem
    git(repo, 'worktree', 'remove', '--force', first.path);
    git(repo, 'branch', '-D', first.branch);
    const second = (await call('prepare_workspace', { card: 2 })).data;
    expect(second.baseBranch).toBe(first.branch);
    expect(rev(repo, second.branch)).toBe(tip);
  });

  it('sem história pulada não registra nada na conversa', async () => {
    const yolo = (n: number) => router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled: true });
    await call('create_card', { title: 'Base', column: 'Implementação' });
    await call('create_card', { title: 'Segunda', column: 'Implementação' });
    yolo(1);
    yolo(2);

    await call('prepare_workspace', { card: 1 });
    await call('prepare_workspace', { card: 2 });

    expect(router.snapshot().comments.filter((c) => c.cardId === card(2).id && c.source === 'ai')).toHaveLength(0);
    expect(router.snapshot().comments.filter((c) => c.cardId === card(1).id && c.source === 'ai')).toHaveLength(0);
  });

  it('RF16: história anterior ao gitflow (base vazia) tem o pull request para a principal e é recriada a partir dela', async () => {
    await call('create_card', { title: 'Antiga', column: 'Implementação' });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    db.run("UPDATE cards SET base_branch = '' WHERE id = ?", [card(1).id]);
    expect((await call('get_card', { card: 1 })).data.workspace).toMatchObject({ branch: ws.branch, baseBranch: 'main', prBase: 'main' });
    // chamar de novo não muda a base gravada
    await call('prepare_workspace', { card: 1 });
    expect(card(1).baseBranch).toBe('');
    // a branch apagada à mão volta a partir da principal
    git(repo, 'worktree', 'remove', '--force', ws.path);
    git(repo, 'branch', '-D', ws.branch);
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'main andou');
    git(repo, 'push', '-q', 'origin', 'main');
    const again = (await call('prepare_workspace', { card: 1 })).data;
    expect(again.branch).toBe(ws.branch);
    expect(rev(repo, ws.branch)).toBe(rev(repo, 'origin/main'));
    expect(card(1).baseBranch).toBe('');
  });

  it('RF17: criar branches não apaga, renomeia nem reescreve nenhuma ref local ou do origin', async () => {
    git(repo, 'switch', '-q', '-c', 'develop', 'origin/develop');
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'develop local à frente');
    git(repo, 'switch', '-q', 'main');
    git(repo, 'tag', 'v1');
    const before = refs(repo);
    const beforeOrigin = refs(origin);
    await call('create_card', { title: 'Tela', column: 'Implementação' });
    await call('create_card', { title: 'Crash', type: 'Bug', column: 'Implementação' });
    await call('prepare_workspace', { card: 1 });
    await call('prepare_workspace', { card: 2 });
    const after = refs(repo);
    expectRefsKept(before, after);
    expect(refs(origin)).toEqual(beforeOrigin);
    // só entraram as duas branches das histórias
    expect(after.filter((l) => !before.includes(l)).map((l) => l.split(' ')[0])).toEqual([
      'refs/heads/feature/1-tela',
      'refs/heads/hotfix/2-crash',
    ]);
  });

  it('a principal detectada entra no snapshot e a tela pode pedir para detectar de novo', () => {
    expect(router.snapshot().mainBranch).toEqual({ name: 'main', source: 'origin' });
    git(repo, 'remote', 'set-head', 'origin', '-d');
    git(repo, 'branch', '-m', 'main', 'trunk');
    expect(router.snapshot().mainBranch).toEqual({ name: 'main', source: 'origin' }); // em cache
    expect(router.handle({ type: 'git.main.refresh' }).mainBranch).toEqual({ name: 'main', source: 'name' }); // origin/main ainda existe
  });

  it('modo branch cria a branch sem trocar a atual; desligado recusa', async () => {
    await call('create_card', { title: 'Corrigir crash', type: 'Bug', column: 'Implementação' });
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch', branchPattern: 'fix/{numero}-{titulo}' } } });
    const ws = (await call('prepare_workspace', { card: 1 })).data;
    expect(ws).toMatchObject({ branch: 'fix/1-corrigir-crash', path: repo, baseBranch: 'main' });
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

  it('fora do worktree, recusa a fase de texto enquanto outra história usa a pasta', async () => {
    await call('create_card', { title: 'Um', column: 'Implementação' });
    await call('create_card', { title: 'Dois', column: 'Discovery' });
    await call('create_card', { title: 'Tres', column: 'Implementação' });
    const run = [
      {
        cardId: card(1).id,
        runId: '',
        mode: 'phase' as const,
        origin: 'manual' as const,
        phase: 'Implementação',
        model: null,
        startedAt: 0,
      },
    ];
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch' } } });
    router.setAiRuns(run);
    const blocked = await call('prepare_workspace', { card: 2 });
    expect(blocked.error).toBe(true);
    expect(blocked.text).toContain('#1');
    expect(blocked.text).toContain('#2 está em Discovery');
    // fase de código não é barrada
    expect((await call('prepare_workspace', { card: 3 })).error).toBe(false);
    // pasta livre
    router.setAiRuns([]);
    expect((await call('prepare_workspace', { card: 2 })).error).toBe(false);
    // modo worktree não tem a guarda
    router.setAiRuns(run);
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree' } } });
    expect((await call('prepare_workspace', { card: 2 })).error).toBe(false);
  });

  it('board aberto antes do git init: o prepare detecta a principal de novo em vez de usar a do cache', async () => {
    fs.rmSync(path.join(repo, '.git'), { recursive: true, force: true });
    expect(router.snapshot().mainBranch).toBeNull(); // o cache guarda "sem repositório"
    git(repo, 'init', '-q', '-b', 'main');
    identity(repo);
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'inicial');

    await call('create_card', { title: 'Tela', column: 'Implementação' });
    await call('create_card', { title: 'Crash', type: 'Bug', column: 'Implementação' });
    const story = await call('prepare_workspace', { card: 1 });
    expect(story.error).toBe(false);
    // sem develop em lugar nenhum, ela nasce da principal recém-detectada
    expect(story.data).toMatchObject({ branch: 'feature/1-tela', baseBranch: 'develop' });
    expect(rev(repo, 'develop')).toBe(rev(repo, 'main'));
    const bug = await call('prepare_workspace', { card: 2 });
    expect(bug.error).toBe(false);
    expect(bug.data).toMatchObject({ branch: 'hotfix/2-crash', baseBranch: 'main' });
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
      args: [
        '-p',
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        'mcp__faz-ai__*',
        'Read',
        'Glob',
        'Grep',
        '--add-dir',
        root,
        '--setting-sources',
        '',
        '--disable-slash-commands',
      ],
    });
    expect(headlessCommand('cursor', { prompt: 'P', permission: 'board', addDirs: [root] })).toMatchObject({
      args: ['-p', '--force', '--approve-mcps', '--trust', '--allowed-tools', expect.any(String), '--add-dir', root],
    });
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch' } } });
    expect(router.aiWorkDirs()).toEqual([]);
  });
});

describe('detectMainBranch (RF09, sem rede)', () => {
  const fresh = (name: string, branch: string): string => {
    const dir = path.join(base, name);
    fs.mkdirSync(dir);
    git(dir, 'init', '-q', '-b', branch);
    identity(dir);
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'inicial');
    return dir;
  };

  it('o HEAD do origin vem primeiro, seja qual for o nome', () => {
    const bare = path.join(base, 'trunk.git');
    git(base, 'init', '-q', '--bare', '-b', 'trunk', bare);
    const seed = fresh('seed-trunk', 'trunk');
    git(seed, 'branch', 'main');
    git(seed, 'remote', 'add', 'origin', bare);
    git(seed, 'push', '-q', 'origin', 'trunk', 'main');
    const clone = path.join(base, 'clone-trunk');
    git(base, 'clone', '-q', bare, clone);
    expect(detectMainBranch(clone)).toEqual({ name: 'trunk', source: 'origin' });
    // numa subpasta do repositório também
    fs.mkdirSync(path.join(clone, 'sub'));
    expect(detectMainBranch(path.join(clone, 'sub'))).toEqual({ name: 'trunk', source: 'origin' });
    // a pasta do projeto dos testes: clone com origin/HEAD = main
    expect(detectMainBranch(repo)).toEqual({ name: 'main', source: 'origin' });
  });

  it('sem origin/HEAD, main ou master pelo nome (local ou já baixada do origin); senão a branch atual', () => {
    expect(detectMainBranch(fresh('so-master', 'master'))).toEqual({ name: 'master', source: 'name' });
    const feat = fresh('so-feat', 'feat');
    expect(detectMainBranch(feat)).toEqual({ name: 'feat', source: 'current' });
    // remote adicionado à mão, sem origin/HEAD: a main só existe em origin/main
    const clone = path.join(base, 'clone-sem-head');
    git(base, 'clone', '-q', origin, clone);
    git(clone, 'remote', 'set-head', 'origin', '-d');
    git(clone, 'switch', '-q', '-c', 'trabalho');
    git(clone, 'branch', '-D', 'main');
    expect(detectMainBranch(clone)).toEqual({ name: 'main', source: 'name' });
  });

  it('fora de um repositório devolve null; repositório sem commit cai na branch atual', () => {
    const plain = path.join(base, 'plain');
    fs.mkdirSync(plain);
    expect(detectMainBranch(plain)).toBeNull();
    expect(detectMainBranch(path.join(base, 'nao-existe'))).toBeNull();
    const empty = path.join(base, 'vazio');
    fs.mkdirSync(empty);
    git(empty, 'init', '-q', '-b', 'main');
    expect(detectMainBranch(empty)).toEqual({ name: 'main', source: 'current' });
  });

  it('prepareWorkspace recusa a base que não existe e não precisa de pilha nem de develop', () => {
    expect(() => prepareWorkspace({ projectDir: repo, mode: 'branch', branch: 'x/1', worktreePath: '', base: 'nao-existe' })).toThrow(
      'nao-existe não existe',
    );
    const ws = prepareWorkspace({ projectDir: repo, mode: 'branch', branch: 'x/1', worktreePath: '', base: 'main' });
    expect(ws).toMatchObject({ branch: 'x/1', path: repo, base: 'main', notices: [] });
    expect(rev(repo, 'x/1')).toBe(rev(repo, 'origin/main'));
  });
});
