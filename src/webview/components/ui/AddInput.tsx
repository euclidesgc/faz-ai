import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Button } from './Button';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onKeyDown' | 'children'> {
  /** recebe o texto já sem espaços nas pontas; devolver `false` mantém o texto no campo */
  onAdd: (text: string) => void | boolean;
  /** rótulo do botão de adicionar; sem isso, só o Enter adiciona */
  buttonLabel?: string;
  /** controles entre o campo e o botão (ex.: um seletor), para manter a ordem que a tela já tinha */
  children?: ReactNode;
}

/** Campo "digite e aperte Enter": ignora texto vazio e limpa depois de adicionar. */
export function AddInput({ onAdd, buttonLabel, children, ...rest }: Props) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (onAdd(t) !== false) setText('');
  };
  return (
    <>
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} {...rest} />
      {children}
      {buttonLabel && (
        <Button variant="primary" disabled={!text.trim()} onClick={add}>
          {buttonLabel}
        </Button>
      )}
    </>
  );
}
