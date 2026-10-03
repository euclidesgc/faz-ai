import type { ReactNode } from 'react';
import { Button } from '../../ui';

interface Props {
  /** texto do botão principal */
  label: string;
  disabled: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  /** aviso depois dos botões (ex.: nome inválido) */
  children?: ReactNode;
}

/** Rodapé dos formulários de criação: o botão principal e o Cancelar. */
export function FormActions({ label, disabled, onSubmit, onCancel, children }: Props) {
  return (
    <div className="row">
      <Button variant="primary" disabled={disabled} onClick={onSubmit}>
        {label}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      {children}
    </div>
  );
}
