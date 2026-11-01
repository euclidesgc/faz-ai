import { describe, expect, it } from 'vitest';
import {
  evaluateExecutionPolicy,
  executionPolicyProblems,
  resolveExecutionTarget,
  simulateExecutionPolicy,
  validateExecutionPolicy,
} from '../src/shared/executionPolicies';

import { catalog, profiles, primary, alternative, other, policy, record, candidate, evaluation } from './fixtures/executionPolicy';

describe('alvo de execução sem troca silenciosa', () => {
  const resolve = (value: string | null | undefined) =>
    resolveExecutionTarget({
      choices: [
        { from: 'card', value },
        { from: 'agent', value: 'claude:haiku@medium' },
      ],
      defaultProfileId: 'copy',
      profiles,
      catalog,
    });
  it('prefixo explícito mantém a identidade, mesmo quando uma cópia virou padrão', () => {
    expect(resolve('claude:opus@high')).toEqual({ state: 'resolved', from: 'card', explicit: true, target: primary });
    expect(resolve('copy:opus@high')).toMatchObject({ target: { ...primary, profileId: 'copy' } });
  });
  it.each(['unknown:opus', 'claude:missing', 'claude:opus@ultra', 'claude:opus@', ' ', 'opus'])(
    'escolha inválida %s bloqueia sem herdar o agente',
    (value) => expect(resolve(value).state).toBe('blocked'),
  );
  it.each([undefined, null, ''])('ausência %s herda e mantém a origem', (value) =>
    expect(resolve(value)).toMatchObject({ state: 'resolved', from: 'agent', explicit: false, target: alternative }),
  );
  it('sem escolhas usa o perfil padrão e preserva esforço padrão do Cursor', () => {
    expect(resolveExecutionTarget({ choices: [], defaultProfileId: 'copy', profiles, catalog })).toMatchObject({
      target: { profileId: 'copy', model: null, effort: null },
      from: 'board',
    });
    expect(resolve('cursor:composer')).toMatchObject({ target: other });
    expect(
      resolveExecutionTarget({ choices: [], defaultProfileId: '../invalid', profiles: [{ ...profiles[0]!, id: '../invalid' }], catalog })
        .state,
    ).toBe('blocked');
  });
});

describe('avaliador único de políticas e simulação', () => {
  it('simula sem mutar entradas, com regra/versão, sequência e consumo desconhecido', () => {
    const input = evaluation(),
      before = structuredClone(input);
    const decision = evaluateExecutionPolicy(input);
    expect(decision).toMatchObject({
      action: 'fallback',
      policy: { id: 'quota', revision: 1 },
      target: alternative,
      nextAttempt: 2,
      consumption: [null],
    });
    expect(simulateExecutionPolicy(input)).toEqual(decision);
    expect(input).toEqual(before);
  });
  it('destinos ordenados recusam indisponibilidade, sem copiar credenciais entre perfis', () => {
    const input = evaluation();
    input.candidates[0]!.credential = 'pending';
    expect(evaluateExecutionPolicy(input)).toMatchObject({
      action: 'fallback',
      target: other,
      rejected: [{ target: alternative, reason: 'credentials-not-reviewed' }],
    });
    input.candidates[1]!.available = false;
    expect(evaluateExecutionPolicy(input)).toMatchObject({ action: 'block', reason: 'targets-exhausted' });
  });
  it.each(['partial', 'unknown'] as const)('efeitos %s exigem reconciliação antes de qualquer fallback', (effects) =>
    expect(evaluateExecutionPolicy(evaluation({ effects }))).toMatchObject({ action: 'reconcile', target: null }),
  );
  it.each(['partial-work', 'unknown', 'invalid-output'] as const)('falha %s não ganha repetição cega', (failure) =>
    expect(evaluateExecutionPolicy(evaluation({ failure }))).toMatchObject({ action: 'reconcile' }),
  );
  it.each(['permission', 'capability'] as const)('falha obrigatória %s não é contornada', (failure) => {
    const p = policy();
    p.conditions.failures = [failure];
    expect(evaluateExecutionPolicy(evaluation({ failure, snapshot: { version: 1, records: [record(p)] } }))).toMatchObject({
      action: 'block',
      reason: 'mandatory-constraint-failed',
    });
  });
  it('sem regra, pendente de revisão e escolha inválida bloqueiam', () => {
    expect(evaluateExecutionPolicy(evaluation({ snapshot: { version: 1, records: [] } })).reason).toBe('no-policy');
    expect(evaluateExecutionPolicy(evaluation({ snapshot: { version: 1, records: [{ ...record(), review: 'pending' }] } })).reason).toBe(
      'no-policy',
    );
    expect(
      evaluateExecutionPolicy(
        evaluation({ requested: { state: 'blocked', from: 'card', reason: 'model-missing', value: 'claude:missing' } }),
      ).reason,
    ).toBe('requested-target-invalid');
  });
  it('troca explícita exige correspondência explícita, além de curingas', () => {
    const p = policy();
    p.conditions.profileIds = [];
    expect(evaluateExecutionPolicy(evaluation({ snapshot: { version: 1, records: [record(p)] } })).reason).toBe('no-policy');
    p.conditions.profileIds = ['claude'];
    p.conditions.explicit = 'exclude';
    expect(evaluateExecutionPolicy(evaluation({ snapshot: { version: 1, records: [record(p)] } })).reason).toBe('no-policy');
  });
  it('bloquear, aguardar quota e oferecer alternativa são decisões distintas', () => {
    for (const action of ['block', 'wait', 'offer'] as const) {
      const p = policy({ action, ...(['block', 'wait'].includes(action) ? { targets: [] } : {}) });
      expect(evaluateExecutionPolicy(evaluation({ snapshot: { version: 1, records: [record(p)] } })).action).toBe(action);
    }
  });
  it('visited avança na lista e a lista exaurida preserva as recusas', () => {
    const input = evaluation();
    input.trace.attempts.push({ target: alternative, startedAt: 100, endedAt: 150, consumption: null });
    expect(evaluateExecutionPolicy(input)).toMatchObject({
      action: 'fallback',
      target: other,
      nextAttempt: 3,
      rejected: [{ reason: 'already-visited', target: alternative }],
    });
    input.trace.attempts.push({ target: other, startedAt: 150, endedAt: 180, consumption: null });
    input.snapshot.records[0]!.policy.limits.maxAttempts = 4;
    expect(evaluateExecutionPolicy(input)).toMatchObject({
      action: 'block',
      reason: 'targets-exhausted',
      rejected: [{ reason: 'already-visited' }, { reason: 'already-visited' }],
    });
  });
  it('contador e prazo não reiniciam ao trocar perfil ou política', () => {
    const input = evaluation();
    input.trace.attempts.push({ target: alternative, startedAt: 100, endedAt: 150, consumption: null });
    input.trace.budget = { maxAttempts: 2, deadlineAt: 900, globalProcesses: 1, perProfile: { cursor: 1 } };
    input.snapshot.records[0]!.policy.limits.maxAttempts = 20;
    expect(evaluateExecutionPolicy(input)).toMatchObject({
      reason: 'attempts-exhausted',
      nextAttempt: 3,
      budget: { maxAttempts: 2, deadlineAt: 900, globalProcesses: 1 },
    });
    input.trace.attempts.pop();
    input.now = 900;
    expect(evaluateExecutionPolicy(input).reason).toBe('deadline-exhausted');
  });
  it('aplica backoff sem gastar tentativa e respeita tetos globais/por perfil', () => {
    const input = evaluation();
    input.snapshot.records[0]!.policy.limits.backoffMs = 200;
    expect(evaluateExecutionPolicy(input)).toMatchObject({ action: 'wait', reason: 'backoff', notBefore: 300, nextAttempt: 2 });
    input.now = 400;
    input.running.perProfile.claude = 1;
    expect(evaluateExecutionPolicy(input)).toMatchObject({
      action: 'fallback',
      target: other,
      rejected: [{ reason: 'concurrency-limit' }],
    });
    input.running.global = 2;
    expect(evaluateExecutionPolicy(input).reason).toBe('targets-exhausted');
  });
  it.each(['permission', 'regime', 'agentId', 'scopeDigest'] as const)('destino não troca o obrigatório %s', (key) => {
    const input = evaluation();
    input.candidates = [candidate(alternative)];
    const changed = { permission: 'full', regime: 'compatible', agentId: 'other', scopeDigest: 'b'.repeat(64) } as const;
    Object.assign(input.candidates[0]!.constraints, { [key]: changed[key] });
    expect(evaluateExecutionPolicy(input)).toMatchObject({
      action: 'block',
      rejected: [{ reason: 'constraints-changed' }, { reason: 'availability-unknown' }],
    });
  });
  it('recusa ciclos e empates; prioridades disjuntas não são ambíguas', () => {
    const reverse = policy({ id: 'reverse', priority: 20, conditions: { ...policy().conditions, models: ['haiku'] }, targets: [primary] });
    expect(executionPolicyProblems([record(), record(reverse)]).some((p) => p.code === 'cycle')).toBe(true);
    const tie = policy({ id: 'tie' });
    expect(executionPolicyProblems([record(), record(tie)]).some((p) => p.code === 'ambiguous-priority')).toBe(true);
    tie.conditions.failures = ['auth'];
    expect(executionPolicyProblems([record(), record(tie)])).toEqual([]);
  });
  it('recusa campos de configuração executável e valores inválidos, sem usar metadados como prova', () => {
    for (const p of [
      { ...policy(), command: 'injetado' },
      { ...policy(), version: 2 },
      { ...policy(), targets: [{ ...alternative, env: { TOKEN: 'não aceitar' } }] },
      { ...policy(), limits: { ...policy().limits, maxAttempts: Infinity } },
    ])
      expect(() => validateExecutionPolicy(p)).toThrow();
    const input = evaluation();
    input.trace.budget = { maxAttempts: NaN, deadlineAt: 1000, globalProcesses: null, perProfile: {} };
    expect(evaluateExecutionPolicy(input).reason).toBe('invalid-input');
  });
  it('políticas de fases mutuamente exclusivas não formam uma cadeia cíclica', () => {
    const a = policy();
    a.conditions.phaseIds = ['implementation'];
    const b = policy({
      id: 'review',
      priority: 20,
      targets: [primary],
      conditions: { ...a.conditions, models: ['haiku'], phaseIds: ['review'] },
    });
    expect(executionPolicyProblems([record(a), record(b)])).toEqual([]);
  });
  it('histórico ou consumo inválido e candidatos duplicados bloqueiam', () => {
    const input = evaluation();
    input.trace.attempts[0]!.endedAt = 201;
    expect(evaluateExecutionPolicy(input).reason).toBe('invalid-history');
    input.trace.attempts[0]!.endedAt = 100;
    input.trace.attempts[0]!.consumption = { inputTokens: 1, outputTokens: null, costUsd: Infinity };
    expect(evaluateExecutionPolicy(input).reason).toBe('invalid-consumption');
    input.trace.attempts[0]!.consumption = null;
    input.candidates.push(candidate(alternative));
    expect(evaluateExecutionPolicy(input).reason).toBe('invalid-input');
  });
});
