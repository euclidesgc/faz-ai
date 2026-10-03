import { Select } from '@radix-ui/themes';
import type { EnumOption } from './EnumSelect';

interface Props<T extends string> {
  options: readonly EnumOption<T>[];
  value: T;
  onChange: (value: T) => void;
  id?: string;
  'aria-label'?: string;
  size?: '1' | '2' | '3';
  disabled?: boolean;
  className?: string;
}

/**
 * Seletor do design system (Radix Themes) de um tipo-união de strings: o valor sai tipado, sem `as` em cada uso.
 * É o par de `EnumSelect` para as telas de configuração; o `<select>` nativo continua no drawer e nos filtros.
 */
export function SelectField<T extends string>({ options, value, onChange, id, size, disabled, className, ...rest }: Props<T>) {
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as T)} size={size} disabled={disabled}>
      <Select.Trigger id={id} className={className} aria-label={rest['aria-label']} />
      <Select.Content position="popper">
        {options.map((o) => (
          <Select.Item key={o.value} value={o.value}>
            {o.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
