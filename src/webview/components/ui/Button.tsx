import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `secondary` é o botão padrão do CSS (sem classe). */
  variant?: ButtonVariant;
  size?: 'small';
  /** compõe `danger` com outra variante (`icon danger`, `ghost small danger`) */
  danger?: boolean;
  /** estado ligado de um botão de alternância (`ghost on`, `segmented on`) */
  on?: boolean;
  /** aba ou item selecionado (`tabs`, `tabs-vertical`, `topbar nav`) */
  active?: boolean;
}

/**
 * Botão com as classes que o styles.css já conhece: nenhuma classe nova é inventada aqui,
 * só a montagem de `primary`, `ghost`, `icon`, `danger`, `small`, `on` e `active`. Repassa o `ref`
 * (o Menu mede o botão para posicionar a lista).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size, danger, on, active, className, ...rest },
  ref,
) {
  const classes = [variant === 'secondary' ? '' : variant, size, danger && 'danger', on && 'on', active && 'active', className]
    .filter(Boolean)
    .join(' ');
  return <button ref={ref} className={classes || undefined} {...rest} />;
});
