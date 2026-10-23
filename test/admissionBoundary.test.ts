import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AdmissionBlockedError, ExecutionAdmission } from '../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
import type { AiProfile } from '../src/shared/aiProfiles';
import {
  ACP_CAPABILITY_CHECKS,
  CAPABILITY_CHECKS,
  EXECUTOR_CAPABILITIES,
  type StrictExecutionRequest,
} from '../src/shared/executionAdmission';
import type { HeadlessInput } from '../src/extension/headless';

// Fixtures de teste: nenhum recibo aqui representa verificação de uma CLI real.
let dir: string;
let store: CapabilityEvidenceStore;
let admission: ExecutionAdmission;
const now = 1000;
const request = (over: Partial<StrictExecutionRequest> = {}): StrictExecutionRequest => ({
  version: 1,
  mcpLevel: { permission: 'board', tools: [] },
  regime: 'exclusive',
  boardTools: { mode: 'inherit' },
  agentTools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
  activeMcpIds: [],
  allowedMcpIds: [],
  boardMcpIds: [],
  mcpServers: [],
  mcpTools: [],
  boardMcpTools: [],
  ...over,
});
const input = (): HeadlessInput => ({ prompt: 'objetivo', permission: 'board' });
const exe = (name: string, body: string) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body, { mode: 0o755 });
  return file;
};
const profile = (over: Partial<AiProfile>): AiProfile => ({
  id: 'perfil',
  name: 'Perfil',
  kind: 'copy',
  base: 'claude',
  enabled: true,
  position: 3,
  config: {},
  credentials: { secretRef: 'b'.repeat(64), review: 'reviewed', available: true },
  ...over,
});
function blocked(p: AiProfile, r = request()): AdmissionBlockedError {
  try {
    admission.prepare(p, p.id, input(), dir, r);
  } catch (e) {
    if (e instanceof AdmissionBlockedError) return e;
    throw e;
  }
  throw new Error('admitido sem prova');
}
const authorize = (binding: string) => {
  for (const capability of EXECUTOR_CAPABILITIES)
    store.record({
      version: 1,
      capability,
      binding,
      source: 'host-probe',
      checkedAt: now - 10,
      expiresAt: now + 1000,
      checks: CAPABILITY_CHECKS[capability].map((id) => ({ id, outcome: 'passed', receipt: 'a'.repeat(64) })),
    });
};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-boundary-'));
  store = new CapabilityEvidenceStore(path.join(dir, 'evidence'));
  admission = new ExecutionAdmission({
    pathEnv: () => dir,
    homeDir: dir,
    evidence: store,
    now: () => now,
    environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('fronteira da admissão do board', () => {
  it('perfil personalizado, mesmo sem argumentos de permissão, não roda em modo restrito', () => {
    const custom = profile({ kind: 'custom', base: 'generic', config: { command: exe('custom-cli', 'x') } });
    const error = blocked(custom);
    expect(error.decision.reasons).toContainEqual({ code: 'tool-mapping-unavailable' });
    expect(error.decision.state).toBe('blocked');
  });
  it('perfil personalizado com permissionArgs declarado também continua recusado', () => {
    const custom = profile({
      kind: 'custom',
      base: 'generic',
      config: { command: exe('custom-cli', 'x'), permissionArgs: { board: ['--read-only'] } },
    });
    expect(blocked(custom).decision.reasons.map((r) => r.code)).toContain('tool-mapping-unavailable');
  });
  it('perfil ACP: o vínculo é o comando do agente do catálogo e o perfil vale só no regime compatível', () => {
    exe('gemini', 'agente de teste');
    const acp = profile({ kind: 'custom', base: 'generic', config: { acpAgent: 'gemini' } });
    const exclusive = blocked(acp);
    expect(exclusive.decision.reasons.map((r) => r.code)).not.toContain('tool-mapping-unavailable');
    for (const capability of EXECUTOR_CAPABILITIES)
      store.record({
        version: 1,
        capability,
        binding: exclusive.decision.binding,
        source: 'host-probe',
        checkedAt: now - 10,
        expiresAt: now + 1000,
        checks: ACP_CAPABILITY_CHECKS[capability].map((id) => ({
          id,
          outcome: id === 'own-context-files' ? 'unavailable' : 'passed',
          receipt: 'a'.repeat(64),
        })),
      });
    expect(blocked(acp).decision.reasons).toEqual([{ code: 'capability-not-verified', capability: 'artifacts' }]);
    const reviewed = request({ regime: 'compatible', compatibilityReview: { actor: 'person', revision: 1 } });
    const admitted = admission.prepare(acp, acp.id, input(), dir, reviewed);
    expect(admitted.transport).toBe('acp');
    expect(admitted.acpCommand({ command: 'gemini', args: ['--acp', '--skip-trust'] }).command).toBe(
      fs.realpathSync(path.join(dir, 'gemini')),
    );
    expect(() => admitted.acpCommand({ command: 'gemini', args: ['--acp'] })).toThrow('mudou');
    expect(() => admitted.acpCommand({ command: 'gemini', args: ['--acp', '--skip-trust'], env: { X: '1' } })).toThrow('mudou');
    expect(() => admitted.command({ command: 'gemini', args: [], format: 'text' })).toThrow('agente ACP');
    // outro agente do catálogo (outro comando) não herda os recibos deste
    exe('opencode', 'outro agente');
    const other = profile({ kind: 'custom', base: 'generic', config: { acpAgent: 'opencode' } });
    expect(blocked(other, reviewed).decision.reasons).toContainEqual({ code: 'capability-not-verified', capability: 'permissions' });
    // agente fora do catálogo não é vinculado
    const unknown = profile({ kind: 'custom', base: 'generic', config: { acpAgent: 'nao-existe' } });
    expect(() => admission.prepare(unknown, unknown.id, input(), dir, reviewed)).toThrow(/desconhecido/);
  });
  it('cópia que troca o binário não herda a verificação da cópia anterior', () => {
    const first = profile({ config: { command: exe('claude-a', 'binário A') } });
    authorize(blocked(first).decision.binding);
    expect(admission.prepare(first, first.id, input(), dir, request()).decision.state).toBe('admitted');
    const swapped = profile({ config: { command: exe('claude-b', 'binário B') } });
    expect(blocked(swapped).decision.reasons).toContainEqual({ code: 'capability-not-verified', capability: 'conversation' });
  });
  it('MCP fora do escopo do board é negado antes de preparar o comando', () => {
    const claude = profile({ config: { command: exe('claude-c', 'binário C') } });
    const r = request({
      mcpTools: ['mcp__externo__ler'],
      mcpServers: [{ artifactId: 'x', name: 'externo' }],
      mcpLevel: { permission: 'board', tools: ['mcp__externo__ler'] },
    });
    expect(blocked(claude, r).decision.reasons).toContainEqual({ code: 'mcp-operation-outside-boundary', resourceId: 'mcp__externo__ler' });
  });
  it('pedido de compatibilidade sem revisão da pessoa não autoriza ignorar o contexto externo', () => {
    const claude = profile({ config: { command: exe('claude-d', 'binário D') } });
    const ai = request({ regime: 'compatible', compatibilityReview: { actor: 'ai' as 'person', revision: 1 } });
    expect(blocked(claude, ai).decision.reasons).toContainEqual({ code: 'compatibility-not-reviewed' });
    expect(blocked(claude, request({ regime: 'compatible' })).decision.state).toBe('blocked');
  });
});
