import { choose, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Dialog } from '../../src/webview/components/Dialog';
import { ExecProfilesSettings } from '../../src/webview/components/settings/ExecProfilesSettings';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  syncStore(board.router);
  // parte sempre de um perfil só, para os testes não dependerem da ordem
  board.router.handle({
    type: 'settings.execProfiles.set',
    profiles: [
      {
        id: 'p1',
        name: 'Revisão',
        agent: '',
        skills: [],
        mcpServers: null,
        tools: [],
        deniedTools: [],
        model: '',
        clean: false,
        isDefault: true,
      },
    ],
  });
  syncStore(board.router);
});

const show = () =>
  render(
    <Theme>
      <ExecProfilesSettings />
      <Dialog />
    </Theme>,
  );
const card = (name: string) => within(screen.getByLabelText(`Perfil ${name}`));

describe('ExecProfilesSettings', () => {
  it('Novo perfil fica no topo e cria e abre um perfil novo', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo perfil' }));
    const sent = lastSent('settings.execProfiles.set').profiles;
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ name: 'Perfil 2', isDefault: false });
  });

  it('o nome é uma caixa de texto e grava ao sair', async () => {
    show();
    const name = card('Revisão').getByLabelText('Nome do perfil');
    await userEvent.clear(name);
    await userEvent.type(name, 'Revisão rápida');
    expect(sentOf('settings.execProfiles.set')).toHaveLength(0);
    await userEvent.tab();
    expect(lastSent('settings.execProfiles.set').profiles[0]).toMatchObject({ id: 'p1', name: 'Revisão rápida' });
  });

  it('Editar abre o editor: interruptor de MCP e de sessão limpa gravam', async () => {
    show();
    const p = card('Revisão');
    await userEvent.click(p.getByRole('button', { name: 'Editar' }));
    await userEvent.click(p.getByRole('switch', { name: /Restringir/ }));
    expect(lastSent('settings.execProfiles.set').profiles[0]).toMatchObject({ mcpServers: [] });
    await userEvent.click(p.getByRole('switch', { name: /Sessão limpa/ }));
    expect(lastSent('settings.execProfiles.set').profiles[0]).toMatchObject({ clean: true });
  });

  it('o seletor de modelo grava o escolhido', async () => {
    show();
    const p = card('Revisão');
    await userEvent.click(p.getByRole('button', { name: 'Editar' }));
    await choose(p.getByRole('combobox', { name: 'Modelo' }), /Sonnet/);
    expect(lastSent('settings.execProfiles.set').profiles[0]!.model).toMatch(/^claude:sonnet/);
  });

  it('apagar pede confirmação', async () => {
    show();
    await userEvent.click(card('Revisão').getByTitle('Apagar o perfil'));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));
    expect(lastSent('settings.execProfiles.set').profiles).toHaveLength(0);
  });
});
