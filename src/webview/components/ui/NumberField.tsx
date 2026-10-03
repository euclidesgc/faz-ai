import type { InputHTMLAttributes } from 'react';

interface Props extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'type' | 'min' | 'max'
> {
  value: number;
  min: number;
  max: number;
  /** chamado ao sair do campo (ou Enter) só se o número mudou; já limitado a [min, max] */
  onCommit: (value: number) => void;
}

/**
 * Número que só é gravado ao sair do campo. Não controlado de propósito: a `key` ressincroniza
 * com o valor do board quando ele muda por fora, sem disputar com o que está sendo digitado.
 */
export function NumberField({ value, min, max, onCommit, ...rest }: Props) {
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    const next = Math.min(max, Math.max(min, n));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      type="number"
      key={value}
      defaultValue={value}
      min={min}
      max={max}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      {...rest}
    />
  );
}
