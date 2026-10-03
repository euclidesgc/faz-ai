import { lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { FieldsSettings } from '../../src/webview/components/settings/FieldsSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const show = () =>
  render(
    <Theme>
      <FieldsSettings />
    </Theme>,
  );
const fieldNamed = (name: string) => useBoardStore.getState().state!.fieldDefs.find((f) => f.name === name)!;
const cardOf = (name: string) => screen.getByLabelText(`Campo ${name}`);

describe('FieldsSettings', () => {
  it('cada campo mostra o nome numa caixa de texto, o tipo com a explicação e a prévia no board', () => {
    show();
    const tags = cardOf('Tags');
    expect(within(tags).getByLabelText('Nome')).toHaveValue('Tags');
    expect(within(tags).getByText('Múltipla seleção')).toBeInTheDocument();
    expect(within(tags).getByText('Várias opções de uma lista que você define, como tags.')).toBeInTheDocument();
    expect(within(tags).getByLabelText('Prévia no card')).toHaveTextContent('frontend');
  });

  it('renomear grava ao sair do campo', async () => {
    show();
    const name = within(cardOf('Tags')).getByLabelText('Nome');
    await userEvent.clear(name);
    await userEvent.type(name, 'Áreas');
    expect(sentOf('settings.field.update')).toHaveLength(0);
    await userEvent.tab();
    expect(lastSent('settings.field.update')).toEqual({
      type: 'settings.field.update',
      fieldId: fieldNamed('Tags').id,
      patch: { name: 'Áreas' },
    });
  });

  it('trocar como aparece no board grava a exibição', async () => {
    show();
    await userEvent.click(within(cardOf('Tags')).getByRole('radio', { name: 'Nome: valor' }));
    expect(lastSent('settings.field.update').patch).toEqual({ display: 'inline' });
  });

  it('opções: Enter inclui, o X tira', async () => {
    show();
    const tags = cardOf('Tags');
    await userEvent.type(within(tags).getByPlaceholderText('Nova opção'), 'mobile{Enter}');
    expect(lastSent('settings.field.update').patch).toEqual({ options: [...fieldNamed('Tags').options, 'mobile'] });
    await userEvent.click(within(tags).getByRole('button', { name: 'Tirar a opção docs' }));
    expect(lastSent('settings.field.update').patch).toEqual({ options: fieldNamed('Tags').options.filter((o) => o !== 'docs') });
  });

  it('desligar "Todos os tipos" marca todos, e desmarcar um grava a lista', async () => {
    show();
    const tags = cardOf('Tags');
    await userEvent.click(within(tags).getByRole('switch'));
    const types = useBoardStore.getState().state!.cardTypes;
    expect(lastSent('settings.field.update').patch).toEqual({ appliesToTypes: types.map((t) => t.id) });
  });

  it('as opções do campo Skills vêm do projeto e não são editadas aqui', () => {
    show();
    expect(within(cardOf('Skills')).queryByPlaceholderText('Nova opção')).toBeNull();
  });

  it('Novo campo abre o rascunho no topo; escolher o tipo mostra a explicação e Criar envia', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    const draft = screen.getByLabelText('Campo novo');
    expect(screen.getByRole('button', { name: 'Novo campo' })).toBeDisabled();
    const name = within(draft).getByLabelText('Nome');
    expect(name).toHaveFocus();
    await userEvent.type(name, 'Prazo');
    await userEvent.click(within(draft).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Data' }));
    expect(within(draft).getByText(/Uma data, como um prazo\./)).toBeInTheDocument();
    await userEvent.click(within(draft).getByRole('button', { name: 'Criar campo' }));
    expect(lastSent('settings.field.create')).toMatchObject({
      name: 'Prazo',
      kind: 'date',
      display: 'badge',
      options: [],
      appliesToTypes: null,
    });
    expect(screen.queryByLabelText('Campo novo')).toBeNull();
  });

  it('campo de seleção só pode ser criado com ao menos uma opção', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    const draft = screen.getByLabelText('Campo novo');
    await userEvent.type(within(draft).getByLabelText('Nome'), 'Prioridade');
    await userEvent.click(within(draft).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Seleção' }));
    expect(within(draft).getByRole('button', { name: 'Criar campo' })).toBeDisabled();
    await userEvent.type(within(draft).getByPlaceholderText('Nova opção'), 'Alta{Enter}');
    await userEvent.click(within(draft).getByRole('button', { name: 'Criar campo' }));
    expect(lastSent('settings.field.create')).toMatchObject({ name: 'Prioridade', kind: 'select', options: ['Alta'] });
  });

  it('Esc no nome e Cancelar descartam o rascunho sem criar', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    await userEvent.type(within(screen.getByLabelText('Campo novo')).getByLabelText('Nome'), 'x{Escape}');
    expect(screen.queryByLabelText('Campo novo')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(sentOf('settings.field.create')).toHaveLength(0);
  });
});
