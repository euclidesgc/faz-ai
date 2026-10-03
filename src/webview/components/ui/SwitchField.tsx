import type { ReactNode } from 'react';
import { Switch, Text } from '@radix-ui/themes';

/** Interruptor do design system (Radix Themes) com o rótulo ao lado: clicar no texto também liga e desliga. */
export function SwitchField({
  label,
  checked,
  onChange,
  title,
  disabled,
}: {
  label?: ReactNode;
  checked: boolean;
  onChange: (on: boolean) => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <Text as="label" size="2" className="switch-row" title={title}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={typeof label === 'string' ? label : title} />
      {label}
    </Text>
  );
}
