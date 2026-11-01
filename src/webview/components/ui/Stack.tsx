import type { HTMLAttributes, ReactNode } from 'react';

/** Os espaços permitidos entre irmãos, da escala de `tokens.css` (`--sp-*`). */
export type StackGap = '4' | '8' | '12' | '16' | '24';

/**
 * Coluna de itens com o espaço entre eles: é assim que o board espaça um bloco. O espaço entre irmãos vem só daqui
 * (do `gap` do pai), nunca da margem de um filho; por isso um bloco novo não fica colado nem afastado dos vizinhos.
 * `indent` recua o grupo, para os campos que dependem do interruptor logo acima.
 */
export function Stack({
  gap = '12',
  indent,
  className,
  children,
  ...rest
}: { gap?: StackGap; indent?: boolean; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['stack', `stack-${gap}`, indent ? 'stack-indent' : '', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
