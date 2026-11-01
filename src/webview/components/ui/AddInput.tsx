import { useState, type ComponentProps, type ReactNode } from 'react';
import { TextField } from '@radix-ui/themes';
import { Button } from './Button';

interface Props extends Omit<ComponentProps<typeof TextField.Root>, 'value' | 'onChange' | 'onKeyDown' | 'children'> {
  /** recebe o texto já sem espaços nas pontas; devolver `false` mantém o texto no campo */
  onAdd: (text: string) => void | boolean;
  /** rótulo do botão de adicionar; sem isso, só o Enter adiciona */
  buttonLabel?: string;
  /** controles entre o campo e o botão (ex.: um seletor), para manter a ordem que a tela já tinha */
  children?: ReactNode;
  /** o item anterior ainda está indo ao host: o campo trava e o botão (ou o spinner ao lado) mostra a espera */
  loading?: boolean;
}

/** Campo "digite e aperte Enter": ignora texto vazio e limpa depois de adicionar. */
export function AddInput({ onAdd, buttonLabel, children, loading = false, ...rest }: Props) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t || loading) return;
    if (onAdd(t) !== false) setText('');
  };
  return (
    <>
      <TextField.Root
        value={text}
        disabled={loading}
        aria-busy={loading || undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        {...rest}
      >
        {loading && !buttonLabel && (
          <TextField.Slot side="right">
            <span className="spinner" aria-hidden />
          </TextField.Slot>
        )}
      </TextField.Root>
      {children}
      {buttonLabel && (
        <Button variant="primary" disabled={!text.trim()} loading={loading} onClick={add}>
          {buttonLabel}
        </Button>
      )}
    </>
  );
}
