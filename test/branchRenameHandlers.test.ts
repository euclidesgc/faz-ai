import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import type { GhRunner } from '../src/extension/branchRename';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let base: string;
let repo: string;
let origin: string;
let router: MessageRouter;
/** as chamadas ao `gh` falso (cada uma com os argumentos) */
let ghCalls: string[][];
let ghFails: Error | null;
let ghViewFails: Error | null;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const has = (cwd: string, ref: string) => {
  try {
    git(cwd, 'rev-parse', '--verify', '--quiet', ref);
    return true;
  } catch {
    return false;
  }
};
const refs = (cwd: string) => git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)').split('\n').filter(Boolean);

const gh: GhRunner = (args) => {
  ghCalls.push(args);
  if (args[0] === 'repo') {
    if (ghViewFails) throw ghViewFails;
    return 'dono/projeto\n';
  }
  if (ghFails) throw ghFails;
  const from = decodeURIComponent(/branches\/(.+)\/rename$/.exec(args[3] ?? '')![1]!);
  const to = (args[5] ?? '').replace('new_name=', '');
  const head = git(origin, 'symbolic-ref', 'HEAD');
  git(origin, 'branch', '-m', from, to);
  if (head === `refs/heads/${from}`) git(origin, 'symbolic-ref', 'HEAD', `refs/heads/${to}`);
  return '';
};

async function open(): Promise<void> {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(base, 'attachments'),
    workspaceDir: repo,
    gh,
  });
}

const update = (git: Record<string, string>) => router.handle({ type: 'settings.board.update', patch: { git } });
const resolve = (kind: 'main' | 'develop', action: 'confirm' | 'undo' | 'dismiss') =>
  router.handle({ type: 'git.rename.resolve', kind, action });
const configured = () => router.snapshot().board.git;

beforeEach(async () => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-rename-h-')));
  repo = path.join(base, 'projeto');
  origin = path.join(base, 'origin.git');
  git(base, 'init', '-q', '--bare', '-b', 'master', origin);
  git(base, 'clone', '-q', origin, repo);
  git(repo, 'config', 'user.email', 't@e.com');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'switch', '-q', '-c', 'master');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'inicial');
  git(repo, 'branch', 'develop');
  git(repo, 'push', '-q', '-u', 'origin', 'master');
  git(repo, 'push', '-q', '-u', 'origin', 'develop');
  git(repo, 'remote', 'set-head', 'origin', 'master');
  ghCalls = [];
  ghFails = null;
  ghViewFails = null;
  await open();
});

afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('mudar o nome da principal ou da develop (RF1, RF2)', () => {
  it('nome novo inexistente e antigo existente guarda o pedido, sem tocar o repositório nem o gh', () => {
    const before = refs(repo);
    update({ developBranch: 'dev' });
    expect(configured().developBranch).toBe('dev');
    expect(router.snapshot().branchRenames).toEqual([{ kind: 'develop', from: 'develop', to: 'dev', previous: 'develop' }]);
    expect(refs(repo)).toEqual(before);
    expect(ghCalls).toEqual([]);
  });

  it('principal: o nome em uso é o detectado, e o Desfazer devolve o campo vazio', () => {
    update({ mainBranch: 'main' });
    expect(router.snapshot().branchRenames).toEqual([{ kind: 'main', from: 'master', to: 'main', previous: '' }]);
    resolve('main', 'undo');
    expect(configured().mainBranch).toBe('');
    expect(router.snapshot().mainBranch).toMatchObject({ name: 'master' });
  });

  it('nome que já existe não pede renomeação: a branch passa a ser usada', () => {
    git(repo, 'branch', 'integracao');
    update({ developBranch: 'integracao' });
    expect(router.snapshot().branchRenames).toEqual([]);
    expect(configured().developBranch).toBe('integracao');
  });

  it('develop que não existe não pede renomeação', () => {
    git(repo, 'branch', '-D', 'develop');
    git(repo, 'push', '-q', 'origin', '--delete', 'develop');
    update({ developBranch: 'dev' });
    expect(router.snapshot().branchRenames).toEqual([]);
  });

  it('mudar de novo antes de responder mantém o nome de origem; voltar a ele cancela o pedido', () => {
    update({ developBranch: 'dev' });
    update({ developBranch: 'dev2' });
    expect(router.snapshot().branchRenames).toEqual([{ kind: 'develop', from: 'develop', to: 'dev2', previous: 'develop' }]);
    update({ developBranch: 'develop' });
    expect(router.snapshot().branchRenames).toEqual([]);
  });

  it('o pedido sobrevive ao editor fechado: um board novo sobre o mesmo banco ainda o vê (RF9)', () => {
    update({ developBranch: 'dev' });
    const meta = router.getMeta('branch_rename_pending');
    expect(meta).toContain('"to":"dev"');
  });
});

describe('Renomear (RF4, RF5)', () => {
  it('só a confirmação age: o gh renomeia no remoto e o clone fica coerente; o pedido some', () => {
    update({ developBranch: 'dev' });
    expect(ghCalls).toEqual([]);
    resolve('develop', 'confirm');
    expect(router.snapshot().branchRenames).toEqual([]);
    expect(router.snapshot().branchRenameResult).toMatchObject({ status: 'done', done: ['remote', 'local', 'upstream'] });
    expect(has(repo, 'refs/heads/dev')).toBe(true);
    expect(has(repo, 'refs/heads/develop')).toBe(false);
    expect(has(origin, 'refs/heads/dev')).toBe(true);
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'dev@{upstream}')).toBe('origin/dev');
    expect(git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).toBe('origin/master');
  });

  it('principal: origin/HEAD acompanha e o snapshot passa a ter a nova', () => {
    update({ mainBranch: 'main' });
    resolve('main', 'confirm');
    expect(git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).toBe('origin/main');
    expect(router.snapshot().mainBranch).toEqual({ name: 'main', source: 'config' });
  });

  it('falha do gh: o clone não muda, a mensagem traz o erro e o pedido continua para tentar de novo (RF8)', () => {
    update({ developBranch: 'dev' });
    const before = refs(repo);
    ghFails = new Error('HTTP 403');
    resolve('develop', 'confirm');
    expect(router.snapshot().branchRenameResult).toMatchObject({ status: 'failed', failed: { step: 'remote', error: 'HTTP 403' } });
    expect(router.snapshot().branchRenames).toHaveLength(1);
    expect(refs(repo)).toEqual(before);
    ghFails = null;
    resolve('develop', 'confirm');
    expect(router.snapshot().branchRenameResult).toMatchObject({ status: 'done' });
    expect(router.snapshot().branchRenames).toEqual([]);
  });

  it('sem gh: mostra os comandos, não executa nada e encerra o pedido', () => {
    update({ developBranch: 'dev' });
    const before = refs(repo);
    const beforeOrigin = refs(origin);
    ghViewFails = new Error('o comando "gh" não foi encontrado');
    resolve('develop', 'confirm');
    const result = router.snapshot().branchRenameResult;
    expect(result).toMatchObject({ status: 'manual', reason: expect.stringContaining('não foi encontrado') });
    expect(result?.commands).toContain('git push origin --delete develop');
    expect(router.snapshot().branchRenames).toEqual([]);
    expect(ghCalls.filter((c) => c[0] === 'api')).toEqual([]);
    expect(refs(repo)).toEqual(before);
    expect(refs(origin)).toEqual(beforeOrigin);
  });

  it('recusa com a IA executando: nada muda e a mensagem diz quais histórias', () => {
    const s = router.snapshot();
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    const id = router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
      columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
      parentId: null,
      title: 'Em andamento',
    });
    const number = router.snapshot().cards.find((c) => c.id === id)!.number;
    router.setAiRuns([{ cardId: id, runId: '', mode: 'phase', origin: 'manual', phase: 'Implementação', model: null, startedAt: 0 }]);
    expect(() => update({ developBranch: 'dev' })).toThrow(`#${number}`);
    expect(configured().developBranch).toBe('develop');
    expect(router.snapshot().branchRenames).toEqual([]);
    // sem renomeação a fazer (nome que já existe), a mudança passa mesmo com a IA executando
    git(repo, 'branch', 'integracao');
    update({ developBranch: 'integracao' });
    expect(configured().developBranch).toBe('integracao');
  });

  it('a IA começou depois do aviso: a confirmação também recusa e o pedido fica', () => {
    update({ developBranch: 'dev' });
    const s = router.snapshot();
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    const id = router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
      columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
      parentId: null,
      title: 'Outra',
    });
    router.setAiRuns([{ cardId: id, runId: '', mode: 'phase', origin: 'manual', phase: 'Implementação', model: null, startedAt: 0 }]);
    expect(() => resolve('develop', 'confirm')).toThrow(/IA está executando/);
    expect(router.snapshot().branchRenames).toHaveLength(1);
    expect(ghCalls).toEqual([]);
  });
});

describe('Desfazer (RF3)', () => {
  it('devolve o nome anterior sem nenhuma escrita no repositório nem chamada ao gh', () => {
    const before = refs(repo);
    const beforeOrigin = refs(origin);
    update({ developBranch: 'dev' });
    resolve('develop', 'undo');
    expect(configured().developBranch).toBe('develop');
    expect(router.snapshot().branchRenames).toEqual([]);
    expect(refs(repo)).toEqual(before);
    expect(refs(origin)).toEqual(beforeOrigin);
    expect(ghCalls).toEqual([]);
  });

  it('sem pedido, responder é um erro claro', () => {
    expect(() => resolve('develop', 'undo')).toThrow(/Não há renomeação/);
  });

  it('dispensar apaga o resultado', () => {
    update({ developBranch: 'dev' });
    resolve('develop', 'confirm');
    expect(router.snapshot().branchRenameResult).not.toBeNull();
    resolve('develop', 'dismiss');
    expect(router.snapshot().branchRenameResult).toBeNull();
  });
});
