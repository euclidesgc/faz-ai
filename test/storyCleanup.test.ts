import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer } from '../src/extension/mcp/server';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import {
  cleanUpStory,
  parsePullRequestFacts,
  pendingWork,
  updateDevelop,
  type CleanupDeps,
  type PullRequestFacts,
} from '../src/extension/storyCleanup';
import { BOARD_AUTHOR } from '../src/shared/gitflow';
import type { Card } from '../src/shared/model';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const PR = 'https://github.com/acme/app/pull/7';

let base: string;
/** o clone em que o board trabalha (a pasta do projeto) */
let repo: string;
/** o repositório `--bare` que faz o papel do origin */
let origin: string;
let db: Database;
let router: MessageRouter;
let client: Client;
let log: string[];
let deps: CleanupDeps;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const identity = (cwd: string) => {
  git(cwd, 'config', 'user.email', 'teste@exemplo.com');
  git(cwd, 'config', 'user.name', 'Teste');
};
/** o `git` assíncrono, como o do boardHost: resolve com a saída, rejeita com o stderr */
const gitAsync = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 30_000 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout),
    );
  });
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
/** os comentários que o board escreveu na conversa da história */
const notices = (n: number) =>
  router
    .snapshot()
    .comments.filter((c) => c.cardId === card(n).id && c.author === BOARD_AUTHOR && c.source === 'ai')
    .map((c) => c.body);
/** as linhas do (único) relatório de limpeza */
const report = (n: number) => {
  const all = notices(n).filter((b) => b.startsWith('Limpeza da história depois do merge:'));
  expect(all).toHaveLength(1);
  return all[0]!.split('\n').slice(1);
};
const rev = (cwd: string, ref: string) => git(cwd, 'rev-parse', '--verify', '--quiet', ref);
const hasRef = (cwd: string, ref: string) => {
  try {
    rev(cwd, ref);
    return true;
  } catch {
    return false;
  }
};
const remoteHas = (branch: string) => git(repo, 'ls-remote', '--heads', 'origin', branch) !== '';
const worktrees = () =>
  git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '));
const commit = (cwd: string, file: string, content: string, msg = 'mudança') => {
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', msg);
};
const prFacts = (branch: string, over: Partial<PullRequestFacts> = {}): PullRequestFacts => ({
  url: PR,
  state: 'MERGED',
  mergedAt: '2026-10-13T00:00:00Z',
  mergeCommit: '',
  baseRefName: 'develop',
  headRefName: branch,
  headRefOid: rev(repo, branch),
  ...over,
});

/**
 * Faz na develop do origin o que o GitHub faz num merge squash: um commit só com a árvore da branch.
 * Devolve o sha desse commit.
 */
function squashMergeOnOrigin(branch: string): string {
  const other = path.join(base, 'outro');
  fs.rmSync(other, { recursive: true, force: true });
  git(base, 'clone', '-q', origin, other);
  identity(other);
  git(other, 'switch', '-q', '-c', 'develop', 'origin/develop');
  git(other, 'merge', '--squash', `origin/${branch}`);
  git(other, 'commit', '-q', '-m', `squash de ${branch}`);
  git(other, 'push', '-q', 'origin', 'develop');
  const sha = rev(other, 'HEAD');
  fs.rmSync(other, { recursive: true, force: true });
  return sha;
}

/** Cria a história, a worktree dela, um commit e o push; devolve a história com a branch e a pasta. */
async function storyWithWork(title = 'Login'): Promise<Card> {
  await call('create_card', { title, column: 'Implementação' });
  const n = router.snapshot().cards.length;
  await call('prepare_workspace', { card: n });
  const c = card(n);
  commit(c.worktreePath, 'a.ts', 'export {};');
  git(c.worktreePath, 'push', '-q', '-u', 'origin', c.branch);
  return card(n);
}

function setupRepos(): void {
  repo = path.join(base, 'projeto');
  origin = path.join(base, 'origin.git');
  git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(base, 'seed');
  fs.mkdirSync(seed);
  git(seed, 'init', '-q', '-b', 'main');
  identity(seed);
  fs.writeFileSync(path.join(seed, 'README.md'), 'oi');
  git(seed, 'add', '.');
  git(seed, 'commit', '-q', '-m', 'inicial');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main');
  git(seed, 'branch', 'develop', 'main');
  git(seed, 'push', '-q', 'origin', 'develop');
  fs.rmSync(seed, { recursive: true, force: true });
  git(base, 'clone', '-q', origin, repo);
  identity(repo);
  git(repo, 'remote', 'set-head', 'origin', 'main');
  // a develop local existe (atrás ou não do origin), como numa máquina que já trabalhou nela
  git(repo, 'branch', 'develop', 'origin/develop');
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
  log = [];
  deps = {
    git: gitAsync,
    gh: async () => '',
    log: (l) => log.push(l),
    cwd: repo,
    sleep: async () => {},
  };
}

beforeEach(async () => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-cleanup-')));
  setupRepos();
  await setupBoard();
});

afterEach(() => {
  db.close();
  fs.rmSync(base, { recursive: true, force: true });
});

describe('parsePullRequestFacts', () => {
  it('lê os campos do gh e completa os ausentes com vazio', () => {
    const out = JSON.stringify({
      state: 'MERGED',
      mergedAt: '2026-10-13T00:00:00Z',
      mergeCommit: { oid: 'abc' },
      baseRefName: 'develop',
      headRefName: 'feature/1-x',
      headRefOid: 'def',
    });
    expect(parsePullRequestFacts(out, PR)).toEqual({
      url: PR,
      state: 'MERGED',
      mergedAt: '2026-10-13T00:00:00Z',
      mergeCommit: 'abc',
      baseRefName: 'develop',
      headRefName: 'feature/1-x',
      headRefOid: 'def',
    });
    expect(parsePullRequestFacts(JSON.stringify({ state: 'OPEN', mergedAt: null, mergeCommit: null }), PR)).toEqual({
      url: PR,
      state: 'OPEN',
      mergedAt: null,
      mergeCommit: '',
      baseRefName: '',
      headRefName: '',
      headRefOid: '',
    });
  });

  it('formato inesperado lança, como o parsePullRequest de merge.ts', () => {
    expect(() => parsePullRequestFacts('', PR)).toThrow('resposta inesperada do gh: (vazia)');
    expect(() => parsePullRequestFacts('não é json', PR)).toThrow('resposta inesperada do gh');
    expect(() => parsePullRequestFacts(JSON.stringify({ mergedAt: null }), PR)).toThrow('resposta inesperada do gh');
  });
});

describe('limpeza depois do merge', () => {
  it('RF1–RF4: remove a worktree, apaga as branches local e remota e atualiza a develop sem trocar a branch da pasta do projeto', async () => {
    const story = await storyWithWork();
    const dir = path.join(base, 'projeto.worktrees', '1-login');
    expect(story.worktreePath).toBe(dir);
    const sha = squashMergeOnOrigin(story.branch);
    expect(worktrees()).toHaveLength(2);

    await cleanUpStory(router, deps, story, prFacts(story.branch));

    expect(worktrees()).toHaveLength(1);
    expect(fs.existsSync(dir)).toBe(false);
    expect(card(1).worktreePath).toBe('');
    expect(card(1).branch).toBe(story.branch); // a branch fica registrada no card
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(false);
    expect(remoteHas(story.branch)).toBe(false);
    expect(rev(repo, 'develop')).toBe(sha);
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(report(1)).toEqual([
      `- pasta de trabalho ${dir} removida`,
      `- branch local ${story.branch} apagada`,
      `- branch remota origin/${story.branch} apagada`,
      '- develop local atualizada até origin/develop',
    ]);
    expect(notices(1)).toHaveLength(1);
  });

  it('RF3: branch remota já apagada pelo GitHub: registra que já não existia, sem aviso', async () => {
    const story = await storyWithWork();
    squashMergeOnOrigin(story.branch);
    git(repo, 'push', '-q', 'origin', '--delete', story.branch);
    await cleanUpStory(router, deps, story, prFacts(story.branch));
    expect(report(1)).toContain(`- branch remota origin/${story.branch} já tinha sido apagada`);
    expect(report(1).some((l) => l.includes('**Aviso:**'))).toBe(false);
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(false);
  });

  it('RF8: outras branches do repositório não são tocadas, nem a principal nem a develop', async () => {
    const story = await storyWithWork();
    git(repo, 'branch', 'outra', 'main');
    git(repo, 'push', '-q', 'origin', 'outra');
    squashMergeOnOrigin(story.branch);
    await cleanUpStory(router, deps, story, prFacts(story.branch));
    expect(hasRef(repo, 'refs/heads/outra')).toBe(true);
    expect(remoteHas('outra')).toBe(true);
    expect(hasRef(repo, 'refs/heads/main')).toBe(true);
    expect(remoteHas('main')).toBe(true);
    expect(remoteHas('develop')).toBe(true);
  });

  it('RF8: nunca apaga a principal nem a develop, mesmo com o PR vindo delas', async () => {
    await storyWithWork();
    for (const branch of ['main', 'develop']) {
      await cleanUpStory(router, deps, { ...card(1), branch }, prFacts(branch));
      expect(hasRef(repo, `refs/heads/${branch}`)).toBe(true);
      expect(remoteHas(branch)).toBe(true);
    }
    const bodies = notices(1);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain(
      `**Aviso:** A limpeza não apagou nada: o pull request ${PR} é da branch main, e a branch registrada no card é main.`,
    );
  });

  it('RF8: PR de outra branch: não apaga nada e avisa', async () => {
    const story = await storyWithWork();
    squashMergeOnOrigin(story.branch);
    await cleanUpStory(router, deps, story, prFacts(story.branch, { headRefName: 'feature/99-outra' }));
    expect(worktrees()).toHaveLength(2);
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(true);
    expect(remoteHas(story.branch)).toBe(true);
    expect(report(1)[0]).toBe(
      `- **Aviso:** A limpeza não apagou nada: o pull request ${PR} é da branch feature/99-outra, e a branch registrada no card é ${story.branch}.`,
    );
    // a develop é atualizada mesmo assim: o merge aconteceu
    expect(report(1)).toContain('- develop local atualizada até origin/develop');
  });

  it('RF8: PR ainda não mesclado: nada é apagado e nada vai para a conversa além do relatório da develop', async () => {
    const story = await storyWithWork();
    await cleanUpStory(router, deps, story, prFacts(story.branch, { state: 'OPEN', mergedAt: null }));
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(true);
    expect(remoteHas(story.branch)).toBe(true);
    expect(report(1)).toEqual(['- develop local já estava atualizada']);
    expect(log.some((l) => l.includes('não está mesclado'))).toBe(true);
  });

  it('RF6: worktree com arquivo modificado: não apaga worktree nem branches, avisa com o caminho e o arquivo e cita a limpeza de órfãs', async () => {
    const story = await storyWithWork();
    squashMergeOnOrigin(story.branch);
    fs.writeFileSync(path.join(story.worktreePath, 'a.ts'), 'mudou');
    fs.writeFileSync(path.join(story.worktreePath, 'novo.ts'), 'não rastreado');
    await cleanUpStory(router, deps, story, prFacts(story.branch));
    expect(worktrees()).toHaveLength(2);
    expect(card(1).worktreePath).toBe(story.worktreePath);
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(true);
    expect(remoteHas(story.branch)).toBe(true);
    const warn = report(1)[0]!;
    expect(warn).toContain(`a pasta de trabalho ${story.worktreePath} tem mudanças não commitadas (a.ts, novo.ts)`);
    expect(warn).toContain(`a branch local ${story.branch} e a remota continuam`);
    expect(warn).toContain('limpeza de branches e worktrees órfãs');
    expect(report(1)).toContain('- develop local atualizada até origin/develop');
  });

  it('RF6: branch local com commit fora do PR: não apaga nada e avisa', async () => {
    const story = await storyWithWork();
    const pr = prFacts(story.branch);
    squashMergeOnOrigin(story.branch);
    commit(story.worktreePath, 'b.ts', 'depois do PR');
    await cleanUpStory(router, deps, story, pr);
    expect(worktrees()).toHaveLength(2);
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(true);
    expect(remoteHas(story.branch)).toBe(true);
    expect(report(1)[0]).toContain(`a branch local ${story.branch} tem 1 commit(s) que não estão no pull request ${PR}`);
    expect(report(1)[0]).toContain(`A worktree ${story.worktreePath} e as branches local e remota continuam`);
  });

  it('RF7: modo branch com a pasta do projeto na branch da história: mantém a branch local e a da pasta, apaga a remota e avisa', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch' } } });
    await call('create_card', { title: 'Login', column: 'Implementação' });
    await call('prepare_workspace', { card: 1 });
    const story = card(1);
    expect(story.worktreePath).toBe(repo);
    git(repo, 'switch', '-q', story.branch);
    commit(repo, 'a.ts', 'export {};');
    git(repo, 'push', '-q', '-u', 'origin', story.branch);
    squashMergeOnOrigin(story.branch);

    await cleanUpStory(router, deps, story, prFacts(story.branch));

    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(story.branch);
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(true);
    expect(remoteHas(story.branch)).toBe(false);
    expect(fs.existsSync(path.join(repo, 'a.ts'))).toBe(true);
    expect(report(1)).toEqual([
      `- **Aviso:** A branch local ${story.branch} não foi apagada: a pasta do projeto (${repo}) está nela, e o board não troca a branch da sua pasta. Troque de branch (por exemplo, git switch develop) e apague-a com: git branch -D ${story.branch}`,
      `- branch remota origin/${story.branch} apagada`,
      '- develop local atualizada até origin/develop',
    ]);
  });

  it('RF7: branch aberta em outra worktree (fora do registro do card): a branch local fica e a remota é apagada', async () => {
    const story = await storyWithWork();
    squashMergeOnOrigin(story.branch);
    // a worktree registrada no card já foi removida à mão; a branch está aberta em outra pasta
    git(repo, 'worktree', 'remove', story.worktreePath);
    const other = path.join(base, 'outra-pasta');
    git(repo, 'worktree', 'add', '-q', other, story.branch);
    await cleanUpStory(router, deps, story, prFacts(story.branch));
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(true);
    expect(remoteHas(story.branch)).toBe(false);
    expect(report(1)[0]).toBe(
      `- **Aviso:** A branch local ${story.branch} não foi apagada: ela está aberta em ${other}. Feche essa pasta ou troque a branch dela e apague com: git branch -D ${story.branch}`,
    );
  });

  it('RF8: branch remota com commits depois do PR: não apaga a remota e avisa', async () => {
    const story = await storyWithWork();
    const pr = prFacts(story.branch);
    squashMergeOnOrigin(story.branch);
    // outra máquina avança a branch no origin depois do merge
    const other = path.join(base, 'outro');
    git(base, 'clone', '-q', '-b', story.branch, origin, other);
    identity(other);
    commit(other, 'c.ts', 'depois');
    git(other, 'push', '-q', 'origin', story.branch);
    await cleanUpStory(router, deps, story, pr);
    expect(remoteHas(story.branch)).toBe(true);
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(false);
    expect(report(1)[0]).toBe(
      `- **Aviso:** A branch remota origin/${story.branch} não foi apagada: ela recebeu commits depois do pull request ${PR}. Confira e, se não precisar deles, apague com: git push origin --delete ${story.branch}`,
    );
  });

  it('RF9: push recusado pelo origin: conclui, apaga o local e avisa o que não foi apagado e por quê', async () => {
    const story = await storyWithWork();
    squashMergeOnOrigin(story.branch);
    const hook = path.join(origin, 'hooks', 'pre-receive');
    fs.writeFileSync(hook, '#!/bin/sh\necho "somente leitura" >&2\nexit 1\n', { mode: 0o755 });
    await cleanUpStory(router, deps, story, prFacts(story.branch));
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(false);
    expect(remoteHas(story.branch)).toBe(true);
    const warn = report(1).find((l) => l.includes(`A branch remota origin/${story.branch} não foi apagada:`))!;
    expect(warn).toBeTruthy();
    expect(warn).toContain(`Apague com: git push origin --delete ${story.branch}`);
    expect(warn.length).toBeLessThan(400);
  });

  it('RF9: sem origin: aviso único, worktree e branch local ainda são limpas e a develop não é tocada', async () => {
    const story = await storyWithWork();
    git(repo, 'remote', 'remove', 'origin');
    await cleanUpStory(router, deps, story, prFacts(story.branch));
    expect(worktrees()).toHaveLength(1);
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(false);
    expect(report(1)).toEqual([
      '- **Aviso:** O repositório não tem o remoto origin: a branch remota e a develop não foram tocadas.',
      `- pasta de trabalho ${story.worktreePath} removida`,
      `- branch local ${story.branch} apagada`,
    ]);
  });

  it('RF9: git worktree remove falha: a branch local fica, a remota segue e o aviso traz o erro', async () => {
    const story = await storyWithWork();
    squashMergeOnOrigin(story.branch);
    await cleanUpStory(
      router,
      {
        ...deps,
        removeWorktree: () => {
          throw new Error('arquivo preso\nsegunda linha');
        },
      },
      story,
      prFacts(story.branch),
    );
    expect(card(1).worktreePath).toBe(story.worktreePath);
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(true);
    expect(remoteHas(story.branch)).toBe(false);
    expect(report(1)[0]).toBe(
      `- **Aviso:** A pasta de trabalho ${story.worktreePath} não foi removida: arquivo preso. A branch local ${story.branch} ficou porque a pasta ainda a usa. Remova com: git worktree remove ${story.worktreePath}`,
    );
  });

  it('a principal vem de deps.mainBranch quando informada', async () => {
    const story = await storyWithWork();
    await cleanUpStory(router, { ...deps, mainBranch: () => story.branch }, story, prFacts(story.branch));
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(true);
    expect(report(1)[0]).toContain('A limpeza não apagou nada');
  });
});

describe('develop local', () => {
  it('RF4: develop aberta na pasta do projeto: não mexe e avisa com o comando', async () => {
    const story = await storyWithWork();
    const before = rev(repo, 'develop');
    squashMergeOnOrigin(story.branch);
    git(repo, 'switch', '-q', 'develop');
    await cleanUpStory(router, deps, story, prFacts(story.branch));
    expect(rev(repo, 'develop')).toBe(before);
    expect(report(1)).toContain(
      `- **Aviso:** A develop local não foi atualizada: ela está aberta em ${repo}, e o board não mexe nos arquivos dessa pasta. Atualize lá com: git pull --ff-only origin develop`,
    );
    // o resto da limpeza aconteceu
    expect(hasRef(repo, `refs/heads/${story.branch}`)).toBe(false);
  });

  it('RF5: develop local com commit que não está no origin: mantém o commit e avisa citando a develop', async () => {
    const story = await storyWithWork();
    git(repo, 'switch', '-q', 'develop');
    commit(repo, 'local.ts', 'só aqui');
    const local = rev(repo, 'develop');
    git(repo, 'switch', '-q', 'main');
    squashMergeOnOrigin(story.branch);
    await cleanUpStory(router, deps, story, prFacts(story.branch));
    expect(rev(repo, 'develop')).toBe(local);
    expect(report(1)).toContain(
      '- **Aviso:** A develop local não foi atualizada: ela tem 1 commit(s) que não estão em origin/develop, e o board não força a atualização. Envie esses commits num pull request ou descarte-os, e depois rode: git fetch origin develop:develop',
    );
  });

  it('develop já atualizada, inexistente ou com fetch falhando', async () => {
    expect(await updateDevelop(deps, 'develop')).toBe('develop local já estava atualizada');
    expect(await updateDevelop(deps, 'nao-existe')).toBe('');
    git(repo, 'remote', 'set-url', 'origin', path.join(base, 'sumiu.git'));
    expect(await updateDevelop(deps, 'develop')).toMatch(
      /^\*\*Aviso:\*\* A develop local não foi atualizada: .+\. Atualize com: git fetch origin develop:develop$/,
    );
  });
});

describe('pendingWork', () => {
  it('nada pendente = null; arquivos e commits fora do PR contam; objeto do PR ausente conta como commit', async () => {
    const story = await storyWithWork();
    const pr = prFacts(story.branch);
    expect(await pendingWork(deps, repo, story, pr)).toBeNull();
    fs.writeFileSync(path.join(story.worktreePath, 'x.ts'), '');
    expect(await pendingWork(deps, repo, story, pr)).toEqual({ dirtyFiles: ['x.ts'], extraCommits: 0 });
    fs.rmSync(path.join(story.worktreePath, 'x.ts'));
    commit(story.worktreePath, 'y.ts', '1');
    commit(story.worktreePath, 'z.ts', '2');
    expect(await pendingWork(deps, repo, story, pr)).toEqual({ dirtyFiles: [], extraCommits: 2 });
    expect(await pendingWork(deps, repo, story, { ...pr, headRefOid: '0'.repeat(40) })).toMatchObject({ extraCommits: 1 });
  });
});
