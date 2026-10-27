// Configurações › Conectar agentes: a lista (os agentes do board e os do registro do ACP), o agente padrão, a conexão
// com o board (o Conectar, com a chave que nunca volta para a tela), a conta (entrar no terminal que o board
// acompanha, sair com confirmação), os modelos, a sessão de teste e os detalhes de cada perfil. Os casos das telas
// Ferramentas de IA e Conectar ferramenta, que esta substituiu, vieram para cá.
import { choose, confirmLast, lastSent, renderThemed, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentConnectSettings } from '../../src/webview/components/settings/agentConnect/AgentConnectSettings';
import { Dialog } from '../../src/webview/components/Dialog';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { useAgentConnectStore } from '../../src/webview/store/agentConnectStore';
import { ACCOUNT_UNCHECKED, TEST_IDLE, type AgentAccount, type RegistryAgent } from '../../src/shared/agentConnect';
import { MODE_SHEET_LINES } from '../../src/shared/aiTools';
import type { AiProfile } from '../../src/shared/aiProfiles';
import type { ConnectState } from '../../src/shared/connect';
import type { ContextLocationResult, ContextOverlap } from '../../src/shared/contextScope';
import type { BoardState } from '../../src/shared/model';
import type { HostToWebview } from '../../src/shared/messages';

const KEY = 'AIzaSy-chave-da-tela-123456';
let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  board.router.setConnections({});
  // o board é o mesmo em todos os casos: a ciência de um não vale para o outro
  for (const id of Object.keys(board.router.snapshot().board.runner.compatibilityReviews)) board.router.revokeCompatibilityReview(id);
  useAgentConnectStore.setState({
    listing: null,
    installed: {},
    loadingRegistry: false,
    registryError: null,
    accounts: {},
    statuses: {},
    quickTests: {},
    selected: null,
    tab: 'connection',
    test: TEST_IDLE,
    testKey: null,
    items: [],
    usage: null,
    log: [],
    logFile: null,
  });
});

const send = (data: HostToWebview) => act(() => window.dispatchEvent(new MessageEvent('message', { data })));
/** O host publica o estado do Conectar do perfil (o `connections` do board). */
const publish = (state: Partial<ConnectState> & Pick<ConnectState, 'step' | 'status'>, profileId = 'gemini') => {
  board.router.setConnections({ [profileId]: { profileId, summary: {}, ...state } });
  syncStore(board.router);
};
const show = () => {
  syncStore(board.router);
  renderThemed(
    <>
      <AgentConnectSettings />
      <Dialog />
    </>,
  );
  // a aba consulta a situação dos perfis (com confirmação) e pede o registro (com resposta própria)
  expect(lastSent('settings.aiProfiles.probe')).toBeDefined();
  confirmLast();
};
const registryAgent = (id: string, over: Partial<RegistryAgent> = {}): RegistryAgent => ({
  id,
  name: id,
  version: '1.0.0',
  description: `${id} do registro`,
  authors: [],
  icon: `https://cdn.example.org/${id}.svg`,
  url: `https://example.org/${id}`,
  distribution: 'npx',
  command: '/usr/bin/npx',
  args: ['-y', '--prefer-offline', `${id}@1.0.0`],
  env: {},
  available: true,
  note: null,
  ...over,
});
/** A resposta do host ao pedido do registro desta tela. */
const answerRegistry = (agents: RegistryAgent[], installed: Record<string, boolean> = {}) =>
  send({
    type: 'agentConnect.registryResult',
    requestId: lastSent('agentConnect.registry').requestId,
    listing: { agents, fetchedAt: Date.UTC(2026, 9, 24, 12), error: null },
    installed,
  });
const account = (key: string, over: Partial<AgentAccount>) =>
  send({ type: 'agentConnect.account', key, account: { ...ACCOUNT_UNCHECKED, checkedAt: Date.UTC(2026, 9, 24, 12), ...over } });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * A aba e o item do seletor de modo pelo rótulo: o Radix Themes repete o texto deles (a cópia escondida segura a
 * largura quando o rótulo fica em negrito), e o nome acessível sai dobrado.
 */
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${escapeRe(name)}`) });
const label = (el: HTMLElement) => el.textContent!.slice(0, el.textContent!.length / 2);
/** A linha do agente: o nome e, logo depois, o modo ("Claude CodeCLI · Ligado"), para um nome não casar com outro maior. */
const row = (name: string, list = 'Agentes do board') =>
  within(screen.getByRole('list', { name: list })).getByRole('button', { name: new RegExp(`^${escapeRe(name)}(CLI|ACP|API) · `) });
/** Abre o agente na lista e, se pedido, uma aba dele; devolve o cartão do agente. */
const openAgent = async (name: string, tabName?: string) => {
  await userEvent.click(row(name));
  if (tabName) await userEvent.click(tab(tabName));
  return within(screen.getByLabelText(name));
};

describe('Conectar agentes: a lista e o agente padrão', () => {
  it('os agentes do board vêm primeiro, o padrão com o selo; os do registro que o board não roda ficam à parte', () => {
    show();
    answerRegistry([
      registryAgent('claude-acp', { name: 'Claude Agent' }),
      registryAgent('gemini', { name: 'Gemini CLI' }),
      registryAgent('kilo', { name: 'Kilo' }),
      registryAgent('amp-acp', {
        name: 'Amp',
        available: false,
        note: 'Instale o amp-acp pela página do agente: o board não baixa binários.',
      }),
    ]);
    expect(row('Claude Code')).toHaveTextContent('Padrão');
    // o ícone vem do registro: o Claude Code é o "Claude Agent" (`claude-acp`) lá
    expect(row('Claude Code').querySelector('img')).toHaveAttribute('src', 'https://cdn.example.org/claude-acp.svg');
    // o Gemini do registro é o perfil do board: não aparece duas vezes
    const others = within(screen.getByRole('list', { name: 'Outros agentes do registro do ACP' }));
    expect(others.getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^Amp/),
      expect.stringMatching(/^Kilo/),
    ]);
    expect(others.getByRole('button', { name: /^Kilo/ })).toHaveTextContent('Só teste');
    expect(others.getByRole('button', { name: /^Amp/ })).toHaveTextContent('Indisponível');
    expect(screen.getAllByRole('tab').map(label)).toEqual(['Conexão', 'Modelos', 'Testar']);
  });

  it('sem cartão do agente padrão no topo: o selo "Padrão" do agente escolhido explica o que é', async () => {
    show();
    expect(screen.queryByLabelText('Agente padrão')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver conexão' })).toBeNull();
    const badge = within(screen.getByLabelText('Claude Code')).getByText('Padrão');
    await userEvent.hover(badge);
    expect(
      (
        await screen.findAllByText(
          'Roda os cards que não dizem qual modelo usar. Para trocar, use Usar nos cards sem modelo na aba Conexão de outro agente.',
        )
      )[0],
    ).toBeInTheDocument();
  });

  it('a situação de cada agente: instalado com a versão; não encontrado, com onde instalar', async () => {
    show();
    send({
      type: 'aiProfiles.status',
      profiles: {
        claude: { found: true, version: '5.5.0', signedIn: true, installUrl: null },
        cursor: { found: false, version: null, signedIn: null, installUrl: 'https://example.org/instalar' },
      },
    });
    expect(within(screen.getByLabelText('Claude Code')).getByText('Instalado · versão 5.5.0')).toBeInTheDocument();
    const cursor = await openAgent('Cursor');
    expect(cursor.getByText('Não encontrado nesta máquina')).toBeInTheDocument();
    expect(cursor.getByRole('link', { name: 'Como instalar' })).toHaveAttribute('href', 'https://example.org/instalar');
  });

  it('o pronto padrão não desliga (a dica diz por quê), e o pronto não tem as ações de cópia e personalizado', async () => {
    show();
    const claude = within(screen.getByLabelText('Claude Code'));
    expect(claude.getByText('CLI · programa instalado no computador')).toBeInTheDocument();
    // "Uso nos cards" vem antes da instalação, da conta e da conexão: é a decisão da aba
    const use = claude.getByLabelText('Uso nos cards');
    expect(use.compareDocumentPosition(claude.getByLabelText('Conta do agente')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(claude.getByRole('switch', { name: 'Ligado' })).toBeDisabled();
    await userEvent.hover(claude.getByRole('switch', { name: 'Ligado' }).closest('span[tabindex]')!);
    expect(
      (
        await screen.findAllByText(
          'Este agente roda os cards sem modelo e não pode ser desligado: use "Usar nos cards sem modelo" em outro agente antes.',
        )
      )[0],
    ).toBeInTheDocument();
    expect(claude.queryByText('Padrão dos cards')).toBeNull();
    // as ações do perfil ficam no fim da Conexão: o pronto só duplica
    expect(claude.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(claude.queryByRole('button', { name: 'Apagar' })).toBeNull();
    expect(claude.getByRole('button', { name: 'Duplicar' })).toBeInTheDocument();
  });

  it('agente ACP pronto: desligado e ligável, com o tipo e o modo, sem Editar nem Apagar', async () => {
    show();
    const gemini = await openAgent('Gemini CLI');
    expect(gemini.getByText('ACP · agente pelo protocolo ACP')).toBeInTheDocument();
    expect(gemini.getByRole('switch', { name: 'Ligado' })).not.toBeChecked();
    expect(gemini.getByRole('switch', { name: 'Ligado' })).toBeEnabled();
    expect(gemini.getByRole('button', { name: 'Usar nos cards sem modelo' })).toBeDisabled();
    await userEvent.click(gemini.getByRole('switch', { name: 'Ligado' }));
    expect(lastSent('settings.aiProfiles.setEnabled')).toMatchObject({ id: 'gemini', enabled: true });
    confirmLast();
    expect(gemini.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(gemini.queryByRole('button', { name: 'Apagar' })).toBeNull();
  });

  it('"Atualizar" baixa a lista de novo e confere a situação dos agentes, num botão só', async () => {
    show();
    answerRegistry([]);
    const probes = sentOf('settings.aiProfiles.probe').length;
    expect(screen.queryByRole('button', { name: /Verificar situação|Atualizar lista/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(lastSent('agentConnect.registry')).toMatchObject({ refresh: true });
    expect(sentOf('settings.aiProfiles.probe')).toHaveLength(probes + 1);
  });
  it('o aviso do topo abre a tela já no agente do perfil', () => {
    useBoardStore.getState().openConnect('opencode');
    expect(useBoardStore.getState()).toMatchObject({ view: 'settings', settingsTab: 'connect', connectTool: 'opencode' });
    show();
    expect(screen.getByLabelText('OpenCode')).toBeInTheDocument();
    // atendido: o mesmo aviso pode pedir de novo
    expect(useBoardStore.getState().connectTool).toBeNull();
  });
});

describe('Conectar agentes: a conexão com o board', () => {
  it('o Gemini tem os três modos, com a ficha de cada um e o selo Recomendado só na API, com o porquê', async () => {
    show();
    const gemini = await openAgent('Gemini CLI');
    expect(gemini.getAllByRole('radio').map(label)).toEqual(['ACP', 'API', 'CLI']);
    expect(gemini.queryByText('Recomendado')).toBeNull();
    await userEvent.click(gemini.getByText('Como funciona o modo ACP'));
    expect(gemini.getAllByRole('term')).toHaveLength(MODE_SHEET_LINES.length);
    expect(gemini.getByText('chave de API do Gemini')).toBeInTheDocument();
    await userEvent.click(gemini.getByRole('radio', { name: /^API/ }));
    expect(gemini.getByText('Recomendado')).toBeInTheDocument();
    expect(gemini.getByRole('button', { name: 'Conectar no modo API' })).toBeInTheDocument();
  });

  it('Conectar manda o perfil no modo escolhido; o host responde passo a passo', async () => {
    show();
    const gemini = await openAgent('Gemini CLI');
    await userEvent.click(gemini.getByRole('button', { name: 'Conectar' }));
    expect(lastSent('settings.aiProfiles.connect')).toEqual(expect.objectContaining({ id: 'gemini', mode: 'acp' }));
    publish({ step: 'verify', status: 'running', summary: { version: '0.65.0' } });
    confirmLast();
    const steps = await screen.findByRole('list', { name: 'Passos do Conectar' });
    expect(within(steps).getByText(/Achar a ferramenta/)).toHaveTextContent('feito');
    expect(within(steps).getByText(/Verificar as capacidades/)).toHaveTextContent('em curso');
    expect(within(steps).getByText(/Ler os modelos/)).toHaveTextContent('a seguir');
    // na lista, o agente diz que o Conectar está em curso
    expect(row('Gemini CLI')).toHaveTextContent('Conectando…');
  });

  it('o campo da chave é de senha, manda a chave ao host e limpa só quando ele confirma; a chave não fica na tela', async () => {
    publish({ step: 'signIn', status: 'waiting', needs: 'api-key', summary: { version: '0.65.0' } });
    show();
    const gemini = await openAgent('Gemini CLI');
    const field = gemini.getByLabelText('Chave de API');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(field, KEY);
    await userEvent.click(gemini.getByRole('button', { name: 'Guardar a chave e continuar' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', apiKey: KEY });
    publish({
      step: 'review',
      status: 'waiting',
      needs: 'review',
      summary: { version: '0.65.0', signIn: 'api-key', regime: 'compatible' },
    });
    confirmLast();
    await waitFor(() => expect(gemini.queryByLabelText('Chave de API')).toBeNull());
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('a chave recusada: o motivo fica no passo do login e o que a pessoa colou continua no campo', async () => {
    publish({ step: 'signIn', status: 'waiting', needs: 'api-key', summary: { version: '0.65.0' } });
    show();
    const gemini = await openAgent('Gemini CLI');
    await userEvent.type(gemini.getByLabelText('Chave de API'), KEY);
    await userEvent.click(gemini.getByRole('button', { name: 'Guardar a chave e continuar' }));
    publish({ step: 'signIn', status: 'running', summary: { version: '0.65.0' } });
    publish({
      step: 'signIn',
      status: 'waiting',
      needs: 'api-key',
      error: 'Gemini CLI recusou a chave de API: API key not valid.',
      summary: { version: '0.65.0' },
    });
    confirmLast();
    expect(await gemini.findByRole('alert')).toHaveTextContent('Gemini CLI recusou a chave de API: API key not valid.');
    expect(gemini.getByLabelText('Chave de API')).toHaveValue(KEY);
  });

  it('no modo API o Conectar confere a chave na hora e diz isso na tela', async () => {
    show();
    const gemini = await openAgent('Gemini CLI');
    await userEvent.click(gemini.getByRole('radio', { name: /^API/ }));
    await userEvent.click(gemini.getByRole('button', { name: 'Conectar no modo API' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', mode: 'api' });
    publish({ mode: 'api', step: 'signIn', status: 'waiting', needs: 'api-key', summary: { version: null } });
    confirmLast();
    expect(await gemini.findByText(/O board confere a chave agora, lendo a lista de modelos da conta/)).toBeInTheDocument();
    await userEvent.type(gemini.getByLabelText('Chave de API'), KEY);
    await userEvent.click(gemini.getByRole('button', { name: 'Conferir e guardar a chave' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', mode: 'api', apiKey: KEY });
    publish({
      mode: 'api',
      step: 'models',
      status: 'connected',
      summary: { version: null, signIn: 'api-key-checked', regime: 'exclusive', reviewed: null, models: 2, at: 1_700_000_000_000 },
    });
    confirmLast();
    expect(await gemini.findByRole('status')).toHaveTextContent(/^Pronto para rodar cards · conferido em /);
    expect(
      gemini.getByText(/^chave de API conferida · a IA lê só o que o board prepara \(regime exclusivo\) · 2 modelos · /),
    ).toBeInTheDocument();
    // o ACP, que não é o modo da conexão, não mostra o progresso dela
    await userEvent.click(gemini.getByRole('radio', { name: /^ACP/ }));
    expect(gemini.queryByRole('list', { name: 'Passos do Conectar' })).toBeNull();
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('a ciência do regime compatível é um botão à parte, com o que a ferramenta carrega', async () => {
    publish({ step: 'review', status: 'waiting', needs: 'review', summary: { regime: 'compatible' } });
    show();
    const gemini = await openAgent('Gemini CLI');
    expect(gemini.getByText(/O Gemini CLI roda com o contexto aberto/)).toHaveTextContent('o agente completo do Gemini CLI');
    await userEvent.click(gemini.getByRole('button', { name: 'Usar assim mesmo' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', acknowledge: true });
    confirmLast();
  });

  it('erro preso ao passo, com "Tentar de novo" e o link de instalação', async () => {
    publish({
      step: 'locate',
      status: 'failed',
      error: 'O comando `gemini` do Gemini CLI não está no PATH. Instale pela página oficial e tente de novo.',
      docs: 'https://geminicli.com/docs/cli/acp-mode',
    });
    show();
    expect(row('Gemini CLI')).toHaveTextContent('O Conectar parou');
    const gemini = await openAgent('Gemini CLI');
    expect(within(gemini.getByRole('list', { name: 'Passos do Conectar' })).getByText(/Achar a ferramenta/)).toHaveTextContent('falhou');
    expect(gemini.getByRole('link', { name: 'Instalar' })).toHaveAttribute('href', 'https://geminicli.com/docs/cli/acp-mode');
    await userEvent.click(gemini.getByRole('button', { name: 'Tentar de novo' }));
    expect(sentOf('settings.aiProfiles.connect').at(-1)).toMatchObject({ id: 'gemini' });
    expect(sentOf('settings.aiProfiles.connect').at(-1)).not.toHaveProperty('apiKey');
    confirmLast();
  });

  const connected = () => {
    board.router.handle({ type: 'settings.aiProfiles.setEnabled', id: 'gemini', enabled: true });
    board.router.recordCompatibilityReview('gemini');
    publish({
      step: 'models',
      status: 'connected',
      summary: { version: '0.65.0', signIn: 'api-key', regime: 'compatible', reviewed: 1, models: 6, at: Date.UTC(2026, 9, 23, 15) },
    });
  };

  it('Conectada: uma linha só; os passos, o resumo e a ficha do modo em "Ver detalhes"; Reconectar discreto', async () => {
    connected();
    show();
    expect(row('Gemini CLI')).toHaveTextContent('Conectado');
    const gemini = await openAgent('Gemini CLI');
    expect(gemini.getByRole('status')).toHaveTextContent(/^Pronto para rodar cards · conferido em /);
    const details = gemini.getByText('Ver detalhes').closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByRole('list', { name: 'Passos do Conectar' })).toBeInTheDocument();
    expect(
      within(details).getByText(
        /^0\.65\.0 · chave de API guardada · a IA também lê a configuração do próprio agente \(regime compatível, ciência 1\) · 6 modelos · /,
      ),
    ).toBeInTheDocument();
    expect(within(details).getByText('Como funciona o modo ACP')).toBeInTheDocument();
    expect(within(details).getByRole('button', { name: 'Parar de usar com o contexto aberto' })).toBeInTheDocument();
    // a ficha do modo sai de cima: conectado, ela só aparece nos detalhes
    expect(gemini.getAllByText(/Como funciona o modo ACP/)).toHaveLength(1);
    await userEvent.click(gemini.getByRole('button', { name: 'Reconectar' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', mode: 'acp' });
    confirmLast();
  });

  it('Trocar a chave na conexão: o campo abre, manda a chave nova e Cancelar fecha sem trocar', async () => {
    connected();
    show();
    const gemini = await openAgent('Gemini CLI');
    await userEvent.click(gemini.getByRole('button', { name: 'Trocar a chave' }));
    await userEvent.click(gemini.getByRole('button', { name: 'Cancelar' }));
    expect(gemini.queryByLabelText('Chave de API')).toBeNull();
    await userEvent.click(gemini.getByRole('button', { name: 'Trocar a chave' }));
    await userEvent.type(gemini.getByLabelText('Chave de API'), `${KEY}-nova`);
    await userEvent.click(gemini.getByRole('button', { name: 'Guardar a chave e continuar' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', apiKey: `${KEY}-nova` });
    confirmLast();
  });

  it('Revogar ciência; revogada, o resumo diz que o perfil não roda e a ciência volta pelo mesmo lugar', async () => {
    connected();
    show();
    const gemini = await openAgent('Gemini CLI');
    await userEvent.click(gemini.getByRole('button', { name: 'Parar de usar com o contexto aberto' }));
    expect(lastSent('settings.aiProfiles.review')).toMatchObject({ type: 'settings.aiProfiles.review', id: 'gemini', accept: false });
    board.router.handle({ type: 'settings.aiProfiles.review', id: 'gemini', accept: false });
    syncStore(board.router);
    confirmLast();
    expect(await gemini.findByRole('status')).toHaveTextContent('Falta a sua ciência: o agente não roda cards até você dá-la.');
    expect(gemini.getByText('Ver detalhes').closest('details')).toHaveAttribute('open');
    expect(gemini.getByText(/sem a sua ciência: o perfil não roda/)).toBeInTheDocument();
    expect(gemini.queryByRole('button', { name: 'Parar de usar com o contexto aberto' })).toBeNull();
    expect(gemini.getByText('Ciência do contexto aberto:').closest('li')).toHaveAttribute('data-state', 'waiting');
    await userEvent.click(gemini.getByRole('button', { name: 'Usar assim mesmo' }));
    expect(lastSent('settings.aiProfiles.review')).toMatchObject({ id: 'gemini', accept: true });
  });

  it('o login que faltou no Conectar da CLI leva ao login no terminal que o board acompanha', async () => {
    publish(
      { step: 'signIn', status: 'failed', error: 'O Claude Code não está com login.', command: 'claude auth login', summary: {} },
      'claude',
    );
    show();
    const claude = within(screen.getByLabelText('Claude Code'));
    expect(claude.getByText('claude auth login')).toBeInTheDocument();
    await userEvent.click(claude.getByRole('button', { name: 'Entrar no terminal' }));
    expect(lastSent('agentConnect.login')).toEqual({ type: 'agentConnect.login', key: 'claude', methodId: 'cli-login' });
    confirmLast();
  });
});

describe('Conectar agentes: o contexto do card', () => {
  const leak = (over: Partial<ContextLocationResult> = {}): ContextLocationResult => ({
    path: 'CLAUDE.md',
    scope: 'project',
    kind: 'instructions',
    loads: 'always',
    source: 'agent',
    verdict: { state: 'controlled', how: 'quote' },
    ...over,
  });
  /** O teste do contexto gravado, como o host publica (sem passar pelo router, que é o mesmo nos outros casos). */
  const withScope = (locations: ContextLocationResult[], extra: Partial<BoardState> = {}, overlaps?: ContextOverlap[]) =>
    act(() =>
      useBoardStore.setState((s) => ({
        state: {
          ...s.state!,
          contextScopes: {
            claude: {
              profileId: 'claude',
              version: '2.1.296',
              at: Date.UTC(2026, 9, 25, 15),
              discovered: true,
              control: true,
              locations,
              ...(overlaps ? { overlaps } : {}),
            },
          },
          ...extra,
        },
      })),
    );

  it('sem teste: diz que não sabe o que o agente lê e "Testar agora" pede o teste ao host', async () => {
    show();
    const scope = within(screen.getByLabelText('Contexto do card'));
    expect(scope.getByText('Ainda não testado: o board não sabe o que este agente lê sozinho.')).toBeInTheDocument();
    await userEvent.click(scope.getByRole('button', { name: 'Testar agora' }));
    expect(lastSent('settings.aiProfiles.contextScope')).toMatchObject({ id: 'claude' });
    confirmLast();
  });

  it('fechado: o cadeado na lista e cada local separa o padrão da ferramenta do que o teste provou no board', async () => {
    show();
    withScope([
      leak(),
      leak({
        path: '~/.claude/skills/*/SKILL.md',
        scope: 'user',
        kind: 'skill',
        loads: 'on-demand',
        verdict: { state: 'untested', reason: 'missing-user' },
      }),
    ]);
    expect(within(row('Claude Code')).getByRole('img', { name: 'Contexto fechado' })).toBeInTheDocument();
    const scope = within(screen.getByLabelText('Contexto do card'));
    expect(scope.getByRole('status')).toHaveTextContent('Contexto fechado: a IA usa só o que o card entrega.');
    expect(scope.getByText(/^Verificado em /)).toBeInTheDocument();
    await userEvent.click(scope.getByText('O que este agente lê sozinho (2 locais)'));
    const items = within(scope.getByRole('list', { name: 'Locais' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    // o que o agente declarou (o padrão da ferramenta) fica separado do que o teste provou no board
    expect(items[0]).toBe('CLAUDE.md fica de fora: só entra se o card incluirinstruções · projeto · Padrão da ferramenta: carrega sempre');
    expect(items[1]).toContain('não existe na sua pasta pessoal; o board não escreve nela');
  });

  it('aberto: o resumo lista o que entra sozinho, os detalhes já abrem e a versão nova pede outro teste', () => {
    show();
    withScope([leak({ verdict: { state: 'leaks', how: 'quote', files: ['CLAUDE.md', '../CLAUDE.md'] } })], {
      connections: { claude: { profileId: 'claude', step: 'models', status: 'connected', summary: { version: '2.2.0' } } },
    });
    const scope = within(screen.getByLabelText('Contexto do card'));
    // a frase diz o estado e quantos; os caminhos ficam na lista logo abaixo
    expect(scope.getByRole('status')).toHaveTextContent('Contexto aberto: 1 local entra sozinho em todo card.');
    expect(scope.getByRole('status')).not.toHaveTextContent('CLAUDE.md');
    expect(scope.getByText(/Veja abaixo o que fazer com cada um\.$/)).toBeInTheDocument();
    expect(scope.getByText('O que este agente lê sozinho (1 locais)').closest('details')).toHaveAttribute('open');
    expect(scope.getByText('Arquivos: CLAUDE.md, ../CLAUDE.md')).toBeInTheDocument();
    expect(scope.getByText('Testado na versão 2.1.296; a atual é 2.2.0. Teste de novo.')).toBeInTheDocument();
    expect(within(row('Claude Code')).queryByRole('img', { name: 'Contexto fechado' })).toBeNull();
  });

  it('no modo API: fechado por construção, sem teste nem botões, e com o cadeado na lista', async () => {
    show();
    act(() =>
      useBoardStore.setState((s) => {
        const st = s.state!;
        const aiProfiles = st.board.aiProfiles.map((p) => (p.id === 'gemini' ? { ...p, mode: 'api' as const } : p));
        return { state: { ...st, board: { ...st.board, aiProfiles } } };
      }),
    );
    const gemini = await openAgent('Gemini CLI');
    const scope = within(gemini.getByLabelText('Contexto do card'));
    expect(scope.getByRole('status')).toHaveTextContent('Contexto fechado por construção');
    expect(scope.queryByRole('button', { name: /Testar/ })).toBeNull();
    expect(within(row('Gemini CLI')).getByRole('img', { name: 'Contexto fechado' })).toBeInTheDocument();
  });

  it('o que vaza do projeto: sugestão, custo, abrir a pasta e importar como regra, com prévia antes de gravar', async () => {
    show();
    withScope([leak({ verdict: { state: 'leaks', how: 'quote', files: ['CLAUDE.md'], tokens: [1200] } })]);
    const scope = within(screen.getByLabelText('Contexto do card'));
    expect(scope.getByRole('status')).toHaveTextContent('Contexto aberto: 1 local entra sozinho em todo card (~1200 tokens).');
    expect(scope.getByText(/Do projeto: leve o conteúdo para uma regra do board/)).toBeInTheDocument();
    await userEvent.click(scope.getByRole('button', { name: 'Abrir pasta' }));
    expect(lastSent('settings.aiProfiles.contextReveal')).toMatchObject({ id: 'claude', path: 'CLAUDE.md' });
    confirmLast();
    await userEvent.click(scope.getByRole('button', { name: 'Importar como regra' }));
    const preview = within(scope.getByRole('group', { name: 'Prévia da mudança' }));
    expect(preview.getByLabelText('Nome da regra')).toHaveValue('claude');
    expect(preview.getByText(/regra "claude" do board Faz AI/)).toBeInTheDocument();
    // nada é gravado antes da confirmação
    expect(sentOf('settings.aiProfiles.contextFix')).toHaveLength(0);
    await userEvent.click(preview.getByRole('button', { name: 'Importar como regra' }));
    expect(lastSent('settings.aiProfiles.contextFix')).toMatchObject({
      id: 'claude',
      fix: { op: 'import', file: 'CLAUDE.md', rule: 'claude' },
    });
    confirmLast();
  });

  it('repetidos: "Juntar" só no arquivo que cabe inteiro no outro, e com prévia', async () => {
    show();
    withScope(
      [
        leak({ verdict: { state: 'leaks', how: 'quote', files: ['CLAUDE.md'], tokens: [10] } }),
        leak({ path: 'AGENTS.md', verdict: { state: 'leaks', how: 'quote', files: ['AGENTS.md'], tokens: [20] } }),
      ],
      {},
      [{ a: 'CLAUDE.md', b: 'AGENTS.md', aInB: 1, bInA: 0.5 }],
    );
    const scope = within(screen.getByLabelText('Contexto do card'));
    expect(scope.getAllByRole('button', { name: /^Juntar em/ }).map((b) => b.textContent)).toEqual(['Juntar em AGENTS.md']);
    expect(scope.getByText('Repete 50% das linhas em CLAUDE.md.')).toBeInTheDocument();
    await userEvent.click(scope.getByRole('button', { name: 'Juntar em AGENTS.md' }));
    const preview = within(scope.getByRole('group', { name: 'Prévia da mudança' }));
    expect(preview.getByText('@AGENTS.md')).toBeInTheDocument();
    await userEvent.click(preview.getByRole('button', { name: 'Juntar' }));
    expect(lastSent('settings.aiProfiles.contextFix')).toMatchObject({ fix: { op: 'merge', keep: 'AGENTS.md', replace: 'CLAUDE.md' } });
    confirmLast();
  });

  it('plugin e cópia antiga do Faz AI têm sugestões próprias; o comando de desinstalar vem do agente, marcado como sugestão', async () => {
    show();
    const files = ['~/.kimi-code/skills/faz-ai-fluxo/SKILL.md', '~/.kimi-code/plugins/managed/br/skills/api/SKILL.md'];
    withScope([
      leak({
        path: '~/.kimi-code/**/SKILL.md',
        scope: 'user',
        kind: 'skill',
        verdict: { state: 'leaks', how: 'quote', files, tokens: [5, 7] },
      }),
    ]);
    const scope = within(screen.getByLabelText('Contexto do card'));
    expect(scope.getByText(/Cópias antigas da skill do fluxo/)).toBeInTheDocument();
    expect(scope.getByText(/Vêm do plugin "br" da ferramenta/)).toBeInTheDocument();
    // da pasta pessoal não se importa nem se junta: o board não mexe nela
    expect(scope.queryByRole('button', { name: 'Importar como regra' })).toBeNull();
    await userEvent.click(scope.getByRole('button', { name: 'Como desinstalar?' }));
    expect(lastSent('settings.aiProfiles.contextAsk')).toMatchObject({ id: 'claude', plugin: 'br' });
    confirmLast();
    withScope(
      [
        leak({
          path: '~/.kimi-code/**/SKILL.md',
          scope: 'user',
          kind: 'skill',
          verdict: { state: 'leaks', how: 'quote', files, tokens: [5, 7] },
        }),
      ],
      {
        contextAdvice: { claude: { br: { state: 'done', command: 'kimi plugin remove br', at: 1 } } },
      },
    );
    expect(scope.getByText('kimi plugin remove br')).toBeInTheDocument();
    expect(scope.getByText(/Sugerido pelo agente, confira antes de rodar/)).toBeInTheDocument();
  });

  it('"Manter assim" tira a sugestão e o local do resumo; "Desfazer" traz de volta', async () => {
    show();
    const loc = leak({ verdict: { state: 'leaks', how: 'quote', files: ['CLAUDE.md'], tokens: [10] } });
    withScope([loc]);
    const scope = within(screen.getByLabelText('Contexto do card'));
    await userEvent.click(scope.getByRole('button', { name: 'Manter assim' }));
    expect(lastSent('settings.aiProfiles.contextKeep')).toMatchObject({
      id: 'claude',
      location: { scope: 'project', path: 'CLAUDE.md' },
      keep: true,
    });
    confirmLast();
    withScope([loc], { contextKept: { claude: ['project:CLAUDE.md'] } });
    expect(scope.getByRole('status')).toHaveTextContent('Contexto aberto por escolha sua: você manteve 1 local que entra em todo card.');
    expect(scope.getByText('Mantido por você: entra em todo card.')).toBeInTheDocument();
    expect(scope.queryByText(/Do projeto: leve o conteúdo/)).toBeNull();
    await userEvent.click(scope.getByRole('button', { name: 'Desfazer' }));
    expect(lastSent('settings.aiProfiles.contextKeep')).toMatchObject({ keep: false });
    confirmLast();
  });

  it('a lista põe o padrão primeiro, depois os conectados de contexto fechado, os sem teste e os abertos', () => {
    show();
    const scope = (state: 'controlled' | 'leaks') => ({
      profileId: 'x',
      version: '1',
      at: 1,
      discovered: true,
      control: true,
      locations: [leak({ verdict: state === 'leaks' ? { state, how: 'quote', files: ['CLAUDE.md'] } : { state, how: 'quote' } })],
    });
    const connected = (id: string) => ({ profileId: id, step: 'models' as const, status: 'connected' as const, summary: {} });
    act(() =>
      useBoardStore.setState((s) => {
        const st = s.state!;
        const on = ['cursor', 'kimi', 'codex-acp'];
        const aiProfiles = st.board.aiProfiles.map((p) => (on.includes(p.id) ? { ...p, enabled: true } : p));
        return {
          state: {
            ...st,
            board: { ...st.board, aiProfiles },
            connections: Object.fromEntries(on.map((id) => [id, connected(id)])),
            contextScopes: { cursor: scope('leaks'), kimi: scope('controlled') },
          },
        };
      }),
    );
    const names = within(screen.getByRole('list', { name: 'Agentes do board' }))
      .getAllByRole('button')
      .map((b) => b.querySelector('.agent-row-name')?.textContent);
    expect(names.slice(0, 4)).toEqual(['Claude Code', 'Kimi Code', 'Codex', 'Cursor']);
    // a situação leva a cor e o cadeado do contexto
    expect(within(row('Kimi Code')).getByRole('img', { name: 'Contexto fechado' }).parentElement).toHaveClass('context-tone', 'closed');
    expect(within(row('Cursor')).getByRole('img', { name: 'Contexto aberto' }).parentElement).toHaveClass('context-tone', 'open');
    expect(within(row('Codex')).queryByRole('img')).toBeNull();
  });

  it('a pessoa acrescenta um local que o agente esqueceu e tira o que acrescentou', async () => {
    show();
    const scope = within(screen.getByLabelText('Contexto do card'));
    await userEvent.click(scope.getByRole('button', { name: /Acrescentar um local/ }));
    await userEvent.type(scope.getByLabelText('Caminho'), '~/.claude/NOTAS.md');
    await userEvent.click(scope.getByRole('button', { name: 'Acrescentar' }));
    expect(lastSent('settings.aiProfiles.contextLocation')).toMatchObject({
      id: 'claude',
      op: 'add',
      location: { path: '~/.claude/NOTAS.md', scope: 'user', kind: 'instructions' },
    });
    confirmLast();
    withScope([leak({ path: 'NOTAS.md', loads: null, source: 'person' })]);
    await userEvent.click(scope.getByText(/O que este agente lê sozinho/));
    await userEvent.click(scope.getByRole('button', { name: 'Tirar NOTAS.md' }));
    expect(lastSent('settings.aiProfiles.contextLocation')).toMatchObject({ op: 'remove', location: { path: 'NOTAS.md' } });
    confirmLast();
  });
});

describe('Conectar agentes: a conta', () => {
  it('abrir um agente ligado e instalado confere a conta sozinho; o desligado espera o clique', async () => {
    show();
    // o Claude Code, o padrão, abre selecionado: a conta é conferida na hora
    expect(sentOf('agentConnect.check').map((m) => m.key)).toEqual(['claude']);
    confirmLast();
    const opencode = await openAgent('OpenCode');
    expect(sentOf('agentConnect.check').map((m) => m.key)).toEqual(['claude']);
    expect(within(opencode.getByLabelText('Conta do agente')).getByText('Não verificada')).toBeInTheDocument();
    await userEvent.click(opencode.getByRole('button', { name: 'Verificar a conta' }));
    expect(lastSent('agentConnect.check')).toEqual({ type: 'agentConnect.check', key: 'opencode' });
    confirmLast();
  });

  it('sem login: os jeitos de entrar; no terminal, o board espera ele fechar', async () => {
    show();
    account('cursor', {
      status: 'signed-out',
      methods: [
        {
          id: 'cli-login',
          name: 'Entrar no terminal',
          description: null,
          type: 'terminal',
          terminalCommand: 'cursor-agent login',
          apiKey: false,
        },
      ],
      canLogout: true,
    });
    const cursor = await openAgent('Cursor');
    const panel = within(cursor.getByLabelText('Conta do agente'));
    expect(panel.getByText('Sem login')).toBeInTheDocument();
    expect(panel.getByText('cursor-agent login')).toBeInTheDocument();
    // sem login, não há o que sair
    expect(panel.queryByRole('button', { name: 'Sair da conta' })).toBeNull();
    await userEvent.click(panel.getByRole('button', { name: 'Entrar no terminal' }));
    expect(lastSent('agentConnect.login')).toEqual({ type: 'agentConnect.login', key: 'cursor', methodId: 'cli-login' });
    confirmLast();
    account('cursor', {
      status: 'signed-out',
      loggingIn: 'cli-login',
      methods: [
        {
          id: 'cli-login',
          name: 'Entrar no terminal',
          description: null,
          type: 'terminal',
          terminalCommand: 'cursor-agent login',
          apiKey: false,
        },
      ],
    });
    expect(panel.getByRole('status')).toHaveTextContent('Login em curso no terminal');
    expect(panel.getByRole('button', { name: 'Entrar no terminal' })).toBeDisabled();
    expect(panel.getByRole('button', { name: 'Verificar a conta' })).toBeDisabled();
    // o terminal fechou e o board conferiu: com login
    account('cursor', { status: 'signed-in', label: 'pessoa@exemplo.com', canLogout: true });
    expect(panel.getByText('pe…@exemplo.com')).toBeInTheDocument();
    // com login, conferir de novo é o que a entrada na tela e o Atualizar já fazem
    expect(panel.queryByRole('button', { name: 'Verificar a conta' })).toBeNull();
    expect(panel.queryByRole('status')).toBeNull();
  });

  it('com login: a conta e o Sair da conta, que confirma antes porque vale para a máquina inteira', async () => {
    show();
    account('claude', { status: 'signed-in', label: 'Claude Max · pessoa@exemplo.com', canLogout: true });
    const panel = within(screen.getByLabelText('Conta do agente'));
    expect(panel.getByText('Com login')).toBeInTheDocument();
    // o e-mail aparece encurtado (a tela vai para capturas); o completo fica na dica
    const label = panel.getByText('Claude Max · pe…@exemplo.com');
    await userEvent.hover(label);
    expect((await screen.findAllByText('Claude Max · pessoa@exemplo.com'))[0]).toBeInTheDocument();
    await userEvent.click(panel.getByRole('button', { name: 'Sair da conta' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Sair da conta do Claude Code?');
    expect(dialog).toHaveTextContent('nesta máquina inteira');
    expect(sentOf('agentConnect.logout')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sair da conta' }));
    expect(lastSent('agentConnect.logout')).toEqual({ type: 'agentConnect.logout', key: 'claude' });
    confirmLast();
  });

  it('a chave de API do Gemini vai pelo Conectar, que a guarda no cofre; a de outro agente vai ao login dele', async () => {
    show();
    account('gemini', {
      status: 'signed-out',
      methods: [
        { id: 'gemini-api-key', name: 'Use Gemini API key', description: null, type: 'agent', terminalCommand: null, apiKey: true },
      ],
    });
    const gemini = await openAgent('Gemini CLI');
    const panel = within(gemini.getByLabelText('Conta do agente'));
    const field = panel.getByLabelText('Chave de API');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(field, KEY);
    await userEvent.click(panel.getByRole('button', { name: 'Entrar com a chave' }));
    expect(lastSent('settings.aiProfiles.connect')).toEqual({ type: 'settings.aiProfiles.connect', id: 'gemini', apiKey: KEY });
    expect(sentOf('agentConnect.login')).toHaveLength(0);
    confirmLast();
    await waitFor(() => expect(panel.getByLabelText('Chave de API')).toHaveValue(''));
  });

  it('o agente do registro: o board ainda não roda cards com ele, mas dá para entrar e testar', async () => {
    show();
    answerRegistry([registryAgent('kilo', { name: 'Kilo' })]);
    await userEvent.click(screen.getByText('Outros agentes do registro do ACP'));
    await userEvent.click(row('Kilo', 'Outros agentes do registro do ACP'));
    const kilo = within(screen.getByLabelText('Kilo'));
    expect(kilo.getByText(/O board ainda não executa cards com este agente/)).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(label)).toEqual(['Conexão', 'Testar']);
    // o agente do registro não é conferido sozinho: só no clique (o npx pode baixar o pacote)
    expect(sentOf('agentConnect.check').some((m) => m.key === 'registry:kilo')).toBe(false);
    await userEvent.click(kilo.getByRole('button', { name: 'Verificar a conta' }));
    expect(lastSent('agentConnect.check')).toEqual({ type: 'agentConnect.check', key: 'registry:kilo' });
    confirmLast();
  });
});

describe('Conectar agentes: testar', () => {
  it('o teste rápido pede confirmação de custo, mostra a espera e o resultado', async () => {
    show();
    const claude = within(screen.getByLabelText('Claude Code'));
    await userEvent.click(tab('Testar'));
    await userEvent.click(within(claude.getByLabelText('Teste rápido')).getByRole('button', { name: 'Testar' }));
    expect(
      screen.getByText('O teste roda a ferramenta e usa a sua assinatura. Uma resposta OK não comprova isolamento, permissões ou MCP.'),
    ).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Testar' }));
    expect(lastSent('settings.aiProfiles.test')).toMatchObject({ id: 'claude' });
    expect(within(claude.getByLabelText('Teste rápido')).getByRole('status')).toHaveTextContent('Testando…');
    send({ type: 'aiProfiles.testResult', id: 'claude', ok: true, output: 'OK' });
    confirmLast();
    await waitFor(() => expect(claude.getByText('OK')).toBeInTheDocument());
    expect(claude.getByText('A resposta não comprova isolamento, permissões ou MCP.')).toBeInTheDocument();
  });

  it('a sessão de teste: abre pelo ACP, mostra as opções e os pedidos de permissão, e avisa quando fecha', async () => {
    show();
    await userEvent.click(tab('Testar'));
    const session = within(screen.getByLabelText('Sessão de teste'));
    await userEvent.click(session.getByRole('button', { name: 'Abrir sessão de teste' }));
    expect(lastSent('agentConnect.test.open')).toEqual({ type: 'agentConnect.test.open', key: 'claude' });
    confirmLast();
    send({
      type: 'agentConnect.test.state',
      state: {
        phase: 'connected',
        error: null,
        connection: {
          key: 'claude',
          agent: { id: 'claude', name: 'Claude Code', command: 'npx', args: [], env: {} },
          cwd: '/projeto',
          protocolVersion: 1,
          agentInfo: { name: 'claude-agent-acp', version: '0.95.0' },
          capabilities: ['loadSession'],
          authMethods: [],
          canLogout: true,
          sessionId: 'sess-1234567890',
          modes: [],
          currentModeId: null,
          configOptions: [
            {
              id: 'model',
              name: 'Model',
              description: null,
              category: 'model',
              type: 'select',
              current: 'opus',
              options: [
                { value: 'opus', name: 'Opus', description: null, group: null },
                { value: 'sonnet', name: 'Sonnet', description: null, group: null },
              ],
            },
          ],
          account: { kind: 'account', label: 'Claude Max', detail: 'pessoa@exemplo.com' },
        },
      },
    });
    expect(session.getByText(/claude-agent-acp 0\.95\.0 · sessão sess-123 · Claude Max · pe…@exemplo\.com/)).toBeInTheDocument();
    await choose(session.getByRole('combobox', { name: 'Model' }), 'Sonnet');
    expect(lastSent('agentConnect.test.setConfig')).toEqual({ type: 'agentConnect.test.setConfig', configId: 'model', value: 'sonnet' });
    confirmLast();
    send({
      type: 'agentConnect.test.event',
      event: {
        kind: 'permission',
        permissionId: 'p1',
        title: 'mcp__faz-ai__get_board',
        options: [
          { optionId: 'ok', name: 'Permitir', kind: 'allow_once' },
          { optionId: 'no', name: 'Recusar', kind: 'reject_once' },
        ],
      },
    });
    await userEvent.click(session.getByRole('button', { name: 'Permitir' }));
    expect(lastSent('agentConnect.test.permission')).toEqual({ type: 'agentConnect.test.permission', permissionId: 'p1', optionId: 'ok' });
    send({
      type: 'agentConnect.test.event',
      event: { kind: 'closed', reason: 'A sessão de teste fechou depois de 10 min sem uso. Abra de novo para continuar.' },
    });
    send({ type: 'agentConnect.test.state', state: TEST_IDLE });
    expect(session.getByText(/A sessão de teste fechou depois de 10 min sem uso/)).toBeInTheDocument();
    expect(session.getByRole('button', { name: 'Abrir sessão de teste' })).toBeInTheDocument();
  });

  it('o log do protocolo mostra cada mensagem, com o tempo do pedido, e abre o arquivo do dia', async () => {
    show();
    await userEvent.click(tab('Testar'));
    send({ type: 'agentConnect.logFile', file: '/dados/trace/acp-2026-10-24.jsonl' });
    send({
      type: 'agentConnect.log',
      entry: {
        seq: 1,
        at: Date.UTC(2026, 9, 24, 12),
        dir: 'in',
        kind: 'response',
        method: 'initialize',
        id: 0,
        ms: 2500,
        summary: '',
        json: '{}',
      },
    });
    const log = within(screen.getByRole('log', { name: 'Log do protocolo ACP' }));
    expect(log.getByText('initialize')).toBeInTheDocument();
    expect(log.getByText('2500 ms')).toBeInTheDocument();
    expect(screen.getByText('Pedido mais lento: initialize em 2500 ms')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir arquivo' }));
    expect(lastSent('agentConnect.openLog')).toEqual({ type: 'agentConnect.openLog' });
    confirmLast();
  });
});

describe('Conectar agentes: detalhes e perfis personalizados', () => {
  /** O formulário do personalizado abre pelo botão da lista. */
  const openNewProfile = async () => {
    await userEvent.click(screen.getByRole('button', { name: /Agente personalizado \(CLI\)/ }));
  };

  it('o personalizado novo é só de CLI: o formulário exige nome e comando e avisa do Windows e do MCP nenhum', async () => {
    show();
    await openNewProfile();
    const form = within(screen.getByLabelText('Novo perfil de CLI'));
    expect(form.queryByRole('textbox', { name: 'Agente ACP' })).toBeNull();
    const save = form.getByRole('button', { name: 'Salvar perfil' });
    expect(save).toBeDisabled();
    expect(form.getByText('Sem servidor do board, a CLI não poderá mover cards por MCP.')).toBeInTheDocument();
    expect(form.queryByText(/8191 caracteres/)).toBeNull();
    await choose(form.getByRole('combobox', { name: 'Entrada do pedido' }), 'Argumento');
    expect(form.getByText(/8191 caracteres/)).toBeInTheDocument();
    await userEvent.type(form.getByRole('textbox', { name: 'Nome' }), 'Minha CLI');
    expect(save).toBeDisabled();
    await userEvent.type(form.getByRole('textbox', { name: 'Comando' }), 'minha-cli');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(lastSent('settings.aiProfiles.save').profile).toMatchObject({
      name: 'Minha CLI',
      kind: 'custom',
      config: { command: 'minha-cli', promptVia: 'arg' },
    });
    confirmLast();
  });

  it('perfil importado começa desligado e exige revisão local antes de ligar', async () => {
    const custom = board.router.handle({
      type: 'settings.aiProfiles.save',
      profile: { name: 'Importada', kind: 'custom', base: 'generic', enabled: true, position: 3, config: { command: 'cli' } },
    });
    const id = custom.board.aiProfiles.find((p) => p.name === 'Importada')!.id;
    board.router.handle({ type: 'settings.aiProfiles.setEnabled', id, enabled: false });
    show();
    const current = useBoardStore.getState().state!;
    act(() =>
      useBoardStore.setState({
        state: {
          ...current,
          board: {
            ...current.board,
            aiProfiles: current.board.aiProfiles.map((p) =>
              p.id === id ? { ...p, credentials: { ...p.credentials!, review: 'pending' as const } } : p,
            ),
          },
        },
      }),
    );
    const imported = await openAgent('Importada');
    expect(imported.getByRole('switch', { name: 'Ligado' })).toBeDisabled();
    await userEvent.click(imported.getByRole('button', { name: 'Editar' }));
    const form = within(screen.getByLabelText('Editar perfil Importada'));
    expect(form.getByText('Os valores salvos não são mostrados. Deixe um campo vazio para manter o valor atual.')).toBeInTheDocument();
    expect(form.getByText(/pendente de revisão local/)).toBeInTheDocument();
    await userEvent.click(form.getByRole('button', { name: 'Salvar perfil' }));
    expect(lastSent('settings.aiProfiles.save').profile).toMatchObject({ id, config: {} });
    confirmLast();
  });

  it('usar nos cards, duplicar e apagar com confirmação', async () => {
    const s = board.router.handle({
      type: 'settings.aiProfiles.save',
      profile: { name: 'Perfil ações', kind: 'custom', base: 'generic', enabled: true, position: 4, config: { command: 'cli' } },
    });
    const custom = s.board.aiProfiles.find((p) => p.name === 'Perfil ações')!;
    show();
    const card = await openAgent('Perfil ações');
    await userEvent.click(card.getByRole('button', { name: 'Usar nos cards sem modelo' }));
    expect(lastSent('settings.board.update')).toEqual({ type: 'settings.board.update', patch: { aiTool: custom.id } });
    confirmLast();
    await userEvent.click(card.getByRole('button', { name: 'Duplicar' }));
    expect(lastSent('settings.aiProfiles.duplicate')).toMatchObject({ id: custom.id });
    confirmLast();
    await userEvent.click(card.getByRole('button', { name: 'Apagar' }));
    expect(screen.getByText('Os cards que mencionam este perfil manterão o identificador antigo.')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));
    expect(lastSent('settings.aiProfiles.remove')).toMatchObject({ id: custom.id });
    confirmLast();
  });

  it('o formulário do perfil novo grava o isolamento que a pessoa marcar', async () => {
    show();
    await openNewProfile();
    const form = within(screen.getByLabelText('Novo perfil de CLI'));
    await userEvent.type(form.getByRole('textbox', { name: 'Nome' }), 'Outra CLI');
    await userEvent.type(form.getByRole('textbox', { name: 'Comando' }), 'outra-cli');
    await userEvent.click(form.getByRole('checkbox', { name: 'Hooks · Usuário' }));
    await userEvent.click(form.getByRole('button', { name: 'Salvar perfil' }));
    expect(lastSent('settings.aiProfiles.save').profile.config.isolation).toEqual({ loads: [{ kind: 'hook', scope: 'user' }] });
    confirmLast();
  });

  it('o personalizado ACP segue rodando, com o aviso, o agente do catálogo e a verificação', async () => {
    const before = board.router.snapshot().board.aiProfiles.map((p) => p.id);
    board.router.handle({ type: 'settings.aiProfiles.duplicate', id: 'gemini' });
    const legacy = board.router.snapshot().board.aiProfiles.find((p) => !before.includes(p.id))!;
    board.router.handle({
      type: 'settings.aiProfiles.save',
      profile: { id: legacy.id, name: 'Gemini antigo', kind: 'custom', base: 'generic', enabled: true, position: 5, config: {} },
    });
    show();
    const card = await openAgent('Gemini antigo');
    expect(card.getAllByText('Personalizado · ACP').length).toBeGreaterThan(0);
    expect(card.getByRole('note')).toHaveTextContent('Personalizado pelo ACP: continua rodando como está');
    await userEvent.click(card.getByRole('button', { name: 'Verificar capacidades' }));
    expect(lastSent('settings.aiProfiles.verify')).toMatchObject({ id: legacy.id });
    confirmLast();
    await userEvent.click(card.getByRole('button', { name: 'Editar' }));
    const form = within(screen.getByLabelText('Editar perfil Gemini antigo'));
    expect(form.getByText(/Personalizado pelo ACP: continua rodando como está/)).toBeInTheDocument();
    expect(form.getByRole('textbox', { name: 'Agente ACP' })).toBeInTheDocument();
    expect(form.queryByRole('textbox', { name: 'Comando' })).toBeNull();
    await userEvent.click(form.getByRole('button', { name: 'Salvar perfil' }));
    expect(lastSent('settings.aiProfiles.save').profile).toMatchObject({ id: legacy.id, kind: 'custom', config: {} });
    confirmLast();
    // o caminho normal: o agente do catálogo deste perfil
    await openAgent('Gemini antigo');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o agente do catálogo' }));
    expect(screen.getByLabelText('Gemini CLI')).toBeInTheDocument();
  });

  it('só o perfil verificável sem Conectar ganha "Verificar capacidades": a cópia do Claude sim, o pronto e o Cursor não', async () => {
    const before = board.router.snapshot().board.aiProfiles.map((p) => p.id);
    board.router.handle({ type: 'settings.aiProfiles.duplicate', id: 'claude' });
    const copy = board.router.snapshot().board.aiProfiles.find((p) => !before.includes(p.id))!;
    show();
    expect(within(screen.getByLabelText('Claude Code')).queryByRole('button', { name: 'Verificar capacidades' })).toBeNull();
    const cursor = await openAgent('Cursor');
    expect(cursor.queryByRole('button', { name: 'Verificar capacidades' })).toBeNull();
    // a cópia nasce desligada e pendente de revisão: o botão espera, com o motivo
    const card = await openAgent(copy.name);
    expect(card.getByRole('button', { name: 'Verificar capacidades' })).toBeDisabled();
    await userEvent.hover(card.getByRole('button', { name: 'Verificar capacidades' }).parentElement!);
    expect(await screen.findByText('Revise o perfil antes: salve a configuração dele no formulário.')).toBeInTheDocument();
  });

  /** Põe na tela perfis que o formulário novo não cria mais (o personalizado ACP de antes, o importado). */
  const withProfiles = (extra: AiProfile[]) => {
    const current = useBoardStore.getState().state!;
    act(() =>
      useBoardStore.setState({ state: { ...current, board: { ...current.board, aiProfiles: [...current.board.aiProfiles, ...extra] } } }),
    );
  };
  const custom = (id: string, over: Partial<AiProfile> = {}): AiProfile => ({
    id,
    name: id,
    kind: 'custom',
    tool: id,
    mode: 'acp',
    base: 'generic',
    enabled: true,
    position: 20,
    config: {},
    credentials: { secretRef: 'x', review: 'reviewed', available: true },
    ...over,
  });

  it('o personalizado ACP desligado diz por que não verifica', async () => {
    show();
    withProfiles([custom('acp-desligado', { config: { acpAgent: 'gemini' }, enabled: false })]);
    const card = await openAgent('acp-desligado');
    expect(card.getByRole('button', { name: 'Verificar capacidades' })).toBeDisabled();
    await userEvent.hover(card.getByRole('button', { name: 'Verificar capacidades' }).parentElement!);
    expect(await screen.findByText('Ligue o perfil antes.')).toBeInTheDocument();
  });

  it('sem o modo ACP no catálogo (Cursor, Kimi Code), o aviso vem sem o caminho do agente do catálogo', async () => {
    show();
    withProfiles([custom('cursor-acp', { config: { acpAgent: 'cursor' } }), custom('kimi-acp', { config: { acpAgent: 'kimi' } })]);
    for (const name of ['cursor-acp', 'kimi-acp']) {
      const card = await openAgent(name);
      expect(card.getByRole('note')).toHaveTextContent('Personalizado pelo ACP');
      expect(card.queryByRole('button', { name: 'Abrir o agente do catálogo' })).toBeNull();
    }
  });

  it('o formulário exige o agente do personalizado ACP sem configuração nesta máquina, e oferece o campo ao importado sem ela', async () => {
    show();
    withProfiles([
      custom('acp-sem-cofre', {
        name: 'ACP sem cofre',
        config: { acpAgent: 'gemini' },
        credentials: { secretRef: 'x', review: 'reviewed', available: false },
      }),
      custom('importado-antigo', {
        name: 'Importado antigo',
        mode: 'cli',
        enabled: false,
        credentials: { secretRef: 'x', review: 'pending', available: false },
      }),
    ]);
    await userEvent.click((await openAgent('ACP sem cofre')).getByRole('button', { name: 'Editar' }));
    let form = within(screen.getByLabelText('Editar perfil ACP sem cofre'));
    expect(form.getByText('Informe o agente ACP do perfil: a configuração dele não está nesta máquina.')).toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Salvar perfil' })).toBeDisabled();
    await userEvent.type(form.getByRole('textbox', { name: 'Agente ACP' }), 'gemini');
    expect(form.getByRole('button', { name: 'Salvar perfil' })).toBeEnabled();
    await userEvent.click(form.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click((await openAgent('Importado antigo')).getByRole('button', { name: 'Editar' }));
    form = within(screen.getByLabelText('Editar perfil Importado antigo'));
    expect(form.getByText(/se o perfil era de um agente ACP no board de origem/)).toBeInTheDocument();
    expect(form.getByRole('textbox', { name: 'Comando' })).toBeInTheDocument();
    await userEvent.type(form.getByRole('textbox', { name: 'Agente ACP' }), 'gemini');
    expect(form.queryByRole('textbox', { name: 'Comando' })).toBeNull();
    await userEvent.type(form.getByRole('textbox', { name: 'Nome' }), ' revisado');
    await userEvent.click(form.getByRole('button', { name: 'Salvar perfil' }));
    expect(lastSent('settings.aiProfiles.save').profile).toMatchObject({ id: 'importado-antigo', config: { acpAgent: 'gemini' } });
    confirmLast();
  });

  it('uma cópia do Claude Code dá a ciência com o mesmo texto do Conectar e depois a revoga', async () => {
    board.router.handle({ type: 'settings.aiProfiles.duplicate', id: 'claude' });
    const copy = board.router
      .snapshot()
      .board.aiProfiles.filter((p) => p.name.startsWith('Claude Code (cópia)'))
      .at(-1)!;
    // a cópia nasce pendente de revisão: revisada e ligada (com um nome só dela), a ação fica disponível
    board.router.handle({ type: 'settings.aiProfiles.save', profile: { ...copy, name: 'Claude da ciência', enabled: true } as never });
    show();
    const card = await openAgent('Claude da ciência');
    await userEvent.click(card.getByRole('button', { name: 'Usar com o contexto aberto' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('O Claude da ciência roda com o contexto aberto');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Usar assim mesmo' }));
    expect(lastSent('settings.aiProfiles.review')).toMatchObject({ id: copy.id, accept: true });
    board.router.handle({ type: 'settings.aiProfiles.review', id: copy.id, accept: true });
    syncStore(board.router);
    confirmLast();
    await userEvent.click(await card.findByRole('button', { name: 'Parar de usar com o contexto aberto' }));
    expect(lastSent('settings.aiProfiles.review')).toMatchObject({ id: copy.id, accept: false });
    confirmLast();
  });
});
