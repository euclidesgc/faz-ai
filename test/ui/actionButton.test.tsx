import { renderThemed } from './setup';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import userEvent from '@testing-library/user-event';
import { ActionButton, ActionIconButton, IconTrash } from '../../src/webview/components/ui';

// Botão de ação de toolbar: o hint abre no hover e no foco pelo teclado; desabilitado, mostra o motivo no lugar.

describe('ActionButton', () => {
  it('abre o hint no hover e no foco pelo teclado, e tem tamanho 2 por padrão', async () => {
    renderThemed(<ActionButton hint="Relê as pastas e atualiza o catálogo.">Reler pastas</ActionButton>);
    const button = screen.getByRole('button', { name: 'Reler pastas' });
    expect(button.className).toContain('rt-r-size-2');
    await userEvent.hover(button);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Relê as pastas e atualiza o catálogo.');
    await userEvent.unhover(button);
    await userEvent.tab();
    expect(button).toHaveFocus();
    expect((await screen.findByRole('tooltip')).textContent).toBe('Relê as pastas e atualiza o catálogo.');
  });

  it('desabilitado com motivo, o hint diz o motivo e continua acessível; habilitado de novo, o botão é o mesmo', async () => {
    const { rerender } = renderThemed(
      <ActionButton hint="Pede sugestões à IA." disabled disabledReason="A IA ainda está respondendo.">
        Sugerir
      </ActionButton>,
    );
    const button = screen.getByRole('button', { name: 'Sugerir' });
    expect(button).toBeDisabled();
    await userEvent.tab();
    expect((await screen.findByRole('tooltip')).textContent).toBe('A IA ainda está respondendo.');
    rerender(
      <Theme>
        <ActionButton hint="Pede sugestões à IA." disabledReason="A IA ainda está respondendo.">
          Sugerir
        </ActionButton>
      </Theme>,
    );
    // o mesmo elemento continua na tela (nada remontou) e volta a dizer o que faz
    expect(screen.getByRole('button', { name: 'Sugerir' })).toBe(button);
    expect(button).toBeEnabled();
    await userEvent.hover(button);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Pede sugestões à IA.');
  });

  it('em espera, fica desabilitado sem mostrar o motivo de desabilitado', async () => {
    renderThemed(
      <ActionButton hint="Procura skills." loading disabledReason="Informe a origem.">
        Procurar
      </ActionButton>,
    );
    const button = screen.getByRole('button', { name: 'Procurar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-disabled');
  });

  it('o botão só com ícone exige o nome acessível e também abre o hint', async () => {
    renderThemed(
      <ActionIconButton aria-label="Apagar" hint="Pede confirmação e apaga o arquivo.">
        <IconTrash />
      </ActionIconButton>,
    );
    const button = screen.getByRole('button', { name: 'Apagar' });
    await userEvent.hover(button);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Pede confirmação e apaga o arquivo.');
  });
});
