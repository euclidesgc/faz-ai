// Ferramentas de IA › Conectar ferramenta (épica "ferramenta por modo", história 7): a lista fixa de `TOOLS`, um
// cartão por modo oferecido com a ficha, o selo Recomendado só quando o recomendado é oferecido, e o progresso
// do Conectar que o host publica em `connections`, com a chave que nunca volta para a tela.
import { confirmLast, lastSent, renderThemed, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectTool } from '../../src/webview/components/settings/ConnectTool';
import { AiToolsSettings } from '../../src/webview/components/settings/AiToolsSettings';
import { MODE_SHEET_LINES, TOOLS, recommendedOffered } from '../../src/shared/aiTools';
import type { ConnectState } from '../../src/shared/connect';

const KEY = 'AIzaSy-chave-da-tela-123456';
let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => board.router.setConnections({}));

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

  it('o Gemini oferece só o ACP nesta versão: um cartão, a ficha inteira e nenhum selo', () => {
    show();
    const card = screen.getByLabelText('Gemini CLI · ACP');
    expect(within(card).queryByText('Recomendado')).toBeNull();
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
    // a CLI e a API ainda não têm driver: nenhum cartão para elas, só o aviso
    expect(screen.queryByLabelText('Gemini CLI · CLI')).toBeNull();
    expect(screen.queryByLabelText('Gemini CLI · API')).toBeNull();
    expect(screen.getByText('Ainda não oferecidos nesta versão: CLI, API.')).toBeInTheDocument();
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

  it('a chave recusada: o motivo fica no passo do login e o campo volta', () => {
    publish({ step: 'signIn', status: 'waiting', needs: 'api-key', error: 'Gemini CLI recusou a chave de API: API key not valid.' });
    show();
    expect(screen.getByRole('alert')).toHaveTextContent('Gemini CLI recusou a chave de API: API key not valid.');
    expect(screen.getByLabelText('Chave de API')).toHaveValue('');
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

  it('Conectada: o resumo (versão, login, regime, modelos, data) e o Reconectar, no cartão e no perfil', async () => {
    publish({
      step: 'models',
      status: 'connected',
      summary: { version: '0.65.0', signIn: 'api-key', regime: 'compatible', reviewed: 1, models: 6, at: Date.UTC(2026, 9, 23, 15) },
    });
    syncStore(board.router);
    renderThemed(<AiToolsSettings />);
    confirmLast();
    const card = screen.getByLabelText('Gemini CLI · ACP');
    expect(within(card).getByRole('status')).toHaveTextContent(
      /Conectada · 0\.65\.0 · chave de API no cofre · regime compatível \(ciência 1\) · 6 modelos · /,
    );
    expect(within(card).getByRole('button', { name: 'Reconectar' })).toBeInTheDocument();
    // o estado de cada perfil do catálogo, também na lista dos perfis
    expect(screen.getByTestId('connection-gemini')).toHaveTextContent('Conectada · 0.65.0');
    expect(screen.getByTestId('connection-claude')).toHaveTextContent('Não conectada pelo Conectar');
    await userEvent.click(within(screen.getByLabelText('Gemini CLI')).getByRole('button', { name: 'Reconectar' }));
    expect(lastSent('settings.aiProfiles.connect')).toMatchObject({ id: 'gemini' });
    confirmLast();
  });
});
