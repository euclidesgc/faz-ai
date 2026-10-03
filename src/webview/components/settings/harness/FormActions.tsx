import type { ReactNode } from 'react';
import { Button } from '@radix-ui/themes';
import { t } from '../../../i18n';

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
    <div className="form-actions">
      <Button variant="soft" color="gray" onClick={onCancel}>
        {t('Cancelar')}
      </Button>
      <Button disabled={disabled} onClick={onSubmit}>
        {label}
      </Button>
      {children}
    </div>
  );
}
