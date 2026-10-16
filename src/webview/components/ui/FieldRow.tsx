import type { ReactNode } from 'react';

interface Props {
  label: ReactNode;
  /** texto curto ao lado do rótulo */
  hint?: ReactNode;
  /** `div` quando o conteúdo tem vários controles (chips, botões): um `label` focaria só o primeiro */
  as?: 'label' | 'div';
  /** o valor está indo ao host: spinner ao lado do rótulo e `aria-busy` na linha */
  busy?: boolean;
  children: ReactNode;
}

/** Linha "rótulo | controle" das telas de configuração e do drawer (`.field-row`). */
export function FieldRow({ label, hint, as: Tag = 'label', busy = false, children }: Props) {
  return (
    <Tag className="field-row" aria-busy={busy || undefined}>
      <span>
        {label}
        {hint && (
          <>
            {' '}
            <small className="muted">{hint}</small>
          </>
        )}
        {busy && <span className="spinner" aria-hidden />}
      </span>
      {children}
    </Tag>
  );
}
