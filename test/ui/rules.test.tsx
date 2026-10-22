import { lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { RulesSettings } from '../../src/webview/components/settings/RulesSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { DEFAULT_RULES } from '../../src/shared/rules';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const show = () =>
  render(
    <Theme>
      <RulesSettings />
    </Theme>,
  );
const rule = (title: string) => screen.getByLabelText(title);
const rules = () => useBoardStore.getState().state!.board.rules;

describe('RulesSettings', () => {
  it('cada regra é um cartão com o selo Ativa/Desligada e o "Quando / Então"', () => {
    show();
    const card = rule('Concluir história com sub-tarefas em aberto');
    expect(within(card).getByText(rules().blockDoneWithOpenChildren ? 'Ativa' : 'Desligada')).toBeInTheDocument();
    expect(within(card).getByText('Quando')).toBeInTheDocument();
    expect(within(card).getByText('Então')).toBeInTheDocument();
  });

  it('o interruptor grava a regra e o selo acompanha', async () => {
    show();
    const card = rule('Concluir história com sub-tarefas em aberto');
    await userEvent.click(within(card).getByRole('switch'));
    expect(lastSent('settings.rules.update')).toEqual({
      type: 'settings.rules.update',
      patch: { blockDoneWithOpenChildren: !DEFAULT_RULES.blockDoneWithOpenChildren },
    });
  });

  it('Trilha curta: o cartão nasce desligado, o interruptor liga a regra e o selo acompanha', async () => {
    show();
    const card = rule('Trilha curta para histórias pequenas');
    expect(rules().shortTrack).toBe(false);
    expect(within(card).getByText('Desligada')).toBeInTheDocument();
    expect(within(card).getByText(/seguir coluna a coluna/)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('switch', { name: 'Ligar' }));
    expect(lastSent('settings.rules.update')).toEqual({ type: 'settings.rules.update', patch: { shortTrack: true } });
  });

  it('Trilha curta ligada no board: o selo diz Ativa e o "Então" explica o pulo', () => {
    board.router.handle({ type: 'settings.rules.update', patch: { shortTrack: true } });
    syncStore(board.router);
    show();
    const card = rule('Trilha curta para histórias pequenas');
    expect(within(card).getByText('Ativa')).toBeInTheDocument();
    expect(within(card).getByText(/direto ao Plan/)).toBeInTheDocument();
    board.router.handle({ type: 'settings.rules.update', patch: { shortTrack: false } });
  });

  it('o seletor da regra grava a opção escolhida', async () => {
    show();
    await userEvent.click(screen.getByRole('combobox', { name: 'Ao excluir um card' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Nunca perguntar' }));
    expect(lastSent('settings.rules.update')).toEqual({ type: 'settings.rules.update', patch: { confirmTrash: 'never' } });
  });

  it('Restaurar regras padrão fica desligado enquanto nada mudou', () => {
    show();
    expect(screen.getByRole('button', { name: 'Restaurar regras padrão' })).toBeDisabled();
    expect(sentOf('settings.rules.update')).toHaveLength(0);
  });
});

describe('RulesSettings: sem o aviso sobre a aba Modelos', () => {
  it('não mostra o aviso nem o botão "Abrir em Modelos", e a opção não aparece aqui', () => {
    show();
    expect(screen.queryByText(/mudou para a aba Modelos/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir em Modelos' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Preencher o modelo sugerido automaticamente' })).toBeNull();
  });
});
