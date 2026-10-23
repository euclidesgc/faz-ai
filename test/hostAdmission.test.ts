import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ExecutionAdmission, AdmissionBlockedError, isolationInput as isolationOf } from '../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
import { CAPABILITY_CHECKS, EXECUTOR_CAPABILITIES, type StrictExecutionRequest } from '../src/shared/executionAdmission';
import { headlessCommand, type HeadlessInput } from '../src/extension/headless';
import { materialize } from '../src/extension/aiOutput/measured';
import { verifyExecutor } from '../src/extension/ai/capabilityVerifier';
import { admissionProfileOf } from '../src/shared/contextAdmissionPreview';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import type { ContextActivityTarget } from '../src/shared/contextPlanning';
import type { BoardState } from '../src/shared/model';
import { referenceBinding } from './helpers/bindingReference';
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
  it('o vínculo da execução admitida e o de isolamento são os de antes do contrato de execução (história 6)', () => {
    const options = { pathEnv: dir, homeDir: dir, environmentEvidence: { state: 'complete' as const, digest: 'a'.repeat(64) } };
    const admitted = approve();
    // a prova foi gravada no vínculo de isolamento calculado como antes; a execução admitida fica presa a ele
    expect(admitted.decision.binding).toBe(referenceBinding('claude', 'claude', isolationOf('full'), null, options));
    expect(admission.binding('claude', 'claude', admitted.input, dir).binding).toBe(
      referenceBinding('claude', 'claude', admitted.input, dir, options),
    );
  });
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
    // o ambiente que conta é o que muda o que a CLI carrega (história 3); uma variável qualquer não conta
    const before = { relevant: process.env.CLAUDE_CONFIG_DIR, other: process.env.FAZAI_ADMISSION_TEST };
    try {
      process.env.FAZAI_ADMISSION_TEST = 'mudou';
      expect(admission.binding('claude', 'claude', i, dir).binding).toBe(base);
      process.env.CLAUDE_CONFIG_DIR = path.join(dir, 'outra-config');
      expect(admission.binding('claude', 'claude', i, dir).binding).not.toBe(base);
    } finally {
      if (before.other === undefined) delete process.env.FAZAI_ADMISSION_TEST;
      else process.env.FAZAI_ADMISSION_TEST = before.other;
      if (before.relevant === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = before.relevant;
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

describe('digest do binário no vínculo', () => {
  it('não relê o binário com o mesmo tamanho, mtime e inode; tamanho ou mtime diferente relê', () => {
    const i = input();
    // mtime redondo: o utimes só grava milissegundos, e a chave do cache compara o mtime exato
    fs.utimesSync(exe, 1000, 1000);
    const first = admission.binding('claude', 'claude', i, dir).binding;
    // mesmo tamanho e mesmo mtime com outro conteúdo: só um vínculo vindo do cache continua igual
    fs.writeFileSync(exe, 'binário de teste; NUNCA executar');
    fs.utimesSync(exe, 1000, 1000);
    expect(admission.binding('claude', 'claude', i, dir).binding).toBe(first);
    // outro mtime: relê e o vínculo muda
    fs.utimesSync(exe, 2000, 2000);
    const touched = admission.binding('claude', 'claude', i, dir).binding;
    expect(touched).not.toBe(first);
    // outro tamanho com o mtime de antes: relê de novo
    fs.writeFileSync(exe, 'binário de teste maior; nunca executar');
    fs.utimesSync(exe, 2000, 2000);
    expect(admission.binding('claude', 'claude', i, dir).binding).not.toBe(touched);
  });
});

describe('prévia da admissão pelo perfil do alvo do card', () => {
  const gemini: AiProfile = {
    ...BUILTIN_PROFILES.find((p) => p.id === 'gemini')!,
    enabled: true,
  };
  const claude: AiProfile = { ...BUILTIN_PROFILES.find((p) => p.id === 'claude')! };
  const option = (tool: string, model: string) => ({ id: `${tool}:${model}`, tool, model, label: model, efforts: [], defaultEffort: null });
  const state = (cards: { id: string; model?: string }[]) =>
    ({
      board: {
        aiTool: 'claude',
        aiProfiles: [claude, gemini],
        modelCatalog: [option('claude', 'opus'), option('gemini', 'gemini-2.5-pro')],
        modelRules: [],
        execProfiles: [],
      },
      workflows: [],
      columns: [{ id: 'col', category: 'open', execProfile: null }],
      cardTypes: [{ id: 't', name: 'Tarefa' }],
      cards: cards.map((c) => ({ id: c.id, typeId: 't', columnId: 'col', parentId: null, execProfile: null, status: 'ready' })),
      fieldDefs: [{ id: 'modelo', kind: 'model', appliesToTypes: null }],
      fieldValues: cards.filter((c) => c.model).map((c) => ({ cardId: c.id, fieldId: 'modelo', value: c.model })),
      links: [],
      comments: [],
    }) as unknown as BoardState;
  const target = (cardId: string | null): ContextActivityTarget => ({ cardId, workflowId: null, phaseId: 'col', action: 'work' });
  const compatible = (): StrictExecutionRequest => ({
    ...request(),
    regime: 'compatible',
    compatibilityReview: { actor: 'person', revision: 1 },
    mcpLevel: { permission: 'board', tools: [] },
  });

  it('o card com modelo de outro perfil é avaliado por esse perfil; sem card ou sem modelo, pelo padrão', () => {
    const s = state([{ id: 'acp', model: 'gemini:gemini-2.5-pro' }, { id: 'livre' }, { id: 'quebrado', model: 'kimi:k3' }]);
    expect(admissionProfileOf(s, target('acp'))).toBe('gemini');
    expect(admissionProfileOf(s, target('livre'))).toBe('claude');
    expect(admissionProfileOf(s, target(null))).toBe('claude');
    // a escolha explícita bloqueada não vira o padrão: a prévia não finge avaliar outro perfil
    expect(admissionProfileOf(s, target('quebrado'))).toBeNull();
  });

  it('os recibos do perfil do card valem para a prévia dele, não para o padrão do board', async () => {
    fs.writeFileSync(path.join(dir, 'gemini'), 'agente de teste; nunca executar', { mode: 0o755 });
    await verifyExecutor({
      executor: gemini,
      profileId: gemini.id,
      admission,
      store,
      pathEnv: dir,
      now: () => now - 10,
      spawn: () => {
        throw new Error('sem CLI');
      },
      probeAcp: async () => ({
        first: { protocolVersion: 1, agentCapabilities: { loadSession: false }, sessionId: 's1', authRequired: false, error: null },
        second: { protocolVersion: 1, agentCapabilities: { loadSession: false }, sessionId: 's2', authRequired: false, error: null },
        mcpConnected: true,
        environmentDigest: 'a'.repeat(64),
      }),
    });
    const s = state([{ id: 'acp', model: 'gemini:gemini-2.5-pro' }]);
    const id = admissionProfileOf(s, target('acp'))!;
    const profile = s.board.aiProfiles.find((p) => p.id === id)!;
    expect(admission.preview(profile, id, compatible(), dir).state).toBe('admitted');
    // o padrão (Claude) não herda a prova do agente
    const standard = admission.preview('claude', 'claude', compatible(), dir);
    expect(standard.state).toBe('blocked');
    expect(standard.reasons.map((r) => r.code)).toContain('capability-not-verified');
  });
});
