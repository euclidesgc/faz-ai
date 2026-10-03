import type { ReactNode } from 'react';
import { useBoardStore, type DialogSpec } from '../../store/boardStore';
import { Button, type ButtonProps } from './Button';
import { IconTrash } from './icons';
import { t } from '../../i18n';

interface Props extends Omit<ButtonProps, 'onClick' | 'danger' | 'children'> {
  /** título do diálogo de confirmação (ex.: `Apagar o tipo "Bug"?`) */
  question: string;
  message?: string;
  /** rótulo do botão de confirmação; `Apagar` por padrão */
  confirmLabel?: string;
  choices?: DialogSpec['choices'];
  onConfirm: DialogSpec['onConfirm'];
  /** conteúdo do botão; a lixeira por padrão */
  children?: ReactNode;
}

/**
 * Botão de exclusão com a confirmação do board: abre o Dialog (`danger`) e só chama `onConfirm`
 * se a pessoa confirmar. Por padrão é o ícone da lixeira (`icon danger`); `variant`/`size` trocam o visual.
 */
export function DeleteButton({
  question,
  message,
  confirmLabel,
  choices,
  onConfirm,
  variant = 'icon',
  children = <IconTrash />,
  ...rest
}: Props) {
  const ask = useBoardStore((s) => s.ask);
  return (
    <Button
      variant={variant}
      danger
      onClick={() => ask({ title: question, message, confirmLabel: confirmLabel ?? t('Apagar'), danger: true, choices, onConfirm })}
      {...rest}
    >
      {children}
    </Button>
  );
}
