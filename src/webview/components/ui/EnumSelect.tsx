import type { SelectHTMLAttributes } from 'react';

export interface EnumOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  options: readonly EnumOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** `<select>` de um tipo-união de strings: o valor sai tipado, sem `as` em cada uso. */
export function EnumSelect<T extends string>({ options, value, onChange, ...rest }: Props<T>) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
