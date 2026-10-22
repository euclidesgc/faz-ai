import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ExecutionAdmission } from '../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
import { evaluateProbes, verifyExecutor, type ProbeObservation, type ProbeRun } from '../src/extension/ai/capabilityVerifier';
import { CAPABILITY_CHECKS, assessCapability, type StrictExecutionRequest } from '../src/shared/executionAdmission';

const obs = (o: Partial<ProbeObservation> = {}): ProbeObservation => ({
  code: 0,
  timedOut: false,
  requestText: 'x',
  toolNames: ['Read'],
  toolResults: [],
  mcpConnections: [],
  mcpCalls: [],
  sessionId: 's',
  ...o,
});
const canaries = { project: 'c-proj', user: 'c-user', ancestor: 'c-anc', additional: 'c-add', skill: 'c-sk', agent: 'c-ag' };
const good = (): ProbeRun => ({
  control: obs({ requestText: 'c-proj c-user c-anc c-add', mcpConnections: ['forbidden'] }),
  strict: obs({
    requestText: 'FAZAI_READ_ALLOWED',
    toolResults: [
      { name: 'Read', isError: false },
      { name: 'Bash', isError: true },
      { name: 'Write', isError: true },
      { name: 'mcp__allowed__allowed', isError: false },
      { name: 'mcp__allowed__forbidden', isError: true },
      { name: 'Agent', isError: true },
    ],
    mcpCalls: ['allowed:allowed'],
    mcpConnections: ['allowed'],
  }),
  controlHook: true,
  strictHook: false,
  forbiddenFileWritten: false,
  allowedReadContent: 'FAZAI_READ_ALLOWED',
  canaries,
  first: { ...obs({ sessionId: 'a' }), marker: 'm1' },
  second: { ...obs({ sessionId: 'b', requestText: 'm2' }), marker: 'm2' },
  environmentDigest: 'a'.repeat(64),
});
const outcomes = (run: ProbeRun) =>
  Object.fromEntries(Object.values(evaluateProbes('b'.repeat(64), run)).flatMap((cs) => cs.map((c) => [c.id, c.outcome])));

describe('avaliação das sondagens', () => {
  it('passa tudo quando a fixture isola e o controle enxergou a contaminação', () => {
    expect(Object.values(outcomes(good())).every((o) => o === 'passed')).toBe(true);
  });
  it('sentinela vazada falha; controle cego deixa a sentinela indisponível', () => {
    const leak = good();
    leak.strict.requestText += ' c-user';
    expect(outcomes(leak)['user-sentinel']).toBe('failed');
    const blind = good();
    blind.control.requestText = 'c-proj c-user c-anc';
    expect(outcomes(blind)['additional-directory-sentinel']).toBe('unavailable');
  });
  it('ferramenta proibida aceita, servidor proibido conectado e delegação aceita falham', () => {
    const run = good();
    run.strict.toolResults = run.strict.toolResults.map((r) => (r.name === 'Bash' || r.name === 'Agent' ? { ...r, isError: false } : r));
    run.strict.mcpConnections = ['forbidden'];
    const o = outcomes(run);
    expect(o['forbidden-tool']).toBe('failed');
    expect(o['native-delegation-denied']).toBe('failed');
    expect(o['forbidden-server']).toBe('failed');
  });
  it('conversa que reaproveita sessão ou texto anterior falha; CLI que não iniciou falha tudo', () => {
    const run = good();
    run.second.sessionId = 'a';
    expect(outcomes(run)['fresh-conversation']).toBe('failed');
    const dead = good();
    dead.strict.code = 1;
    expect(outcomes(dead)['allowed-tool']).toBe('failed');
  });
});

describe('verifyExecutor', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-verifier-'));
    fs.writeFileSync(path.join(dir, 'claude'), 'binário de teste', { mode: 0o755 });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const make = (complete: boolean) => {
    const store = new CapabilityEvidenceStore(path.join(dir, 'evidence'));
    const admission = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => 1000,
      environmentEvidence: () => (complete ? { state: 'complete', digest: 'a'.repeat(64) } : { state: 'unknown' }),
    });
    return { store, admission };
  };
  const request = (): StrictExecutionRequest => ({
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
  });
  it('grava as cinco evidências no vínculo de isolamento e a admissão vale em outra pasta de projeto', async () => {
    const { store, admission } = make(true);
    const result = await verifyExecutor({
      executor: 'claude',
      profileId: 'claude',
      admission,
      store,
      pathEnv: dir,
      now: () => 900,
      spawn: () => {
        throw new Error('sem CLI');
      },
      probe: async () => good(),
    });
    expect(result.verified).toBe(true);
    const evidence = store.load(result.binding);
    expect(evidence).toHaveLength(5);
    for (const e of evidence) expect(assessCapability(e.capability, result.binding, evidence, 1000).state).toBe('verified');
    for (const cwd of [dir, fs.mkdtempSync(path.join(dir, 'outro-'))]) {
      const admitted = admission.prepare('claude', 'claude', { prompt: 'x', permission: 'board' }, cwd, request());
      expect(admitted.decision.state).toBe('admitted');
    }
    expect(CAPABILITY_CHECKS.mcp).toHaveLength(3);
  });
  it('recusa gravar recibos com o ambiente gerenciado desconhecido', async () => {
    const { store, admission } = make(false);
    await expect(
      verifyExecutor({
        executor: 'claude',
        profileId: 'claude',
        admission,
        store,
        pathEnv: dir,
        spawn: () => {
          throw new Error('sem CLI');
        },
        probe: async () => good(),
      }),
    ).rejects.toThrow('Ambiente gerenciado não verificado');
    expect(fs.existsSync(path.join(dir, 'evidence'))).toBe(false);
  });
  it('grava a falha e a admissão continua bloqueada', async () => {
    const { store, admission } = make(true);
    const bad = good();
    bad.strict.toolResults = [];
    const result = await verifyExecutor({
      executor: 'claude',
      profileId: 'claude',
      admission,
      store,
      pathEnv: dir,
      now: () => 900,
      spawn: () => {
        throw new Error('sem CLI');
      },
      probe: async () => bad,
    });
    expect(result.verified).toBe(false);
    expect(() => admission.prepare('claude', 'claude', { prompt: 'x', permission: 'board' }, dir, request())).toThrow();
  });
});
