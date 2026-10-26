import type { HTMLAttributes, ReactNode } from 'react';
import { IconChevronRight } from './icons';

/**
 * Título de um bloco recolhível (`<details>`): a seta do board, que gira ao abrir, no lugar do triângulo de cada
 * navegador. Todo `<details>` usa este título, para todos abrirem e se parecerem do mesmo jeito.
 */
export function Summary({ className, children, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <summary className={['disclosure', className].filter(Boolean).join(' ')} {...rest}>
      <IconChevronRight className="disclosure-icon" />
      {children}
    </summary>
  );
}
