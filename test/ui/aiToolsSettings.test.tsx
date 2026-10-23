import { choose, confirmLast, lastSent, renderThemed, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiToolsSettings } from '../../src/webview/components/settings/AiToolsSettings';
import { Dialog } from '../../src/webview/components/Dialog';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
const profileCard = (name: string) => screen.getByLabelText(name);
/** O formulário do personalizado abre por "Avançado" (história 13). */
const openNewProfile = async () => {
  await userEvent.click(screen.getByText('Avançado'));
  await userEvent.click(screen.getByRole('button', { name: 'Novo perfil de CLI personalizado' }));
};
const show = () => {
  syncStore(board.router);
  renderThemed(
    <>
      <AiToolsSettings />
      <Dialog />
    </>,
  );
  expect(lastSent('settings.aiProfiles.probe')).toBeDefined();
  confirmLast();
};

describe('Ferramentas de IA', () => {
  it('lista situação e capacidades sem tratar configuração como verificação; pronto e padrão não têm ações proibidas', async () => {
    show();
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'aiProfiles.status',
            profiles: {
              claude: { found: true, version: '5.5.0', signedIn: true, installUrl: null },
              cursor: { found: false, version: null, signedIn: null, installUrl: 'https://example.org' },
            },
          },
        }),
      ),
    );
    const claude = within(profileCard('Claude Code'));
    expect(claude.getByText('Encontrada · 5.5.0')).toBeInTheDocument();
    expect(claude.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(claude.queryByRole('button', { name: 'Apagar' })).toBeNull();
    expect(claude.getByRole('switch', { name: 'Ligado' })).toBeDisabled();
    await userEvent.click(claude.getByText('Capacidades e evidências'));
    expect(claude.getAllByText('Desconhecido').length).toBeGreaterThan(0);
    expect(within(profileCard('Cursor')).getByText('Não encontrada')).toBeInTheDocument();
  });

  it('a aba abre com o Conectar ferramenta e mostra o estado do Conectar só nos perfis do catálogo (história 7)', () => {
    show();
    expect(screen.getByRole('region', { name: 'Conectar ferramenta' })).toBeInTheDocument();
    // perfil pronto de um modo oferecido: o estado e o botão de conectar
    expect(within(profileCard('Gemini CLI')).getByTestId('connection-gemini')).toHaveTextContent('Não conectada pelo Conectar');
    expect(within(profileCard('Gemini CLI')).getByRole('button', { name: 'Conectar' })).toBeInTheDocument();
    // as CLIs prontas também passam pelo mesmo Conectar
    expect(within(profileCard('Claude Code')).getByTestId('connection-claude')).toBeInTheDocument();
  });

  it('agente ACP pronto: desligado, com o link da página oficial, sem Editar nem Apagar', async () => {
    show();
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'aiProfiles.status',
            profiles: { gemini: { found: false, version: null, signedIn: null, installUrl: 'https://geminicli.com/docs/cli/acp-mode' } },
          },
        }),
      ),
    );
    const gemini = within(profileCard('Gemini CLI'));
    // o rótulo é a ferramenta e o modo
    expect(gemini.getByText('Gemini · ACP')).toBeInTheDocument();
    expect(within(profileCard('Claude Code')).getByText('Claude Code · CLI')).toBeInTheDocument();
    expect(gemini.getByRole('switch', { name: 'Ligado' })).not.toBeChecked();
    expect(gemini.getByRole('switch', { name: 'Ligado' })).toBeEnabled();
    expect(gemini.getByRole('link', { name: 'Instalar' })).toHaveAttribute('href', 'https://geminicli.com/docs/cli/acp-mode');
    expect(gemini.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(gemini.queryByRole('button', { name: 'Apagar' })).toBeNull();
    await userEvent.click(gemini.getByRole('switch', { name: 'Ligado' }));
    expect(lastSent('settings.aiProfiles.setEnabled')).toMatchObject({ id: 'gemini', enabled: true });
    confirmLast();
  });

  it('o perfil personalizado fica atrás de "Avançado", fora do caminho normal (história 13)', async () => {
    show();
    // o topo da aba só consulta a situação: o caminho normal é o Conectar ferramenta
    expect(screen.queryByRole('button', { name: 'Novo perfil' })).toBeNull();
    const advanced = screen.getByText('Avançado').closest('details')!;
    expect(advanced).not.toHaveAttribute('open');
    expect(
      within(advanced).getByText(/Perfil de CLI personalizado, para uma linha de comando que o catálogo não traz/),
    ).toBeInTheDocument();
    await openNewProfile();
    // o personalizado novo é só de CLI: sem o campo do agente ACP, com o campo do comando
    const form = within(screen.getByLabelText('Novo perfil de CLI'));
    expect(form.queryByRole('textbox', { name: 'Agente ACP' })).toBeNull();
    expect(form.getByRole('textbox', { name: 'Comando' })).toBeInTheDocument();
    expect(form.queryByText(/de uma versão anterior/)).toBeNull();
  });

  it('formulário novo exige nome e comando e mostra avisos de argumento no Windows e MCP nenhum', async () => {
    show();
    await openNewProfile();
    const form = within(screen.getByLabelText('Novo perfil de CLI'));
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

  it('Testar pede confirmação de custo, mostra espera e publica o resultado', async () => {
    show();
    const claude = within(profileCard('Claude Code'));
    await userEvent.click(claude.getByRole('button', { name: 'Testar' }));
    expect(
      screen.getByText('O teste roda a ferramenta e usa a sua assinatura. Uma resposta OK não comprova isolamento, permissões ou MCP.'),
    ).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Testar' }));
    expect(lastSent('settings.aiProfiles.test')).toMatchObject({ id: 'claude' });
    expect(claude.getByRole('status')).toHaveTextContent('Testando perfil…');
    act(() =>
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'aiProfiles.testResult', id: 'claude', ok: true, output: 'OK' } })),
    );
    confirmLast();
    await waitFor(() => expect(claude.getByText('OK')).toBeInTheDocument());
    expect(claude.getByText('A resposta não comprova isolamento, permissões ou MCP.')).toBeInTheDocument();
  });

  it('perfil importado começa desligado e exige revisão local antes de ligar', async () => {
    const custom = board.router.handle({
      type: 'settings.aiProfiles.save',
      profile: {
        name: 'Importada',
        kind: 'custom',
        base: 'generic',
        enabled: true,
        position: 3,
        config: { command: 'cli' },
      },
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
    const imported = within(profileCard('Importada'));
    expect(imported.getByRole('switch', { name: 'Ligado' })).toBeDisabled();
    await userEvent.click(imported.getByRole('button', { name: 'Editar' }));
    const form = within(screen.getByLabelText('Editar perfil Importada'));
    expect(form.getByText('Os valores salvos não são mostrados. Deixe um campo vazio para manter o valor atual.')).toBeInTheDocument();
    expect(form.getByText(/pendente de revisão local/)).toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Salvar perfil' })).toBeEnabled();
    await userEvent.click(form.getByRole('button', { name: 'Salvar perfil' }));
    expect(lastSent('settings.aiProfiles.save').profile).toMatchObject({ id, config: {} });
    confirmLast();
  });

  it('torna um perfil ligado padrão, duplica e confirma antes de apagar', async () => {
    const s = board.router.handle({
      type: 'settings.aiProfiles.save',
      profile: {
        name: 'Perfil ações',
        kind: 'custom',
        base: 'generic',
        enabled: true,
        position: 4,
        config: { command: 'cli' },
      },
    });
    const custom = s.board.aiProfiles.find((p) => p.name === 'Perfil ações')!;
    show();
    const card = within(profileCard('Perfil ações'));
    await userEvent.click(card.getByRole('radio', { name: 'Padrão' }));
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

  it('mostra o selo de isolamento sem tratar lista vazia como prova e grava o que a pessoa marcar', async () => {
    show();
    const claude = within(profileCard('Claude Code'));
    expect(claude.getByText('Sem prova de isolamento')).toBeInTheDocument();
    expect(within(profileCard('Cursor')).getByText('Carrega por conta própria')).toBeInTheDocument();
    await userEvent.click(claude.getByText('Capacidades e evidências'));
    expect(claude.getByText(/Conferido na documentação em 2026-10-16 · versão Claude Code/)).toBeInTheDocument();
    await openNewProfile();
    const form = within(screen.getByLabelText('Novo perfil de CLI'));
    await userEvent.type(form.getByRole('textbox', { name: 'Nome' }), 'Outra CLI');
    await userEvent.type(form.getByRole('textbox', { name: 'Comando' }), 'outra-cli');
    await userEvent.click(form.getByRole('checkbox', { name: 'Hooks · Usuário' }));
    await userEvent.click(form.getByRole('button', { name: 'Salvar perfil' }));
    expect(lastSent('settings.aiProfiles.save').profile.config.isolation).toEqual({ loads: [{ kind: 'hook', scope: 'user' }] });
    confirmLast();
  });

  it('o personalizado ACP de uma versão anterior segue rodando, com o aviso, o caminho do Conectar e a verificação', async () => {
    // a cópia de um agente pronto é o personalizado ACP que versões anteriores também criavam pelo formulário
    const before = board.router.snapshot().board.aiProfiles.map((p) => p.id);
    board.router.handle({ type: 'settings.aiProfiles.duplicate', id: 'gemini' });
    const legacy = board.router.snapshot().board.aiProfiles.find((p) => !before.includes(p.id))!;
    board.router.handle({
      type: 'settings.aiProfiles.save',
      profile: { id: legacy.id, name: 'Gemini antigo', kind: 'custom', base: 'generic', enabled: true, position: 5, config: {} },
    });
    show();
    const card = within(profileCard('Gemini antigo'));
    expect(card.getByText('Personalizado · ACP')).toBeInTheDocument();
    expect(card.getByRole('note')).toHaveTextContent('de uma versão anterior: continua rodando como está');
    // o caminho normal: o Conectar no agente do perfil
    await userEvent.click(card.getByRole('button', { name: 'Abrir o Conectar' }));
    expect(useBoardStore.getState().connectTool).toBe('gemini');
    // sem Conectar, a verificação de capacidades é pedida daqui (o comando da paleta saiu)
    await userEvent.click(card.getByRole('button', { name: 'Verificar capacidades' }));
    expect(lastSent('settings.aiProfiles.verify')).toMatchObject({ id: legacy.id });
    confirmLast();
    // editar mantém o agente e avisa; o campo do agente só existe nele
    await userEvent.click(card.getByRole('button', { name: 'Editar' }));
    const form = within(screen.getByLabelText('Editar perfil Gemini antigo'));
    expect(form.getByText(/de uma versão anterior: continua rodando como está/)).toBeInTheDocument();
    expect(form.getByRole('textbox', { name: 'Agente ACP' })).toBeInTheDocument();
    expect(form.queryByRole('textbox', { name: 'Comando' })).toBeNull();
    await userEvent.click(form.getByRole('button', { name: 'Salvar perfil' }));
    expect(lastSent('settings.aiProfiles.save').profile).toMatchObject({ id: legacy.id, kind: 'custom', config: {} });
    confirmLast();
  });

  it('só o perfil verificável sem Conectar ganha "Verificar capacidades": a cópia do Claude sim, o pronto e o Cursor não', async () => {
    const before = board.router.snapshot().board.aiProfiles.map((p) => p.id);
    board.router.handle({ type: 'settings.aiProfiles.duplicate', id: 'claude' });
    const copy = board.router.snapshot().board.aiProfiles.find((p) => !before.includes(p.id))!;
    show();
    // o pronto verifica pelo Conectar e o Cursor não tem sonda
    expect(within(profileCard('Claude Code')).queryByRole('button', { name: 'Verificar capacidades' })).toBeNull();
    expect(within(profileCard('Cursor')).queryByRole('button', { name: 'Verificar capacidades' })).toBeNull();
    // a cópia nasce desligada e pendente de revisão: o botão espera
    const card = within(profileCard(copy.name));
    expect(card.getByRole('button', { name: 'Verificar capacidades' })).toBeDisabled();
    expect(card.queryByRole('note')).toBeNull();
  });
});
