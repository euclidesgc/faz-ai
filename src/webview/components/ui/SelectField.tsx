import type { ReactNode } from 'react';
import { Select } from '@radix-ui/themes';

export interface EnumOption<T extends string> {
  value: T;
  label: string;
}

/** Uma opção do seletor: o rótulo pode levar um logo ou outro elemento, não só texto. */
export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface Props<T extends string> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  id?: string;
  'aria-label'?: string;
  size?: '1' | '2' | '3';
  disabled?: boolean;
  className?: string;
  title?: string;
  /**
   * Largura fixa, a da opção mais longa: trocar o valor não muda o tamanho do seletor nem faz o texto ao
   * lado quebrar de outro jeito. Para seletores em linhas de lista, ao lado de texto que se ajusta.
   */
  steady?: boolean;
}

/**
 * Seletor do design system (Radix Themes) de um tipo-união de strings: o valor sai tipado, sem `as` em cada uso.
 * O Select do Radix não aceita `value` vazio: quem precisa de "nenhum" usa um valor sentinela (ex.: `'__none'`).
 */
export function SelectField<T extends string>({
  options,
  value,
  onChange,
  id,
  size,
  disabled,
  className,
  title,
  steady,
  ...rest
}: Props<T>) {
  // o rótulo mais longo fica atrás do escolhido, invisível (no CSS, por `data-longest`), e dá a largura
  const longest = options.reduce((a, o) => (typeof o.label === 'string' && o.label.length > a.length ? o.label : a), '');
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as T)} size={size} disabled={disabled}>
      <Select.Trigger id={id} className={className} title={title} aria-label={rest['aria-label']}>
        {steady ? (
          <span className="select-steady" data-longest={longest}>
            <span>{options.find((o) => o.value === value)?.label}</span>
          </span>
        ) : undefined}
      </Select.Trigger>
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
