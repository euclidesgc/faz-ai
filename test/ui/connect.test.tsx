// Ferramentas de IA › Conectar ferramenta (épica "ferramenta por modo", história 7): a lista fixa de `TOOLS`, um
// cartão por modo oferecido com a ficha, o selo Recomendado só quando o recomendado é oferecido, e o progresso
// do Conectar que o host publica em `connections`, com a chave que nunca volta para a tela.
import { confirmLast, lastSent, renderThemed, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectTool } from '../../src/webview/components/settings/ConnectTool';
import { AiToolsSettings } from '../../src/webview/components/settings/AiToolsSettings';
import { Dialog } from '../../src/webview/components/Dialog';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { MODE_SHEET_LINES, TOOLS, recommendedOffered } from '../../src/shared/aiTools';
import type { ConnectState } from '../../src/shared/connect';

const KEY = 'AIzaSy-chave-da-tela-123456';
let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  board.router.setConnections({});
  // o board é o mesmo em todos os casos: a ciência de um não vale para o outro
  for (const id of Object.keys(board.router.snapshot().board.runner.compatibilityReviews)) board.router.revokeCompatibilityReview(id);
});

/** O host publica o estado do Conectar do perfil (o `connections` do board). */
const publish = (state: Partial<ConnectState> & Pick<ConnectState, 'step' | 'status'>, profileId = 'gemini') => {
  board.router.setConnections({ [profileId]: { profileId, summary: {}, ...state } });
  syncStore(board.router);
};
const show = () => {
  syncStore(board.router);
  return renderThemed(<ConnectTool />);
};
const toolButton = (name: string) =>
  within(screen.getByRole('list', { name: 'Ferramentas' }))
    .getAllByRole('button')
    .find((b) => b.querySelector('strong')?.textContent === name)!;

describe('Conectar ferramenta: a lista e os cartões', () => {
  it('a lista fixa é a de TOOLS, na ordem, com o Gemini primeiro e a nota de cobrança', () => {
    show();
    const buttons = within(screen.getByRole('list', { name: 'Ferramentas' })).getAllByRole('button');
    expect(buttons.map((b) => b.querySelector('strong')?.textContent)).toEqual(TOOLS.map((t) => t.name));
    expect(buttons[0]).toHaveTextContent('Gemini CLI');
    expect(buttons[0]).toHaveTextContent('cobrança por token');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('o Gemini oferece o ACP e a API (história 10): a ficha inteira em cada um, o selo Recomendado na API', () => {
    show();
    const card = screen.getByLabelText('Gemini CLI · ACP');
    expect(within(card).queryByText('Recomendado')).toBeNull();
    const api = screen.getByLabelText('Gemini CLI · API');
    expect(within(api).getByText('Recomendado')).toBeInTheDocument();
    expect(within(api).getByText('exclusivo, por construção: o board monta cada pedido e executa cada chamada')).toBeInTheDocument();
    expect(within(api).getByText(/Refinar, Resumir e Trabalhar na fase com a permissão "Só o board"/)).toBeInTheDocument();
    // as oito linhas da ficha, na ordem
    expect(
      within(card)
        .getAllByRole('term')
        .map((dt) => dt.textContent),
    ).toEqual([
      'O que o board controla',
      'Regime esperado',
      'Precisão do que foi usado',
      'Consumo',
      'O que a ferramenta traz',
      'Como se entra',
      'Cobrança',
      'Quando escolher',
    ]);
    expect(within(card).getByText('chave de API do Gemini')).toBeInTheDocument();
    // a CLI ainda não tem driver: nenhum cartão para ela, só o aviso
    expect(screen.queryByLabelText('Gemini CLI · CLI')).toBeNull();
    expect(screen.getByText('Ainda não oferecidos nesta versão: CLI.')).toBeInTheDocument();
  });

  it('o Claude Code mostra a CLI com o selo e o porquê de ser a única', async () => {
    show();
    await userEvent.click(toolButton('Claude Code'));
    const card = screen.getByLabelText('Claude Code · CLI');
    expect(within(card).getByText('Recomendado')).toBeInTheDocument();
    expect(within(card).getByText('É o único modo que usa a assinatura: o ACP do Claude exige cobrança por API.')).toBeInTheDocument();
  });

  it.each(TOOLS.map((t) => [t.name, t] as const))(
    '%s: um cartão por modo oferecido, selo só no recomendado oferecido',
    async (name, tool) => {
      show();
      await userEvent.click(toolButton(name));
      const cards = screen.getAllByLabelText(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · `));
      expect(cards).toHaveLength(tool.modes.length);
      for (const card of cards) expect(within(card).getAllByRole('term')).toHaveLength(MODE_SHEET_LINES.length);
      expect(screen.queryAllByText('Recomendado')).toHaveLength(recommendedOffered(tool) ? 1 : 0);
      for (const p of tool.planned) expect(screen.queryByLabelText(`${name} · ${p.mode.toUpperCase()}`)).toBeNull();
    },
  );
});

describe('Conectar ferramenta: o fluxo na tela', () => {
  it('Conectar manda o perfil do catálogo do modo; o host responde passo a passo', async () => {
    show();
    await userEvent.click(within(screen.getByLabelText('Gemini CLI · ACP')).getByRole('button', { name: 'Conectar' }));
    expect(lastSent('settings.aiProfiles.connect')).toEqual(expect.objectContaining({ type: 'settings.aiProfiles.connect', id: 'gemini' }));
    publish({ step: 'verify', status: 'running', summary: { version: '0.65.0' } });
    confirmLast();
    const steps = await screen.findByRole('list', { name: 'Passos do Conectar' });
    expect(within(steps).getByText(/Achar a ferramenta/)).toHaveTextContent('feito');
    expect(within(steps).getByText(/Verificar as capacidades/)).toHaveTextContent('em curso');
    expect(within(steps).getByText(/Ler os modelos/)).toHaveTextContent('a seguir');
  });

  it('o campo da chave é de senha, manda a chave ao host e limpa só quando ele confirma; a chave não fica na tela', async () => {
    publish({ step: 'signIn', status: 'waiting', needs: 'api-key', summary: { version: '0.65.0' } });
    show();
    const field = screen.getByLabelText('Chave de API');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.type(field, KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar a chave e continuar' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', apiKey: KEY });
    // o host confirma e publica o passo seguinte, sem a chave
    publish({
      step: 'review',
      status: 'waiting',
      needs: 'review',
      summary: { version: '0.65.0', signIn: 'api-key', regime: 'compatible' },
    });
    confirmLast();
    await waitFor(() => expect(screen.queryByLabelText('Chave de API')).toBeNull());
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('a chave recusada: o motivo fica no passo do login e o que a pessoa colou continua no campo', async () => {
    publish({ step: 'signIn', status: 'waiting', needs: 'api-key', summary: { version: '0.65.0' } });
    show();
    await userEvent.type(screen.getByLabelText('Chave de API'), KEY);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar a chave e continuar' }));
    // o host passa pelo login (em curso) e volta a esperar a chave, com a recusa
    publish({ step: 'signIn', status: 'running', summary: { version: '0.65.0' } });
    publish({
      step: 'signIn',
      status: 'waiting',
      needs: 'api-key',
      error: 'Gemini CLI recusou a chave de API: API key not valid.',
      summary: { version: '0.65.0' },
    });
    confirmLast();
    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini CLI recusou a chave de API: API key not valid.');
    expect(screen.getByLabelText('Chave de API')).toHaveValue(KEY);
  });

  it('o cartão API conecta o mesmo perfil no modo api, confere a chave na hora e diz isso na tela', async () => {
    show();
    const api = () => screen.getByLabelText('Gemini CLI · API');
    await userEvent.click(within(api()).getByRole('button', { name: 'Conectar' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', mode: 'api' });
    // o host publica a espera da chave para o modo api: o campo aparece no cartão API, não no ACP
    publish({ mode: 'api', step: 'signIn', status: 'waiting', needs: 'api-key', summary: { version: null } });
    confirmLast();
    expect(await within(api()).findByText(/O board confere a chave agora, lendo a lista de modelos da conta/)).toBeInTheDocument();
    expect(within(screen.getByLabelText('Gemini CLI · ACP')).queryByLabelText('Chave de API')).toBeNull();
    await userEvent.type(within(api()).getByLabelText('Chave de API'), KEY);
    await userEvent.click(within(api()).getByRole('button', { name: 'Conferir e guardar a chave' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', mode: 'api', apiKey: KEY });
    // conectada: a chave conferida, sem versão de binário, exclusivo
    publish({
      mode: 'api',
      step: 'models',
      status: 'connected',
      summary: { version: null, signIn: 'api-key-checked', regime: 'exclusive', reviewed: null, models: 2, at: 1_700_000_000_000 },
    });
    confirmLast();
    expect(await within(api()).findByRole('status')).toHaveTextContent(
      /^Conectada · chave de API conferida · regime exclusivo · 2 modelos · /,
    );
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('o texto do campo diz que a chave é guardada e conferida na primeira execução, não validada aqui', () => {
    publish({ step: 'signIn', status: 'waiting', needs: 'api-key' });
    show();
    expect(screen.getByText(/A ferramenta a confere de fato na primeira execução/)).toBeInTheDocument();
  });

  it('a ciência do regime compatível é um botão à parte, com o que a ferramenta carrega', async () => {
    publish({ step: 'review', status: 'waiting', needs: 'review', summary: { regime: 'compatible' } });
    show();
    expect(screen.getByText(/O Gemini CLI roda no regime compatível/)).toHaveTextContent('o agente completo do Gemini CLI');
    await userEvent.click(screen.getByRole('button', { name: 'Entendo o que a ferramenta carrega' }));
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
    expect(within(screen.getByRole('list', { name: 'Passos do Conectar' })).getByText(/Achar a ferramenta/)).toHaveTextContent('falhou');
    expect(screen.getByRole('link', { name: 'Instalar' })).toHaveAttribute('href', 'https://geminicli.com/docs/cli/acp-mode');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
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

  it('Conectada: o resumo (versão, login, regime, modelos, data) e o Reconectar, no cartão e no perfil', async () => {
    connected();
    renderThemed(<AiToolsSettings />);
    confirmLast();
    const card = screen.getByLabelText('Gemini CLI · ACP');
    expect(within(card).getByRole('status')).toHaveTextContent(
      /Conectada · 0\.65\.0 · chave de API guardada · regime compatível \(ciência 1\) · 6 modelos · /,
    );
    expect(within(card).getByRole('button', { name: 'Reconectar' })).toBeInTheDocument();
    // o estado de cada perfil do catálogo, também na lista dos perfis
    expect(screen.getByTestId('connection-gemini')).toHaveTextContent('Conectada · 0.65.0');
    expect(screen.getByTestId('connection-claude')).toHaveTextContent('Não conectada pelo Conectar');
    await userEvent.click(within(screen.getByLabelText('Gemini CLI')).getByRole('button', { name: 'Reconectar' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini' });
    confirmLast();
  });

  it('Trocar a chave no cartão conectado: o campo abre, manda a chave nova e Cancelar fecha sem trocar', async () => {
    connected();
    show();
    const card = screen.getByLabelText('Gemini CLI · ACP');
    await userEvent.click(within(card).getByRole('button', { name: 'Trocar a chave' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Cancelar' }));
    expect(within(card).queryByLabelText('Chave de API')).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Trocar a chave' }));
    await userEvent.type(within(card).getByLabelText('Chave de API'), `${KEY}-nova`);
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar a chave e continuar' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini', apiKey: `${KEY}-nova` });
    confirmLast();
  });

  it('Revogar ciência no cartão conectado; revogada, o resumo diz que o perfil não roda', async () => {
    connected();
    show();
    await userEvent.click(within(screen.getByLabelText('Gemini CLI · ACP')).getByRole('button', { name: 'Revogar ciência' }));
    expect(lastSent('settings.aiProfiles.review')).toMatchObject({ type: 'settings.aiProfiles.review', id: 'gemini', accept: false });
    board.router.handle({ type: 'settings.aiProfiles.review', id: 'gemini', accept: false });
    syncStore(board.router);
    confirmLast();
    expect(await screen.findByText(/regime compatível, sem ciência: o perfil não roda/)).toBeInTheDocument();
    expect(within(screen.getByLabelText('Gemini CLI · ACP')).queryByRole('button', { name: 'Revogar ciência' })).toBeNull();
  });

  it('a lista dos perfis diz quando o Conectar espera você, apontando para o cartão', () => {
    publish({ step: 'review', status: 'waiting', needs: 'review' });
    renderThemed(<AiToolsSettings />);
    confirmLast();
    expect(screen.getByTestId('connection-gemini')).toHaveTextContent(
      'O Conectar espera você no passo "Ciência do regime": continue no cartão em Conectar ferramenta, acima.',
    );
  });

  it('o aviso do topo abre o Conectar já na ferramenta do perfil', () => {
    useBoardStore.getState().openConnect('opencode');
    expect(useBoardStore.getState()).toMatchObject({ view: 'settings', settingsTab: 'aiTools', connectTool: 'opencode' });
    show();
    expect(toolButton('OpenCode')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('OpenCode · ACP')).toBeInTheDocument();
    useBoardStore.setState({ connectTool: null });
  });
});

describe('ciência para quem não passa pelo Conectar (cópias, personalizados)', () => {
  it('uma cópia do Claude Code dá a ciência com o mesmo texto do Conectar e depois a revoga', async () => {
    board.router.handle({ type: 'settings.aiProfiles.duplicate', id: 'claude' });
    const copy = board.router.snapshot().board.aiProfiles.find((p) => p.name === 'Claude Code (cópia)')!;
    // a cópia nasce pendente de revisão: revisada e ligada, a ação fica disponível
    board.router.handle({ type: 'settings.aiProfiles.save', profile: { ...copy, enabled: true } as never });
    syncStore(board.router);
    renderThemed(
      <>
        <AiToolsSettings />
        <Dialog />
      </>,
    );
    confirmLast();
    const card = within(screen.getByLabelText('Claude Code (cópia)'));
    expect(card.getByTestId(`review-${copy.id}`)).toHaveTextContent('Sem ciência do regime compatível');
    await userEvent.click(card.getByRole('button', { name: 'Dar ciência do regime compatível' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('O Claude Code (cópia) roda no regime compatível');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entendo o que a ferramenta carrega' }));
    expect(lastSent('settings.aiProfiles.review')).toMatchObject({ id: copy.id, accept: true });
    board.router.handle({ type: 'settings.aiProfiles.review', id: copy.id, accept: true });
    syncStore(board.router);
    confirmLast();
    await userEvent.click(await within(screen.getByLabelText('Claude Code (cópia)')).findByRole('button', { name: 'Revogar ciência' }));
    expect(lastSent('settings.aiProfiles.review')).toMatchObject({ id: copy.id, accept: false });
    confirmLast();
  });
});
