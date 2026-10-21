import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { all, run } from '../src/extension/db/query';
import { exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { evaluateExecutionPolicy, validateExecutionPolicy } from '../src/shared/executionPolicies';
import {
  legacyFallbackNotes,
  legacyFallbackProposal,
  legacyFallbackProposals,
  parseLegacyFallbacks,
  type LegacyFallbackRule,
} from '../src/shared/legacyFallback';
import { catalog, evaluation } from './fixtures/executionPolicy';

const rule = (over: Partial<LegacyFallbackRule> = {}): LegacyFallbackRule => ({
  id: 'r1',
  name: 'Regra',
  model: 'claude:opus@high',
  fallback: 'claude:haiku@medium',
  index: 0,
  ...over,
});

describe('reserva legada como proposta de política (puro)', () => {
  it('parseLegacyFallbacks lê do JSON bruto só as regras com reserva string não vazia, preservando o índice', () => {
    const json = JSON.stringify([
      { id: 'r0', name: 'Sem reserva', model: 'claude:opus@high' },
      { id: 'r1', name: 'Com reserva', model: 'claude:opus@high', fallback: 'claude:haiku@medium' },
      { id: 'r2', model: 'claude:opus@high', fallback: '' },
      { id: 'r3', model: 'claude:opus@high', fallback: 42 },
      { id: 'r4', model: 'claude:opus@high', fallback: 'claude:ausente' },
    ]);
    expect(parseLegacyFallbacks(json)).toEqual([
      { id: 'r1', name: 'Com reserva', model: 'claude:opus@high', fallback: 'claude:haiku@medium', index: 1 },
      { id: 'r4', name: '', model: 'claude:opus@high', fallback: 'claude:ausente', index: 4 },
    ]);
    expect(parseLegacyFallbacks('')).toEqual([]);
    expect(parseLegacyFallbacks(null)).toEqual([]);
    expect(parseLegacyFallbacks('{nada')).toEqual([]);
  });
  it('gera política válida, desligada, com origem no id e no nome', () => {
    const result = legacyFallbackProposal(rule(), catalog);
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
    [{ fallback: 'claude:ausente' }, 'model-missing'],
    [{ model: 'claude:ausente' }, 'model-missing'],
    [{ fallback: 'claude:haiku@ultra' }, 'effort-invalid'],
    [{ id: 'com espaço' }, 'id-invalid'],
  ] as [Partial<LegacyFallbackRule>, string][])('sem conversão %j: %s', (over, reason) => {
    expect(legacyFallbackProposal(rule(over), catalog)).toEqual({ reason });
  });
  it('a prioridade vem do índice gravado e os avisos separam convertidas de não convertidas', () => {
    const rules = [rule(), rule({ id: 'r3', fallback: 'claude:ausente', index: 2 })];
    expect(legacyFallbackProposals([rule({ index: 3 })], catalog)[0]!.priority).toBe(130);
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
  // simula um board antigo: o campo `fallback` não existe mais no tipo, então o JSON bruto é gravado direto e o board reaberto
  const setLegacyRules = (rules: LegacyFallbackRule[], source?: 'ai') => {
    const json = JSON.stringify(rules.map(({ id, name, model, fallback }) => ({ id, name, enabled: true, groups: [], model, fallback })));
    run(db, 'UPDATE boards SET model_rules_json = ? WHERE id = ?', [json, router.boardId]);
    router = open();
    if (source) router.handle({ type: 'settings.modelRules.set', rules: router.snapshot().board.modelRules }, { source });
  };
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

  it('vira proposta desligada e pendente, com histórico e aviso, e a regra em memória não tem reserva', () => {
    setLegacyRules([rule(), rule({ id: 'r3', fallback: 'claude:ausente', index: 1 })]);
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ revision: 1, review: 'pending', policy: { id: 'legacy-r1', enabled: false } });
    expect(router.executionPolicyHistory('legacy-r1').history).toHaveLength(1);
    expect(router.executionPolicyLibrary().legacy).toMatchObject([
      { ruleId: 'r1', status: 'proposed', review: 'pending' },
      { ruleId: 'r3', status: 'unconvertible', reason: 'model-missing' },
    ]);
    expect(router.snapshot().board.modelRules.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(router.snapshot().board.modelRules.some((r) => 'fallback' in r)).toBe(false);
  });
  it('sem ativação silenciosa nem segundo motor: nada troca de CLI até a pessoa revisar e ligar', () => {
    setLegacyRules([rule()]);
    const pending = evaluation({ snapshot: router.executionPolicyLibrary().snapshot });
    expect(evaluateExecutionPolicy(pending)).toMatchObject({ action: 'block', reason: 'no-policy' });
    const proposal = records()[0]!.policy;
    router.handle({ type: 'settings.executionPolicy.save', policy: { ...proposal, enabled: true }, expectedRevision: 1, reviewed: true });
    expect(evaluateExecutionPolicy(evaluation({ snapshot: router.executionPolicyLibrary().snapshot }))).toMatchObject({
      action: 'offer',
      policy: { id: 'legacy-r1', revision: 2 },
    });
  });
  it('é idempotente: regravar regras (o que apaga a reserva do JSON) ou reabrir o board não duplica nem reverte a revisão da pessoa', () => {
    setLegacyRules([rule()]);
    const proposal = records()[0]!.policy;
    router.handle({
      type: 'settings.executionPolicy.save',
      policy: { ...proposal, name: 'Ajustada' },
      expectedRevision: 1,
      reviewed: false,
    });
    router.handle({ type: 'settings.modelRules.set', rules: router.snapshot().board.modelRules });
    router = open();
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ revision: 2, policy: { name: 'Ajustada' } });
    // a regravação tirou o valor legado do JSON: a proposta já criada fica, e só o aviso de migração some
    expect(router.executionPolicyLibrary().legacy).toBeUndefined();
  });
  it('proposta removida pela pessoa não volta', () => {
    setLegacyRules([rule()]);
    router.handle({ type: 'settings.executionPolicy.remove', id: 'legacy-r1', expectedRevision: 1 });
    setLegacyRules([rule()]);
    expect(records()).toEqual([]);
    expect(router.executionPolicyLibrary().legacy).toBeUndefined();
  });
  it('a proposta nasce desligada e pendente mesmo quando as regras vêm da IA', () => {
    setLegacyRules([rule()], 'ai');
    expect(records()[0]).toMatchObject({ review: 'pending', policy: { enabled: false } });
  });
  it('export/import mantém regra e proposta, lista as políticas pendentes e não leva credenciais', () => {
    setLegacyRules([rule()]);
    const store = { pathOf: () => '/arquivo-ausente', backupCards: () => undefined };
    const file = exportBoard(db, router.boardId, store, { extensionVersion: 'test' }).file;
    expect(JSON.stringify(file)).not.toMatch(/secret_ref":"[^"]/);
    const result = importBoard({ db, store, boardId: router.boardId, workspaceKey: 'legado' }, parseExportFile(JSON.stringify(file)));
    expect(result.policyReviews).toEqual([records()[0]!.policy.name]);
    expect(result.profileReviews?.length).toBeGreaterThan(0);
    expect(all(db, 'SELECT review_state FROM execution_policies')).toEqual([{ review_state: 'pending' }]);
    expect(router.snapshot().board.modelRules.map((r) => r.id)).toEqual(['r1']);
  });
});
