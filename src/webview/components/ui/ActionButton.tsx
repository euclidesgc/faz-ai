import { forwardRef, type ReactNode } from 'react';
import { Button, IconButton, type ButtonProps, type IconButtonProps } from '@radix-ui/themes';
import { Hint } from './Hint';

interface Extra {
  /** o que o clique faz, numa frase; aparece no hover e no foco (não é o `title` nativo, que não abre pelo teclado) */
  hint: ReactNode;
  /** por que está desabilitado; mostrado no lugar do hint enquanto `disabled` */
  disabledReason?: string | null;
}

export type ActionButtonProps = ButtonProps & Extra;

/**
 * Botão de ação de uma toolbar das Configurações: o `Button` do Radix com um hint obrigatório que diz o que ele
 * faz, e tamanho 2 por padrão (o 1 fica para as ações de linha). Ver DESIGN.md, "Componentes".
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { hint, disabledReason, size = '2', disabled, loading, ...rest },
  ref,
) {
  // com `disabledReason` o wrapper do Hint existe sempre; o motivo só aparece enquanto está desabilitado
  const reason = disabledReason === undefined ? undefined : disabled && !loading ? disabledReason : null;
  return (
    <Hint content={hint} disabledReason={reason}>
      <Button ref={ref} size={size} disabled={disabled} loading={loading} {...rest} />
    </Hint>
  );
});

export type ActionIconButtonProps = IconButtonProps & Extra & { 'aria-label': string };

/** Botão só com ícone de uma toolbar ou de uma linha: exige `aria-label` (o nome acessível) e o hint. */
export const ActionIconButton = forwardRef<HTMLButtonElement, ActionIconButtonProps>(function ActionIconButton(
  { hint, disabledReason, disabled, loading, ...rest },
  ref,
) {
  const reason = disabledReason === undefined ? undefined : disabled && !loading ? disabledReason : null;
  return (
    <Hint content={hint} disabledReason={reason}>
      <IconButton ref={ref} disabled={disabled} loading={loading} {...rest} />
    </Hint>
  );
});
