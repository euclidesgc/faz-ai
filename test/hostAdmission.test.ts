import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ExecutionAdmission, AdmissionBlockedError } from '../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
import { CAPABILITY_CHECKS, EXECUTOR_CAPABILITIES, type StrictExecutionRequest } from '../src/shared/executionAdmission';
import { headlessCommand, type HeadlessInput } from '../src/extension/headless';
import { materialize } from '../src/extension/aiOutput/measured';
let dir: string;
let exe: string;
let store: CapabilityEvidenceStore;
let admission: ExecutionAdmission;
const now = 1000;
const request = (): StrictExecutionRequest => ({
  version: 1,
  mcpLevel: { permission: 'full', tools: [] },
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
const input = (): HeadlessInput => ({ prompt: 'objetivo da atividade', permission: 'full' });
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-host-admit-'));
  exe = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
  fs.writeFileSync(exe, 'binário de teste; nunca executar', { mode: 0o755 });
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
/** Só fixtures assinadas do verificador de teste. Isto não verifica a CLI real. */
function approve(i = input(), r = request(), profile = 'claude') {
  let binding = '';
  try {
    admission.prepare('claude', profile, i, dir, r);
  } catch (e) {
    if (!(e instanceof AdmissionBlockedError)) throw e;
    binding = e.decision.binding;
  }
  expect(binding).toMatch(/^[a-f0-9]{64}$/);
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
  return admission.prepare('claude', profile, i, dir, r);
}
describe('admissão no host', () => {
  it('sem evidências, bloqueia e não inventa verificação ou inicia processo', () => {
    expect(() => admission.prepare('claude', 'claude', input(), dir, request())).toThrow(AdmissionBlockedError);
    expect(fs.existsSync(path.join(dir, 'evidence'))).toBe(false);
  });
  it('vincula prova a perfil, binário, argumentos, ambiente, permissão, cwd e diretórios adicionais', () => {
    const i = input();
    const base = admission.binding('claude', 'claude', i, dir).binding;
    expect(admission.binding('claude', 'copia', i, dir).binding).not.toBe(base);
    fs.writeFileSync(exe, 'outro binário');
    expect(admission.binding('claude', 'claude', i, dir).binding).not.toBe(base);
    fs.writeFileSync(exe, 'binário de teste; nunca executar');
    expect(admission.binding('claude', 'claude', { ...i, permission: 'board' }, dir).binding).not.toBe(base);
    const child = path.join(dir, 'child');
    fs.mkdirSync(child);
    expect(admission.binding('claude', 'claude', { ...i, addDirs: [child] }, dir).binding).not.toBe(base);
    expect(admission.binding('claude', 'claude', i, child).binding).not.toBe(base);
    const before = process.env.FAZAI_ADMISSION_TEST;
    try {
      process.env.FAZAI_ADMISSION_TEST = 'mudou';
      expect(admission.binding('claude', 'claude', i, dir).binding).not.toBe(base);
    } finally {
      if (before === undefined) delete process.env.FAZAI_ADMISSION_TEST;
      else process.env.FAZAI_ADMISSION_TEST = before;
    }
    expect(admission.binding('claude', 'claude', { ...i, prompt: 'outro objetivo sem mudar capacidades' }, dir).binding).toBe(base);
  });
  it('o conjunto imposto é explícito, sem bypass de permissões nem wildcard do board', () => {
    const r = request();
    r.agentTools.categories = [];
    const admitted = approve(input(), r);
    const built = headlessCommand('claude', { ...admitted.input, structured: true });
    expect(admitted.input.exec?.tools).toEqual([]);
    expect(built.args[built.args.indexOf('--tools') + 1]).toBe('');
    expect(built.args).toContain('dontAsk');
    expect(built.args).not.toContain('bypassPermissions');
    expect(built.args.join(' ')).not.toContain('mcp__faz-ai__*');
    expect(admitted.input.exec?.delegates).toEqual([]);
    expect(admitted.input.exec?.deniedTools).toContain('Agent');
  });
  it('pruna servidores não selecionados, sem expor seus segredos na decisão', () => {
    const i = input();
    i.boardServer = { command: 'node', args: ['bridge.js'], env: { SECRET: 'sentinela' } };
    const admitted = approve(i);
    expect(admitted.input.exec?.mcpConfig).toBe('{"mcpServers":{}}');
    expect(JSON.stringify(admitted.decision)).not.toContain('sentinela');
    expect(JSON.stringify(admitted.decision)).not.toContain('bridge.js');
  });
  it('alteração do binário depois de admitir impede liberar o comando', () => {
    const admitted = approve();
    const files = materialize(headlessCommand('claude', { ...admitted.input, structured: true }));
    try {
      fs.writeFileSync(exe, 'atualizado');
      expect(() => admitted.command(files.command)).toThrow('mudou');
    } finally {
      files.cleanup();
    }
  });
  it('retirada de flags, mudança de prompt e mudança do arquivo MCP são recusadas; só o formato pode variar', () => {
    const admitted = approve();
    const files = materialize(headlessCommand('claude', { ...admitted.input, structured: true }));
    try {
      expect(admitted.command(files.command).command).toBe(fs.realpathSync(exe));
      expect(() => admitted.command({ ...files.command, args: files.command.args.filter((a) => a !== '--setting-sources') })).toThrow(
        'mudou',
      );
      expect(() => admitted.command({ ...files.command, stdin: 'outro prompt' })).toThrow('mudou');
      const mcp = files.command.args[files.command.args.indexOf('--mcp-config') + 1]!;
      fs.writeFileSync(mcp, '{"mcpServers":{"externo":{}}}');
      expect(() => admitted.command(files.command)).toThrow('restrição obrigatória');
    } finally {
      files.cleanup();
    }
    const plain = materialize(headlessCommand('claude', { ...admitted.input, structured: false }));
    try {
      expect(admitted.command(plain.command).format).toBe('text');
    } finally {
      plain.cleanup();
    }
  });
  it('uma cópia do perfil e uma nova versão não herdam os recibos antigos', () => {
    approve();
    expect(() => admission.prepare('claude', 'copia', input(), dir, request())).toThrow(AdmissionBlockedError);
    fs.writeFileSync(exe, 'nova versão');
    expect(() => admission.prepare('claude', 'claude', input(), dir, request())).toThrow(AdmissionBlockedError);
  });
  it('políticas externas desconhecidas impedem admitir mesmo com recibos sintéticos completos', () => {
    admission = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => now,
      environmentEvidence: () => ({ state: 'unknown' }),
    });
    expect(() => approve()).toThrow(AdmissionBlockedError);
    try {
      admission.prepare('claude', 'claude', input(), dir, request());
    } catch (e) {
      expect((e as AdmissionBlockedError).decision.reasons).toContainEqual({ code: 'environment-not-verified' });
    }
  });
});

it('não transporta permissões ou modelos ocultos na definição nativa do agente', () => {
  const i = input();
  i.exec = {
    agent: 'revisor',
    agentDefinition: Object.assign(
      { name: 'revisor', description: 'Revisor', prompt: 'Revise.', model: 'modelo-externo', tools: ['Agent'] },
      { permissionMode: 'bypassPermissions', skills: ['externa'], mcpServers: ['externo'] },
    ),
    delegates: [],
    mcpAllowed: [],
    mcpBlocked: [],
    mcpConfig: null,
    tools: [],
    deniedTools: [],
    model: null,
  };
  const admitted = approve(i);
  expect(admitted.input.exec?.agentDefinition).toEqual({
    name: 'revisor',
    description: 'Revisor',
    prompt: 'Revise.',
    tools: admitted.decision.tools,
    disallowedTools: admitted.decision.deniedTools,
  });
});

describe('prévia da admissão (E3)', () => {
  it('lê a decisão sem lançar nem exigir definições MCP, e explica a falta de recibos', () => {
    const decision = admission.preview('claude', 'claude', { ...request(), mcpLevel: { permission: 'board', tools: [] } }, dir);
    expect(decision.state).toBe('blocked');
    expect(decision.reasons.map((r) => r.code)).toContain('capability-not-verified');
  });
});
