import type { ReactNode } from 'react';

interface Props {
  label: ReactNode;
  /** texto curto ao lado do rótulo */
  hint?: ReactNode;
  /** `div` quando o conteúdo tem vários controles (chips, botões): um `label` focaria só o primeiro */
  as?: 'label' | 'div';
  children: ReactNode;
}

/** Linha "rótulo | controle" das telas de configuração e do drawer (`.field-row`). */
export function FieldRow({ label, hint, as: Tag = 'label', children }: Props) {
  return (
    <Tag className="field-row">
      <span>
        {label}
        {hint && (
          <>
            {' '}
            <small className="muted">{hint}</small>
          </>
        )}
      </span>
      {children}
    </Tag>
  );
}
