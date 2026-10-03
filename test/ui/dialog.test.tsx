import { seedBoard } from './setup';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '../../src/webview/components/Dialog';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeAll(async () => {
  await seedBoard();
});

describe('Dialog', () => {
  it('não aparece sem pedido na store', () => {
    render(<Dialog />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape fecha sem confirmar', async () => {
    const onConfirm = vi.fn();
    render(<Dialog />);
    useBoardStore.getState().ask({ title: 'Tem certeza?', onConfirm });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('o botão de confirmação chama onConfirm e fecha', async () => {
    const onConfirm = vi.fn();
    render(<Dialog />);
    useBoardStore.getState().ask({ title: 'Tem certeza?', confirmLabel: 'Sim', onConfirm });
    await userEvent.click(await screen.findByRole('button', { name: 'Sim' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(undefined);
    expect(useBoardStore.getState().dialog).toBeNull();
  });

  it('com opções, confirma passando a escolha feita', async () => {
    const onConfirm = vi.fn();
    render(<Dialog />);
    useBoardStore.getState().ask({
      title: 'Mover para onde?',
      choices: {
        label: 'Coluna',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      onConfirm,
    });
    await userEvent.selectOptions(await screen.findByLabelText('Coluna'), 'b');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledWith('b');
  });

  it('a ação secundária fecha e chama o próprio onClick, não o onConfirm', async () => {
    const onConfirm = vi.fn();
    const onClick = vi.fn();
    render(<Dialog />);
    useBoardStore.getState().ask({ title: 'Salvar?', onConfirm, secondary: { label: 'Descartar', onClick } });
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(useBoardStore.getState().dialog).toBeNull();
  });
});
