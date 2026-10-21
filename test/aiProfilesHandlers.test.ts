import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { AiProfileRepo } from '../src/extension/repositories/aiProfileRepo';
import { createAiProfileRuntime } from '../src/extension/panel/handlers/aiProfiles';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { AiProfileDraft } from '../src/shared/aiProfiles';

let dir: string;
let db: Awaited<ReturnType<typeof openInMemory>>;
let router: MessageRouter;
let repo: AiProfileRepo;
const draft = (config: AiProfileDraft['config'] = { command: 'fake-cli', env: { TOKEN: 'secret-sentinel' } }): AiProfileDraft => ({
  name: 'Minha CLI',
  kind: 'custom',
  base: 'generic',
  enabled: true,
  position: 3,
  config,
});
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-profile-handlers-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'profile-handlers',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: dir,
  });
  repo = new AiProfileRepo(db);
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('salva, liga/desliga, duplica e apaga; recusa pronto, padrão e escrita pela IA/MCP', () => {
  router.handle({ type: 'settings.aiProfiles.save', profile: draft() });
  const id = router.snapshot().board.aiProfiles.find((p) => p.kind === 'custom')!.id;
  expect(JSON.stringify(router.snapshot())).not.toContain('secret-sentinel');
  router.handle({ type: 'settings.aiProfiles.setEnabled', id, enabled: false });
  expect(router.snapshot().board.aiProfiles.find((p) => p.id === id)?.enabled).toBe(false);
  router.handle({ type: 'settings.aiProfiles.setEnabled', id, enabled: true });
  router.handle({ type: 'settings.aiProfiles.duplicate', id });
  const copy = router.snapshot().board.aiProfiles.find((p) => p.id !== id && p.kind === 'custom')!;
  expect(copy).toMatchObject({ enabled: false, credentials: { review: 'pending' } });
  router.handle({ type: 'settings.aiProfiles.remove', id: copy.id });
  expect(router.snapshot().board.aiProfiles.some((p) => p.id === copy.id)).toBe(false);
  expect(() => router.handle({ type: 'settings.aiProfiles.remove', id: 'claude' })).toThrow('prontos');
  expect(() => router.handle({ type: 'settings.aiProfiles.setEnabled', id: 'claude', enabled: false })).toThrow('padrão');
  expect(() => router.handle({ type: 'settings.aiProfiles.save', profile: draft() }, { source: 'ai' })).toThrow('revisão humana');
  expect(() => router.handle({ type: 'settings.aiProfiles.save', profile: draft() }, { externalMcp: true })).toThrow('revisão humana');
  router.handle({ type: 'settings.board.update', patch: { aiTool: id } });
  expect(router.snapshot().board.aiTool).toBe(id);
  expect(() => router.handle({ type: 'settings.aiProfiles.remove', id })).toThrow('padrão');
});

it('sonda perfis com resolução falsa e só devolve metadados públicos', async () => {
  const saved = repo.save(router.boardId, draft(), 'person');
  const resolve = vi.fn(() => '/fake/bin');
  const version = vi.fn(async () => '1.2.3');
  const signedIn = vi.fn(async () => true);
  const runtime = createAiProfileRuntime({
    repo,
    gateway: { run: vi.fn() },
    boardId: () => router.boardId,
    cwd: dir,
    homeDir: dir,
    pathEnv: () => '/fake',
    resolve,
    version,
    signedIn,
  });
  const result = await runtime.probe();
  expect(result.profiles[saved.id]).toEqual({ found: true, version: '1.2.3', signedIn: true, installUrl: null });
  expect(resolve).toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain('secret-sentinel');
  expect(JSON.stringify(result)).not.toContain('fake-cli');
});

it('Testar usa origem test, NO_CARD, permissão board e 60 linhas; recusa teste concorrente sem revelar env', async () => {
  const calls: unknown[] = [];
  let finish: ((end: unknown) => void) | undefined;
  const gateway = {
    run: vi.fn((call: any) => {
      calls.push(call);
      for (let i = 0; i < 65; i++) call.log(`linha ${i}`);
      return {
        onExit: (fn: (end: unknown) => void) => {
          finish = fn;
        },
      };
    }),
  };
  const runtime = createAiProfileRuntime({
    repo,
    gateway: gateway as never,
    boardId: () => router.boardId,
    cwd: dir,
    homeDir: dir,
    pathEnv: () => '/fake',
  });
  const first = runtime.test('claude');
  expect((await runtime.test('claude')).error).toContain('em curso');
  expect(gateway.run).toHaveBeenCalledTimes(1);
  const call = calls[0] as any;
  expect(call).toMatchObject({ origin: 'test', tool: 'claude', context: { cardId: null }, cwd: dir, timeoutMinutes: 2 });
  expect(call.prepare().input).toEqual({ prompt: 'Responda apenas com a palavra OK.', permission: 'board', structured: true });
  expect(call.prepare().input).not.toHaveProperty('exec');
  expect(call.prepare().input).not.toHaveProperty('boardServer');
  finish!({ outcome: 'done', timedOut: false });
  const result = await first;
  expect(result.ok).toBe(true);
  expect(result.output.split('\n')).toHaveLength(60);
  expect(result.output).toContain('linha 64');
  expect(result.output).not.toContain('linha 0\n');
  expect(JSON.stringify(result)).not.toContain('secret-sentinel');
  expect((await runtime.test('missing')).ok).toBe(false);
});

it('Testar perfil custom envia contrato mínimo à admissão e oculta valores privados até no erro', async () => {
  const saved = repo.save(router.boardId, draft(), 'person');
  let finish: ((end: unknown) => void) | undefined;
  const run = vi.fn((call: any) => {
    call.log('secret-sentinel');
    expect(call.prepare().strict).toMatchObject({ profileId: saved.id, request: { regime: 'exclusive', mcpTools: [] } });
    return {
      onExit: (fn: (end: unknown) => void) => {
        finish = fn;
      },
    };
  });
  const runtime = createAiProfileRuntime({
    repo,
    gateway: { run } as never,
    boardId: () => router.boardId,
    cwd: dir,
    homeDir: dir,
    pathEnv: () => '/fake',
  });
  const pending = runtime.test(saved.id);
  finish!({ outcome: 'failed', timedOut: false, error: new Error('secret-sentinel') });
  const result = await pending;
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain('secret-sentinel');
  expect(run).toHaveBeenCalledTimes(1);
  router.handle({ type: 'settings.aiProfiles.setEnabled', id: saved.id, enabled: false });
  expect((await runtime.test(saved.id)).error).toContain('desativado');
  expect(run).toHaveBeenCalledTimes(1);
});
