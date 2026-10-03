import { choose, renderThemed, seedBoard } from './setup';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { Dialog } from '../../src/webview/components/Dialog';
import { Menu } from '../../src/webview/components/Menu';
import { AddInput, Button, ChipsEditor, DeleteButton, NumberField, SelectField, TextField } from '../../src/webview/components/ui';
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

  it('repassa o ref ao <button>', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>a</Button>);
    expect(ref.current).toBe(screen.getByRole('button'));
  });
});

describe('Menu', () => {
  it('abre a lista abaixo do botão, marca aria-expanded e executa o item escolhido', async () => {
    const onClick = vi.fn();
    render(<Menu items={[{ label: 'Arquivar', onClick }, 'sep', { label: 'Excluir', danger: true, onClick: () => {} }]} />);
    const trigger = screen.getByRole('button', { name: 'Mais ações' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveClass('danger');

    await userEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('SelectField', () => {
  it('chama onChange com o valor escolhido, já tipado', async () => {
    type Mode = 'a' | 'b';
    const onChange = vi.fn<(v: Mode) => void>();
    renderThemed(
      <SelectField<Mode>
        aria-label="Modo"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    await choose(screen.getByRole('combobox', { name: 'Modo' }), 'B');
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

describe('TextField', () => {
  it('não grava a cada tecla; grava ao sair do campo, só se mudou', async () => {
    const onCommit = vi.fn();
    render(<TextField value="a" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.type(input, 'bcd');
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('abcd');
  });

  it('Enter grava sem sair do campo', async () => {
    const onCommit = vi.fn();
    render(<TextField value="" onCommit={onCommit} />);
    await userEvent.type(screen.getByRole('textbox'), 'x{Enter}');
    expect(onCommit).toHaveBeenCalledWith('x');
  });

  it('grava o rascunho quando o campo some (card fechado no meio da edição)', async () => {
    const onCommit = vi.fn();
    const { unmount } = render(<TextField value="" onCommit={onCommit} />);
    await userEvent.type(screen.getByRole('textbox'), 'meio');
    unmount();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('meio');
  });

  it('valor novo de fora entra quando o campo não está em foco, mas não atropela quem digita', async () => {
    const { rerender } = render(<TextField value="a" onCommit={() => {}} />);
    const input = screen.getByRole('textbox');
    rerender(<TextField value="b" onCommit={() => {}} />);
    expect(input).toHaveValue('b');
    await userEvent.type(input, 'X');
    rerender(<TextField value="c" onCommit={() => {}} />);
    expect(input).toHaveValue('bX');
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
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));
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
