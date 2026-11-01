import { describe, expect, it } from 'vitest';
import { evaluateRunPolicy, newChain, startPosition, type StartInput } from '../src/extension/policyGate';
import type { ExecutionPolicy, ExecutionTarget } from '../src/shared/executionPolicies';
import type { BoardState } from '../src/shared/model';
import type { RunTarget } from '../src/shared/runTarget';
import { policy, record } from './fixtures/executionPolicy';

// Posição de partida na cadeia de fallback (#1100): o mesmo avaliador único, com uma tentativa sintética do esgotado.

const profile = (id: string, tool: string) => ({
  id,
  name: id,
  enabled: true,
  kind: 'catalog',
  tool,
  mode: 'cli',
  base: tool,
  config: {},
  position: 0,
});
const model = (tool: string, name: string, effort: string) => ({
  id: `${tool}:${name}`,
  tool,
  model: name,
  label: name,
  efforts: [effort],
  defaultEffort: effort,
});
const state = {
  board: {
    aiProfiles: [profile('claude', 'claude'), profile('gemini', 'gemini')],
    modelCatalog: [model('claude', 'opus', 'high'), model('claude', 'sonnet', 'medium'), model('gemini', 'pro', 'high')],
    runner: { admissionRegime: 'exclusive', compatibilityReviewRevision: 1 },
  },
  requirements: [],
  authExpired: [],
} as unknown as BoardState;

const opus: ExecutionTarget = { profileId: 'claude', model: 'opus', effort: 'high' };
const sonnet: ExecutionTarget = { profileId: 'claude', model: 'sonnet', effort: 'medium' };
const gemini: ExecutionTarget = { profileId: 'gemini', model: 'pro', effort: 'high' };
const asRun = (t: ExecutionTarget, source: RunTarget['source'] = 'card'): RunTarget => ({
  cli: state.board.aiProfiles.find((p) => p.id === t.profileId)!,
  model: { name: t.model!, effort: t.effort },
  value: `${t.profileId}:${t.model}@${t.effort}`,
  source,
});
const constraints = { permission: 'board' as const, regime: 'exclusive' as const, agentId: 'agent', scopeDigest: 'a'.repeat(64) };
const rule = (over: Partial<ExecutionPolicy> = {}) =>
  policy({
    conditions: { ...policy().conditions, origins: ['autopilot'], explicit: 'include' },
    targets: [sonnet, gemini],
    limits: { maxAttempts: 5, maxElapsedMs: 60_000, backoffMs: 0, globalProcesses: null, perProfile: {} },
    ...over,
  });
const NOW = Date.now();
const input = (p: ExecutionPolicy, marked: string[] = ['opus'], over: Partial<StartInput> = {}): StartInput => ({
  state,
  snapshot: { version: 1, records: [record(p)] },
  requested: asRun(opus),
  exhausted: (t) => marked.includes(t.model?.name ?? ''),
  now: NOW,
  action: 'work',
  origin: 'autopilot',
  agentId: 'agent',
  phaseId: 'phase',
  cardTypeId: 'type',
  constraints,
  runningProfiles: [],
  ...over,
});

describe('startPosition', () => {
  it('"Troca sozinho" opus → sonnet: começa em sonnet com a tentativa do opus na cadeia', () => {
    const pos = startPosition(input(rule()));
    expect(pos?.decision.action).toBe('fallback');
    expect(pos?.target.model?.name).toBe('sonnet');
    expect(pos?.skipped.map((t) => t.model?.name)).toEqual(['opus']);
    expect(pos?.chain.attempts).toHaveLength(1);
    expect(pos?.chain.attempts[0]).toMatchObject({ target: opus, startedAt: NOW, endedAt: NOW, consumption: null });
  });
  it('"Pergunta antes" não troca', () => {
    expect(startPosition(input(rule({ action: 'offer' })))).toBeNull();
  });
  it('cadeia opus → sonnet → gemini com sonnet também marcado: começa em gemini', () => {
    const pos = startPosition(input(rule(), ['opus', 'sonnet']));
    expect(pos?.target.cli.id).toBe('gemini');
    expect(pos?.skipped.map((t) => t.model?.name)).toEqual(['opus', 'sonnet']);
    expect(pos?.chain.attempts.map((a) => a.target.model)).toEqual(['opus', 'sonnet']);
  });
  it('maxAttempts 2: o primeiro destino sai; com ele também esgotado a cadeia para', () => {
    const limits = { maxAttempts: 2, maxElapsedMs: 60_000, backoffMs: 0, globalProcesses: null, perProfile: {} };
    expect(startPosition(input(rule({ limits })))?.target.model?.name).toBe('sonnet');
    expect(startPosition(input(rule({ limits }), ['opus', 'sonnet']))).toBeNull();
  });
  it('regra desligada, backoff, alvo livre e sem restrições: null', () => {
    expect(startPosition(input(rule({ enabled: false })))).toBeNull();
    expect(startPosition(input(rule({ limits: { ...rule().limits, backoffMs: 1000 } })))).toBeNull();
    expect(startPosition(input(rule(), []))).toBeNull();
    expect(startPosition(input(rule(), ['opus'], { constraints: null }))).toBeNull();
  });
});

describe('evaluateRunPolicy (núcleo decide)', () => {
  it('uma falha real de quota segue para o mesmo destino', () => {
    const requested = asRun(opus);
    const out = evaluateRunPolicy({
      state,
      snapshot: { version: 1, records: [record(rule())] },
      target: requested,
      chain: newChain(requested, NOW),
      execStartedAt: NOW,
      end: { report: { consumption: null } } as never,
      failure: 'quota',
      action: 'work',
      origin: 'autopilot',
      agentId: 'agent',
      phaseId: 'phase',
      cardTypeId: 'type',
      constraints,
      acted: false,
      runningProfiles: [],
    });
    expect(out?.decision.action).toBe('fallback');
    expect(out?.decision.target).toEqual(sonnet);
    expect(out?.attempt.target).toEqual(opus);
  });
});
