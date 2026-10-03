import { useId, type ReactNode } from 'react';
import { Text } from '@radix-ui/themes';

/**
 * Campo de formulário: rótulo acima, controle e uma linha de ajuda abaixo. `children` recebe o `id`
 * para o rótulo apontar para o controle (clicar no rótulo foca o campo; leitor de tela lê o nome).
 */
export function FormField({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="form-field">
      <Text as="label" htmlFor={id} size="1" weight="medium" className="form-field-label">
        {label}
      </Text>
      {children(id)}
      {hint && (
        <Text as="p" size="1" color="gray" className="form-field-hint">
          {hint}
        </Text>
      )}
    </div>
  );
}
