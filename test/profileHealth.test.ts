import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import {
  CAPABILITY_CHECKS,
  EXECUTOR_CAPABILITIES,
  type CapabilityEvidence,
  type ExecutionAdmissionDecision,
} from '../src/shared/executionAdmission';
import type { ExecProfile } from '../src/shared/execution';
import type { Board } from '../src/shared/model';
import type { ModelRule } from '../src/shared/models';
import {
  boardAvailability,
  evidenceCapabilityDetails,
  evidenceStateOf,
  profileAvailable,
  profileHealth,
  profilesInUse,
  type ProfileHealth,
  type ProfileHealthInput,
  type ProfileProbe,
} from '../src/shared/profileHealth';

const admitted = { state: 'admitted' } as ExecutionAdmissionDecision;
const blocked = { state: 'blocked' } as ExecutionAdmissionDecision;
const probe = (id: string, over: Partial<ProfileProbe> = {}): ProfileProbe => ({
  id,
  found: true,
  path: `/bin/${id}`,
  version: '1.0.0',
  login: 'signed-in',
  ...over,
});
function health(id: string, over: Partial<ProfileHealthInput> = {}, profile: Partial<AiProfile> = {}): ProfileHealth {
  const base = { ...BUILTIN_PROFILES.find((p) => p.id === id)!, ...profile } as AiProfile;
  return profileHealth({
    profile: base,
    isDefault: false,
    pendingReview: false,
    probe: probe(id),
    authExpired: false,
    validationRequired: true,
    credentials: [],
    capabilities: ['verified'],
    admission: admitted,
    evidence: { state: 'valid' },
    install: null,
    ...over,
  });
}

describe('profileProblem (ordem de resolver)', () => {
  it('pendente de revisão vem antes de tudo e não guarda probe nem admissão', () => {
    const h = health('claude', { pendingReview: true, probe: probe('claude', { found: false }) });
    expect(h).toMatchObject({ problem: 'pending-review', registration: 'pending-review', probe: null, admission: null });
  });
  it('sem CLI, o problema é cli, mesmo com evidência antiga', () => {
    expect(health('cursor', { probe: probe('cursor', { found: false, login: 'unchecked' }) }).problem).toBe('cli');
    expect(health('cursor', { probe: null }).problem).toBe('cli');
  });
  it('login desconectado ou vencido numa execução é signin', () => {
    expect(health('claude', { probe: probe('claude', { login: 'signed-out' }) }).problem).toBe('signin');
    expect(health('claude', { authExpired: true }).problem).toBe('signin');
  });
  it('nunca testado, vencido e não admissível, nesta ordem', () => {
    expect(health('claude', { evidence: { state: 'never' }, admission: blocked }).problem).toBe('unvalidated');
    expect(health('claude', { evidence: { state: 'stale' }, admission: blocked }).problem).toBe('stale');
    expect(health('claude', { admission: blocked }).problem).toBe('not-admissible');
    expect(health('claude', { admission: null }).problem).toBe('not-admissible');
  });
});

describe('validação não exigida', () => {
  it('não validado, vencido e não admissível aparecem no bloco, mas não são problema', () => {
    for (const evidence of [{ state: 'never' }, { state: 'stale' }] as const)
      expect(health('claude', { validationRequired: false, evidence, admission: blocked }).problem).toBeNull();
    expect(health('claude', { validationRequired: false, evidence: { state: 'never' } }).evidence.state).toBe('never');
  });
  it('sem CLI e sem login continuam sendo problema', () => {
    expect(health('claude', { validationRequired: false, probe: null }).problem).toBe('cli');
    expect(health('claude', { validationRequired: false, authExpired: true }).problem).toBe('signin');
  });
});

describe('profileAvailable', () => {
  it('login não conferível não impede; sem CLI ou admissão recusada, sim', () => {
    expect(profileAvailable(health('claude', { probe: probe('claude', { login: 'unchecked' }) }))).toBe(true);
    expect(profileAvailable(health('claude', { probe: probe('claude', { found: false }) }))).toBe(false);
    expect(profileAvailable(health('claude', { admission: blocked }))).toBe(false);
  });
  it('capacidade parcial ou desconhecida é copiada como veio, nunca vira verificada', () => {
    expect(health('claude', { capabilities: ['partial', 'unknown'] }).capabilities).toEqual(['partial', 'unknown']);
  });
});

describe('boardAvailability', () => {
  it('critério de aceite: Claude Code pronto e Cursor sem CLI não bloqueia, com um aviso só do Cursor', () => {
    const a = boardAvailability([health('claude'), health('cursor', { probe: probe('cursor', { found: false }) })]);
    expect(a).toEqual({ blocked: false, reason: null, warnings: [{ id: 'cursor', name: 'Cursor', problem: 'cli' }] });
  });
  it('nenhum ligado bloqueia com no-enabled', () => {
    expect(boardAvailability([])).toMatchObject({ blocked: true, reason: 'no-enabled', warnings: [] });
    expect(boardAvailability([health('claude', {}, { enabled: false })])).toMatchObject({ blocked: true, reason: 'no-enabled' });
  });
  it('todos só não validados ou vencidos: unvalidated', () => {
    const a = boardAvailability([health('claude', { evidence: { state: 'never' } }), health('cursor', { evidence: { state: 'stale' } })]);
    expect(a).toMatchObject({ blocked: true, reason: 'unvalidated' });
    expect(a.warnings).toHaveLength(2);
  });
  it('um sem CLI e outro não admissível: unavailable', () => {
    const a = boardAvailability([health('claude', { admission: blocked }), health('cursor', { probe: null })]);
    expect(a).toMatchObject({ blocked: true, reason: 'unavailable' });
  });
  it('desligado e pendente nunca geram aviso', () => {
    const a = boardAvailability([
      health('claude'),
      health('cursor', { probe: null }, { enabled: false }),
      health('kimi', { pendingReview: true }),
    ]);
    expect(a).toEqual({ blocked: false, reason: null, warnings: [] });
  });
});

type InUseBoard = Pick<Board, 'aiTool' | 'modelRules' | 'execProfiles'>;
const rule = (model: string): ModelRule => ({ id: model, name: model, enabled: true, groups: [], model });
const agent = (model: string): ExecProfile => ({ id: model, model }) as ExecProfile;
const inUseBoard = (over: Partial<InUseBoard> = {}): InUseBoard => ({ aiTool: 'claude', modelRules: [], execProfiles: [], ...over });

describe('profilesInUse', () => {
  it('sem regras nem agentes, devolve só o padrão', () => {
    expect(profilesInUse(inUseBoard())).toEqual(['claude']);
  });
  it('junta os prefixos das regras e dos agentes, na ordem, sem repetir', () => {
    const board = inUseBoard({
      modelRules: [rule('cursor:composer-1'), rule('claude:opus@high'), rule('kimi:k3')],
      execProfiles: [agent('kimi:k3@max'), agent('cursor:gpt-5')],
    });
    expect(profilesInUse(board)).toEqual(['claude', 'cursor', 'kimi']);
  });
  it('valor sem prefixo `<perfil>:` não entra; o esforço não atrapalha o prefixo', () => {
    const board = inUseBoard({ modelRules: [rule('opus'), rule('cursor:composer-1@high')], execProfiles: [agent('')] });
    expect(profilesInUse(board)).toEqual(['claude', 'cursor']);
  });
  it('perfil apagado que ainda aparece numa regra ou agente continua na lista', () => {
    const board = inUseBoard({ modelRules: [rule('apagado:modelo')], execProfiles: [agent('apagado:outro')] });
    expect(profilesInUse(board)).toEqual(['claude', 'apagado']);
  });
});

describe('a última verificação real pelas provas de capacidade (evidenceStateOf)', () => {
  const BINDING = 'b'.repeat(64);
  const NOW = 1000;
  const proofs = (checkedAt: number, outcome: 'passed' | 'failed' = 'passed'): CapabilityEvidence[] =>
    EXECUTOR_CAPABILITIES.map((capability) => ({
      version: 1,
      capability,
      binding: BINDING,
      source: 'host-probe',
      checkedAt,
      expiresAt: NOW + 1000,
      checks: CAPABILITY_CHECKS[capability].map((id) => ({ id, outcome, receipt: 'a'.repeat(64) })),
    }));
  it('com prova em vigor no vínculo atual, é válida, com a data da prova mais recente e a versão da CLI', () => {
    const rows = [...proofs(NOW - 500), ...proofs(NOW - 100)];
    expect(evidenceStateOf(BINDING, rows, NOW, 'cli', false, '2.1.316')).toEqual({
      state: 'valid',
      checkedAt: NOW - 100,
      version: '2.1.316',
      ok: true,
    });
  });
  it('sem prova nenhuma é "nunca testado"; com a última prova noutro vínculo, "vencida" (a prova de lá não vale aqui)', () => {
    expect(evidenceStateOf(BINDING, [], NOW, 'cli', false, '2.1.316')).toEqual({ state: 'never' });
    expect(evidenceStateOf(BINDING, [], NOW, 'cli', true, '2.1.316')).toEqual({ state: 'stale', version: '2.1.316' });
    // a data da prova do vínculo anterior, quando o host a carregou: a linha diz de quando ela é
    expect(evidenceStateOf(BINDING, [], NOW, 'cli', true, '2.1.316', NOW - 5000)).toEqual({
      state: 'stale',
      version: '2.1.316',
      checkedAt: NOW - 5000,
    });
  });
  it('cada capacidade leva o motivo de não estar verificada, com o check na falha e na parcial', () => {
    const details = (rows: CapabilityEvidence[]) => evidenceCapabilityDetails(BINDING, rows, NOW, 'cli');
    // sem prova nenhuma; cancelamento e saída não têm sonda: sem motivo
    expect(details([]).map((d) => d.reason)).toEqual([
      { reason: 'no-evidence' },
      { reason: 'no-evidence' },
      { reason: 'no-evidence' },
      { reason: 'no-evidence' },
      { reason: 'no-evidence' },
      null,
      null,
    ]);
    // prova em vigor: verificada, sem motivo
    expect(
      details(proofs(NOW - 100))
        .slice(0, 5)
        .every((d) => d.state === 'verified' && d.reason === null),
    ).toBe(true);
    // a prova de outro vínculo (a CLI mudou) e a vencida
    expect(details(proofs(NOW - 100).map((r) => ({ ...r, binding: 'c'.repeat(64) })))[0]).toEqual({
      state: 'unknown',
      reason: { reason: 'changed-binding' },
    });
    expect(details(proofs(NOW - 100).map((r) => ({ ...r, expiresAt: NOW - 1 })))[0]).toEqual({
      state: 'unknown',
      reason: { reason: 'expired' },
    });
    // a falha diz o check que falhou; a parcial, o indisponível
    const failedMcp = proofs(NOW - 100).map((r) =>
      r.capability === 'mcp' ? { ...r, checks: r.checks.map((c) => ({ ...c, outcome: 'failed' as const })) } : r,
    );
    expect(details(failedMcp)[3]).toEqual({ state: 'partial', reason: { reason: 'failed', check: CAPABILITY_CHECKS.mcp[0] } });
    const partialArtifacts = proofs(NOW - 100).map((r) =>
      r.capability === 'artifacts'
        ? { ...r, checks: r.checks.map((c) => (c.id === 'user-sentinel' ? { ...c, outcome: 'unavailable' as const } : c)) }
        : r,
    );
    expect(details(partialArtifacts)[1]).toEqual({ state: 'partial', reason: { reason: 'incomplete', check: 'user-sentinel' } });
    // a prova que não cobre um check (sem dizer indisponível) aponta o que falta
    const missingCheck = proofs(NOW - 100).map((r) =>
      r.capability === 'mcp' ? { ...r, checks: r.checks.filter((c) => c.id !== 'operation-scope') } : r,
    );
    expect(details(missingCheck)[3]).toEqual({ state: 'partial', reason: { reason: 'incomplete', check: 'operation-scope' } });
  });
  it('prova com check falho ou vencida não vale: volta a "nunca testado" sem vínculo anterior', () => {
    expect(evidenceStateOf(BINDING, proofs(NOW - 100, 'failed'), NOW, 'cli', false).state).toBe('never');
    const expired = proofs(NOW - 100).map((r) => ({ ...r, expiresAt: NOW - 1 }));
    expect(evidenceStateOf(BINDING, expired, NOW, 'cli', false).state).toBe('never');
  });
  it('a evidência informa e não bloqueia: sem validationRequired o perfil segue disponível em qualquer estado', () => {
    for (const state of ['valid', 'stale', 'never'] as const)
      expect(health('claude', { validationRequired: false, evidence: { state } }).problem).toBeNull();
  });
});
