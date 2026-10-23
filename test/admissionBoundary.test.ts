import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  AdmissionBlockedError,
  ExecutionAdmission,
  admissionTransport,
  bindingEnvironment,
  isolationInput as isolationInputOf,
} from '../src/extension/ai/admission';
import { apiBinding, apiEndpoint, apiKeyDigest } from '../src/extension/ai/apiBinding';
import { executorOf, type Executor } from '../src/extension/ai/drivers';
import { cliExecutor } from '../src/extension/ai/drivers/cli';
import { acpSessionMode } from '../src/extension/ai/acp/provider';
import { acpAgent } from '../src/extension/ai/acp/agents';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
import { isAcpProfile, type AiProfile } from '../src/shared/aiProfiles';
import {
  ACP_CAPABILITY_CHECKS,
  API_CAPABILITY_CHECKS,
  CAPABILITY_CHECKS,
  EXECUTOR_CAPABILITIES,
  type StrictExecutionRequest,
} from '../src/shared/executionAdmission';
import type { HeadlessInput } from '../src/extension/headless';
import { ACP_AGENTS } from '../src/extension/ai/acp/agents';
import { BUILTIN_PROFILES } from '../src/shared/aiProfiles';
import { referenceBinding } from './helpers/bindingReference';
import { materialize } from '../src/extension/aiOutput/measured';
import { headlessCommand } from '../src/extension/headless';

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
  kind: 'catalog',
  tool: 'claude',
  mode: 'cli',
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
    const custom = profile({ kind: 'custom', tool: 'perfil', mode: 'cli', base: 'generic', config: { command: exe('custom-cli', 'x') } });
    const error = blocked(custom);
    expect(error.decision.reasons).toContainEqual({ code: 'tool-mapping-unavailable' });
    expect(error.decision.state).toBe('blocked');
  });
  it('perfil personalizado com permissionArgs declarado também continua recusado', () => {
    const custom = profile({
      kind: 'custom',
      tool: 'perfil',
      mode: 'cli',
      base: 'generic',
      config: { command: exe('custom-cli', 'x'), permissionArgs: { board: ['--read-only'] } },
    });
    expect(blocked(custom).decision.reasons.map((r) => r.code)).toContain('tool-mapping-unavailable');
  });
  it('perfil ACP: o vínculo é o comando do agente do catálogo e o perfil vale só no regime compatível', () => {
    exe('gemini', 'agente de teste');
    const acp = profile({ kind: 'custom', tool: 'perfil', mode: 'acp', base: 'generic', config: { acpAgent: 'gemini' } });
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
    // agente só com nome (sem definição) no ACP não é descoberta nativa: o nome é zerado e a execução é admitida
    const named: HeadlessInput = { ...input(), exec: { agent: 'restrito', agentDefinition: null } as HeadlessInput['exec'] };
    expect(admission.prepare(acp, acp.id, named, dir, reviewed).transport).toBe('acp');
    expect(admitted.acpCommand({ command: 'gemini', args: ['--acp', '--skip-trust'] }).command).toBe(
      fs.realpathSync(path.join(dir, 'gemini')),
    );
    expect(() => admitted.acpCommand({ command: 'gemini', args: ['--acp'] })).toThrow('mudou');
    expect(() => admitted.acpCommand({ command: 'gemini', args: ['--acp', '--skip-trust'], env: { X: '1' } })).toThrow('mudou');
    expect(() => admitted.command({ command: 'gemini', args: [], format: 'text' })).toThrow('agente ACP');
    // o servidor do board é o canal das permissões no ACP: fica na configuração admitida mesmo sem ferramenta nativa liberada (#1091)
    const withBoard = admission.prepare(
      acp,
      acp.id,
      {
        ...input(),
        boardServer: { command: 'node', args: ['bridge.js'] },
        exec: {
          agent: '',
          agentDefinition: null,
          tools: [],
          deniedTools: [],
          toolSet: 'explicit',
          mcpTools: [],
          mcpAllowed: ['memoria'],
          mcpBlocked: [],
          model: null,
          mcpConfig: JSON.stringify({ mcpServers: { 'faz-ai': { command: 'node', args: ['bridge.js'] }, memoria: { command: 'mem' } } }),
        },
      },
      dir,
      request({
        ...reviewed,
        activeMcpIds: ['memoria'],
        allowedMcpIds: ['memoria'],
        boardMcpIds: ['memoria'],
        mcpServers: [{ artifactId: 'memoria', name: 'memoria' }],
      }),
    );
    expect(Object.keys(JSON.parse(withBoard.input.exec!.mcpConfig!).mcpServers)).toEqual(['faz-ai', 'memoria']);
    expect(withBoard.input.exec!.mcpAllowed).toEqual(['memoria']);
    // outro agente do catálogo (outro comando) não herda os recibos deste
    exe('opencode', 'outro agente');
    const other = profile({ kind: 'custom', tool: 'perfil', mode: 'acp', base: 'generic', config: { acpAgent: 'opencode' } });
    expect(blocked(other, reviewed).decision.reasons).toContainEqual({ code: 'capability-not-verified', capability: 'permissions' });
    // agente fora do catálogo não é vinculado
    const unknown = profile({ kind: 'custom', tool: 'perfil', mode: 'acp', base: 'generic', config: { acpAgent: 'nao-existe' } });
    expect(() => admission.prepare(unknown, unknown.id, input(), dir, reviewed)).toThrow(/desconhecido/);
  });
  it('perfil CLI: agente com nome e sem definição do board é recusado, nunca descoberto nativamente', () => {
    // o oposto do ACP: na CLI o nome sem definição seria descoberta nativa, então a admissão recusa
    const claude = profile({ config: { command: exe('claude-e', 'binário E') } });
    const named: HeadlessInput = { ...input(), exec: { agent: 'restrito', agentDefinition: null } as HeadlessInput['exec'] };
    expect(() => admission.prepare(claude, claude.id, named, dir, request())).toThrow(/Agente obrigatório precisa de definição do board/);
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

describe('vínculo de isolamento saneado', () => {
  const withEnv = <T>(vars: Record<string, string | undefined>, fn: () => T): T => {
    const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(vars))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    try {
      return fn();
    } finally {
      for (const [k, v] of Object.entries(before))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  };
  const level = (permission: 'board' | 'edits' | 'full') => request({ mcpLevel: { permission, tools: [] } });

  it('Claude: a prova feita em board vale para edits e full', () => {
    const claude = profile({ config: { command: exe('claude-f', 'binário F') } });
    const board = admission.isolationBinding(claude, claude.id, 'board').binding;
    expect(admission.isolationBinding(claude, claude.id, 'edits').binding).toBe(board);
    expect(admission.isolationBinding(claude, claude.id, 'full').binding).toBe(board);
    authorize(board);
    for (const permission of ['board', 'edits', 'full'] as const) {
      const admitted = admission.prepare(claude, claude.id, { prompt: 'objetivo', permission }, dir, level(permission));
      expect(admitted.decision.state).toBe('admitted');
      expect(admitted.decision.binding).toBe(board);
    }
  });
  it('ACP: a permissão não entra no comando nem no vínculo', () => {
    exe('gemini', 'agente de teste');
    const acp = profile({ kind: 'custom', tool: 'perfil', mode: 'acp', base: 'generic', config: { acpAgent: 'gemini' } });
    const board = admission.isolationBinding(acp, acp.id, 'board').binding;
    expect(admission.isolationBinding(acp, acp.id, 'edits').binding).toBe(board);
    expect(admission.isolationBinding(acp, acp.id, 'full').binding).toBe(board);
  });
  it('ACP: o modo sem perguntas (yolo) entra no vínculo e nunca vale numa execução admitida', () => {
    exe('gemini', 'agente de teste');
    const gemini = acpAgent('gemini')!;
    // fora da admissão (sem restrição declarada) o full pede o yolo; com o conjunto explícito ou uma negação, não
    expect(acpSessionMode(gemini, { permission: 'full' })).toBe('yolo');
    expect(acpSessionMode(gemini, { permission: 'full', exec: { deniedTools: ['Agent'] } as HeadlessInput['exec'] })).toBeUndefined();
    expect(acpSessionMode(gemini, { permission: 'full', exec: { toolSet: 'explicit', deniedTools: [] } as never })).toBeUndefined();
    expect(acpSessionMode(gemini, { permission: 'edits' })).toBeUndefined();
    const acp = profile({ kind: 'custom', tool: 'perfil', mode: 'acp', base: 'generic', config: { acpAgent: 'gemini' } });
    const board = admission.isolationBinding(acp, acp.id, 'board').binding;
    // uma sessão em yolo é outro vínculo: a prova feita no modo padrão não a cobre
    expect(admission.binding(acp, acp.id, { prompt: '', permission: 'full' }, null).binding).not.toBe(board);
    expect(admission.binding(acp, acp.id, { prompt: '', permission: 'edits' }, null).binding).toBe(
      admission.binding(acp, acp.id, { prompt: '', permission: 'board' }, null).binding,
    );
    // o card em full, admitido com a prova de board, roda no modo padrão: o board segue decidindo cada pedido
    for (const capability of EXECUTOR_CAPABILITIES)
      store.record({
        version: 1,
        capability,
        binding: board,
        source: 'host-probe',
        checkedAt: now - 10,
        expiresAt: now + 1000,
        checks: ACP_CAPABILITY_CHECKS[capability].map((id) => ({
          id,
          outcome: id === 'own-context-files' ? 'unavailable' : 'passed',
          receipt: 'a'.repeat(64),
        })),
      });
    const reviewed = request({
      regime: 'compatible',
      compatibilityReview: { actor: 'person', revision: 1 },
      mcpLevel: { permission: 'full', tools: [] },
    });
    const admitted = admission.prepare(acp, acp.id, { prompt: 'objetivo', permission: 'full' }, dir, reviewed);
    expect(admitted.decision.binding).toBe(board);
    expect(admitted.input.exec?.deniedTools).toContain('Agent');
    expect(acpSessionMode(gemini, admitted.input)).toBeUndefined();
  });
  it('variável volátil e as da sessão do Claude Code não mudam o vínculo; as que a ferramenta lê, mudam', () => {
    const claude = profile({ config: { command: exe('claude-g', 'binário G') } });
    const bind = () => admission.isolationBinding(claude, claude.id, 'board').binding;
    const base = bind();
    expect(withEnv({ TERM_SESSION_ID: 'w0t0p0:qualquer', VSCODE_PID: String(Math.random()), OLDPWD: '/tmp' }, bind)).toBe(base);
    // o spawn tira as variáveis da sessão que abriu o editor: elas também não contam no vínculo
    expect(withEnv({ CLAUDE_CODE_SESSION_ID: 'sessao-1', CLAUDECODE: '1' }, bind)).toBe(base);
    // a pasta de configuração e a pré-carga do Node mudam o que a CLI carrega
    expect(withEnv({ CLAUDE_CONFIG_DIR: '/outra/config' }, bind)).not.toBe(base);
    expect(withEnv({ NODE_OPTIONS: '--require /x.js' }, bind)).not.toBe(base);
    // proxy e certificados mudam com quem a ferramenta fala
    expect(withEnv({ HTTPS_PROXY: 'http://proxy.local:3128' }, bind)).not.toBe(base);
    expect(withEnv({ https_proxy: 'http://proxy.local:3128' }, bind)).not.toBe(base);
    expect(withEnv({ NODE_EXTRA_CA_CERTS: '/etc/ca.pem' }, bind)).not.toBe(base);
    // as CLAUDE_CODE_* da sessão que abriu o editor mudam a cada sessão; as de comportamento contam
    expect(
      withEnv({ CLAUDE_CODE_SSE_PORT: String(40000 + Math.floor(Math.random() * 1000)), CLAUDE_CODE_EXECPATH: '/x/claude' }, bind),
    ).toBe(base);
    expect(withEnv({ CLAUDE_CODE_USE_BEDROCK: '1' }, bind)).not.toBe(base);
    // credencial que gira (token de sessão) não derruba a prova: só a presença conta
    const withToken = withEnv({ AWS_SESSION_TOKEN: 'token-1' }, bind);
    expect(withEnv({ AWS_SESSION_TOKEN: 'token-2' }, bind)).toBe(withToken);
  });
  it('o ambiente do vínculo: PATH, pastas de configuração, as observadas e as do perfil; de segredo, só a presença', () => {
    const env = bindingEnvironment(
      {
        PATH: '/usr/bin',
        HOME: '/home/p',
        TERM: 'xterm',
        SHLVL: '2',
        ANTHROPIC_API_KEY: 'sk-ant-segredo',
        ANTHROPIC_BASE_URL: 'https://api.local',
        GEMINI_API_KEY: 'chave-gemini',
        CLAUDE_CODE_SESSION_ID: 'volatil',
      },
      '/opt/bin:/usr/bin',
      { MINHA_VAR: 'do-perfil', MEU_TOKEN: 'segredo-do-perfil' },
    );
    expect(Object.keys(env).sort()).toEqual(
      ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'GEMINI_API_KEY', 'HOME', 'MEU_TOKEN', 'MINHA_VAR', 'PATH'].sort(),
    );
    expect(env.PATH).toBe('/opt/bin:/usr/bin');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.local');
    expect(env.MINHA_VAR).toBe('do-perfil');
    for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'MEU_TOKEN']) expect(env[k]).toBe('<definida>');
    expect(JSON.stringify(env)).not.toMatch(/segredo|chave-gemini/);
  });
});

describe('os mesmos vínculos com o contrato de execução (história 6)', () => {
  // O vínculo é o hash a que cada prova gravada está presa: se a parte da ferramenta, que agora vem do
  // driver (`bindingContext`), mudasse uma vírgula, toda prova perderia a validade. A régua é o cálculo da
  // admissão antes do driver, congelado em `helpers/bindingReference.ts`.
  const options = () => ({ pathEnv: dir, homeDir: dir, environmentEvidence: { state: 'complete' as const, digest: 'a'.repeat(64) } });
  const ready = (id: string) => ({ ...BUILTIN_PROFILES.find((p) => p.id === id)!, enabled: true });
  const exec = (over: Partial<NonNullable<HeadlessInput['exec']>> = {}): HeadlessInput['exec'] => ({
    agent: '',
    agentDefinition: null,
    mcpBlocked: [],
    model: { name: 'modelo-x', effort: null },
    tools: ['Read', 'Grep'],
    deniedTools: ['Agent'],
    toolSet: 'explicit',
    mcpTools: ['mcp__faz-ai__get_card'],
    mcpAllowed: [],
    mcpConfig: '{"mcpServers":{"faz-ai":{"command":"node","args":["mcp.js"]}}}',
    ...over,
  });
  const inputs = (): HeadlessInput[] => [
    { prompt: 'objetivo', permission: 'board' },
    { prompt: 'outro objetivo', permission: 'edits', exec: exec() },
    { prompt: 'objetivo', permission: 'full', exec: exec({ deniedTools: [], toolSet: undefined }), addDirs: ['extra'] },
    // fora da admissão: no ACP, o modo sem perguntas
    { prompt: 'objetivo', permission: 'full' },
  ];
  beforeEach(() => {
    for (const name of ['claude', 'cursor-agent', 'kimi', ...ACP_AGENTS.map((a) => a.command)]) exe(name, `binário ${name}`);
    fs.mkdirSync(path.join(dir, 'extra'));
  });
  const cases = (): [string, Parameters<ExecutionAdmission['binding']>[0], string][] => [
    ['Claude Code pronto (pelo id)', 'claude', 'claude'],
    ['Claude Code pronto (pelo perfil)', ready('claude'), 'claude'],
    ['Cursor pronto', ready('cursor'), 'cursor'],
    ['Kimi Code pronto', ready('kimi'), 'kimi'],
    [
      'cópia do Claude Code com comando, ambiente e PATH próprios',
      profile({
        id: 'copia',
        config: { command: exe('claude-copia', 'cópia'), env: { PATH: dir, MINHA_VAR: 'x' }, extraArgs: ['--verbose'] },
      }),
      'copia',
    ],
    [
      'CLI personalizada (sem driver)',
      profile({
        id: 'pers',
        kind: 'custom',
        tool: 'pers',
        mode: 'cli',
        base: 'generic',
        config: {
          command: exe('minha-cli', 'pers'),
          args: ['--prompt', '{prompt}'],
          permissionArgs: { board: ['--somente-leitura'], edits: ['--editar'] },
          env: { X_PERFIL: '1' },
        },
      }),
      'pers',
    ],
    ...ACP_AGENTS.map((a): [string, AiProfile, string] => [
      `agente ACP ${a.id} como personalizado`,
      profile({ id: `acp-${a.id}`, kind: 'custom', tool: `acp-${a.id}`, mode: 'acp', base: 'generic', config: { acpAgent: a.id } }),
      `acp-${a.id}`,
    ]),
    ['Gemini pronto (ACP)', ready('gemini'), 'gemini'],
    // o comando do agente não leva o ambiente do perfil: o PATH que resolve o executável é o do host,
    // mesmo com outro PATH no perfil (é o que o vínculo fazia antes, e o que a régua repete)
    [
      'agente ACP personalizado com PATH e variável próprios no perfil',
      profile({
        id: 'acp-path',
        kind: 'custom',
        tool: 'acp-path',
        mode: 'acp',
        base: 'generic',
        config: { acpAgent: 'gemini', env: { PATH: '/caminho/que/nao/existe', MINHA_VAR: 'x' } },
      }),
      'acp-path',
    ],
  ];
  it('Claude, as outras CLIs, a CLI personalizada e os agentes ACP: vínculo de isolamento e de execução iguais aos de antes', () => {
    let compared = 0;
    for (const [label, executor, profileId] of cases()) {
      for (const i of inputs()) {
        for (const cwd of [null, dir]) {
          // a recusa também conta: o que a régua recusava (CLI personalizada no modo estrito) segue recusado
          const outcome = (fn: () => string) => {
            try {
              return { binding: fn() };
            } catch (e) {
              return { error: (e as Error).message };
            }
          };
          const now = outcome(() => admission.binding(executor, profileId, i, cwd).binding);
          expect(now, `${label}, ${i.permission}, ${cwd ?? 'isolamento'}`).toEqual(
            outcome(() => referenceBinding(executor, profileId, i, cwd, options())),
          );
          if ('binding' in now) compared++;
        }
      }
    }
    // a maior parte das combinações dá vínculo; só a CLI personalizada no modo estrito é recusada
    expect(compared).toBeGreaterThan(cases().length * inputs().length);
  });
  it('a execução admitida (Claude e ACP) fica presa ao mesmo vínculo de isolamento de antes', () => {
    const claude = profile({ config: { command: exe('claude-h6', 'binário H6') } });
    const isolation = referenceBinding(claude, claude.id, isolationInputOf('board'), null, options());
    authorize(isolation);
    expect(admission.prepare(claude, claude.id, input(), dir, request()).decision.binding).toBe(isolation);
    const acp = profile({ kind: 'custom', tool: 'perfil', mode: 'acp', base: 'generic', config: { acpAgent: 'gemini' } });
    const acpIsolation = referenceBinding(acp, acp.id, isolationInputOf('board'), null, options());
    expect(admission.isolationBinding(acp, acp.id, 'edits').binding).toBe(acpIsolation);
    // o PATH do perfil não entra no ACP: o executável sai do PATH do host e o vínculo é o mesmo de sem ele
    const withPath = profile({ ...acp, config: { acpAgent: 'gemini', env: { PATH: '/caminho/que/nao/existe' } } });
    expect(admission.binding(withPath, acp.id, isolationInputOf('board'), null).executable).toBe(fs.realpathSync(path.join(dir, 'gemini')));
  });
});

describe('admissão do modo API (história 9)', () => {
  // Ainda não há driver da API (história 10): o executor falso usa a parte pura do vínculo (`apiBinding`)
  // com a chave lida do perfil, como o driver fará com o cofre. Nenhuma rede.
  const API_KEY = 'AIzaSyChaveDeTesteSEGREDO0123456789';
  const MODEL = { name: 'gemini-2.5-pro', effort: null };
  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
  const apiProfile = (key = API_KEY) =>
    profile({ id: 'gemini', kind: 'catalog', tool: 'gemini', mode: 'api', base: 'generic', config: { apiKey: key } });
  const apiExecutor = (
    over: { endpoint?: string; extensionVersion?: string } = {},
    transport: Executor['transport'] = 'api',
  ): Executor => ({
    transport,
    run: () => {
      throw new Error('o laço do modo API é da história 10');
    },
    bindingContext: (i, { profile: p }) =>
      apiBinding({
        endpoint: over.endpoint ?? ENDPOINT,
        model: i.exec?.model?.name,
        extensionVersion: over.extensionVersion ?? '0.47.0',
        apiKey: String(p.config.apiKey),
      }),
  });
  const admissionWith = (executor: Executor) =>
    new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => now,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
      executorOf: (p) => (p.mode === 'api' ? executor : executorOf(p)),
    });
  const apiInput = (model: typeof MODEL | null = MODEL, permission: 'board' | 'edits' | 'full' = 'board'): HeadlessInput => ({
    prompt: 'objetivo',
    permission,
    exec: { agent: '', agentDefinition: null, mcpBlocked: [], model } as unknown as HeadlessInput['exec'],
  });
  const withEnv = <T>(vars: Record<string, string>, fn: () => T): T => {
    const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    Object.assign(process.env, vars);
    try {
      return fn();
    } finally {
      for (const [k, v] of Object.entries(before))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  };

  it('o vínculo não tem executável e prende endpoint, modelo, versão da extensão e chave; o ambiente não entra', () => {
    const api = admissionWith(apiExecutor());
    const bind = (a = api, p = apiProfile(), model: typeof MODEL | null = MODEL) => a.isolationBinding(p, 'gemini', 'board', model);
    const base = bind();
    expect(base.executable).toBe('');
    expect(base.environmentComplete).toBe(true);
    expect(base.binding).toMatch(/^[a-f0-9]{64}$/);
    // a permissão não muda o vínculo de isolamento, como na CLI e no ACP
    expect(api.isolationBinding(apiProfile(), 'gemini', 'full', MODEL).binding).toBe(base.binding);
    expect(bind(api, apiProfile(), { name: 'gemini-2.5-flash', effort: null }).binding).not.toBe(base.binding);
    expect(bind(api, apiProfile('AIzaSyOutraChave')).binding).not.toBe(base.binding);
    expect(bind(admissionWith(apiExecutor({ endpoint: 'https://outro.exemplo/v1' }))).binding).not.toBe(base.binding);
    expect(bind(admissionWith(apiExecutor({ extensionVersion: '0.48.0' }))).binding).not.toBe(base.binding);
    // a barra final do endpoint não muda nada
    expect(bind(admissionWith(apiExecutor({ endpoint: `${ENDPOINT}/` }))).binding).toBe(base.binding);
    // sem processo da ferramenta, o ambiente não muda o que o board faz: nem PATH, nem proxy, nem chave no ambiente
    expect(withEnv({ PATH: '/outro/path', HTTPS_PROXY: 'http://proxy.local:3128', GEMINI_API_KEY: 'x' }, () => bind().binding)).toBe(
      base.binding,
    );
    // a prova é de um modelo: sem ele não há vínculo
    expect(() => bind(api, apiProfile(), null)).toThrow('O modo API precisa de um modelo explícito.');
  });

  it('sem a evidência por construção a execução é bloqueada; com ela, admitida no transporte api', () => {
    const api = admissionWith(apiExecutor());
    const p = apiProfile();
    const isolation = api.isolationBinding(p, 'gemini', 'board', MODEL).binding;
    let error: unknown;
    try {
      api.prepare(p, 'gemini', apiInput(), dir, request());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AdmissionBlockedError);
    expect((error as AdmissionBlockedError).decision.reasons).toEqual(
      EXECUTOR_CAPABILITIES.map((capability) => ({ code: 'capability-not-verified', capability })),
    );
    // uma prova forjada como sonda, mesmo assinada pelo host, não vale para o modo API
    for (const capability of EXECUTOR_CAPABILITIES)
      store.record({
        version: 1,
        capability,
        binding: isolation,
        source: 'host-probe',
        checkedAt: now - 10,
        expiresAt: now + 1000,
        checks: API_CAPABILITY_CHECKS[capability].map((id) => ({ id, outcome: 'passed', receipt: 'a'.repeat(64) })),
      });
    expect(() => api.prepare(p, 'gemini', apiInput(), dir, request())).toThrow(AdmissionBlockedError);
    fs.rmSync(path.join(dir, 'evidence'), { recursive: true, force: true });
    store.recordByConstruction(isolation, now - 10);
    const admitted = api.prepare(p, 'gemini', apiInput(MODEL, 'edits'), dir, request({ mcpLevel: { permission: 'edits', tools: [] } }));
    expect(admitted.transport).toBe('api');
    expect(admitted.decision.state).toBe('admitted');
    expect(admitted.decision.binding).toBe(isolation);
    // os validadores de processo não servem ao modo API
    expect(() => admitted.command({ command: 'gemini', args: [] } as never)).toThrow(
      'A admissão é do modo API, não de uma CLI de uma passada.',
    );
    expect(() => admitted.acpCommand({ command: 'gemini', args: [] })).toThrow('A admissão é do modo API, não de um agente ACP.');
    // outro modelo é outro vínculo: a prova do primeiro não o cobre
    const other = { name: 'gemini-2.5-flash', effort: null };
    expect(() => api.prepare(p, 'gemini', apiInput(other), dir, request())).toThrow(AdmissionBlockedError);
  });

  it('a chave nunca é gravada nem logada: nem a chave, nem o digest dela', () => {
    const logged: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' '))),
    );
    try {
      const api = admissionWith(apiExecutor());
      const p = apiProfile();
      const isolation = api.isolationBinding(p, 'gemini', 'board', MODEL).binding;
      let blockedMessage = '';
      try {
        api.prepare(p, 'gemini', apiInput(), dir, request());
      } catch (e) {
        blockedMessage = `${(e as Error).message} ${JSON.stringify((e as AdmissionBlockedError).decision)}`;
      }
      store.recordByConstruction(isolation, now - 10);
      store.remember('gemini', isolation);
      const admitted = api.prepare(p, 'gemini', apiInput(), dir, request());
      const files = fs.readdirSync(path.join(dir, 'evidence'));
      const written = files.map((f) => `${f}\n${fs.readFileSync(path.join(dir, 'evidence', f)).toString('latin1')}`).join('\n');
      // a decisão é o que vai para `ai_runs.admission_json`
      const surfaces = [written, blockedMessage, JSON.stringify(admitted.decision), ...logged];
      for (const secret of [API_KEY, apiKeyDigest(API_KEY)]) for (const s of surfaces) expect(s).not.toContain(secret);
      // as mensagens de erro também não repetem a chave nem um endpoint com ela
      expect(() => apiKeyDigest('chave com espaço SEGREDO')).toThrow('Chave de API ausente ou inválida.');
      try {
        apiKeyDigest('chave com espaço SEGREDO');
      } catch (e) {
        expect((e as Error).message).not.toContain('SEGREDO');
      }
      try {
        apiEndpoint(`${ENDPOINT}/models?key=${API_KEY}`);
        throw new Error('aceitou a chave na URL');
      } catch (e) {
        expect((e as Error).message).toBe('Endpoint da API inválido.');
      }
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it('o digest da chave é estável, com rótulo, e o endpoint só HTTPS (HTTP só no próprio computador)', () => {
    expect(apiKeyDigest(API_KEY)).toMatch(/^[a-f0-9]{64}$/);
    expect(apiKeyDigest(API_KEY)).toBe(apiKeyDigest(API_KEY));
    expect(apiKeyDigest(API_KEY)).not.toBe(apiKeyDigest(`${API_KEY}x`));
    expect(apiKeyDigest(API_KEY)).not.toBe(createHash('sha256').update(API_KEY).digest('hex'));
    expect(() => apiKeyDigest('')).toThrow('Chave de API');
    expect(apiEndpoint('https://generativelanguage.googleapis.com/v1beta/')).toBe(ENDPOINT);
    expect(apiEndpoint('http://127.0.0.1:8080/v1beta')).toBe('http://127.0.0.1:8080/v1beta');
    for (const bad of [
      'http://generativelanguage.googleapis.com/v1beta',
      'https://user:senha@exemplo.com',
      'https://exemplo.com/#x',
      'ftp://exemplo.com',
      'nada',
    ])
      expect(() => apiEndpoint(bad), bad).toThrow('Endpoint da API inválido.');
    expect(() => apiBinding({ endpoint: ENDPOINT, model: 'gemini-2.5-pro', extensionVersion: 'dev', apiKey: API_KEY })).toThrow(
      'Versão da extensão',
    );
  });

  it('um driver cujo vínculo não bate com o transporte é recusado', () => {
    // transporte de CLI com o vínculo da API: a admissão não aceita perder o executável por engano
    const cliWithApi = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => now,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
      executorOf: () => apiExecutor({}, 'cli'),
    });
    expect(() => cliWithApi.isolationBinding(apiProfile(), 'gemini', 'board', MODEL)).toThrow(
      'Vínculo do executor incoerente com o transporte.',
    );
    // e o transporte api com o vínculo de um processo (executável a resolver)
    const apiWithProcess = admissionWith({
      ...cliExecutor,
      transport: 'api',
      bindingContext: () => ({ invocation: {}, command: 'gemini' }),
    });
    expect(() => apiWithProcess.isolationBinding(apiProfile(), 'gemini', 'board', MODEL)).toThrow(
      'Vínculo do executor incoerente com o transporte.',
    );
  });

  it('com o driver da API (história 10), o host afirma a prova por construção na execução, e a prévia usa o modelo do card', () => {
    const p = apiProfile();
    expect(admissionTransport(p)).toBe('api');
    expect(executorOf(p).transport).toBe('api');
    // sem a chave do cofre não há vínculo do modo API
    expect(admissionWith(executorOf(p)).preview(p, 'gemini', request(), dir, MODEL.name).reasons).toContainEqual({
      code: 'executor-unavailable',
    });
    // a chave chega à admissão pelo cofre da ferramenta (no host, `profileApiKey(toolKeys, perfil)`)
    const admission = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => now,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
      apiKey: () => API_KEY,
    });
    // a prévia não grava nada: sem modelo não há vínculo do modo API; com o do card, avalia a prova que o
    // host afirmaria
    expect(admission.preview(p, 'gemini', request(), dir).reasons).toContainEqual({ code: 'executor-unavailable' });
    expect(admission.preview(p, 'gemini', request(), dir, MODEL.name)).toMatchObject({ state: 'admitted', reasons: [] });
    expect(fs.existsSync(path.join(dir, 'evidence'))).toBe(false);
    // a execução: o driver registrado diz o que o laço garante, e o host assina por construção
    const admitted = admission.prepare(p, 'gemini', apiInput(), dir, request());
    expect(admitted).toMatchObject({ transport: 'api', decision: { state: 'admitted' } });
    const isolation = admission.isolationBinding(p, 'gemini', 'board', MODEL).binding;
    const rows = store.load(isolation);
    expect(rows.map((r) => r.capability).sort()).toEqual([...EXECUTOR_CAPABILITIES].sort());
    expect(rows.every((r) => r.source === 'by-construction' && r.checks.every((c) => c.outcome === 'passed'))).toBe(true);
    // o validador do modo API passa no vínculo admitido; uma segunda execução não afirma de novo
    expect(() => admitted.api()).not.toThrow();
    admission.prepare(p, 'gemini', apiInput(), dir, request());
    expect(store.load(isolation)).toHaveLength(rows.length);
    // o Gemini pronto traz o agente ACP do código: no modo API ele não é ACP
    const ready = { ...BUILTIN_PROFILES.find((b) => b.id === 'gemini')!, mode: 'api' as const };
    expect(isAcpProfile(ready)).toBe(false);
    expect(admissionTransport(ready)).toBe('api');
    // uma ferramenta sem o laço da API é recusada com a causa, e nunca cai na CLI nem no ACP
    const claudeApi = profile({ id: 'claude', kind: 'catalog', tool: 'claude', mode: 'api', base: 'claude' });
    expect(() => executorOf(claudeApi)).toThrow('O modo API de Claude Code ainda não roda nesta versão da extensão.');
    expect(() => admission.prepare(claudeApi, 'claude', apiInput(), dir, request())).toThrow('ainda não roda nesta versão');
  });

  it('antes de cada pedido o validador relê a prova: removida ou vencida no meio do laço, o próximo pedido não sai', () => {
    let at = now;
    const timed = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => at,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
      apiKey: () => API_KEY,
    });
    const p = apiProfile();
    const admitted = timed.prepare(p, 'gemini', apiInput(), dir, request());
    expect(() => admitted.api()).not.toThrow();
    // vencida (a validade é de 14 dias)
    at = now + 15 * 24 * 60 * 60 * 1000;
    expect(() => admitted.api()).toThrow('A prova do modo API perdeu a validade durante a execução');
    // removida
    at = now;
    expect(() => admitted.api()).not.toThrow();
    fs.rmSync(path.join(dir, 'evidence'), { recursive: true, force: true });
    expect(() => admitted.api()).toThrow(/perdeu a validade durante a execução \(conversation, artifacts, permissions, mcp, delegation\)/);
  });

  it('o host só afirma o que o laço garante: um check sem garantia deixa a capacidade parcial e a execução bloqueada', () => {
    const partial = admissionWith({
      ...apiExecutor(),
      guarantees: () => ['board-built-request', 'no-own-context-files', 'declared-functions'],
    });
    const p = apiProfile();
    let error: unknown;
    try {
      partial.prepare(p, 'gemini', apiInput(), dir, request());
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AdmissionBlockedError);
    expect((error as AdmissionBlockedError).decision.reasons).toEqual([
      { code: 'capability-not-verified', capability: 'mcp' },
      { code: 'capability-not-verified', capability: 'delegation' },
    ]);
    // e a prévia mostra o mesmo, sem gravar
    const isolation = partial.isolationBinding(p, 'gemini', 'board', MODEL).binding;
    const written = store.load(isolation).length;
    expect(partial.preview(p, 'gemini', request(), dir, MODEL.name).state).toBe('blocked');
    expect(store.load(isolation)).toHaveLength(written);
  });

  it('o vínculo da CLI e do ACP continua sem o modelo do card (a régua da história 6)', () => {
    const options = { pathEnv: dir, homeDir: dir, environmentEvidence: { state: 'complete' as const, digest: 'a'.repeat(64) } };
    const claude = profile({ config: { command: exe('claude-h9', 'binário H9') } });
    const isolation = referenceBinding(claude, claude.id, isolationInputOf('board'), null, options);
    authorize(isolation);
    const withModel: HeadlessInput = {
      ...input(),
      exec: { agent: '', agentDefinition: null, mcpBlocked: [], model: MODEL } as unknown as HeadlessInput['exec'],
    };
    expect(admission.prepare(claude, claude.id, withModel, dir, request()).decision.binding).toBe(isolation);
    exe('gemini', 'agente de teste');
    const acp = profile({ kind: 'custom', tool: 'perfil', mode: 'acp', base: 'generic', config: { acpAgent: 'gemini' } });
    expect(admission.isolationBinding(acp, acp.id, 'board').binding).toBe(
      referenceBinding(acp, acp.id, isolationInputOf('board'), null, options),
    );
    // e o executor injetado não muda nada fora do modo API
    expect(admissionWith(apiExecutor()).isolationBinding(claude, claude.id, 'board').binding).toBe(isolation);
  });
});

describe('admissão do Gemini pela CLI (história 8)', () => {
  const geminiCli = (): AiProfile => ({ ...structuredClone(BUILTIN_PROFILES.find((p) => p.id === 'gemini')!), mode: 'cli', enabled: true });
  const KEY = 'AIzaChaveDaAdmissao-000999';

  it('a tabela de ferramentas é a do Gemini: a decisão lista os nomes dele, e o comando os fixa no settings', () => {
    exe('gemini', 'gemini 0.65.0');
    const p = geminiCli();
    expect(isAcpProfile(p)).toBe(false);
    expect(admissionTransport(p)).toBe('cli');
    authorize(admission.isolationBinding(p, p.id, 'board').binding);
    const admitted = admission.prepare(p, p.id, input(), dir, request());
    expect(admitted.decision.state).toBe('admitted');
    expect(admitted.decision.tools).toEqual([
      'read_file',
      'read_many_files',
      'list_directory',
      'glob',
      'grep_search',
      'list_mcp_resources',
      'read_mcp_resource',
    ]);
    // o comando que a CLI recebe, com a home materializada, passa pela conferência; a chave só por cima
    const built = headlessCommand(p, { ...admitted.input, structured: true });
    const { command, cleanup } = materialize(built, dir);
    try {
      const checked = admitted.command({ ...command, apiKey: KEY });
      expect(checked.apiKey).toBe(KEY);
      expect(checked.env!.GEMINI_CLI_HOME).toBe(command.env!.GEMINI_CLI_HOME);
      // a chave noutra variável que não a declarada, ou num comando que não a declara, é recusada
      expect(() => admitted.command({ ...command, apiKeyEnv: 'PATH', apiKey: KEY })).toThrow('O comando mudou');
      // o settings da home trocado depois da admissão (um servidor a mais) é recusado
      const settings = path.join(command.env!.GEMINI_CLI_HOME!, '.gemini', 'settings.json');
      fs.writeFileSync(settings, fs.readFileSync(settings, 'utf8').replace('"mcpServers": {}', '"mcpServers": {"x": {"command": "x"}}'));
      expect(() => admitted.command(command)).toThrow('restrição obrigatória');
      // e outra home (outra variável) também
      expect(() => admitted.command({ ...command, env: { ...command.env, GEMINI_CLI_HOME: dir } })).toThrow('restrição obrigatória');
    } finally {
      cleanup();
    }
    expect(fs.existsSync(command.env!.GEMINI_CLI_HOME!)).toBe(false);
  });

  it('o vínculo não vê a chave, muda com a configuração gerenciada do sistema e não muda os de Claude e ACP', () => {
    exe('gemini', 'gemini 0.65.0');
    const p = geminiCli();
    const before = admission.isolationBinding(p, p.id, 'board').binding;
    // com a chave no cofre, o mesmo vínculo: trocar a chave não invalida as provas (como no ACP)
    const withKey = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      now: () => now,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
      apiKey: () => KEY,
    });
    expect(withKey.isolationBinding(p, p.id, 'board').binding).toBe(before);
    // o modo é outro vínculo: a prova do ACP não vale para a CLI
    const acp = { ...p, mode: 'acp' as const };
    expect(admission.isolationBinding(acp, acp.id, 'board').binding).not.toBe(before);
    const systemSettings = path.join(dir, 'gemini-system.json');
    const old = process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
    process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = systemSettings;
    try {
      const pointed = admission.isolationBinding(p, p.id, 'board').binding;
      fs.writeFileSync(systemSettings, '{"tools":{"core":["run_shell_command"]}}');
      expect(admission.isolationBinding(p, p.id, 'board').binding).not.toBe(pointed);
    } finally {
      if (old === undefined) delete process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
      else process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = old;
    }
    expect(admission.isolationBinding(p, p.id, 'board').binding).toBe(before);
    // o ACP pronto do Gemini segue na régua da história 6
    const options = { pathEnv: dir, homeDir: dir, environmentEvidence: { state: 'complete' as const, digest: 'a'.repeat(64) } };
    expect(admission.isolationBinding(acp, acp.id, 'board').binding).toBe(
      referenceBinding(acp, acp.id, isolationInputOf('board'), null, options),
    );
  });
});
