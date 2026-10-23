// Os modelos que um agente ACP anuncia ao abrir a sessão: a leitura nas duas formas do protocolo
// (`configOptions` de categoria `model`, a atual; `models.availableModels`, a anterior), a sessão
// aberta só até o `session/new` e o gancho do host que o "Detectar modelos" usa num perfil ACP.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { acpAgent } from '../src/extension/ai/acp/agents';
import { acpSessionModels, modelConfigOption, parseAcpSessionModels } from '../src/extension/ai/acp/models';
import type { AcpSpawnFn } from '../src/extension/ai/acp/provider';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { AiProfileDraft } from '../src/shared/aiProfiles';

const gemini = acpAgent('gemini')!;

describe('parseAcpSessionModels', () => {
  it('lê o seletor de modelo das opções da sessão, com o atual em primeiro e no id do perfil', () => {
    const session = {
      sessionId: 's',
      configOptions: [
        { id: 'mode', name: 'Mode', category: 'mode', currentValue: 'default', options: [{ value: 'default', name: 'Default' }] },
        {
          id: 'model',
          name: 'Model',
          category: 'model',
          type: 'select',
          currentValue: 'gpt-5-mini',
          options: [
            { value: 'gpt-5', name: 'GPT-5' },
            { value: 'gpt-5-mini', name: 'GPT-5 mini', description: 'rápido' },
          ],
        },
      ],
    };
    const found = parseAcpSessionModels(session, 'codex-acp');
    expect(found.source).toBe('configOptions');
    expect(found.current).toBe('gpt-5-mini');
    expect(found.options).toEqual([
      {
        id: 'codex-acp:gpt-5-mini',
        tool: 'codex-acp',
        model: 'gpt-5-mini',
        label: 'GPT-5 mini',
        efforts: [],
        defaultEffort: null,
        fromTool: true,
      },
      { id: 'codex-acp:gpt-5', tool: 'codex-acp', model: 'gpt-5', label: 'GPT-5', efforts: [], defaultEffort: null, fromTool: true },
    ]);
    expect(modelConfigOption(session)).toEqual({
      configId: 'model',
      current: 'gpt-5-mini',
      values: [
        { value: 'gpt-5', name: 'GPT-5' },
        { value: 'gpt-5-mini', name: 'GPT-5 mini' },
      ],
    });
  });

  it('opções em grupos (o protocolo não mistura com as planas) viram uma lista só, sem repetição', () => {
    const session = {
      configOptions: [
        {
          id: 'm',
          name: 'Model',
          category: 'model',
          currentValue: 'b',
          options: [
            { group: 'anthropic', name: 'Anthropic', options: [{ value: 'a', name: 'A' }] },
            {
              group: 'openai',
              name: 'OpenAI',
              options: [
                { value: 'b', name: 'B' },
                { value: 'a', name: 'A de novo' },
              ],
            },
          ],
        },
      ],
    };
    expect(parseAcpSessionModels(session, 'x').options.map((o) => o.model)).toEqual(['b', 'a']);
  });

  it('a forma anterior do protocolo (Gemini CLI 0.65.0): models.availableModels e currentModelId', () => {
    const session = {
      sessionId: 's',
      models: {
        availableModels: [
          { modelId: 'auto', name: 'Auto', description: 'Let Gemini CLI decide' },
          { modelId: 'gemini-2.5-pro', name: 'gemini-2.5-pro' },
        ],
        currentModelId: 'auto',
      },
    };
    const found = parseAcpSessionModels(session, 'gemini-acp');
    expect(found).toMatchObject({ source: 'models', current: 'auto' });
    expect(found.options.map((o) => o.id)).toEqual(['gemini-acp:auto', 'gemini-acp:gemini-2.5-pro']);
    // sem seletor nas opções da sessão não há o que trocar por set_config_option
    expect(modelConfigOption(session)).toBeNull();
  });

  it('um seletor booleano ou de outra categoria não é o de modelo; sem nada, lista vazia', () => {
    const session = { configOptions: [{ id: 'think', name: 'Pensar', category: 'model', type: 'boolean', currentValue: true }] };
    expect(modelConfigOption(session)).toBeNull();
    expect(parseAcpSessionModels(session, 'x')).toEqual({ options: [], current: null, source: null });
    expect(parseAcpSessionModels({ sessionId: 's' }, 'x').source).toBeNull();
  });
});

/** Um agente mínimo dentro do processo: responde initialize e session/new pelo stdout e sai quando o stdin fecha. */
function fakeAgent(sessionNew: () => Record<string, unknown>) {
  const received: { method?: string; params?: unknown }[] = [];
  let command: { command: string; args: string[] } | null = null;
  const spawn: AcpSpawnFn = (cmd, _cwd, out) => {
    command = cmd;
    let exit: (code: number | null) => void = () => {};
    const reply = (msg: Record<string, unknown>) => out(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`, 'stdout');
    return {
      write: (text) => {
        for (const line of text.split('\n').filter(Boolean)) {
          const msg = JSON.parse(line);
          received.push({ method: msg.method, params: msg.params });
          if (msg.method === 'initialize') reply({ id: msg.id, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } });
          if (msg.method === 'session/new') {
            const result = sessionNew();
            reply(result.error ? { id: msg.id, error: result.error } : { id: msg.id, result });
          }
        }
      },
      end: () => exit(0),
      kill: () => exit(143),
      onExit: (fn) => (exit = fn),
    };
  };
  return { spawn, received, command: () => command };
}

describe('acpSessionModels', () => {
  it('abre a sessão só até o session/new, sem servidores MCP nem prompt, e fecha o agente pelo stdin', async () => {
    const agent = fakeAgent(() => ({
      sessionId: 's',
      models: { availableModels: [{ modelId: 'gemini-3.8-flash', name: 'gemini-3.8-flash' }], currentModelId: 'gemini-3.8-flash' },
    }));
    const found = await acpSessionModels(gemini, 'gemini-acp', '/tmp/x', { spawn: agent.spawn, executable: '/opt/bin/gemini' });
    expect(found.options.map((o) => o.id)).toEqual(['gemini-acp:gemini-3.8-flash']);
    expect(agent.received.map((m) => m.method)).toEqual(['initialize', 'session/new']);
    expect(agent.received[1]!.params).toEqual({ cwd: '/tmp/x', mcpServers: [] });
    expect((agent.received[0]!.params as { clientCapabilities: { session: unknown } }).clientCapabilities.session).toEqual({
      configOptions: {},
    });
    expect(agent.command()).toEqual({ command: '/opt/bin/gemini', args: ['--acp', '--skip-trust'] });
  });

  it('sem login, o erro diz como entrar em vez de abrir o navegador', async () => {
    const agent = fakeAgent(() => ({ error: { code: -32000, message: 'Authentication required' } }));
    // o Gemini entra pela chave de API, na tela do Conectar (história 7)
    await expect(acpSessionModels(gemini, 'gemini-acp', '/tmp/x', { spawn: agent.spawn })).rejects.toThrow(
      'Conectar ferramenta, com a chave de API',
    );
  });
});

describe('readAcpModels no router', () => {
  const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
  let dir: string;
  let router: MessageRouter;
  /** o id do personalizado ACP, que nasce da cópia do agente pronto (o formulário novo é só de CLI, história 13) */
  let acpId: string;
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-acp-models-'));
    const db = await openInMemory(WASM_DIR);
    router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'ws',
      folderName: 'Projeto',
      author: 'Pessoa',
      attachmentsDir: path.join(dir, 'attachments'),
      workspaceDir: dir,
      homeDir: path.join(dir, 'home'),
    });
    const before = router.snapshot().board.aiProfiles.map((p) => p.id);
    router.handle({ type: 'settings.aiProfiles.duplicate', id: 'gemini' });
    acpId = router.snapshot().board.aiProfiles.find((p) => !before.includes(p.id))!.id;
    const acp: AiProfileDraft = { id: acpId, name: 'Gemini ACP', enabled: true, kind: 'custom', base: 'generic', config: {}, position: 9 };
    router.handle({ type: 'settings.aiProfiles.save', profile: acp });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('chama o gancho do host só para um perfil ACP; sem gancho, avisa que o host não lê', async () => {
    await expect(router.readAcpModels('claude')).resolves.toBeUndefined();
    await expect(router.readAcpModels(acpId)).rejects.toThrow('indisponível neste host');
    const read: string[] = [];
    router.onAcpModels(async (profile) => void read.push(profile.id));
    await router.readAcpModels(acpId);
    await router.readAcpModels('claude');
    expect(read).toEqual([acpId]);
  });
});
