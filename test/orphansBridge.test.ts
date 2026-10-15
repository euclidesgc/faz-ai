import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { HostBridge, type HostEnv } from '../src/extension/host/hostBridge';
import { MessageRouter, type OrphanHooks } from '../src/extension/panel/messageRouter';
import { EMPTY_ORPHANS, type OrphanItem, type OrphanReport } from '../src/shared/orphans';
import type { HostToWebview } from '../src/shared/messages';

let router: MessageRouter;
let bridge: HostBridge;
let sent: HostToWebview[];
let dir: string;
let changes: number;

const item: OrphanItem = {
  id: 'branch:feature/9-x',
  kind: 'branch',
  ref: 'feature/9-x',
  branch: null,
  cardNumber: 9,
  situation: 'merged',
  verdict: 'safe',
  proof: 'merge-commit',
  blockers: [],
  dirtyFiles: 0,
  uniqueCommits: 0,
};

const report = (over: Partial<OrphanReport> = {}): OrphanReport => ({ items: [item], failed: {}, scannedAt: 1_000, ...over });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-orphans-bridge-'));
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'a'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'h'),
  });
  sent = [];
  changes = 0;
  router.onDidChange(() => void changes++);
  bridge = new HostBridge(
    (m) => sent.push(m),
    router,
    { get: () => ({}), onDidChange: () => () => {}, update: () => {} } as never,
    { attachmentsBaseUri: () => '' } as unknown as HostEnv,
  );
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const hooks = (over: Partial<OrphanHooks> = {}): OrphanHooks => ({
  scan: vi.fn(async () => {}),
  clean: vi.fn(async () => 'Branch apagada: feature/9-x'),
  cleanSafe: vi.fn(async () => 'Branch apagada: feature/9-x'),
  ...over,
});

describe('MessageRouter: setOrphans', () => {
  it('começa vazio e o relatório entra no snapshot', () => {
    expect(router.snapshot().orphans).toEqual(EMPTY_ORPHANS);
    router.setOrphans(report());
    expect(router.snapshot().orphans).toEqual(report());
  });

  it('só notifica quando o conteúdo muda', () => {
    router.setOrphans(report());
    expect(changes).toBe(1);
    router.setOrphans(report());
    expect(changes).toBe(1);
    router.setOrphans(report({ scannedAt: 2_000 }));
    expect(changes).toBe(2);
  });

  it('o relatório vazio igual ao inicial não notifica', () => {
    router.setOrphans({ ...EMPTY_ORPHANS });
    expect(changes).toBe(0);
  });
});

describe('MessageRouter: onOrphans', () => {
  it('sem hooks: varrer resolve sem efeito e limpar devolve o aviso de indisponível', async () => {
    await expect(router.scanOrphans()).resolves.toBeUndefined();
    await expect(router.cleanOrphan('branch:x')).resolves.toMatch(/não está disponível/);
    await expect(router.cleanSafeOrphans()).resolves.toMatch(/não está disponível/);
  });

  it('com hooks: repassa o id e o acceptLoss e devolve o texto do host', async () => {
    const h = hooks({ clean: vi.fn(async () => 'Worktree removida: /w') });
    router.onOrphans(h);
    await router.scanOrphans();
    expect(h.scan).toHaveBeenCalledTimes(1);
    await expect(router.cleanOrphan('worktree:/w', { dirtyFiles: 2, uniqueCommits: 1 })).resolves.toBe('Worktree removida: /w');
    expect(h.clean).toHaveBeenCalledWith('worktree:/w', { dirtyFiles: 2, uniqueCommits: 1 });
    await expect(router.cleanSafeOrphans()).resolves.toBe('Branch apagada: feature/9-x');
  });
});

describe('HostBridge: git.orphans.*', () => {
  it('scan aguarda o hook e fecha com done; não manda notice (o relatório vai no boardState)', async () => {
    let finish!: () => void;
    const h = hooks({ scan: vi.fn(() => new Promise<void>((r) => (finish = r))) });
    router.onOrphans(h);
    let done = false;
    const run = bridge.handle({ type: 'git.orphans.scan', requestId: 'r1' }).then(() => (done = true));
    await Promise.resolve();
    expect(h.scan).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    finish();
    await run;
    expect(sent.some((m) => m.type === 'notice')).toBe(false);
    expect(sent.at(-1)).toEqual({ type: 'done', requestId: 'r1', ok: true });
  });

  it('clean entrega o acceptLoss ao host e responde com o aviso', async () => {
    const h = hooks();
    router.onOrphans(h);
    await bridge.handle({
      type: 'git.orphans.clean',
      id: 'branch:feature/9-x',
      acceptLoss: { dirtyFiles: 0, uniqueCommits: 3 },
      requestId: 'r2',
    });
    expect(h.clean).toHaveBeenCalledWith('branch:feature/9-x', { dirtyFiles: 0, uniqueCommits: 3 });
    expect(sent.find((m) => m.type === 'notice')).toEqual({ type: 'notice', message: 'Branch apagada: feature/9-x' });
    expect(sent.at(-1)).toEqual({ type: 'done', requestId: 'r2', ok: true });
  });

  it('cleanSafe responde com o resumo do host', async () => {
    router.onOrphans(hooks({ cleanSafe: vi.fn(async () => 'Nenhuma branch ou worktree segura para remover.') }));
    await bridge.handle({ type: 'git.orphans.cleanSafe' });
    expect(sent.find((m) => m.type === 'notice')).toEqual({
      type: 'notice',
      message: 'Nenhuma branch ou worktree segura para remover.',
    });
  });

  it('sem hooks, as três mensagens não lançam', async () => {
    await bridge.handle({ type: 'git.orphans.scan' });
    await bridge.handle({ type: 'git.orphans.clean', id: 'branch:x' });
    await bridge.handle({ type: 'git.orphans.cleanSafe' });
    expect(sent.some((m) => m.type === 'error')).toBe(false);
  });

  it('o hook que lança vira o erro da ponte e done com ok:false', async () => {
    router.onOrphans(hooks({ cleanSafe: vi.fn(async () => Promise.reject(new Error('git quebrou'))) }));
    await bridge.handle({ type: 'git.orphans.cleanSafe', requestId: 'r3' });
    expect(sent.at(-1)).toEqual({ type: 'done', requestId: 'r3', ok: false, error: 'git quebrou' });
  });
});
