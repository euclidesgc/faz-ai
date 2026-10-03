import { seedBoard } from './setup';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '../../src/webview/components/Dialog';
import { AddInput, Button, ChipsEditor, DeleteButton, EnumSelect, NumberField } from '../../src/webview/components/ui';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeAll(async () => {
  await seedBoard();
});

describe('Button', () => {
  it('monta as classes que o CSS espera, por variante e modificador', () => {
    const { rerender } = render(<Button variant="primary">a</Button>);
    expect(screen.getByRole('button')).toHaveClass('primary');

    rerender(
      <Button variant="ghost" size="small" danger>
        a
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveClass('ghost', 'small', 'danger');

    rerender(
      <Button variant="icon" className="collapse-toggle" on active>
        a
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveClass('icon', 'collapse-toggle', 'on', 'active');
  });

  it('o botão padrão (secondary) sai sem atributo class', () => {
    render(<Button>a</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('class');
  });
});

describe('EnumSelect', () => {
  it('chama onChange com o valor escolhido', async () => {
    type Mode = 'a' | 'b';
    const onChange = vi.fn<(v: Mode) => void>();
    render(
      <EnumSelect<Mode>
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('ChipsEditor', () => {
  it('clicar num chip desligado liga e devolve a lista com ele no fim', async () => {
    const onChange = vi.fn();
    render(<ChipsEditor options={['x', 'y']} values={['x']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'x' })).toHaveClass('on');
    await userEvent.click(screen.getByRole('button', { name: 'y' }));
    expect(onChange).toHaveBeenCalledWith(['x', 'y']);
  });

  it('clicar num chip ligado tira ele da lista', async () => {
    const onChange = vi.fn();
    render(<ChipsEditor options={[{ value: 'x', label: 'Xis' }, 'y']} values={['x', 'y']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xis' }));
    expect(onChange).toHaveBeenCalledWith(['y']);
  });
});

describe('AddInput', () => {
  it('Enter chama onAdd com o texto sem espaços e limpa o campo', async () => {
    const onAdd = vi.fn();
    render(<AddInput placeholder="Novo" onAdd={onAdd} />);
    await userEvent.type(screen.getByPlaceholderText('Novo'), '  item {Enter}');
    expect(onAdd).toHaveBeenCalledWith('item');
    expect(screen.getByPlaceholderText('Novo')).toHaveValue('');
  });

  it('texto vazio não chama onAdd', async () => {
    const onAdd = vi.fn();
    render(<AddInput placeholder="Novo" onAdd={onAdd} />);
    await userEvent.type(screen.getByPlaceholderText('Novo'), '   {Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('o botão faz o mesmo que o Enter e fica desligado sem texto', async () => {
    const onAdd = vi.fn();
    render(<AddInput placeholder="Novo" onAdd={onAdd} buttonLabel="Adicionar" />);
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('Novo'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(onAdd).toHaveBeenCalledWith('x');
  });

  it('se onAdd devolver false, o texto fica no campo', async () => {
    render(<AddInput placeholder="Novo" onAdd={() => false} />);
    await userEvent.type(screen.getByPlaceholderText('Novo'), 'x{Enter}');
    expect(screen.getByPlaceholderText('Novo')).toHaveValue('x');
  });
});

describe('NumberField', () => {
  it('só comete ao sair do campo, e só se o valor mudou', async () => {
    const onCommit = vi.fn();
    render(<NumberField value={30} min={1} max={60} onCommit={onCommit} />);
    const input = screen.getByRole('spinbutton');
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, '45');
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(45);
  });

  it('Enter comete como o blur', async () => {
    const onCommit = vi.fn();
    render(<NumberField value={30} min={1} max={60} onCommit={onCommit} />);
    const input = screen.getByRole('spinbutton');
    await userEvent.clear(input);
    await userEvent.type(input, '12{Enter}');
    expect(onCommit).toHaveBeenCalledWith(12);
  });

  it('limita ao intervalo e expõe min/max no input', async () => {
    const onCommit = vi.fn();
    render(<NumberField value={30} min={1} max={60} onCommit={onCommit} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '60');
    await userEvent.clear(input);
    await userEvent.type(input, '999');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(60);
  });
});

describe('DeleteButton', () => {
  it('abre o Dialog e só chama onConfirm ao confirmar', async () => {
    const onConfirm = vi.fn();
    render(
      <>
        <DeleteButton title="Apagar" question="Apagar isto?" onConfirm={onConfirm} />
        <Dialog />
      </>,
    );
    const btn = screen.getByTitle('Apagar');
    expect(btn).toHaveClass('icon', 'danger');
    await userEvent.click(btn);
    expect(useBoardStore.getState().dialog).toMatchObject({ title: 'Apagar isto?', confirmLabel: 'Apagar', danger: true });
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(useBoardStore.getState().dialog).toBeNull();
  });

  it('cancelar fecha sem chamar onConfirm', async () => {
    const onConfirm = vi.fn();
    render(
      <>
        <DeleteButton variant="ghost" question="Apagar isto?" confirmLabel="Remover" onConfirm={onConfirm}>
          Apagar de vez
        </DeleteButton>
        <Dialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Apagar de vez' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(useBoardStore.getState().dialog).toBeNull();
  });
});
