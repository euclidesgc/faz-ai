import { lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '../../src/webview/components/Dialog';
import { TypesSettings } from '../../src/webview/components/settings/TypesSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
  // um tipo sem cards: é o único que pode ser apagado
  board.router.handle({
    type: 'settings.type.create',
    name: 'Sem uso',
    color: '#123456',
    defaultWorkflowId: board.router.snapshot().workflows[0]!.id,
  });
  syncStore(board.router);
});

describe('TypesSettings', () => {
  it('cada tipo tem a prévia do card com a cor e o nome; cor boa não mostra aviso', () => {
    render(<TypesSettings />);
    const t = useBoardStore.getState().state!.cardTypes[0]!;
    const preview = screen.getByLabelText(`Prévia do card do tipo ${t.name}`);
    expect(preview.querySelector('.card-bar')).toHaveTextContent(t.name);
    expect(preview.querySelector('.card-bar')).toHaveStyle({ background: t.color });
    expect(screen.queryByText('Texto difícil de ler nesta cor.')).toBeNull();
  });

  it('cor com pouco contraste mostra o aviso e as sugestões; um clique aplica a cor sugerida', async () => {
    const t = useBoardStore.getState().state!.cardTypes[0]!;
    board.router.handle({ type: 'settings.type.update', typeId: t.id, patch: { color: '#00aaaa' } });
    syncStore(board.router);
    render(<TypesSettings />);
    expect(screen.getByText('Texto difícil de ler nesta cor.')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Usar #009191'));
    expect(lastSent('settings.type.update')).toMatchObject({ typeId: t.id, patch: { color: '#009191' } });
    board.router.handle({ type: 'settings.type.update', typeId: t.id, patch: { color: t.color } });
    syncStore(board.router);
  });

  it('a cor do tipo novo também tem prévia', () => {
    render(<TypesSettings />);
    expect(screen.getByLabelText('Prévia do card do tipo Novo tipo')).toBeInTheDocument();
  });

  it('digitar o nome e apertar Enter cria o tipo com o workflow escolhido', async () => {
    render(<TypesSettings />);
    const wf = useBoardStore.getState().state!.workflows[0]!;
    await userEvent.type(screen.getByPlaceholderText('Novo tipo'), 'Bug{Enter}');
    expect(lastSent('settings.type.create')).toMatchObject({ name: 'Bug', defaultWorkflowId: wf.id });
    // o campo é limpo depois de adicionar
    expect(screen.getByPlaceholderText('Novo tipo')).toHaveValue('');
  });

  it('o botão Adicionar faz o mesmo que o Enter', async () => {
    render(<TypesSettings />);
    await userEvent.type(screen.getByPlaceholderText('Novo tipo'), 'Melhoria');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(lastSent('settings.type.create').name).toBe('Melhoria');
  });

  it('Enter com o nome vazio não envia nada', async () => {
    render(<TypesSettings />);
    await userEvent.type(screen.getByPlaceholderText('Novo tipo'), '   {Enter}');
    expect(sentOf('settings.type.create')).toHaveLength(0);
  });

  it('apagar abre o diálogo e só envia a exclusão depois de confirmar', async () => {
    render(
      <>
        <TypesSettings />
        <Dialog />
      </>,
    );
    const type = useBoardStore.getState().state!.cardTypes.find((t) => t.name === 'Sem uso')!;
    const row = screen.getByDisplayValue('Sem uso').closest('tr')!;
    await userEvent.click(within(row).getByTitle('Apagar'));
    // o diálogo pede confirmação; nada foi enviado ainda
    expect(useBoardStore.getState().dialog?.title).toBe('Apagar o tipo "Sem uso"?');
    expect(sentOf('settings.type.delete')).toHaveLength(0);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));
    expect(lastSent('settings.type.delete')).toEqual({ type: 'settings.type.delete', typeId: type.id });
    expect(useBoardStore.getState().dialog).toBeNull();
  });

  it('cancelar o diálogo não apaga', async () => {
    render(
      <>
        <TypesSettings />
        <Dialog />
      </>,
    );
    const row = screen.getByDisplayValue('Sem uso').closest('tr')!;
    await userEvent.click(within(row).getByTitle('Apagar'));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(useBoardStore.getState().dialog).toBeNull();
    expect(posted).not.toHaveBeenCalled();
  });

  it('tipo em uso tem o botão de apagar desligado', () => {
    render(<TypesSettings />);
    const story = useBoardStore
      .getState()
      .state!.cardTypes.find((t) => t.defaultWorkflowId === board.router.snapshot().workflows[0]!.id && t.name !== 'Sem uso')!;
    const row = screen.getByDisplayValue(story.name).closest('tr')!;
    expect(within(row).getByTitle('Tipo em uso')).toBeDisabled();
  });
});
