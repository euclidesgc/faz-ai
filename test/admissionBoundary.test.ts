import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AdmissionBlockedError, ExecutionAdmission, bindingEnvironment } from '../src/extension/ai/admission';
import { acpSessionMode } from '../src/extension/ai/acp/provider';
import { acpAgent } from '../src/extension/ai/acp/agents';
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
    const other = profile({ kind: 'custom', base: 'generic', config: { acpAgent: 'opencode' } });
    expect(blocked(other, reviewed).decision.reasons).toContainEqual({ code: 'capability-not-verified', capability: 'permissions' });
    // agente fora do catálogo não é vinculado
    const unknown = profile({ kind: 'custom', base: 'generic', config: { acpAgent: 'nao-existe' } });
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
    const acp = profile({ kind: 'custom', base: 'generic', config: { acpAgent: 'gemini' } });
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
    const acp = profile({ kind: 'custom', base: 'generic', config: { acpAgent: 'gemini' } });
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
