import { Select } from '@radix-ui/themes';

export interface EnumOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly EnumOption<T>[];
  value: T;
  onChange: (value: T) => void;
  id?: string;
  'aria-label'?: string;
  size?: '1' | '2' | '3';
  disabled?: boolean;
  className?: string;
  title?: string;
}

/**
 * Seletor do design system (Radix Themes) de um tipo-união de strings: o valor sai tipado, sem `as` em cada uso.
 * O Select do Radix não aceita `value` vazio: quem precisa de "nenhum" usa um valor sentinela (ex.: `'__none'`).
 */
export function SelectField<T extends string>({ options, value, onChange, id, size, disabled, className, title, ...rest }: Props<T>) {
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as T)} size={size} disabled={disabled}>
      <Select.Trigger id={id} className={className} title={title} aria-label={rest['aria-label']} />
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
