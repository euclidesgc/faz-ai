import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ExecutionAdmission } from '../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
import {
  evaluateAcpProbes,
  evaluateProbes,
  verifyExecutor,
  type AcpProbeRun,
  type ProbeObservation,
  type ProbeRun,
} from '../src/extension/ai/capabilityVerifier';
import { ACP_CAPABILITY_CHECKS, CAPABILITY_CHECKS, assessCapability, type StrictExecutionRequest } from '../src/shared/executionAdmission';
import { BUILTIN_PROFILES, verifiableProfile, verifiableProfiles, type AiProfile } from '../src/shared/aiProfiles';
import { evidenceCapabilities, evidenceCurrent } from '../src/shared/profileHealth';

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

const handshake = (sessionId: string | null, version = 1) => ({
  protocolVersion: version,
  agentCapabilities: { loadSession: false },
  sessionId,
  authRequired: false,
  error: null,
});
const acpGood = (): AcpProbeRun => ({
  first: handshake('s1'),
  second: handshake('s2'),
  mcpConnected: true,
  environmentDigest: 'a'.repeat(64),
});
const acpOutcomes = (run: AcpProbeRun) =>
  Object.fromEntries(
    Object.entries(evaluateAcpProbes('b'.repeat(64), run)).flatMap(([cap, cs]) => cs.map((c) => [`${cap}/${c.id}`, c.outcome])),
  );

describe('avaliação do handshake ACP', () => {
  it('passa o protocolo, a sessão nova e o MCP da sessão; os arquivos do agente ficam sem prova', () => {
    expect(acpOutcomes(acpGood())).toEqual({
      'conversation/fresh-session': 'passed',
      'artifacts/own-context-files': 'unavailable',
      'artifacts/managed-settings': 'passed',
      'permissions/protocol-version': 'passed',
      'mcp/session-servers': 'passed',
      'delegation/protocol-version': 'passed',
    });
  });
  it('sessão repetida, outra versão do protocolo, login pendente e MCP ignorado falham', () => {
    const same = acpGood();
    same.second = handshake('s1');
    expect(acpOutcomes(same)['conversation/fresh-session']).toBe('failed');
    const v2 = acpGood();
    v2.first = handshake('s1', 2);
    expect(acpOutcomes(v2)['permissions/protocol-version']).toBe('failed');
    const login = acpGood();
    login.first = { ...handshake(null), authRequired: true, error: 'auth_required' };
    expect(acpOutcomes(login)['delegation/protocol-version']).toBe('failed');
    expect(acpOutcomes(login)['conversation/fresh-session']).toBe('failed');
    const noMcp = acpGood();
    noMcp.mcpConnected = false;
    expect(acpOutcomes(noMcp)['mcp/session-servers']).toBe('failed');
  });
});

describe('verifyExecutor com agente ACP', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-verifier-acp-'));
    fs.writeFileSync(path.join(dir, 'gemini'), 'agente de teste', { mode: 0o755 });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const acp: AiProfile = {
    id: 'gemini-acp',
    name: 'Gemini ACP',
    kind: 'custom',
    base: 'generic',
    enabled: true,
    position: 5,
    config: { acpAgent: 'gemini' },
    credentials: { secretRef: 'b'.repeat(64), review: 'reviewed', available: true },
  };
  const request = (regime: 'exclusive' | 'compatible'): StrictExecutionRequest => ({
    version: 1,
    mcpLevel: { permission: 'board', tools: [] },
    regime,
    ...(regime === 'compatible' ? { compatibilityReview: { actor: 'person' as const, revision: 1 } } : {}),
    boardTools: { mode: 'inherit' },
    agentTools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
    activeMcpIds: [],
    allowedMcpIds: [],
    boardMcpIds: [],
    mcpServers: [],
    mcpTools: [],
    boardMcpTools: [],
  });
  it('grava os recibos do handshake no vínculo do agente: admissível no regime compatível, não no exclusivo', async () => {
    const store = new CapabilityEvidenceStore(path.join(dir, 'evidence'));
    const admission = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => 1000,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
    });
    const result = await verifyExecutor({
      executor: acp,
      profileId: acp.id,
      admission,
      store,
      pathEnv: dir,
      now: () => 900,
      spawn: () => {
        throw new Error('sem CLI');
      },
      probeAcp: async () => acpGood(),
    });
    // "verificado" pede todos os checks: o dos arquivos do agente nunca passa no ACP
    expect(result.verified).toBe(false);
    const evidence = store.load(result.binding);
    expect(evidence).toHaveLength(5);
    expect(evidence.find((e) => e.capability === 'permissions')?.checks.map((c) => c.id)).toEqual(ACP_CAPABILITY_CHECKS.permissions);
    expect(assessCapability('artifacts', result.binding, evidence, 1000, ACP_CAPABILITY_CHECKS).state).toBe('partial');
    expect(assessCapability('mcp', result.binding, evidence, 1000, ACP_CAPABILITY_CHECKS).state).toBe('verified');
    expect(() => admission.prepare(acp, acp.id, { prompt: 'x', permission: 'board' }, dir, request('exclusive'))).toThrow();
    const admitted = admission.prepare(acp, acp.id, { prompt: 'x', permission: 'board' }, dir, request('compatible'));
    expect(admitted.decision.state).toBe('admitted');
    expect(admitted.transport).toBe('acp');
  });
  it('sem o transporte ACP no host, não há sondagem', async () => {
    const store = new CapabilityEvidenceStore(path.join(dir, 'evidence'));
    const admission = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => 1000,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
    });
    await expect(
      verifyExecutor({
        executor: acp,
        profileId: acp.id,
        admission,
        store,
        pathEnv: dir,
        spawn: () => {
          throw new Error('sem CLI');
        },
      }),
    ).rejects.toThrow(/ACP indisponível/);
  });
});

describe('verificação por perfil', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-verifier-perfil-'));
    for (const bin of ['claude', 'cursor-agent', 'gemini']) fs.writeFileSync(path.join(dir, bin), 'binário de teste', { mode: 0o755 });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const builtin = (id: string, over: Partial<AiProfile> = {}): AiProfile => ({ ...BUILTIN_PROFILES.find((p) => p.id === id)!, ...over });
  const make = () => {
    const store = new CapabilityEvidenceStore(path.join(dir, 'evidence'));
    const admission = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => 1000,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
    });
    return { store, admission };
  };
  const deps = (executor: AiProfile, store: CapabilityEvidenceStore, admission: ExecutionAdmission) => ({
    executor,
    profileId: executor.id,
    admission,
    store,
    pathEnv: dir,
    now: () => 900,
    spawn: () => {
      throw new Error('sem CLI');
    },
    probe: async () => good(),
    probeAcp: async () => acpGood(),
  });

  it('aceita o perfil resolvido do Claude (não só o id) e recusa o que não tem sonda', async () => {
    const { store, admission } = make();
    const result = await verifyExecutor(deps(builtin('claude'), store, admission));
    expect(result.verified).toBe(true);
    await expect(verifyExecutor(deps(builtin('cursor'), store, admission))).rejects.toThrow(/só existe para a CLI do Claude/);
  });

  it('cada perfil tem a própria evidência: provar o agente ACP não prova o Claude', async () => {
    const { store, admission } = make();
    const gemini = builtin('gemini', { enabled: true });
    const result = await verifyExecutor(deps(gemini, store, admission));
    const own = evidenceCapabilities(result.binding, store.load(result.binding), 1000, 'acp');
    // na ordem de PROFILE_CAPABILITIES: os arquivos do agente ficam sem prova; cancelamento e saída não têm sonda
    expect(own).toEqual(['verified', 'partial', 'verified', 'verified', 'verified', 'unknown', 'unknown']);
    const claude = admission.isolationBinding(builtin('claude'), 'claude', 'board').binding;
    expect(claude).not.toBe(result.binding);
    expect(evidenceCapabilities(claude, store.load(claude), 1000, 'cli').every((c) => c === 'unknown')).toBe(true);
  });

  it('a prova em vigor deixa pular a verificação automática; vencida, falha ou de outro vínculo, não', async () => {
    const { store, admission } = make();
    const gemini = builtin('gemini', { enabled: true });
    const result = await verifyExecutor(deps(gemini, store, admission));
    // a parcial dos arquivos do agente (check indisponível) conta como prova em vigor
    expect(evidenceCurrent(result.binding, store.load(result.binding), 1000, 'acp')).toBe(true);
    expect(evidenceCurrent(result.binding, store.load(result.binding), 900 + 15 * 24 * 3600_000, 'acp')).toBe(false);
    expect(evidenceCurrent('c'.repeat(64), store.load(result.binding), 1000, 'acp')).toBe(false);
    const noMcp = acpGood();
    noMcp.mcpConnected = false;
    const failed = await verifyExecutor({ ...deps(gemini, store, admission), now: () => 950, probeAcp: async () => noMcp });
    expect(evidenceCurrent(failed.binding, store.load(failed.binding), 1000, 'acp')).toBe(false);
  });

  it('a prova feita pelo verificador vale para edits e full, e o perfil guarda o vínculo dela', async () => {
    const { store, admission } = make();
    const claude = builtin('claude');
    expect(store.lastBinding('claude')).toBeNull();
    const result = await verifyExecutor(deps(claude, store, admission));
    expect(store.lastBinding('claude')).toBe(result.binding);
    for (const permission of ['edits', 'full'] as const)
      expect(admission.isolationBinding(claude, 'claude', permission).binding).toBe(result.binding);
    // o índice é por perfil: o agente ACP verificado depois não apaga o do Claude
    const gemini = await verifyExecutor(deps(builtin('gemini', { enabled: true }), store, admission));
    expect(store.lastBinding('gemini')).toBe(gemini.binding);
    expect(store.lastBinding('claude')).toBe(result.binding);
  });

  it('falha ao gravar o índice por perfil não perde os recibos nem o resultado', async () => {
    const { store, admission } = make();
    store.remember = () => {
      throw new Error('disco cheio');
    };
    const result = await verifyExecutor(deps(builtin('claude'), store, admission));
    expect(result.verified).toBe(true);
    expect(result.indexError).toMatch(/disco cheio/);
    expect(store.load(result.binding)).toHaveLength(5);
  });

  it('binário trocado depois da prova: o vínculo atual não é mais o da última prova', async () => {
    const { store, admission } = make();
    const gemini = builtin('gemini', { enabled: true });
    const result = await verifyExecutor(deps(gemini, store, admission));
    fs.writeFileSync(path.join(dir, 'gemini'), 'binário atualizado, outra versão', { mode: 0o755 });
    const current = admission.isolationBinding(gemini, gemini.id, 'board').binding;
    expect(current).not.toBe(result.binding);
    expect(store.lastBinding(gemini.id)).toBe(result.binding);
    expect(evidenceCurrent(current, store.load(current), 1000, 'acp')).toBe(false);
  });

  it('nenhuma variável sensível do ambiente é gravada em claro nas evidências nem no índice', async () => {
    const secrets = {
      ANTHROPIC_API_KEY: 'sk-ant-nao-gravar-1234',
      GEMINI_API_KEY: 'gemini-nao-gravar-5678',
      AWS_SESSION_TOKEN: 'aws-nao-gravar',
    };
    const before = Object.fromEntries(Object.keys(secrets).map((k) => [k, process.env[k]]));
    Object.assign(process.env, secrets);
    try {
      const { store, admission } = make();
      await verifyExecutor(deps(builtin('claude'), store, admission));
      await verifyExecutor(deps(builtin('gemini', { enabled: true }), store, admission));
      const files = fs.readdirSync(path.join(dir, 'evidence'));
      expect(files).toContain('profiles.json');
      const written = files.map((f) => fs.readFileSync(path.join(dir, 'evidence', f), 'latin1')).join('\n');
      for (const [name, value] of Object.entries(secrets)) {
        expect(written).not.toContain(value);
        expect(written).not.toContain(name);
      }
    } finally {
      for (const [k, v] of Object.entries(before))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  });

  it('o comando oferece só os perfis ligados, revisados e verificáveis, com o padrão primeiro', () => {
    const board = {
      aiTool: 'gemini',
      aiProfiles: [
        builtin('claude'),
        builtin('cursor'),
        builtin('gemini', { enabled: true }),
        builtin('opencode'),
        {
          ...builtin('claude'),
          id: 'claude-copia',
          kind: 'copy' as const,
          credentials: { secretRef: 'x', review: 'pending' as const, available: true },
        },
      ],
    };
    expect(verifiableProfiles(board).map((p) => p.id)).toEqual(['gemini', 'claude']);
    expect(verifiableProfile(builtin('kimi'))).toBe(false);
    expect(verifiableProfile(builtin('opencode'))).toBe(true);
  });
});
