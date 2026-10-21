import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { all } from '../src/extension/db/query';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { HostBridge, type HostEnv } from '../src/extension/host/hostBridge';
import type { HostToWebview } from '../src/shared/messages';
import type { PolicyScenario } from '../src/shared/policyManagement';
import { catalog, policy } from './fixtures/executionPolicy';

let dir: string;
let db: Awaited<ReturnType<typeof openInMemory>>;
let router: MessageRouter;
let saves: number;
let bridge: HostBridge;
let replies: HostToWebview[];
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-policy-host-'));
  db = await openInMemory(path.resolve('node_modules/sql.js/dist'));
  router = new MessageRouter(
    {
      db,
      scheduleSave: () => {
        saves++;
      },
      close: async () => {},
    } as never,
    { workspaceKey: 'policy-host', folderName: 'Políticas', author: 'Pessoa', attachmentsDir: path.join(dir, 'attachments') },
  );
  router.handle({ type: 'settings.models.set', catalog });
  saves = 0;
  replies = [];
  bridge = new HostBridge(
    (msg) => replies.push(msg),
    router,
    { get: () => ({}), onDidChange: () => () => {} } as never,
    { get: () => ({}), onDidChange: () => () => {} } as never,
    { attachmentsBaseUri: () => '' } as HostEnv,
  );
});
afterEach(() => {
  bridge.dispose();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function save(revision = 0, reviewed = true) {
  router.handle({ type: 'settings.executionPolicy.save', policy: policy(), expectedRevision: revision, reviewed });
}
function scenario(): PolicyScenario {
  return {
    draft: policy(),
    sourceValue: 'claude:opus@high',
    defaultProfileId: 'claude',
    explicit: true,
    context: { action: 'work', origin: 'manual', agentId: null, phaseId: null, cardTypeId: null },
    failure: 'quota',
    effects: 'none',
    eligibility: 'admitted',
    elapsedMs: 0,
    runningGlobal: 0,
    runningByProfile: {},
  };
}
describe('host de políticas e simulação', () => {
  it('o token de revisão muda com gravação e remoção, mas não com leitura ou simulação', () => {
    const initial = router.snapshot().executionPolicyRevision;
    router.executionPolicyLibrary();
    router.simulateExecutionPolicy(scenario());
    expect(router.snapshot().executionPolicyRevision).toBe(initial);
    save();
    const saved = router.snapshot().executionPolicyRevision;
    expect(saved).not.toBe(initial);
    router.handle({ type: 'settings.executionPolicy.remove', id: policy().id, expectedRevision: 1 });
    expect(router.snapshot().executionPolicyRevision).not.toBe(saved);
  });
  it('somente a pessoa grava; IA, MCP externo e tentativa autenticada não mudam políticas', () => {
    for (const origin of [
      { source: 'ai' as const },
      { source: 'human' as const, externalMcp: true as const },
      { runToken: 'a'.repeat(64) },
    ])
      expect(() =>
        router.handle({ type: 'settings.executionPolicy.save', policy: policy(), expectedRevision: 0, reviewed: true }, origin),
      ).toThrow('revisão humana');
    expect(saves).toBe(0);
    expect(router.executionPolicyLibrary().snapshot.records).toEqual([]);
    save();
    expect(router.executionPolicyLibrary().snapshot.records[0]).toMatchObject({ revision: 1, review: 'reviewed' });
  });
  it('o protocolo correlaciona leitura/simulação sem done extra e não grava nem inicia execuções', async () => {
    const before = JSON.stringify(all(db, 'SELECT * FROM execution_policies'));
    await bridge.handle({ type: 'executionPolicy.read', requestId: 'read' });
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ type: 'executionPolicy.result', requestId: 'read', library: { snapshot: { records: [] } } });
    await bridge.handle({ type: 'executionPolicy.simulate', requestId: 'sim', scenario: scenario() });
    expect(replies.at(-1)).toMatchObject({
      type: 'executionPolicy.result',
      requestId: 'sim',
      simulation: { hypothetical: true, decision: { action: 'fallback' }, problems: [] },
    });
    expect(saves).toBe(0);
    expect(JSON.stringify(all(db, 'SELECT * FROM execution_policies'))).toBe(before);
    expect(all(db, 'SELECT * FROM ai_runs')).toEqual([]);
  });
  it('Próxima execução sem rascunho usa só as políticas salvas e não altera nada', () => {
    const before = JSON.stringify(all(db, 'SELECT * FROM execution_policies'));
    const result = router.simulateExecutionPolicy({ ...scenario(), draft: null });
    expect(result.hypothetical).toBe(true);
    expect(result.decision.policy).toBeNull();
    expect(JSON.stringify(all(db, 'SELECT * FROM execution_policies'))).toBe(before);
  });
  it('simulação é determinística, conserva consumo desconhecido e recusa efeitos, destinos e recursos inválidos', () => {
    const input = scenario();
    const a = router.simulateExecutionPolicy(input);
    expect(router.simulateExecutionPolicy(input)).toEqual(a);
    expect(a.decision.consumption).toEqual([null]);
    expect(router.simulateExecutionPolicy({ ...input, effects: 'unknown' }).decision.action).toBe('reconcile');
    expect(router.simulateExecutionPolicy({ ...input, eligibility: 'blocked-admission' }).decision.action).toBe('block');
    input.draft!.targets[0]!.profileId = 'unknown';
    expect(router.simulateExecutionPolicy(input)).toMatchObject({ decision: { action: 'block' }, problems: [{ code: 'target-invalid' }] });
    expect(() => router.simulateExecutionPolicy({ ...scenario(), context: { ...scenario().context, phaseId: 'other-board' } })).toThrow(
      'Cenário',
    );
  });
  it('simula também destinos da política salva que vence o rascunho por prioridade', () => {
    router.handle({
      type: 'settings.executionPolicy.save',
      policy: policy({ id: 'winner', priority: 1, targets: [{ profileId: 'cursor', model: 'composer', effort: 'high' }] }),
      expectedRevision: 0,
      reviewed: true,
    });
    const input = scenario();
    input.draft!.targets = [{ profileId: 'claude', model: 'haiku', effort: 'medium' }];
    expect(router.simulateExecutionPolicy(input)).toMatchObject({
      decision: { action: 'fallback', policy: { id: 'winner' }, target: { profileId: 'cursor', model: 'composer' } },
    });
  });
  it('conflito de revisão e erro da ponte preservam a versão salva', async () => {
    save();
    await bridge.handle({
      type: 'settings.executionPolicy.save',
      requestId: 'stale',
      expectedRevision: 0,
      reviewed: true,
      policy: policy({ name: 'Atrasada' }),
    });
    expect(replies.at(-1)).toMatchObject({ type: 'done', requestId: 'stale', ok: false });
    expect(router.executionPolicyLibrary().snapshot.records[0]!.policy.name).toBe(policy().name);
    await bridge.handle({ type: 'executionPolicy.read', requestId: 'bad-page', id: 'quota', beforeRevision: -1 });
    expect(replies.at(-1)).toMatchObject({ type: 'executionPolicy.result', requestId: 'bad-page', error: 'Página de histórico inválida.' });
  });
  it('histórico é paginado e ordenado sem sobreposição', () => {
    for (let i = 0; i < 55; i++)
      router.handle({ type: 'settings.executionPolicy.save', policy: policy({ enabled: false }), expectedRevision: i, reviewed: false });
    const first = router.executionPolicyHistory('quota');
    expect(first.history.map((r) => r.revision)).toEqual(Array.from({ length: 50 }, (_, i) => 55 - i));
    expect(first.nextBefore).toBe(6);
    const second = router.executionPolicyHistory('quota', first.nextBefore!);
    expect(second.history.map((r) => r.revision)).toEqual([5, 4, 3, 2, 1]);
    expect(second.nextBefore).toBeNull();
  });
  it('rascunho inválido pode ser preservado/desativado e removido, mas não ativado', () => {
    const draft = policy({ targets: [{ profileId: 'missing', model: null, effort: null }] });
    router.handle({ type: 'settings.executionPolicy.save', policy: draft, expectedRevision: 0, reviewed: false });
    expect(() => router.handle({ type: 'settings.executionPolicy.save', policy: draft, expectedRevision: 1, reviewed: true })).toThrow(
      'Destino',
    );
    router.handle({ type: 'settings.executionPolicy.remove', id: draft.id, expectedRevision: 1 });
    expect(router.executionPolicyLibrary().snapshot.records).toEqual([]);
    expect(router.executionPolicyHistory(draft.id).history).toHaveLength(2);
  });
});
