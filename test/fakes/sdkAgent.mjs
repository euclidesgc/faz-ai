/* global process, AbortController */
// Agente ACP falso para os testes de Conectar agentes: escrito com o lado "agente" do mesmo SDK oficial, roda como processo
// de verdade e fala pelo stdin/stdout, como os agentes do registro. `FAKE_ACP_AUTH=1` recusa a sessão até o
// `authenticate`. O turno manda texto em dois pedaços, uma ferramenta, um pedido de permissão e o uso. As opções da
// sessão trazem um select agrupado (modelo), um simples (esforço) e um booleano (rápido); `logout` esquece o login.
// `FAKE_ACP_LAZY_AUTH=1` imita o adaptador do Claude: abre a sessão mesmo sem login, recusa só no prompt e avisa a
// conta pelo `_auth/status_update`. O login de terminal só aparece para o cliente que declara `auth.terminal`.
// `FAKE_ACP_STATE=<arquivo>` guarda o login entre processos, como os agentes de verdade (existe = com login): a
// verificação da conta, o login e o logout abrem um processo cada um.
import * as fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';

const stateFile = process.env.FAKE_ACP_STATE;
let authenticated = stateFile ? fs.existsSync(stateFile) : process.env.FAKE_ACP_AUTH !== '1';
const setAuthenticated = (on) => {
  authenticated = on;
  if (!stateFile) return;
  if (on) fs.writeFileSync(stateFile, '1');
  else fs.rmSync(stateFile, { force: true });
};
const lazyAuth = process.env.FAKE_ACP_LAZY_AUTH === '1';
const prompts = new Map();
const authStatus = (cx) =>
  cx.notify('_auth/status_update', {
    authStatus: authenticated
      ? { kind: 'account', label: 'Plano Falso', account: { email: 'pessoa@exemplo.com' } }
      : { kind: 'none', label: 'Not logged in' },
  });
const config = { model: 'm-a', effort: 'medium', fast: false };

const configOptions = () => [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: config.model,
    options: [
      { group: 'prov-a', name: 'Provedor A', options: [{ value: 'm-a', name: 'Modelo A' }] },
      { group: 'prov-b', name: 'Provedor B', options: [{ value: 'm-b', name: 'Modelo B', description: 'o grande' }] },
    ],
  },
  {
    id: 'effort',
    name: 'Effort',
    category: 'thought_level',
    type: 'select',
    currentValue: config.effort,
    options: [
      { value: 'low', name: 'Low' },
      { value: 'medium', name: 'Medium' },
    ],
  },
  { id: 'fast', name: 'Fast', type: 'boolean', currentValue: config.fast },
];

const update = (cx, sessionId, u) => cx.notify(acp.methods.client.session.update, { sessionId, update: u });

acp
  .agent({ name: 'fake-agent' })
  .onRequest('initialize', (ctx) => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentInfo: { name: 'Fake', version: '9.9.9' },
    agentCapabilities: { loadSession: true, promptCapabilities: { image: true }, auth: { logout: {} } },
    authMethods: [
      { id: 'fake-login', name: 'Login falso', description: 'só para teste' },
      { id: 'fake-key', name: 'Chave', _meta: { 'api-key': { provider: 'fake' } } },
      ...(ctx.params.clientCapabilities?.auth?.terminal
        ? [
            {
              id: 'fake-term',
              type: 'terminal',
              name: 'Terminal',
              args: ['--login'],
              _meta: { 'terminal-auth': { command: '/bin/fake', args: ['login', 'now'] } },
            },
          ]
        : []),
    ],
  }))
  .onRequest('authenticate', (ctx) => {
    if (ctx.params.methodId === 'fake-key' && ctx.params._meta?.['api-key'] !== 'k-123')
      throw new acp.RequestError(-32000, 'Chave inválida');
    setAuthenticated(true);
    return {};
  })
  .onRequest('logout', async (ctx) => {
    setAuthenticated(false);
    if (lazyAuth) await authStatus(ctx.client);
    return {};
  })
  .onRequest('session/set_config_option', (ctx) => {
    config[ctx.params.configId] = ctx.params.value;
    return { configOptions: configOptions() };
  })
  .onRequest('session/new', async (ctx) => {
    if (lazyAuth) await authStatus(ctx.client);
    else if (!authenticated) throw new acp.RequestError(-32000, 'Authentication required');
    return {
      sessionId: 'sess-1',
      configOptions: configOptions(),
      modes: {
        currentModeId: 'default',
        availableModes: [
          { id: 'default', name: 'Padrão' },
          { id: 'plan', name: 'Plano' },
        ],
      },
    };
  })
  .onRequest('session/set_mode', () => ({}))
  .onRequest('session/prompt', async (ctx) => {
    const { sessionId } = ctx.params;
    if (!authenticated) throw new acp.RequestError(-32000, 'Authentication required');
    const abort = new AbortController();
    prompts.set(sessionId, abort);
    process.stderr.write('aviso do agente\n');
    await update(ctx.client, sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Olá' } });
    await update(ctx.client, sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' mundo' } });
    await update(ctx.client, sessionId, {
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      title: 'Ler README',
      kind: 'read',
      status: 'pending',
    });
    const answer = await ctx.client.request(acp.methods.client.session.requestPermission, {
      sessionId,
      toolCall: { toolCallId: 't1', title: 'Ler README' },
      options: [
        { optionId: 'ok', name: 'Permitir', kind: 'allow_once' },
        { optionId: 'no', name: 'Recusar', kind: 'reject_once' },
      ],
    });
    if (abort.signal.aborted || answer.outcome.outcome === 'cancelled') return { stopReason: 'cancelled' };
    await update(ctx.client, sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });
    await update(ctx.client, sessionId, { sessionUpdate: 'usage_update', used: 120, size: 1000 });
    await update(ctx.client, sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: ` (${answer.outcome.optionId})` },
    });
    return { stopReason: 'end_turn' };
  })
  .onNotification('session/cancel', (ctx) => prompts.get(ctx.params.sessionId)?.abort())
  .connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
