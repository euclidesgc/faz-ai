// Verificador do host para a CLI do Claude: roda a CLI real numa fixture descartável contra uma API local
// controlada e grava as evidências assinadas das cinco capacidades. O vínculo é o de isolamento
// (`ExecutionAdmission.isolationBinding`), independente da pasta do projeto: nenhuma sentinela é plantada
// no projeto da pessoa. O que a fixture prova são as flags de isolamento da CLI; o ambiente e as políticas
// gerenciadas reais fazem parte do vínculo.
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  ACP_CAPABILITY_CHECKS,
  CAPABILITY_CHECKS,
  EXECUTOR_CAPABILITIES,
  type CapabilityEvidence,
  type ExecutorCapability,
} from '../../shared/executionAdmission';
import { headlessCommand, type HeadlessCommand, type HeadlessInput } from '../headless';
import { materialize } from '../aiOutput/measured';
import { asObject, asText, type Json } from '../aiOutput/json';
import { lineSplitter } from '../aiOutput/lines';
import type { RunningProcess } from '../runner';
import { executorProfile, type AiExecutor } from './providers';
import { admissionAgent, VERIFIER_OBSERVED_ENV, type ExecutionAdmission } from './admission';
import { canonical, type CapabilityEvidenceStore } from './capabilityEvidence';
import { ACP_PROTOCOL_VERSION } from './acp/run';
import { AUTH_REQUIRED, RpcError, acpAuthenticate, rpcConnection } from './acp/connection';
import { acpCommand, type AcpAgent, type AcpAuth, type AcpSpawnFn } from './acp/provider';
import { version as EXTENSION_VERSION } from '../../../package.json';
import { isGeminiCli } from '../../shared/aiProfiles';

const API_KEY = 'fazai-local-verification-only';
const NO_DELEGATION = ['Agent', 'Task', 'SendMessage', 'ListAgents'];
const DAY = 24 * 3600_000;

export interface ProbeToolResult {
  name: string;
  isError: boolean;
}
/** O que uma execução da CLI deixou observável: pedidos à API, chamadas MCP e efeitos em disco. */
export interface ProbeObservation {
  code: number | null;
  timedOut: boolean;
  requestText: string;
  toolNames: string[];
  toolResults: ProbeToolResult[];
  mcpConnections: string[];
  mcpCalls: string[];
  sessionId: string | null;
}
export interface ProbeRun {
  /** barreiras retiradas: precisa tornar a contaminação observável, senão a ausência não prova nada */
  control: ProbeObservation;
  strict: ProbeObservation;
  controlHook: boolean;
  strictHook: boolean;
  forbiddenFileWritten: boolean;
  /**
   * A chave chegou a um comando de shell do modelo (só as sondas que rodam um shell a observam: a do Gemini
   * pela CLI). Credencial ao alcance de uma ferramenta é permissão a mais: o `forbidden-tool` falha.
   */
  secretInShell?: boolean;
  allowedReadContent: string;
  canaries: Record<string, string>;
  /** duas execuções vazias seguidas, com marcadores distintos */
  first: ProbeObservation & { marker: string };
  second: ProbeObservation & { marker: string };
  environmentDigest: string;
}
type Check = CapabilityEvidence['checks'][number];
const sha = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

/** Os nomes das ferramentas que a sonda pede ao modelo e procura nas observações, no vocabulário da CLI. */
export interface ProbeNames {
  read: string;
  shell: string;
  write: string;
  mcpAllowed: string;
  mcpForbidden: string;
  delegation: string;
  /** os nomes de delegação que não podem aparecer entre as ferramentas declaradas ao modelo */
  delegationNames: readonly string[];
}
export const CLAUDE_PROBE_NAMES: ProbeNames = {
  read: 'Read',
  shell: 'Bash',
  write: 'Write',
  mcpAllowed: 'mcp__allowed__allowed',
  mcpForbidden: 'mcp__allowed__forbidden',
  delegation: 'Agent',
  delegationNames: NO_DELEGATION,
};
/** Gemini CLI 0.65.0: os nomes internos e o `mcp_<servidor>_<operação>` das ferramentas MCP. */
export const GEMINI_PROBE_NAMES: ProbeNames = {
  read: 'read_file',
  shell: 'run_shell_command',
  write: 'write_file',
  mcpAllowed: 'mcp_allowed_allowed',
  mcpForbidden: 'mcp_allowed_forbidden',
  delegation: 'invoke_agent',
  delegationNames: ['invoke_agent'],
};

/** Decisão pura sobre as observações; recibo = hash dos fatos observados e do vínculo. */
export function evaluateProbes(
  binding: string,
  run: ProbeRun,
  names: ProbeNames = CLAUDE_PROBE_NAMES,
): Record<ExecutorCapability, Check[]> {
  const check = (id: string, ok: boolean | null, facts: unknown): Check => ({
    id,
    outcome: ok === null ? 'unavailable' : ok ? 'passed' : 'failed',
    receipt: sha({ binding, id, ok, facts }),
  });
  const leaks = (text: string, scope: string) => text.includes(run.canaries[scope]!);
  const detectable = (scope: string) => leaks(run.control.requestText, scope);
  // Sentinela ausente só prova isolamento quando o controle a enxergou; senão o resultado é indisponível.
  const sentinel = (scope: string) => (!detectable(scope) ? null : !leaks(run.strict.requestText, scope));
  const resultOf = (name: string) => run.strict.toolResults.find((r) => r.name === name);
  const started = run.strict.code === 0 && !run.strict.timedOut && run.strict.requestText.length > 0;
  const refused = (name: string) => resultOf(name)?.isError === true;
  const hookSeen = run.controlHook;
  return {
    conversation: [
      check(
        'fresh-conversation',
        run.first.code === 0 && run.second.code === 0 && run.first.sessionId !== null
          ? run.first.sessionId !== run.second.sessionId && !run.second.requestText.includes(run.first.marker)
          : false,
        { distinct: run.first.sessionId !== run.second.sessionId },
      ),
    ],
    artifacts: [
      check('project-sentinel', started ? sentinel('project') : false, { control: detectable('project') }),
      check('user-sentinel', started ? sentinel('user') : false, { control: detectable('user') }),
      check('ancestor-sentinel', started ? sentinel('ancestor') : false, { control: detectable('ancestor') }),
      check('additional-directory-sentinel', started ? sentinel('additional') : false, { control: detectable('additional') }),
      check('managed-settings', /^[a-f0-9]{64}$/.test(run.environmentDigest), { digest: run.environmentDigest }),
    ],
    permissions: [
      check(
        'allowed-tool',
        started && resultOf(names.read)?.isError === false && run.strict.requestText.includes(run.allowedReadContent),
        {},
      ),
      check(
        'forbidden-tool',
        started &&
          refused(names.shell) &&
          refused(names.write) &&
          !run.forbiddenFileWritten &&
          run.secretInShell !== true &&
          !run.strict.toolNames.some((n) => n === names.shell || n === names.write),
        { hook: hookSeen && !run.strictHook },
      ),
    ],
    mcp: [
      check(
        'allowed-server',
        started && run.strict.mcpCalls.includes('allowed:allowed') && resultOf(names.mcpAllowed)?.isError === false,
        {},
      ),
      check(
        'forbidden-server',
        started && run.control.mcpConnections.includes('forbidden') ? !run.strict.mcpConnections.includes('forbidden') : null,
        {},
      ),
      check('operation-scope', started && refused(names.mcpForbidden) && !run.strict.mcpCalls.includes('allowed:forbidden'), {}),
    ],
    delegation: [
      check(
        'native-delegation-denied',
        started && refused(names.delegation) && !run.strict.toolNames.some((n) => names.delegationNames.includes(n)),
        {},
      ),
    ],
  };
}

export function buildEvidence(
  binding: string,
  checks: Record<ExecutorCapability, Check[]>,
  now: number,
  ttlMs = 14 * DAY,
  expected: Record<ExecutorCapability, readonly string[]> = CAPABILITY_CHECKS,
): CapabilityEvidence[] {
  return EXECUTOR_CAPABILITIES.map((capability) => ({
    version: 1,
    capability,
    source: 'host-probe',
    binding,
    checkedAt: now,
    expiresAt: now + ttlMs,
    // só os checks previstos para a capacidade; um check ausente deixa a capacidade parcial
    checks: checks[capability].filter((c) => expected[capability].includes(c.id)),
  }));
}

/** O que um handshake do agente ACP deixou observável. */
export interface AcpHandshake {
  /** `protocolVersion` do `initialize`; null se o agente não respondeu ou saiu antes */
  protocolVersion: number | null;
  agentCapabilities: Json | null;
  /** id do `session/new`; null se a sessão não abriu */
  sessionId: string | null;
  /** o agente respondeu `auth_required`: sem login não há sessão */
  authRequired: boolean;
  error: string | null;
}
export interface AcpProbeRun {
  /** dois processos seguidos: cada um precisa abrir a própria sessão */
  first: AcpHandshake;
  second: AcpHandshake;
  /** o servidor MCP passado no `session/new` recebeu o `initialize` do agente */
  mcpConnected: boolean;
  environmentDigest: string;
}

/**
 * Decisão pura sobre o handshake. O que o protocolo não deixa observar (os arquivos de contexto que o
 * agente lê sozinho) fica `unavailable`, de propósito: a capacidade de artefatos nunca é verificada no ACP.
 */
export function evaluateAcpProbes(binding: string, run: AcpProbeRun): Record<ExecutorCapability, Check[]> {
  const check = (id: string, ok: boolean | null, facts: unknown): Check => ({
    id,
    outcome: ok === null ? 'unavailable' : ok ? 'passed' : 'failed',
    receipt: sha({ binding, id, ok, facts }),
  });
  const opened = run.first.sessionId !== null && run.second.sessionId !== null;
  const speaks = run.first.protocolVersion === ACP_PROTOCOL_VERSION && run.second.protocolVersion === ACP_PROTOCOL_VERSION;
  const protocol = check('protocol-version', opened && speaks, {
    version: run.first.protocolVersion,
    capabilities: run.first.agentCapabilities,
  });
  return {
    conversation: [
      check('fresh-session', opened && run.first.sessionId !== run.second.sessionId, {
        distinct: run.first.sessionId !== run.second.sessionId,
      }),
    ],
    artifacts: [
      check('own-context-files', null, {}),
      check('managed-settings', /^[a-f0-9]{64}$/.test(run.environmentDigest), { digest: run.environmentDigest }),
    ],
    permissions: [protocol],
    mcp: [check('session-servers', opened && run.mcpConnected, { connected: run.mcpConnected })],
    delegation: [protocol],
  };
}

interface Attempt {
  name: string;
  input: Record<string, unknown>;
}
interface ApiState {
  texts: string[];
  tools: string[][];
  results: { id: string; isError: boolean }[];
  uses: Map<string, string>;
  attempts: Attempt[];
  sent: boolean;
  connections: string[];
  calls: string[];
  /** o texto das respostas de função que voltaram ao modelo (a sonda do Gemini procura a chave nelas) */
  outputs?: string[];
}
const json = (v: unknown) => JSON.stringify(v);
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, text, { mode: 0o600 });
};
function reply(res: http.ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(json(body));
}
/**
 * O servidor MCP de teste, por HTTP em `/mcp/<nome>`: as operações `allowed` e `forbidden`, e o registro de
 * quem conectou e do que foi chamado. Devolve false quando o pedido não é dele.
 */
function mcpProbe(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  data: { id?: unknown; method?: string; params?: { protocolVersion?: string; name?: string } },
  state: { connections: string[]; calls: string[] },
): boolean {
  if (!req.url?.startsWith('/mcp/')) return false;
  const name = req.url.slice('/mcp/'.length);
  if (data.id === undefined) {
    res.writeHead(202).end();
    return true;
  }
  if (data.method === 'initialize') state.connections.push(name);
  const result =
    data.method === 'initialize'
      ? { protocolVersion: data.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name, version: '1' } }
      : data.method === 'tools/list'
        ? {
            tools: ['allowed', 'forbidden'].map((tool) => ({
              name: tool,
              description: `Operação ${tool} do teste`,
              inputSchema: { type: 'object', properties: {} },
            })),
          }
        : data.method === 'tools/call'
          ? (state.calls.push(`${name}:${data.params?.name}`), { content: [{ type: 'text', text: 'FAZAI_MCP_ALLOWED' }] })
          : {};
  reply(res, { jsonrpc: '2.0', id: data.id, result });
  return true;
}
/** Resposta SSE mínima da API: as respostas do modelo são roteirizadas, nunca valores aceitos como prova. */
function message(res: http.ServerResponse, model: string, calls: Attempt[]): void {
  const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${json(data)}\n\n`);
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  send('message_start', {
    type: 'message_start',
    message: {
      id: `msg_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  });
  const blocks = calls.length
    ? calls.map((c) => ({ type: 'tool_use', id: `toolu_${randomUUID()}`, name: c.name, input: c.input }))
    : [{ type: 'text', text: 'Verificação local encerrada.' }];
  blocks.forEach((block, index) => {
    send('content_block_start', {
      type: 'content_block_start',
      index,
      content_block: block.type === 'tool_use' ? { ...block, input: {} } : block,
    });
    if ('input' in block)
      send('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: json(block.input) },
      });
    send('content_block_stop', { type: 'content_block_stop', index });
  });
  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: calls.length ? 'tool_use' : 'end_turn', stop_sequence: null },
    usage: { output_tokens: 1 },
  });
  send('message_stop', { type: 'message_stop' });
  res.end();
}

export interface VerifierDeps {
  executor: AiExecutor;
  profileId: string;
  admission: ExecutionAdmission;
  store: CapabilityEvidenceStore;
  pathEnv: string | undefined;
  /** quem inicia a CLI é o host (regra do gateway): ele entrega o iniciador */
  spawn(command: HeadlessCommand, cwd: string, out: (text: string, stream: 'stdout' | 'stderr') => void): RunningProcess;
  now?(): number;
  /** limite por execução da CLI */
  timeoutMs?: number;
  /** substituível em testes: roda as sondagens e devolve as observações */
  probe?(binding: string): Promise<ProbeRun>;
  /** quem inicia o agente ACP é o host; sem ele, um perfil ACP não é verificado */
  spawnAgent?: AcpSpawnFn;
  /** substituível em testes: o handshake do agente ACP */
  probeAcp?(binding: string): Promise<AcpProbeRun>;
  /**
   * quanto o handshake espera, depois do `session/new`, o agente conectar no servidor MCP de teste. O Codex
   * (codex-acp 2.2.2) responde a sessão antes de iniciar os servidores: sem a espera, a sondagem fechava o processo
   * antes da conexão e a capacidade de MCP nunca era provada
   */
  mcpWaitMs?: number;
  /**
   * A chave do cofre para o `authenticate` de cada handshake (o agente com login por chave não abre a sessão
   * sem ela). Não entra no vínculo nem nos recibos: trocar a chave não muda o que a prova cobre.
   */
  acpAuth?: AcpAuth;
}
export interface VerifierResult {
  binding: string;
  evidence: CapabilityEvidence[];
  /** nenhuma capacidade verificada de fato quando há check falho ou indisponível */
  verified: boolean;
  /** o índice do vínculo da última prova por perfil não foi gravado; os recibos foram */
  indexError?: string;
  /** o agente ACP recusou a sessão por falta de login (ou recusou a chave): o Conectar diz isso no passo do login */
  authRequired?: boolean;
}

/** Executa as sondagens e grava as evidências. Recusa quando o ambiente gerenciado não pôde ser lido. */
export async function verifyExecutor(deps: VerifierDeps): Promise<VerifierResult> {
  const profile = executorProfile(deps.executor);
  const agent = admissionAgent(profile);
  const gemini = isGeminiCli(profile);
  // o host entrega o perfil resolvido (pronto ou cópia do Claude), não só o id 'claude'
  if (!agent && profile.base !== 'claude' && !gemini)
    throw new Error('O verificador de isolamento só existe para a CLI do Claude, a CLI do Gemini e os agentes ACP.');
  const bound = deps.admission.isolationBinding(deps.executor, deps.profileId, 'board');
  if (!bound.environmentComplete) throw new Error('Ambiente gerenciado não verificado; recibos não são gravados.');
  const now = deps.now?.() ?? Date.now();
  const expected = agent ? ACP_CAPABILITY_CHECKS : CAPABILITY_CHECKS;
  let evidence: CapabilityEvidence[];
  let authRequired = false;
  if (agent) {
    if (!deps.spawnAgent && !deps.probeAcp) throw new Error('Transporte ACP indisponível neste host.');
    const run = await (deps.probeAcp ?? (() => runAcpProbes(deps, agent, bound.executable)))(bound.binding);
    authRequired = run.first.authRequired || run.second.authRequired;
    evidence = buildEvidence(bound.binding, evaluateAcpProbes(bound.binding, run), now, undefined, expected);
  } else {
    // as mesmas cinco capacidades e os mesmos checks nas duas CLIs; mudam a fixture, a API local e os nomes
    const probe = gemini
      ? () => runGeminiProbes(deps, bound.executable)
      : (binding: string) => runClaudeProbes(deps, bound.executable, binding);
    const run = await (deps.probe ?? probe)(bound.binding);
    evidence = buildEvidence(bound.binding, evaluateProbes(bound.binding, run, gemini ? GEMINI_PROBE_NAMES : CLAUDE_PROBE_NAMES), now);
  }
  const verified = evidence.every((e) => expected[e.capability].every((id) => e.checks.some((c) => c.id === id && c.outcome === 'passed')));
  // Também grava falhas: uma falha mais nova nunca recorre ao sucesso antigo.
  for (const e of evidence) deps.store.record(e);
  // a partir daqui o host sabe que este perfil tem prova neste vínculo, e avisa quando o vínculo mudar.
  // O índice só serve ao aviso: uma falha nele não perde os recibos já gravados nem o resultado
  let indexError: string | undefined;
  try {
    deps.store.remember(deps.profileId, bound.binding);
  } catch (e) {
    indexError = `O índice das provas por perfil não foi gravado (${e instanceof Error ? e.message : String(e)}); os recibos valem, mas o aviso de prova invalidada não aparece para este perfil.`;
  }
  return { binding: bound.binding, evidence, verified, ...(indexError ? { indexError } : {}), ...(authRequired ? { authRequired } : {}) };
}

/** A fixture neutraliza provedores/chaves: nunca usa nem reencaminha a autenticação da pessoa. */
async function runClaudeProbes(deps: VerifierDeps, executable: string, _binding: string): Promise<ProbeRun> {
  if (process.platform === 'win32') throw new Error('Verificador de isolamento: Windows não validado.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-verify-'));
  fs.chmodSync(root, 0o700);
  const project = path.join(root, 'ancestor', 'project');
  const config = path.join(root, 'config');
  const additional = path.join(root, 'additional');
  const marker = path.join(root, 'hook-executed');
  const canaries = Object.fromEntries(
    ['project', 'user', 'ancestor', 'additional', 'skill', 'agent'].map((n) => [n, `FAZAI_${n}_${randomUUID().replaceAll('-', '')}`]),
  );
  write(path.join(project, 'CLAUDE.md'), canaries.project!);
  write(path.join(config, 'CLAUDE.md'), canaries.user!);
  write(path.join(project, '..', 'CLAUDE.md'), canaries.ancestor!);
  write(path.join(additional, 'CLAUDE.md'), canaries.additional!);
  write(path.join(project, 'allowed.txt'), 'FAZAI_READ_ALLOWED');
  const hook = path.join(root, 'hook.cjs');
  write(hook, `require('node:fs').writeFileSync(${json(marker)}, 'executado')`);
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  write(
    path.join(project, '.claude', 'settings.local.json'),
    json({
      enableAllProjectMcpServers: true,
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `${q(process.execPath)} ${q(hook)}` }] }] },
    }),
  );
  let state: ApiState = { texts: [], tools: [], results: [], uses: new Map(), attempts: [], sent: false, connections: [], calls: [] };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') return reply(res, {}, 405);
      let body = '';
      for await (const chunk of req) {
        body += String(chunk);
        if (body.length > 8_000_000) return reply(res, {}, 413);
      }
      const data = JSON.parse(body);
      if (mcpProbe(req, res, data, state)) return;
      if (req.url?.split('?')[0] === '/v1/messages') {
        if (req.headers['x-api-key'] !== API_KEY || req.headers.authorization)
          return reply(res, { error: { type: 'authentication_error', message: 'Apenas autenticação fictícia é aceita.' } }, 401);
        state.texts.push(body);
        state.tools.push((data.tools ?? []).map((t: { name: string }) => t.name));
        for (const m of data.messages ?? [])
          if (Array.isArray(m.content))
            for (const b of m.content) {
              if (b.type === 'tool_use') state.uses.set(b.id, b.name);
              if (b.type === 'tool_result') state.results.push({ id: b.tool_use_id, isError: b.is_error === true });
            }
        const attempts = state.sent ? [] : state.attempts;
        state.sent = true;
        return message(res, data.model, attempts);
      }
      return reply(res, req.url?.includes('count_tokens') ? { input_tokens: 1 } : {});
    } catch {
      if (!res.headersSent) reply(res, {}, 400);
      else res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  write(path.join(project, '.mcp.json'), json({ mcpServers: { forbidden: { type: 'http', url: `${url}/mcp/forbidden` } } }));
  const mcpConfig = json({ mcpServers: { allowed: { type: 'http', url: `${url}/mcp/allowed` } } });
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.keys(process.env)
        .filter((k) => VERIFIER_OBSERVED_ENV.test(k))
        .map((k) => [k, '']),
    ),
    PATH: deps.pathEnv ?? process.env.PATH ?? '',
    CLAUDE_CONFIG_DIR: config,
    ANTHROPIC_API_KEY: API_KEY,
    ANTHROPIC_BASE_URL: url,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
    NO_COLOR: '1',
  };
  const execute = async (opts: {
    control?: boolean;
    empty?: boolean;
    attempts?: Attempt[];
    prompt?: string;
  }): Promise<ProbeObservation> => {
    fs.rmSync(marker, { force: true });
    state = { texts: [], tools: [], results: [], uses: new Map(), attempts: opts.attempts ?? [], sent: false, connections: [], calls: [] };
    const input: HeadlessInput = {
      prompt: opts.prompt ?? 'Verificação local de contrato.',
      permission: 'board',
      structured: true,
      addDirs: [additional],
      exec: {
        agent: '',
        agentDefinition: null,
        model: { name: 'claude-sonnet-4-6', effort: null },
        mcpBlocked: [],
        mcpAllowed: opts.empty ? [] : ['allowed'],
        mcpConfig: opts.empty ? '{"mcpServers":{}}' : mcpConfig,
        tools: opts.empty ? [] : ['Read'],
        deniedTools: NO_DELEGATION,
        toolSet: 'explicit',
        mcpTools: opts.empty ? [] : ['mcp__allowed__allowed'],
      },
    };
    let built: HeadlessCommand = headlessCommand(deps.executor, input);
    if (opts.control) {
      // Controle positivo: retirar as barreiras precisa tornar a contaminação observável.
      let args = built.args.filter((a) => !['--strict-mcp-config', '--disable-slash-commands'].includes(a));
      for (const flag of ['--setting-sources', '--tools', '--disallowedTools']) {
        const i = args.indexOf(flag);
        if (i >= 0) {
          const end = args.findIndex((a, j) => j > i && a.startsWith('--'));
          args = [...args.slice(0, i), ...(end < 0 ? [] : args.slice(end))];
        }
      }
      built = { ...built, args, env: undefined };
    }
    const { command, cleanup } = materialize(built);
    let stdout = '';
    try {
      const code = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
        const proc = deps.spawn({ ...command, command: executable, env: { ...env, ...command.env } }, project, (text, stream) => {
          if (stream === 'stdout') stdout += text;
        });
        const timer = setTimeout(() => {
          proc.kill();
          resolve({ code: null, timedOut: true });
        }, deps.timeoutMs ?? 90_000);
        proc.onExit((c) => {
          clearTimeout(timer);
          resolve({ code: c, timedOut: false });
        });
      });
      let sessionId: string | null = null;
      for (const line of stdout.split('\n'))
        try {
          const event = JSON.parse(line) as { type?: string; subtype?: string; session_id?: string };
          if (event.type === 'system' && event.subtype === 'init' && typeof event.session_id === 'string') sessionId = event.session_id;
        } catch {
          /* linha que não é JSON */
        }
      return {
        ...code,
        requestText: state.texts.join('\n'),
        toolNames: state.tools[0] ?? [],
        toolResults: state.results.flatMap((r) => (state.uses.has(r.id) ? [{ name: state.uses.get(r.id)!, isError: r.isError }] : [])),
        mcpConnections: [...state.connections],
        mcpCalls: [...state.calls],
        sessionId,
      };
    } finally {
      cleanup();
    }
  };
  try {
    const control = await execute({ control: true });
    const controlHook = fs.existsSync(marker);
    const strict = await execute({
      attempts: [
        { name: 'Read', input: { file_path: path.join(project, 'allowed.txt') } },
        { name: 'Bash', input: { command: 'exit 73' } },
        { name: 'Write', input: { file_path: path.join(project, 'forbidden.txt'), content: 'não escrever' } },
        { name: 'mcp__allowed__allowed', input: {} },
        { name: 'mcp__allowed__forbidden', input: {} },
        { name: 'Agent', input: { description: 'Não delegar', prompt: 'Não delegar', subagent_type: 'general-purpose' } },
      ],
    });
    const strictHook = fs.existsSync(marker);
    const forbiddenFileWritten = fs.existsSync(path.join(project, 'forbidden.txt'));
    const m1 = `FAZAI_CONVERSATION_${randomUUID()}`;
    const m2 = `FAZAI_CONVERSATION_${randomUUID()}`;
    const first = { ...(await execute({ empty: true, prompt: m1 })), marker: m1 };
    const second = { ...(await execute({ empty: true, prompt: m2 })), marker: m2 };
    const environment = deps.admission.environmentDigest();
    return {
      control,
      strict,
      controlHook,
      strictHook,
      forbiddenFileWritten,
      allowedReadContent: 'FAZAI_READ_ALLOWED',
      canaries,
      first,
      second,
      environmentDigest: environment,
    };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** Uma resposta da API local do Gemini em SSE (`streamGenerateContent?alt=sse`): as chamadas roteirizadas, ou um texto. */
function geminiStream(res: http.ServerResponse, model: string, calls: Attempt[]): void {
  const parts = calls.length
    ? calls.map((c) => ({ functionCall: { name: c.name, args: c.input } }))
    : [{ text: 'Verificação local encerrada.' }];
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  res.write(
    `data: ${json({
      candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      modelVersion: model,
    })}\r\n\r\n`,
  );
  res.end();
}

/** Os argumentos de isolamento do Gemini pela CLI que o controle tira: `-e none` e cada `--allowed-mcp-server-names`. */
function withoutGeminiBarriers(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-e' && args[i + 1] === 'none') || args[i] === '--allowed-mcp-server-names') {
      i++;
      continue;
    }
    out.push(args[i]!);
  }
  return out;
}

/**
 * A sondagem do Gemini pela CLI (história 8): o binário real numa fixture descartável, contra uma API local do
 * Gemini (`GOOGLE_GEMINI_BASE_URL`, que a CLI aceita em HTTP no próprio computador) com uma chave fictícia:
 * nada sai para a rede nem gasta a conta da pessoa. As sentinelas ficam no `GEMINI.md` do projeto, do
 * ancestral (até a pasta com `.git`), da pasta adicional e da home da pessoa (a `HOME` da fixture, com uma
 * extensão que traz o próprio contexto e um servidor MCP proibido, também no settings do projeto). O controle
 * roda sem as barreiras (sem a home do board, sem `-e none` e sem `--allowed-mcp-server-names`) e precisa
 * enxergar cada sentinela; a execução estrita é o comando do provider, com a home isolada.
 */
async function runGeminiProbes(deps: VerifierDeps, executable: string): Promise<ProbeRun> {
  if (process.platform === 'win32') throw new Error('Verificador de isolamento: Windows não validado.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-verify-gemini-'));
  fs.chmodSync(root, 0o700);
  const ancestor = path.join(root, 'ancestor');
  const project = path.join(ancestor, 'project');
  const user = path.join(root, 'user');
  const additional = path.join(root, 'additional');
  const marker = path.join(root, 'hook-executed');
  const canaries = Object.fromEntries(
    ['project', 'user', 'ancestor', 'additional', 'skill', 'agent'].map((n) => [n, `FAZAI_${n}_${randomUUID().replaceAll('-', '')}`]),
  );
  // a busca do `GEMINI.md` sobe até a pasta com `.git` (o `memoryBoundaryMarkers` padrão): o ancestral fica dentro
  fs.mkdirSync(path.join(ancestor, '.git'), { recursive: true, mode: 0o700 });
  write(path.join(project, 'GEMINI.md'), canaries.project!);
  write(path.join(ancestor, 'GEMINI.md'), canaries.ancestor!);
  write(path.join(additional, 'GEMINI.md'), canaries.additional!);
  write(path.join(user, '.gemini', 'GEMINI.md'), canaries.user!);
  // a extensão da conta da pessoa: o contexto dela conta como sentinela da home
  const extension = path.join(user, '.gemini', 'extensions', 'fazai-sonda');
  write(path.join(extension, 'EXTENSAO.md'), `${canaries.user}_extensao`);
  write(path.join(project, 'allowed.txt'), 'FAZAI_READ_ALLOWED');
  // o `.env` hostil: com a pasta confiada (`--skip-trust`), a CLI carrega o primeiro `.gemini/.env` ou `.env` que
  // achar subindo da pasta (o `~/.gemini/.env` da pessoa, acima do projeto, inclusive) e aplica as variáveis que
  // ainda não estão definidas. O cabeçalho que ele pede (`GEMINI_CLI_CUSTOM_HEADERS`) chega à API local e é a
  // sentinela: o do projeto conta como do projeto, o do ancestral (o lugar do `~/.gemini/.env`) como do ancestral
  write(path.join(project, '.env'), `GEMINI_CLI_CUSTOM_HEADERS=x-fazai-sentinela: ${canaries.project}_env\n`);
  write(path.join(ancestor, '.gemini', '.env'), `GEMINI_CLI_CUSTOM_HEADERS=x-fazai-sentinela: ${canaries.ancestor}_env\n`);
  const hook = path.join(root, 'hook.cjs');
  write(hook, `require('node:fs').writeFileSync(${json(marker)}, 'executado')`);
  let state: ApiState = { texts: [], tools: [], results: [], uses: new Map(), attempts: [], sent: false, connections: [], calls: [] };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') return reply(res, {}, 405);
      let body = '';
      for await (const chunk of req) {
        body += String(chunk);
        if (body.length > 8_000_000) return reply(res, {}, 413);
      }
      const data = JSON.parse(body);
      if (mcpProbe(req, res, data, state)) return;
      const route = /^\/v1beta\/models\/([^:/?]+):(streamGenerateContent|generateContent|countTokens)/.exec(req.url ?? '');
      if (!route) return reply(res, {}, 404);
      if (req.headers['x-goog-api-key'] !== API_KEY)
        return reply(res, { error: { code: 401, message: 'Apenas autenticação fictícia é aceita.', status: 'UNAUTHENTICATED' } }, 401);
      if (route[2] === 'countTokens') return reply(res, { totalTokens: 1 });
      // o cabeçalho que um `.env` hostil pediria entra no texto observado, junto do pedido
      state.texts.push(`${body}\n${String(req.headers['x-fazai-sentinela'] ?? '')}`);
      if (route[2] === 'generateContent')
        return reply(res, { candidates: [{ content: { role: 'model', parts: [{ text: '{}' }] }, finishReason: 'STOP' }] });
      state.tools.push(
        ((data.tools ?? []) as { functionDeclarations?: { name: string }[] }[]).flatMap((t) =>
          (t.functionDeclarations ?? []).map((f) => f.name),
        ),
      );
      // as respostas das funções voltam no pedido seguinte: o erro é a recusa da CLI (ferramenta fora do registro)
      for (const c of data.contents ?? [])
        for (const p of c.parts ?? [])
          if (p.functionResponse) {
            state.results.push({ id: String(p.functionResponse.name), isError: 'error' in (p.functionResponse.response ?? {}) });
            (state.outputs ??= []).push(json(p.functionResponse.response ?? {}));
          }
      const attempts = state.sent ? [] : state.attempts;
      state.sent = true;
      return geminiStream(res, route[1]!, attempts);
    } catch {
      if (!res.headersSent) reply(res, {}, 400);
      else res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const forbidden = { httpUrl: `${url}/mcp/forbidden` };
  write(
    path.join(extension, 'gemini-extension.json'),
    json({ name: 'fazai-sonda', version: '1.0.0', contextFileName: 'EXTENSAO.md', mcpServers: { forbidden } }),
  );
  write(path.join(project, '.gemini', 'settings.json'), json({ mcpServers: { forbidden } }));
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  write(
    path.join(user, '.gemini', 'settings.json'),
    json({
      security: { auth: { selectedType: 'gemini-api-key' } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
      mcpServers: { forbidden },
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `${q(process.execPath)} ${q(hook)}` }] }] },
    }),
  );
  const mcpConfig = json({ mcpServers: { allowed: { type: 'http', url: `${url}/mcp/allowed` } } });
  const env: Record<string, string> = {
    // nada da conta da pessoa: a chave, o projeto do Google e as pastas do Gemini vêm vazios
    ...Object.fromEntries(
      Object.keys(process.env)
        .filter((k) => VERIFIER_OBSERVED_ENV.test(k) || /^GEMINI_/.test(k))
        .map((k) => [k, '']),
    ),
    PATH: deps.pathEnv ?? process.env.PATH ?? '',
    HOME: user,
    GEMINI_API_KEY: API_KEY,
    GOOGLE_GEMINI_BASE_URL: url,
    NO_COLOR: '1',
  };
  /** o que a fixture controla em toda execução, por cima do ambiente fixado pelo provider */
  const fixed = { PATH: env.PATH!, HOME: user, GEMINI_API_KEY: API_KEY, GOOGLE_GEMINI_BASE_URL: url, NO_COLOR: '1' };
  const execute = async (opts: {
    control?: boolean;
    empty?: boolean;
    attempts?: Attempt[];
    prompt?: string;
    /** as ferramentas da execução, no lugar da leitura (a passada que roda um shell) */
    tools?: string[];
  }): Promise<ProbeObservation> => {
    fs.rmSync(marker, { force: true });
    state = {
      texts: [],
      tools: [],
      results: [],
      uses: new Map(),
      attempts: opts.attempts ?? [],
      sent: false,
      connections: [],
      calls: [],
      outputs: [],
    };
    const input: HeadlessInput = {
      prompt: opts.prompt ?? 'Verificação local de contrato.',
      permission: 'board',
      structured: true,
      addDirs: [additional],
      exec: {
        agent: '',
        agentDefinition: null,
        model: { name: 'gemini-2.5-flash', effort: null },
        mcpBlocked: [],
        mcpAllowed: opts.empty ? [] : ['allowed'],
        mcpConfig: opts.empty ? '{"mcpServers":{}}' : mcpConfig,
        tools: opts.tools ?? (opts.empty ? [] : [GEMINI_PROBE_NAMES.read]),
        deniedTools: [GEMINI_PROBE_NAMES.delegation],
        toolSet: 'explicit',
        mcpTools: opts.empty ? [] : ['mcp__allowed__allowed'],
      },
    };
    let built: HeadlessCommand = headlessCommand(deps.executor, input);
    // Controle positivo: sem a home do board (e o settings dela), sem o ambiente fixado, sem `-e none` e sem a
    // lista de servidores, a contaminação aparece
    if (opts.control) {
      const { tempHome: _home, env: _env, ...rest } = built;
      built = { ...rest, args: withoutGeminiBarriers(built.args) };
    }
    const { command, cleanup } = materialize(built);
    let stdout = '';
    try {
      const code = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
        const proc = deps.spawn({ ...command, command: executable, env: { ...env, ...command.env, ...fixed } }, project, (text, stream) => {
          if (stream === 'stdout') stdout += text;
        });
        const timer = setTimeout(() => {
          proc.kill();
          resolve({ code: null, timedOut: true });
        }, deps.timeoutMs ?? 90_000);
        proc.onExit((c) => {
          clearTimeout(timer);
          resolve({ code: c, timedOut: false });
        });
      });
      let sessionId: string | null = null;
      for (const line of stdout.split('\n'))
        try {
          const event = JSON.parse(line) as { type?: string; session_id?: string };
          if (event.type === 'init' && typeof event.session_id === 'string') sessionId = event.session_id;
        } catch {
          /* linha que não é JSON */
        }
      return {
        ...code,
        requestText: state.texts.join('\n'),
        toolNames: state.tools[0] ?? [],
        // na API do Gemini a resposta da função vem pelo nome, não por id
        toolResults: state.results.map((r) => ({ name: r.id, isError: r.isError })),
        mcpConnections: [...state.connections],
        mcpCalls: [...state.calls],
        sessionId,
      };
    } finally {
      cleanup();
    }
  };
  try {
    const control = await execute({ control: true });
    const controlHook = fs.existsSync(marker);
    const n = GEMINI_PROBE_NAMES;
    const strict = await execute({
      attempts: [
        { name: n.read, input: { file_path: path.join(project, 'allowed.txt') } },
        { name: n.shell, input: { command: 'exit 73' } },
        { name: n.write, input: { file_path: path.join(project, 'forbidden.txt'), content: 'não escrever' } },
        { name: n.mcpAllowed, input: {} },
        { name: n.mcpForbidden, input: {} },
        { name: n.delegation, input: { agent_name: 'codebase_investigator', prompt: 'Não delegar' } },
      ],
    });
    const strictHook = fs.existsSync(marker);
    const forbiddenFileWritten = fs.existsSync(path.join(project, 'forbidden.txt'));
    // o shell liberado não vê a chave: a passada roda um comando que a imprime; sem o fim do comando na resposta
    // (o shell não rodou), a sonda não prova nada e conta como falha
    await execute({
      tools: [n.shell],
      attempts: [{ name: n.shell, input: { command: 'printenv GEMINI_API_KEY; printenv GOOGLE_API_KEY; echo FAZAI_SHELL_FIM' } }],
    });
    const shellOutputs = state.outputs ?? [];
    const secretInShell = !shellOutputs.some((o) => o.includes('FAZAI_SHELL_FIM')) || shellOutputs.some((o) => o.includes(API_KEY));
    const m1 = `FAZAI_CONVERSATION_${randomUUID()}`;
    const m2 = `FAZAI_CONVERSATION_${randomUUID()}`;
    const first = { ...(await execute({ empty: true, prompt: m1 })), marker: m1 };
    const second = { ...(await execute({ empty: true, prompt: m2 })), marker: m2 };
    return {
      control,
      strict,
      controlHook,
      strictHook,
      forbiddenFileWritten,
      secretInShell,
      allowedReadContent: 'FAZAI_READ_ALLOWED',
      canaries,
      first,
      second,
      // a configuração gerenciada do Gemini (as do sistema) entra no vínculo pelo driver; aqui, a do host
      environmentDigest: deps.admission.environmentDigest(),
    };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** Um servidor MCP stdio mínimo, escrito na fixture: responde ao `initialize` e deixa um marcador quando o agente o chama. */
const MCP_PROBE_SERVER = `
const fs = require('node:fs');
const marker = process.argv[2];
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.method === 'initialize') fs.writeFileSync(marker, 'conectado');
    if (msg.id === undefined) continue;
    const result =
      msg.method === 'initialize'
        ? { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'allowed', version: '1' } }
        : msg.method === 'tools/list'
          ? { tools: [{ name: 'allowed', description: 'Operação de teste', inputSchema: { type: 'object', properties: {} } }] }
          : {};
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\\n');
  }
});
process.stdin.on('end', () => process.exit(0));
`;

/**
 * Abre o agente uma vez: `initialize`, `session/new` com o servidor de teste, e fecha. O `session/prompt` só vai
 * quando `nudge` pede e o agente não ligou o servidor sozinho: há agentes que só iniciam os servidores MCP no
 * primeiro turno (o Antigravity 1.4.1), e um pedido mínimo é o único jeito de observar a conexão neles.
 */
async function acpHandshake(
  deps: Pick<VerifierDeps, 'spawnAgent' | 'timeoutMs' | 'acpAuth' | 'mcpWaitMs'>,
  agent: AcpAgent,
  executable: string,
  cwd: string,
  server: { command: string; args: string[]; env: { name: string; value: string }[] },
  connected: () => boolean,
  nudge = false,
): Promise<AcpHandshake> {
  const result: AcpHandshake = { protocolVersion: null, agentCapabilities: null, sessionId: null, authRequired: false, error: null };
  const built = acpCommand(agent, { prompt: '', permission: 'board' });
  const stdout = lineSplitter();
  let proc = null as ReturnType<AcpSpawnFn> | null;
  let exited = false;
  const rpc = rpcConnection({
    send: (line) => proc?.write(`${line}\n`),
    onNotification: () => {},
    // a sondagem não pede trabalho: qualquer pedido do agente é recusado
    onRequest: () => ({ outcome: { outcome: 'cancelled' } }),
  });
  const done = new Promise<void>((resolve) => {
    proc = deps.spawnAgent!({ ...built, command: executable }, cwd, (text, stream) => {
      if (stream !== 'stdout') return;
      for (const line of stdout.push(text)) if (line) rpc.receive(line);
    });
    proc.onExit((code, error) => {
      exited = true;
      rpc.close(error ?? new Error(`${agent.label} saiu (código ${code}) durante a sondagem.`));
      resolve();
    });
  });
  const timer = setTimeout(() => proc?.kill(), deps.timeoutMs ?? 90_000);
  try {
    const init = await rpc.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'faz-ai', title: 'Faz AI Kanban (sondagem)', version: EXTENSION_VERSION },
    });
    result.protocolVersion = typeof init.protocolVersion === 'number' ? init.protocolVersion : null;
    result.agentCapabilities = asObject(init.agentCapabilities) ?? null;
    // a recusa da chave volta como `auth_required`, como a sessão sem login
    await acpAuthenticate(rpc, init, deps.acpAuth);
    const session = await rpc.request('session/new', {
      cwd,
      mcpServers: [{ name: 'allowed', command: server.command, args: server.args, env: server.env }],
    });
    result.sessionId = asText(session.sessionId);
    // o agente pode iniciar os servidores depois de responder a sessão: espera a conexão antes de fechar o processo
    const wait = async () => {
      const until = Date.now() + (deps.mcpWaitMs ?? 10_000);
      while (!connected() && !exited && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    };
    await wait();
    // ainda sem conexão: um turno mínimo faz o agente que adia os servidores iniciá-los. A resposta não importa, e o
    // turno não espera o fim: a conexão (ou a espera) decide, e o processo fecha em seguida
    if (nudge && !connected() && !exited && result.sessionId) {
      rpc.request('session/prompt', { sessionId: result.sessionId, prompt: [{ type: 'text', text: 'Responda só OK.' }] }).catch(() => {});
      await wait();
    }
  } catch (e) {
    if (e instanceof RpcError && e.code === AUTH_REQUIRED) result.authRequired = true;
    result.error = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(timer);
    proc?.end();
    setTimeout(() => {
      if (!exited) proc?.kill();
    }, 5_000).unref?.();
    await done;
  }
  return result;
}

/** A sondagem do agente ACP numa fixture descartável: dois handshakes e o servidor MCP de teste. */
export async function runAcpProbes(
  deps: Pick<VerifierDeps, 'spawnAgent' | 'timeoutMs' | 'acpAuth' | 'mcpWaitMs'> & {
    admission: Pick<ExecutionAdmission, 'environmentDigest'>;
  },
  agent: AcpAgent,
  executable: string,
): Promise<AcpProbeRun> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-verify-acp-'));
  fs.chmodSync(root, 0o700);
  const project = path.join(root, 'project');
  const script = path.join(root, 'mcp-probe.cjs');
  const marker = path.join(root, 'mcp-connected');
  fs.mkdirSync(project, { recursive: true, mode: 0o700 });
  write(script, MCP_PROBE_SERVER);
  // no editor o `process.execPath` é o Electron, que só roda o script como node com ELECTRON_RUN_AS_NODE. A
  // variável vai na própria entrada do servidor, como a do servidor do board (`runner.ts`): o Codex inicia os
  // servidores MCP com o ambiente filtrado, e a herdada do editor não chegava
  const server = { command: process.execPath, args: [script, marker], env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }] };
  const connected = () => fs.existsSync(marker);
  try {
    // só o primeiro handshake pode pedir o turno mínimo: o segundo prova a sessão nova, e a conexão já foi vista
    const first = await acpHandshake(deps, agent, executable, project, server, connected, true);
    const second = await acpHandshake(deps, agent, executable, project, server, connected);
    return { first, second, mcpConnected: fs.existsSync(marker), environmentDigest: deps.admission.environmentDigest() };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
