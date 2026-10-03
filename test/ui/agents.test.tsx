import { choose, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Dialog } from '../../src/webview/components/Dialog';
import { defaultAgent } from '../../src/shared/execution';
import { AgentsSettings } from '../../src/webview/components/settings/AgentsSettings';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  syncStore(board.router);
  // parte sempre de um agente só, para os testes não dependerem da ordem
  board.router.handle({
    type: 'settings.execProfiles.set',
    profiles: [
      {
        id: 'p1',
        name: 'Revisão',
        purpose: '',
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
      <AgentsSettings />
      <Dialog />
    </Theme>,
  );
const card = (name: string) => within(screen.getByLabelText(`Agente ${name}`));

describe('AgentsSettings', () => {
  it('Novo agente fica no topo e cria e abre um agente novo', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo agente' }));
    const sent = lastSent('settings.execProfiles.set').profiles;
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ name: 'Agente 2', purpose: '', isDefault: false });
  });

  it('a página explica o que é um agente e onde ele vale', () => {
    show();
    expect(screen.getByText(/Toda execução pelo board .* roda através de um agente/)).toBeInTheDocument();
  });

  it('o nome é uma caixa de texto e grava ao sair', async () => {
    show();
    const name = card('Revisão').getByLabelText('Nome do agente');
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

  it('a intenção grava ao sair e aparece no resumo do agente', async () => {
    show();
    const p = card('Revisão');
    await userEvent.click(p.getByRole('button', { name: 'Editar' }));
    await userEvent.type(p.getByLabelText('O que este agente faz'), 'revisa a spec e aponta lacunas');
    await userEvent.tab();
    expect(lastSent('settings.execProfiles.set').profiles[0]).toMatchObject({ purpose: 'revisa a spec e aponta lacunas' });
  });

  it('conjuntos de ferramentas prontos preenchem a lista; Liberar o padrão a esvazia', async () => {
    show();
    const p = card('Revisão');
    await userEvent.click(p.getByRole('button', { name: 'Editar' }));
    await userEvent.click(p.getByRole('button', { name: 'Só leitura' }));
    expect(lastSent('settings.execProfiles.set').profiles[0]!.tools).toEqual(['Read', 'Grep', 'Glob']);
    await userEvent.click(p.getByRole('button', { name: 'Editar código' }));
    expect(lastSent('settings.execProfiles.set').profiles[0]!.tools).toContain('Edit');
    await userEvent.click(p.getByRole('button', { name: 'Liberar o padrão' }));
    expect(lastSent('settings.execProfiles.set').profiles[0]!.tools).toEqual([]);
  });

  it('as skills do agente são escolhidas na janela, não em chips', async () => {
    show();
    const p = card('Revisão');
    await userEvent.click(p.getByRole('button', { name: 'Editar' }));
    expect(p.getByText('Nenhuma skill.')).toBeInTheDocument();
    await userEvent.click(p.getByRole('button', { name: /Escolher skills/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Skills de Revisão');
  });

  it('o seletor de modelo grava o escolhido', async () => {
    show();
    const p = card('Revisão');
    await userEvent.click(p.getByRole('button', { name: 'Editar' }));
    await choose(p.getByRole('combobox', { name: 'Modelo' }), /Sonnet/);
    expect(lastSent('settings.execProfiles.set').profiles[0]!.model).toMatch(/^claude:sonnet/);
  });

  it('o último agente não pode ser apagado: toda execução precisa de um', () => {
    show();
    expect(card('Revisão').getByTitle('Precisa haver ao menos um agente')).toBeDisabled();
  });

  it('apagar o padrão pede confirmação e passa o posto ao que sobra', async () => {
    board.router.handle({
      type: 'settings.execProfiles.set',
      profiles: [
        { ...defaultAgent(), id: 'p1', name: 'Revisão' },
        { ...defaultAgent(), id: 'p2', name: 'Outro', isDefault: false },
      ],
    });
    syncStore(board.router);
    show();
    await userEvent.click(card('Revisão').getByTitle('Apagar o agente'));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));
    expect(lastSent('settings.execProfiles.set').profiles).toMatchObject([{ id: 'p2', isDefault: true }]);
  });
});
