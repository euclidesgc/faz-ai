import type { ReactNode } from 'react';
import { Switch, Text } from '@radix-ui/themes';

/**
 * Interruptor do design system (Radix Themes) com o rótulo ao lado: clicar no texto também liga e desliga. A
 * explicação vai em `hint`, abaixo, no mesmo bloco (como no `FormField`): nunca num texto solto depois do interruptor.
 */
export function SwitchField({
  label,
  hint,
  checked,
  onChange,
  title,
  disabled,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (on: boolean) => void;
  title?: string;
  disabled?: boolean;
}) {
  const row = (
    <Text as="label" size="2" className="switch-row" title={title}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={typeof label === 'string' ? label : title} />
      {label}
    </Text>
  );
  if (!hint) return row;
  return (
    <div className="form-field">
      {row}
      <Text as="p" size="1" color="gray" className="form-field-hint">
        {hint}
      </Text>
    </div>
  );
}
