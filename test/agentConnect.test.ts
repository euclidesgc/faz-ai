// Conectar agentes, no host: o registro do ACP resolvido para a máquina e guardado em cache, a lista que junta os
// perfis do board com o registro, a sessão de teste, a conta (verificar, entrar, sair) e o log do protocolo. Os
// agentes são processos de verdade: o agente falso (`fakes/sdkAgent.mjs`, o lado "agente" do mesmo SDK) e uma CLI
// falsa do Claude Code, um script que responde o `auth status`.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RegistryCache, agentsFromRegistry, binaryName, npxArgs, platformKey } from '../src/extension/agentConnect/registry';
import {
  accountLabel,
  accountOf,
  capabilityLabels,
  configOptionsOf,
  parseAuthMethods,
  toTestEvent,
  type AgentSpawn,
} from '../src/extension/agentConnect/protocol';
import { TestSession } from '../src/extension/agentConnect/session';
import { acpAccount, acpLogin, acpLogout, cliAccount } from '../src/extension/agentConnect/account';
import { AgentConnectService, type AgentConnectNotice, type TerminalSpec } from '../src/extension/agentConnect/service';
import { MAX_LOG_JSON, ProtocolLog, ProtocolLogFile, compactJson, redact } from '../src/extension/agentConnect/protocolLog';
import {
  agentList,
  appendTestEvent,
  registryIdOf,
  type AgentAccount,
  type ProtocolLogEntry,
  type TestEvent,
  type TestItem,
  type TestState,
} from '../src/shared/agentConnect';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import { TOOLS, VAULT_KEY_TOOLS } from '../src/shared/aiTools';
import { allDrivers } from '../src/extension/ai/drivers';
import type { ConnectState } from '../src/shared/connect';

const REGISTRY = {
  version: '1',
  agents: [
    {
      id: 'gemini',
      name: 'Gemini CLI',
      version: '0.65.0',
      description: 'Google',
      authors: ['Google'],
      icon: 'https://cdn/gemini.svg',
      distribution: { npx: { package: '@google/gemini-cli@0.65.0', args: ['--acp'] } },
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      version: '1.19.4',
      description: 'open source',
      authors: ['Anomaly'],
      website: 'https://opencode.ai',
      distribution: { binary: { 'darwin-aarch64': { archive: 'x', cmd: './opencode', args: ['acp'] } } },
    },
    {
      id: 'kilo',
      name: 'Kilo',
      version: '7',
      description: '',
      authors: [],
      distribution: {
        binary: { 'darwin-aarch64': { archive: 'x', cmd: './kilo', args: ['acp'] } },
        npx: { package: '@kilocode/cli@7', args: ['acp'], env: { NO_UPDATE: '1' } },
      },
    },
    {
      id: 'goose',
      name: 'goose',
      version: '1',
      description: '',
      authors: [],
      distribution: { binary: { 'linux-x86_64': { cmd: './goose' } } },
    },
  ],
};

const FAKE = path.join(__dirname, 'fakes', 'sdkAgent.mjs');
const nodeSpawn: AgentSpawn = (command, args, extra, cwd) =>
  spawn(command, args, { cwd, env: { ...process.env, ...extra }, stdio: ['pipe', 'pipe', 'pipe'] });
const fakeLaunch = (env: Record<string, string> = {}) => ({ id: 'fake', name: 'Fake', command: process.execPath, args: [FAKE], env });
const tmp = (what: string) => fs.mkdtempSync(path.join(os.tmpdir(), `fazai-agents-${what}-`));
const posix = process.platform !== 'win32';

describe('registro do ACP', () => {
  it('traduz a plataforma do Node para a chave do registro', () => {
    expect(platformKey('darwin', 'arm64')).toBe('darwin-aarch64');
    expect(platformKey('win32', 'x64')).toBe('windows-x86_64');
    expect(binaryName('./dist-package\\cursor-agent.cmd')).toBe('cursor-agent');
  });

  it('usa o binário instalado, cai para o npx (sem perguntar e sem consultar a rede à toa) e marca o que não roda aqui', () => {
    const found: Record<string, string> = { npx: '/bin/npx', opencode: '/usr/bin/opencode' };
    const agents = agentsFromRegistry(REGISTRY, 'darwin-aarch64', (c) => found[c] ?? null);
    const by = Object.fromEntries(agents.map((a) => [a.id, a]));
    expect(by.opencode).toMatchObject({ distribution: 'binary', command: '/usr/bin/opencode', args: ['acp'], available: true });
    expect(by.gemini).toMatchObject({
      distribution: 'npx',
      command: '/bin/npx',
      args: ['-y', '--prefer-offline', '@google/gemini-cli@0.65.0', '--acp'],
      available: true,
    });
    expect(npxArgs('pkg@1', ['acp'])).toEqual(['-y', '--prefer-offline', 'pkg@1', 'acp']);
    // o kilo não está instalado: vai pelo pacote, com as variáveis do registro
    expect(by.kilo).toMatchObject({ distribution: 'npx', env: { NO_UPDATE: '1' }, available: true });
    expect(by.goose).toMatchObject({ available: false, note: 'Sem binário para esta plataforma.' });
    expect(agents.at(-1)?.id).toBe('goose');
  });

  it('sem npx, o agente de pacote fica indisponível com o motivo; um registro sem lista é recusado', () => {
    const [gemini] = agentsFromRegistry({ agents: [REGISTRY.agents[0]] }, 'darwin-aarch64', () => null);
    expect(gemini).toMatchObject({ available: false, note: 'Precisa do npx instalado.' });
    expect(() => agentsFromRegistry({}, 'darwin-aarch64', () => null)).toThrow(/formato inesperado/);
  });

  it('a cópia guardada vale por algumas horas: a tela abre sem baixar de novo; Atualizar baixa', async () => {
    const dir = tmp('registry');
    let now = 1_000;
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(REGISTRY)));
    const cache = new RegistryCache(path.join(dir, 'acp-registry.json'), fetchFn as never, () => now, 60_000);
    const first = await cache.listing(() => '/bin/npx', false, 'darwin-aarch64');
    expect(first).toMatchObject({ fetchedAt: 1_000, error: null });
    expect(first.agents.map((a) => a.id)).toContain('gemini');
    now = 30_000;
    await cache.listing(() => null, false, 'darwin-aarch64');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // o arquivo vale para o próximo processo (o editor reabriu)
    const again = new RegistryCache(path.join(dir, 'acp-registry.json'), fetchFn as never, () => now, 60_000);
    expect((await again.listing(() => null, false, 'darwin-aarch64')).fetchedAt).toBe(1_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await again.listing(() => null, true, 'darwin-aarch64');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('sem rede, a lista segue com a cópia anterior e diz o erro; sem cópia, a lista vem vazia com o erro', async () => {
    let now = 0;
    let fail = false;
    const fetchFn = vi.fn(async () => {
      if (fail) throw new Error('getaddrinfo ENOTFOUND');
      return new Response(JSON.stringify(REGISTRY));
    });
    const cache = new RegistryCache(null, fetchFn as never, () => now, 1_000);
    await cache.listing(() => null, false, 'darwin-aarch64');
    fail = true;
    now = 5_000;
    const stale = await cache.listing(() => null, false, 'darwin-aarch64');
    expect(stale).toMatchObject({ fetchedAt: 0, error: 'getaddrinfo ENOTFOUND' });
    expect(stale.agents).toHaveLength(4);
    const empty = await new RegistryCache(null, fetchFn as never).listing(() => null);
    expect(empty).toEqual({ agents: [], fetchedAt: null, error: 'getaddrinfo ENOTFOUND' });
    const bad = await new RegistryCache(null, (async () => new Response('{}')) as never).listing(() => null);
    expect(bad.error).toMatch(/formato inesperado/);
  });
});

describe('a lista da tela: os perfis do board e o registro', () => {
  const profiles = (): AiProfile[] => [
    ...BUILTIN_PROFILES.map((p) => ({ ...p })),
    {
      id: 'minha-cli',
      name: 'Minha CLI',
      enabled: true,
      kind: 'custom',
      tool: 'minha-cli',
      mode: 'cli',
      base: 'generic',
      config: {},
      position: 99,
    },
  ];
  const entry = (id: string) => ({
    ...agentsFromRegistry({ agents: [{ id, name: id, version: '1', distribution: { npx: { package: id } } }] }, 'x', () => '/bin/npx')[0]!,
  });

  it('o perfil acha a entrada do registro: o agente ACP dele, a ferramenta, e o Claude Code no "Claude Agent"', () => {
    const by = Object.fromEntries(profiles().map((p) => [p.id, registryIdOf(p)]));
    expect(by).toMatchObject({
      claude: 'claude-acp',
      cursor: 'cursor',
      kimi: 'kimi',
      gemini: 'gemini',
      'codex-acp': 'codex-acp',
      'minha-cli': null,
    });
  });

  it('o em uso primeiro, depois os ligados e os desligados; os do registro sem perfil ficam à parte, por nome', () => {
    const registry = ['claude-acp', 'gemini', 'zeta', 'amp-acp'].map(entry);
    const { board, others } = agentList(profiles(), registry, 'cursor');
    expect(board[0]).toMatchObject({ key: 'cursor', inUse: true });
    const enabled = board.filter((i) => i.profile!.enabled).map((i) => i.key);
    expect(board.slice(0, enabled.length).map((i) => i.key)).toEqual(enabled);
    expect(board.find((i) => i.key === 'claude')!.registry?.id).toBe('claude-acp');
    expect(board.find((i) => i.key === 'minha-cli')!.registry).toBeNull();
    expect(others.map((i) => i.key)).toEqual(['registry:amp-acp', 'registry:zeta']);
    expect(others.every((i) => i.profile === null && !i.inUse)).toBe(true);
  });

  it('a chave de API pelo cofre é a das ferramentas cujo driver entra por chave', () => {
    const byKey = new Set(
      allDrivers()
        .filter((d) => d.auth.kind === 'api-key')
        .map((d) => d.tool),
    );
    expect([...byKey].sort()).toEqual([...VAULT_KEY_TOOLS].sort());
    for (const tool of VAULT_KEY_TOOLS) expect(TOOLS.some((t) => t.id === tool)).toBe(true);
  });
});

describe('a conversa da sessão de teste', () => {
  it('converte os session/update e esconde o eco do prompt e os avisos de protocolo', () => {
    expect(toTestEvent({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'a' } })).toEqual({
      kind: 'message',
      text: 'a',
    });
    expect(toTestEvent({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'a' } })).toBeNull();
    expect(toTestEvent({ sessionUpdate: 'available_commands_update', availableCommands: [] })).toBeNull();
    expect(toTestEvent({ sessionUpdate: 'session_info_update', title: 'x' } as never)).toBeNull();
    expect(toTestEvent({ sessionUpdate: 'usage_update', used: 1, size: 2 })).toEqual({ kind: 'usage', used: 1, size: 2 });
    expect(capabilityLabels({ loadSession: true, mcpCapabilities: { http: true } })).toEqual(['loadSession', 'MCP http']);
  });

  it('junta os pedaços de texto, atualiza a ferramenta no lugar e anota o fechamento', () => {
    const events: TestEvent[] = [
      { kind: 'message', text: 'Olá' },
      { kind: 'message', text: ' mundo' },
      { kind: 'tool', toolCallId: 't1', title: 'Ler', status: 'pending', toolKind: 'read' },
      { kind: 'tool', toolCallId: 't1', title: '', status: 'completed', toolKind: null },
      { kind: 'permission', permissionId: 'p', title: 'Ler', options: [] },
      { kind: 'permission-answer', permissionId: 'p', choice: 'Permitir' },
      { kind: 'closed', reason: 'Sessão de teste encerrada.' },
    ];
    expect(events.reduce<TestItem[]>(appendTestEvent, [])).toEqual([
      { kind: 'message', text: 'Olá mundo' },
      { kind: 'tool', toolCallId: 't1', title: 'Ler', status: 'completed', toolKind: 'read' },
      { kind: 'permission', permissionId: 'p', title: 'Ler', options: [], answer: 'Permitir' },
      { kind: 'note', text: 'Sessão de teste encerrada.', tone: 'muted', translate: true },
    ]);
  });

  it('achata os grupos do select e mantém o booleano', () => {
    expect(
      configOptionsOf([
        {
          id: 'model',
          name: 'Model',
          category: 'model',
          type: 'select',
          currentValue: 'b',
          options: [{ group: 'g', name: 'Grupo', options: [{ value: 'b', name: 'B' }] }],
        },
        { id: 'fast', name: 'Fast', type: 'boolean', currentValue: true },
      ]),
    ).toEqual([
      {
        id: 'model',
        name: 'Model',
        description: null,
        category: 'model',
        type: 'select',
        current: 'b',
        options: [{ value: 'b', name: 'B', description: null, group: 'Grupo' }],
      },
      { id: 'fast', name: 'Fast', description: null, category: null, type: 'boolean', current: true, options: [] },
    ]);
  });

  it('o login de terminal é o comando do _meta, ou o próprio agente com os args e o ambiente do método', () => {
    const launch = { id: 'k', name: 'k', command: '/bin/kimi', args: ['acp'], env: { A: '1' } };
    const [fromMeta, fromArgs, key] = parseAuthMethods(
      [
        { id: 'a', type: 'terminal', name: 'A', args: ['--login'], _meta: { 'terminal-auth': { command: '/bin/kimi', args: ['login'] } } },
        { id: 'b', type: 'terminal', name: 'B', args: ['--login'], env: { B: '2' } } as never,
        { id: 'c', name: 'C', _meta: { 'api-key': { provider: 'x' } } },
      ],
      launch,
    );
    expect(fromMeta).toMatchObject({
      method: { type: 'terminal', terminalCommand: '/bin/kimi login', apiKey: false },
      terminal: { command: '/bin/kimi', args: ['login'] },
    });
    expect(fromArgs).toMatchObject({
      method: { terminalCommand: '/bin/kimi acp --login' },
      terminal: { command: '/bin/kimi', args: ['acp', '--login'], env: { A: '1', B: '2' } },
    });
    expect(key).toMatchObject({ method: { type: 'agent', terminalCommand: null, apiKey: true }, terminal: null });
  });

  it('a conta do aviso do adaptador do Claude, numa linha; sem login, nada', () => {
    const info = accountOf({ authStatus: { kind: 'account', label: 'Claude Max', account: { email: 'p@e.com' } } });
    expect(accountLabel(info)).toBe('Claude Max · p@e.com');
    expect(accountLabel(accountOf({ authStatus: { kind: 'none', label: 'Not logged in' } }))).toBeNull();
    expect(accountOf({ foo: 1 })).toBeNull();
  });
});

/** Uma sessão de teste ligada ao agente falso, com os eventos e as situações guardados para conferir. */
function fakeSession(idleMs?: number) {
  const events: TestEvent[] = [];
  const states: TestState[] = [];
  const log: ProtocolLogEntry[] = [];
  const waiters: { test: (e: TestEvent) => boolean; resolve: (e: TestEvent) => void }[] = [];
  const session = new TestSession(
    {
      event: (e) => {
        events.push(e);
        for (const w of waiters.filter((w) => w.test(e))) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(e);
        }
      },
      state: (s) => states.push(s),
      log: (entry) => log.push(entry),
    },
    nodeSpawn,
    idleMs,
  );
  const next = <K extends TestEvent['kind']>(kind: K) =>
    new Promise<Extract<TestEvent, { kind: K }>>((resolve) => {
      const seen = events.find((e) => e.kind === kind);
      if (seen) return resolve(seen as Extract<TestEvent, { kind: K }>);
      waiters.push({ test: (e) => e.kind === kind, resolve: resolve as (e: TestEvent) => void });
    });
  return { session, events, states, log, next };
}

describe('sessão de teste pelo SDK oficial', () => {
  it('abre, conversa e repassa o pedido de permissão; muda uma opção e encerra deixando a nota', async () => {
    const { session, events, next, log } = fakeSession();
    await session.open('fake', fakeLaunch(), process.cwd());
    try {
      expect(session.state.phase).toBe('connected');
      expect(session.state.connection).toMatchObject({
        key: 'fake',
        agentInfo: { name: 'Fake', version: '9.9.9' },
        capabilities: ['loadSession', 'imagens'],
        sessionId: 'sess-1',
        currentModeId: 'default',
        canLogout: true,
      });
      // o board declara o login no terminal: o agente lista o método de terminal
      expect(session.state.connection!.authMethods.map((m) => [m.id, m.type])).toContainEqual(['fake-term', 'terminal']);
      session.prompt('oi');
      const ask = await next('permission');
      expect(ask.options.map((o) => o.name)).toEqual(['Permitir', 'Recusar']);
      session.answerPermission(ask.permissionId, 'ok');
      await next('end');
      const text = events
        .filter((e): e is Extract<TestEvent, { kind: 'message' }> => e.kind === 'message')
        .map((e) => e.text)
        .join('');
      expect(text).toBe('Olá mundo (ok)');
      expect(events).toContainEqual({ kind: 'usage', used: 120, size: 1000 });
      expect(events).toContainEqual({ kind: 'stderr', text: 'aviso do agente' });
      await session.setConfigOption('model', 'm-b');
      expect(session.state.connection!.configOptions.find((o) => o.id === 'model')!.current).toBe('m-b');
    } finally {
      session.close();
    }
    expect(session.state.phase).toBe('idle');
    expect(events.at(-1)).toEqual({ kind: 'closed', reason: 'Sessão de teste encerrada.' });
    await new Promise((r) => setTimeout(r, 100));
    const pid = log.find((e) => /^processo \d+ iniciado$/.test(e.summary))!.summary.split(' ')[1];
    expect(log.map((e) => e.summary)).toContain(`sessão de teste fechada pela tela: encerrando o processo ${pid}`);
    expect(log.at(-1)!.summary).toMatch(new RegExp(`^processo ${pid} saiu`));
  });

  it('Interromper cancela o pedido de permissão e o agente encerra o turno', async () => {
    const { session, next } = fakeSession();
    await session.open('fake', fakeLaunch(), process.cwd());
    try {
      session.prompt('oi');
      await next('permission');
      session.cancel();
      expect(await next('end')).toEqual({ kind: 'end', stopReason: 'cancelled' });
      expect(await next('permission-answer')).toMatchObject({ choice: 'Cancelado' });
    } finally {
      session.close();
    }
  });

  it('como o Claude: a sessão abre sem login, o aviso traz a conta e o prompt recusado passa a pedir login', async () => {
    const { session, next } = fakeSession();
    await session.open('fake', fakeLaunch({ FAKE_ACP_LAZY_AUTH: '1', FAKE_ACP_AUTH: '1' }), process.cwd());
    try {
      expect(session.state.phase).toBe('connected');
      await vi.waitFor(() => expect(session.state.connection!.account).toEqual({ kind: 'none', label: 'Not logged in', detail: null }));
      session.prompt('oi');
      await next('error');
      expect(session.state.phase).toBe('needs-auth');
    } finally {
      session.close();
    }
  });

  it('parada além do prazo, fecha sozinha e diz por quê', async () => {
    const { session, next, states } = fakeSession(150);
    await session.open('fake', fakeLaunch(), process.cwd());
    expect(await next('closed')).toEqual({
      kind: 'closed',
      reason: expect.stringMatching(/^A sessão de teste fechou depois de 0 min sem uso/),
    });
    expect(states.at(-1)!.phase).toBe('idle');
  });

  it('com a chave do cofre, o agente que entra por chave abre a sessão como na execução', async () => {
    const { session } = fakeSession();
    await session.open('fake', fakeLaunch({ FAKE_ACP_AUTH: '1' }), process.cwd(), { methodId: 'fake-key', apiKey: 'k-123' });
    try {
      expect(session.state.phase).toBe('connected');
    } finally {
      session.close();
    }
    const { session: without } = fakeSession();
    await without.open('fake', fakeLaunch({ FAKE_ACP_AUTH: '1' }), process.cwd());
    expect(without.state.phase).toBe('needs-auth');
    without.close();
  });

  it('um comando que não existe vira erro na tela, sem derrubar o host', async () => {
    const { session } = fakeSession();
    await session.open('x', { id: 'x', name: 'Nada', command: '/caminho/que/nao/existe', args: [], env: {} }, process.cwd());
    expect(session.state.phase).toBe('error');
    expect(session.state.error).toMatch(/Não deu para iniciar Nada|saiu/);
  });
});

describe('a conta pelo ACP: verificar, entrar e sair', () => {
  it('sem login, o agente recusa a sessão: a conta sai sem login, com os jeitos de entrar e o login de terminal', async () => {
    const state = path.join(tmp('acc'), 'login');
    const check = await acpAccount(fakeLaunch({ FAKE_ACP_STATE: state }), process.cwd(), nodeSpawn);
    expect(check.account).toMatchObject({ status: 'signed-out', label: null, canLogout: true, version: '9.9.9' });
    expect(check.account.methods.map((m) => m.id)).toEqual(['fake-login', 'fake-key', 'fake-term']);
    expect(check.terminals.get('fake-term')).toEqual({ command: '/bin/fake', args: ['login', 'now'], env: { FAKE_ACP_STATE: state } });
  });

  it('o login pelo agente e o logout valem para o processo seguinte, como num agente de verdade', async () => {
    const state = path.join(tmp('acc'), 'login');
    const launch = fakeLaunch({ FAKE_ACP_STATE: state });
    await acpLogin(launch, process.cwd(), nodeSpawn, 'fake-login');
    expect((await acpAccount(launch, process.cwd(), nodeSpawn)).account.status).toBe('signed-in');
    await acpLogout(launch, process.cwd(), nodeSpawn);
    expect((await acpAccount(launch, process.cwd(), nodeSpawn)).account.status).toBe('signed-out');
  });

  it('a chave do cofre entra pelo authenticate antes da sessão, e não vai para o log', async () => {
    const log: ProtocolLogEntry[] = [];
    const check = await acpAccount(fakeLaunch({ FAKE_ACP_AUTH: '1' }), process.cwd(), nodeSpawn, {
      auth: { methodId: 'fake-key', apiKey: 'k-123' },
      log: (e) => log.push(e),
    });
    expect(check.account.status).toBe('signed-in');
    const auth = log.filter((e) => e.method === 'authenticate' && e.kind === 'request').map((e) => e.json);
    expect(auth.join()).not.toContain('k-123');
    expect(auth.join()).toContain('[oculto]');
  });

  it('como o Claude: abre a sessão sem login, mas o aviso de conta diz que não há login', async () => {
    const check = await acpAccount(fakeLaunch({ FAKE_ACP_LAZY_AUTH: '1', FAKE_ACP_AUTH: '1' }), process.cwd(), nodeSpawn);
    expect(check.account).toMatchObject({ status: 'signed-out', label: null });
    const signed = await acpAccount(fakeLaunch({ FAKE_ACP_LAZY_AUTH: '1' }), process.cwd(), nodeSpawn);
    expect(signed.account).toMatchObject({ status: 'signed-in', label: 'Plano Falso · pessoa@exemplo.com' });
  });
});

/** Uma pasta com a CLI falsa do Claude Code e o agente falso como binário do registro, para pôr no PATH. */
function fakeBin(): { dir: string; claudeState: string; agentState: string } {
  const dir = tmp('bin');
  const claudeState = path.join(dir, 'claude-login');
  const agentState = path.join(dir, 'agent-login');
  fs.writeFileSync(
    path.join(dir, 'claude'),
    [
      '#!/bin/sh',
      `STATE='${claudeState}'`,
      'if [ "$1 $2" = "auth status" ]; then',
      '  if [ -f "$STATE" ]; then echo \'{"loggedIn": true, "authMethod": "claude.ai", "email": "pessoa@exemplo.com", "subscriptionType": "max"}\';',
      '  else echo \'{"loggedIn": false, "authMethod": "none"}\'; fi',
      '  exit 0',
      'fi',
      'if [ "$1 $2" = "auth logout" ]; then rm -f "$STATE"; exit 0; fi',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(dir, 'fake-acp-agent'),
    `#!/bin/sh\nFAKE_ACP_STATE='${agentState}' exec '${process.execPath}' '${FAKE}' "$@"\n`,
    { mode: 0o755 },
  );
  return { dir, claudeState, agentState };
}

describe.skipIf(!posix)('o serviço da tela: conta, login no terminal e logout', () => {
  let bin: ReturnType<typeof fakeBin>;
  beforeAll(() => {
    bin = fakeBin();
  });
  afterEach(() => {
    fs.rmSync(bin.claudeState, { force: true });
    fs.rmSync(bin.agentState, { force: true });
  });
  const registryJson = {
    agents: [
      {
        id: 'fake',
        name: 'Agente falso',
        version: '1',
        distribution: { binary: { [platformKey()]: { archive: 'x', cmd: './fake-acp-agent' } } },
      },
    ],
  };
  /** O serviço com as dependências do host trocadas por estas: o PATH com a pasta falsa e o terminal que responde o que o caso pede. */
  const service = (o: { runTerminal?: (spec: TerminalSpec) => Promise<number | null>; connection?: ConnectState } = {}) => {
    const notices: AgentConnectNotice[] = [];
    const resumed: string[] = [];
    const svc = new AgentConnectService({
      storageDir: tmp('storage'),
      logDir: null,
      homeDir: os.homedir(),
      pathEnv: async () => `${bin.dir}${path.delimiter}${process.env.PATH ?? ''}`,
      profiles: () => BUILTIN_PROFILES,
      privateProfile: (id) => ({ ...BUILTIN_PROFILES.find((p) => p.id === id)! }),
      acpAuth: () => undefined,
      hasApiKey: () => false,
      ...(o.runTerminal ? { runTerminal: o.runTerminal } : {}),
      connection: () => o.connection,
      resumeConnect: async (id) => void resumed.push(id),
      log: () => {},
      fetchFn: (async () => new Response(JSON.stringify(registryJson))) as never,
    });
    svc.on((n) => notices.push(n));
    const accounts = (key: string) =>
      notices
        .filter((n): n is Extract<AgentConnectNotice, { type: 'account' }> => n.type === 'account' && n.key === key)
        .map((n) => n.account);
    return { svc, notices, resumed, accounts };
  };

  it('a CLI do Claude Code: a conta pelo status, o login no terminal (o board espera ele fechar) e o Conectar retomado', async () => {
    const terminal: TerminalSpec[] = [];
    const { svc, resumed, accounts } = service({
      runTerminal: async (spec) => {
        terminal.push(spec);
        fs.writeFileSync(bin.claudeState, '1');
        return 0;
      },
      connection: { profileId: 'claude', step: 'signIn', status: 'failed', summary: {} },
    });
    const before = await svc.check('claude');
    expect(before).toMatchObject({ status: 'signed-out', canLogout: true });
    expect(before.methods).toEqual([expect.objectContaining({ id: 'cli-login', type: 'terminal', terminalCommand: 'claude auth login' })]);
    await svc.login('claude', 'cli-login');
    expect(terminal).toEqual([
      expect.objectContaining({ name: 'Faz AI: entrar no Claude Code', command: path.join(bin.dir, 'claude'), args: ['auth', 'login'] }),
    ]);
    expect(terminal[0]!.env.PATH).toContain(bin.dir);
    // o login em curso aparece para a tela e some depois; a conta nova vem conferida
    expect(accounts('claude').some((a) => a.loggingIn === 'cli-login')).toBe(true);
    expect(accounts('claude').at(-1)).toMatchObject({ status: 'signed-in', label: 'Claude Max · pessoa@exemplo.com', loggingIn: null });
    // o Conectar tinha parado por falta de login: retoma sozinho
    expect(resumed).toEqual(['claude']);
  });

  it('sair da conta pela CLI e conferir de novo', async () => {
    fs.writeFileSync(bin.claudeState, '1');
    const { svc } = service();
    expect((await svc.check('claude')).status).toBe('signed-in');
    await svc.logout('claude');
    expect(svc.snapshot().claude).toMatchObject({ status: 'signed-out' });
    expect(fs.existsSync(bin.claudeState)).toBe(false);
  });

  it('o terminal que termina com erro vira o motivo; fora do editor, a tela recebe o comando para rodar', async () => {
    const failing = service({ runTerminal: async () => 1 });
    await failing.svc.login('claude', 'cli-login');
    expect(failing.svc.snapshot().claude).toMatchObject({ loggingIn: null, error: 'O login no terminal terminou com o código 1.' });
    const web = service();
    await web.svc.login('claude', 'cli-login');
    expect(web.svc.snapshot().claude!.error).toBe(`Rode no terminal: ${path.join(bin.dir, 'claude')} auth login`);
  });

  it('o agente do registro: a conta pelo ACP, o login pelo próprio agente e o logout', async () => {
    const { svc, notices } = service();
    await svc.listing();
    const before = await svc.check('registry:fake');
    expect(before).toMatchObject({ status: 'signed-out', version: '9.9.9' });
    await svc.login('registry:fake', 'fake-login');
    expect(svc.snapshot()['registry:fake']).toMatchObject({ status: 'signed-in' });
    await svc.logout('registry:fake');
    expect(svc.snapshot()['registry:fake']).toMatchObject({ status: 'signed-out' });
    // as verificações passam pelo log do protocolo, para as telas abertas
    expect(notices.some((n) => n.type === 'log' && n.entry.method === 'initialize')).toBe(true);
    expect((await svc.testLaunch('registry:fake')).launch).toMatchObject({ command: path.join(bin.dir, 'fake-acp-agent') });
  });

  it('o login de terminal de um agente ainda não verificado: verifica antes e abre o terminal, sem mandar o método ao authenticate', async () => {
    const terminal: TerminalSpec[] = [];
    const { svc, notices } = service({
      runTerminal: async (spec) => {
        terminal.push(spec);
        fs.writeFileSync(bin.agentState, '1');
        return 0;
      },
    });
    await svc.listing();
    await svc.login('registry:fake', 'fake-term');
    expect(terminal).toEqual([expect.objectContaining({ command: '/bin/fake', args: ['login', 'now'] })]);
    expect(svc.snapshot()['registry:fake']).toMatchObject({ status: 'signed-in', loggingIn: null });
    const sent = notices
      .filter((n) => n.type === 'log' && n.entry.dir === 'out')
      .map((n) => (n as { entry: ProtocolLogEntry }).entry.method);
    expect(sent).not.toContain('authenticate');
  });

  it('duas verificações do mesmo agente ao mesmo tempo esperam a mesma', async () => {
    const { svc, accounts } = service();
    const [a, b] = await Promise.all([svc.check('claude'), svc.check('claude')]);
    expect(a).toBe(b);
    expect(accounts('claude').filter((x: AgentAccount) => x.status === 'checking')).toHaveLength(1);
  });

  it('a lista diz quais perfis têm a ferramenta no PATH; o desligado do cofre fica de fora, sem dizer que falta', async () => {
    const custom: AiProfile = {
      id: 'minha-cli',
      name: 'Minha CLI',
      enabled: false,
      kind: 'custom',
      tool: 'minha-cli',
      mode: 'cli',
      base: 'generic',
      config: {},
      position: 99,
    };
    const svc = new AgentConnectService({
      storageDir: tmp('storage'),
      logDir: null,
      homeDir: os.homedir(),
      pathEnv: async () => `${bin.dir}${path.delimiter}${process.env.PATH ?? ''}`,
      profiles: () => [...BUILTIN_PROFILES, custom],
      privateProfile: (id) => {
        const builtin = BUILTIN_PROFILES.find((p) => p.id === id);
        if (!builtin) throw new Error('Perfil desativado ou pendente de revisão.');
        return { ...builtin };
      },
      acpAuth: () => undefined,
      hasApiKey: () => false,
      connection: () => undefined,
      resumeConnect: async () => {},
      log: () => {},
      fetchFn: (async () => new Response(JSON.stringify(registryJson))) as never,
    });
    const { installed, listing } = await svc.listing();
    expect(installed.claude).toBe(true);
    expect(installed['github-copilot-cli']).toBe(false);
    expect(installed).not.toHaveProperty('minha-cli');
    expect(listing.agents.map((a) => a.id)).toEqual(['fake']);
  });
});

describe.skipIf(!posix)('a conta da CLI pronta pelo status dela', () => {
  it('o Claude Code: plano e e-mail do `auth status`; sem login, nada', async () => {
    const bin = fakeBin();
    const claude = path.join(bin.dir, 'claude');
    expect((await cliAccount('claude', claude, { pathEnv: process.env.PATH, homeDir: os.homedir() })).account).toMatchObject({
      status: 'signed-out',
      label: null,
    });
    fs.writeFileSync(bin.claudeState, '1');
    expect((await cliAccount('claude', claude, { pathEnv: process.env.PATH, homeDir: os.homedir() })).account).toMatchObject({
      status: 'signed-in',
      label: 'Claude Max · pessoa@exemplo.com',
    });
  });
});

describe('log do protocolo', () => {
  it('casa a resposta com o pedido pelo sentido e pelo id, e mede o tempo', () => {
    const entries: ProtocolLogEntry[] = [];
    let now = 1000;
    const log = new ProtocolLog(
      (e) => entries.push(e),
      () => now,
    );
    log.record('out', { jsonrpc: '2.0', id: 0, method: 'initialize', params: {} });
    // o agente também pede (permissão) com o mesmo id 0: é outro sentido, não confunde
    now = 1100;
    log.record('in', { jsonrpc: '2.0', id: 0, method: 'session/request_permission', params: { toolCall: { title: 'Ler' } } });
    now = 1250;
    log.record('in', { jsonrpc: '2.0', id: 0, result: { protocolVersion: 1 } });
    now = 1300;
    log.record('out', { jsonrpc: '2.0', id: 0, result: { outcome: { outcome: 'selected', optionId: 'ok' } } });
    log.record('in', { jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'plan' } } });
    log.record('in', { jsonrpc: '2.0', id: 9, error: { code: -32000, message: 'Authentication required' } });
    expect(entries.map((e) => [e.dir, e.kind, e.method, e.ms, e.summary])).toEqual([
      ['out', 'request', 'initialize', null, ''],
      ['in', 'request', 'session/request_permission', null, 'Ler'],
      ['in', 'response', 'initialize', 250, ''],
      ['out', 'response', 'session/request_permission', 200, 'ok'],
      ['in', 'notification', 'session/update', null, 'plan'],
      ['in', 'error', null, null, '-32000 Authentication required'],
    ]);
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('grava uma linha JSON por mensagem no arquivo do dia', async () => {
    const dir = tmp('log');
    const file = new ProtocolLogFile(path.join(dir, 'trace'));
    const at = new Date(2026, 9, 24, 10).getTime();
    file.append({ seq: 1, at, dir: 'out', kind: 'request', method: 'initialize', id: 0, ms: null, summary: '', json: '{}' });
    file.append({ seq: 2, at, dir: 'in', kind: 'response', method: 'initialize', id: 0, ms: 12, summary: '', json: '{}' });
    await file.flush();
    expect(file.file(at)).toBe(path.join(dir, 'trace', 'acp-2026-10-24.jsonl'));
    const lines = fs
      .readFileSync(file.file(at), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as ProtocolLogEntry);
    expect(lines.map((l) => [l.seq, l.ms])).toEqual([
      [1, null],
      [2, 12],
    ]);
  });

  it('o corte mantém o JSON válido; os segredos saem, e os contadores de tokens ficam', () => {
    const big = { jsonrpc: '2.0', method: 'session/update', params: { update: { status: 'completed', content: 'x'.repeat(50_000) } } };
    const text = compactJson(big);
    expect(text.length).toBeLessThanOrEqual(MAX_LOG_JSON);
    expect(JSON.parse(text).params.update.status).toBe('completed');
    expect(redact({ _meta: { 'api-key': 's', 'api-key-info': { provider: 'p' } }, token: 1 })).toEqual({
      _meta: { 'api-key': '[oculto]', 'api-key-info': { provider: 'p' } },
      token: '[oculto]',
    });
    // o consumo do turno não é segredo: antes o "token" do nome escondia os números
    expect(
      redact({ usage: { inputTokens: 10, totalTokens: 12, token_count: 3 }, accessToken: 'abc', refresh_token: 'def', api_token: 'x' }),
    ).toEqual({
      usage: { inputTokens: 10, totalTokens: 12, token_count: 3 },
      accessToken: '[oculto]',
      refresh_token: '[oculto]',
      api_token: '[oculto]',
    });
  });
});
