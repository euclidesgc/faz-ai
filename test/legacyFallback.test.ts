import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { all } from '../src/extension/db/query';
import { exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { evaluateExecutionPolicy, validateExecutionPolicy } from '../src/shared/executionPolicies';
import { legacyFallbackNotes, legacyFallbackProposal, legacyFallbackProposals } from '../src/shared/legacyFallback';
import type { ModelRule } from '../src/shared/models';
import { catalog, evaluation } from './fixtures/executionPolicy';

const rule = (over: Partial<ModelRule> = {}): ModelRule => ({
  id: 'r1',
  name: 'Regra',
  enabled: true,
  groups: [],
  model: 'claude:opus@high',
  fallback: 'claude:haiku@medium',
  ...over,
});

describe('reserva legada como proposta de política (puro)', () => {
  it('gera política válida, desligada, com origem no id e no nome', () => {
    const result = legacyFallbackProposal(rule(), 0, catalog);
    if (!('policy' in result)) throw new Error('esperava proposta');
    expect(() => validateExecutionPolicy(result.policy)).not.toThrow();
    expect(result.policy).toMatchObject({
      id: 'legacy-r1',
      enabled: false,
      action: 'offer',
      conditions: { profileIds: ['claude'], models: ['opus'], failures: ['quota'] },
      targets: [{ profileId: 'claude', model: 'haiku', effort: 'medium' }],
    });
    expect(result.policy.name).toContain('Regra');
  });
  it.each([
    [{ fallback: null }, 'fallback-missing'],
    [{ fallback: 'claude:ausente' }, 'model-missing'],
    [{ model: 'claude:ausente' }, 'model-missing'],
    [{ fallback: 'claude:haiku@ultra' }, 'effort-invalid'],
    [{ id: 'com espaço' }, 'id-invalid'],
  ] as [Partial<ModelRule>, string][])('sem conversão %j: %s', (over, reason) => {
    expect(legacyFallbackProposal(rule(over), 0, catalog)).toEqual({ reason });
  });
  it('as propostas ignoram regras sem reserva e os avisos separam convertidas de não convertidas', () => {
    const rules = [rule(), rule({ id: 'r2', fallback: null }), rule({ id: 'r3', fallback: 'claude:ausente' })];
    const proposals = legacyFallbackProposals(rules, catalog);
    expect(proposals.map((p) => p.id)).toEqual(['legacy-r1']);
    const records = proposals.map((policy) => ({ policy, revision: 1, review: 'pending' as const, updatedAt: 1 }));
    expect(legacyFallbackNotes(rules, records, catalog)).toEqual([
      { ruleId: 'r1', ruleName: 'Regra', policyId: 'legacy-r1', status: 'proposed', review: 'pending' },
      { ruleId: 'r3', ruleName: 'Regra', policyId: null, status: 'unconvertible', review: null, reason: 'model-missing' },
    ]);
    // proposta descartada pela pessoa: sem registro, sem aviso
    expect(legacyFallbackNotes(rules, [], catalog).map((n) => n.ruleId)).toEqual(['r3']);
  });
});

describe('migração da reserva legada no board', () => {
  let dir: string;
  let db: Awaited<ReturnType<typeof openInMemory>>;
  let router: MessageRouter;
  const open = () =>
    new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'legado',
      folderName: 'Legado',
      author: 'Pessoa',
      attachmentsDir: path.join(dir, 'attachments'),
    });
  const setRules = (rules: ModelRule[]) => router.handle({ type: 'settings.modelRules.set', rules });
  const records = () => router.executionPolicyLibrary().snapshot.records;
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-legacy-'));
    db = await openInMemory(path.resolve('node_modules/sql.js/dist'));
    router = open();
    router.handle({ type: 'settings.models.set', catalog });
  });
  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('vira proposta desligada e pendente, com histórico e aviso, e a regra guarda a origem', () => {
    setRules([rule(), rule({ id: 'r3', fallback: 'claude:ausente' })]);
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ revision: 1, review: 'pending', policy: { id: 'legacy-r1', enabled: false } });
    expect(router.executionPolicyHistory('legacy-r1').history).toHaveLength(1);
    expect(router.executionPolicyLibrary().legacy).toMatchObject([
      { ruleId: 'r1', status: 'proposed', review: 'pending' },
      { ruleId: 'r3', status: 'unconvertible', reason: 'model-missing' },
    ]);
    expect(router.snapshot().board.modelRules[0]!.fallback).toBe('claude:haiku@medium');
  });
  it('sem ativação silenciosa nem segundo motor: nada troca de CLI até a pessoa revisar e ligar', () => {
    setRules([rule()]);
    const pending = evaluation({ snapshot: router.executionPolicyLibrary().snapshot });
    expect(evaluateExecutionPolicy(pending)).toMatchObject({ action: 'block', reason: 'no-policy' });
    const proposal = records()[0]!.policy;
    router.handle({ type: 'settings.executionPolicy.save', policy: { ...proposal, enabled: true }, expectedRevision: 1, reviewed: true });
    expect(evaluateExecutionPolicy(evaluation({ snapshot: router.executionPolicyLibrary().snapshot }))).toMatchObject({
      action: 'offer',
      policy: { id: 'legacy-r1', revision: 2 },
    });
  });
  it('é idempotente: regravar regras ou reabrir o board não duplica nem reverte a revisão da pessoa', () => {
    setRules([rule()]);
    const proposal = records()[0]!.policy;
    router.handle({
      type: 'settings.executionPolicy.save',
      policy: { ...proposal, name: 'Ajustada' },
      expectedRevision: 1,
      reviewed: false,
    });
    setRules([rule(), rule({ id: 'r4', fallback: null })]);
    router = open();
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ revision: 2, policy: { name: 'Ajustada' } });
  });
  it('proposta removida pela pessoa não volta', () => {
    setRules([rule()]);
    router.handle({ type: 'settings.executionPolicy.remove', id: 'legacy-r1', expectedRevision: 1 });
    setRules([rule()]);
    router = open();
    expect(records()).toEqual([]);
    expect(router.executionPolicyLibrary().legacy).toBeUndefined();
  });
  it('a proposta nasce desligada e pendente mesmo quando as regras vêm da IA', () => {
    router.handle({ type: 'settings.modelRules.set', rules: [rule()] }, { source: 'ai' });
    expect(records()[0]).toMatchObject({ review: 'pending', policy: { enabled: false } });
  });
  it('export/import mantém regra e proposta, lista as políticas pendentes e não leva credenciais', () => {
    setRules([rule()]);
    const store = { pathOf: () => '/arquivo-ausente', backupCards: () => undefined };
    const file = exportBoard(db, router.boardId, store, { extensionVersion: 'test' }).file;
    expect(JSON.stringify(file)).not.toMatch(/secret_ref":"[^"]/);
    const result = importBoard({ db, store, boardId: router.boardId, workspaceKey: 'legado' }, parseExportFile(JSON.stringify(file)));
    expect(result.policyReviews).toEqual([records()[0]!.policy.name]);
    expect(result.profileReviews?.length).toBeGreaterThan(0);
    expect(all(db, 'SELECT review_state FROM execution_policies')).toEqual([{ review_state: 'pending' }]);
    expect(router.snapshot().board.modelRules[0]!.fallback).toBe('claude:haiku@medium');
  });
});
