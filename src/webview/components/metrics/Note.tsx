import type { ComponentProps } from 'react';
import { IconInfo } from '../ui';

/**
 * O aviso de honestidade do painel ("ainda não medido", "parte estimada", "detalhe só desde…"). É
 * pequeno de propósito: fica **junto** do número ou do gráfico que qualifica (RF-22), não num rodapé.
 * O texto vem de quem usa, já traduzido. Para ligar ao número, passe um `id` e aponte
 * `aria-describedby` do número para ele.
 */
export function Note({ className, children, ...rest }: ComponentProps<'p'>) {
  return (
    <p className={className ? `metrics-note ${className}` : 'metrics-note'} {...rest}>
      <IconInfo />
      <span>{children}</span>
    </p>
  );
}
