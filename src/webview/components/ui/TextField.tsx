import { useEffect, useRef, type ComponentProps } from 'react';
import { TextField as RxTextField } from '@radix-ui/themes';

interface Props extends Omit<ComponentProps<typeof RxTextField.Root>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'> {
  value: string;
  /** chamado ao sair do campo, com Enter ou quando o campo some (card fechado), só se o texto mudou */
  onCommit: (value: string) => void;
}

/**
 * Campo de texto que só grava ao terminar a edição. Não é controlado pelo valor do board de
 * propósito: com cada tecla indo ao host e voltando, uma resposta atrasada apagava as letras
 * digitadas depois dela. O valor de fora só entra no campo quando ele não está em foco.
 */
export function TextField({ value, onCommit, onKeyDown, ...rest }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const draft = useRef(value);
  const saved = useRef(value);
  const commitRef = useRef(onCommit);

  const commit = () => {
    if (draft.current === saved.current) return;
    saved.current = draft.current;
    commitRef.current(draft.current);
  };

  useEffect(() => {
    commitRef.current = onCommit;
  });

  // mudou por fora (outra tela, a IA): atualiza, a não ser que a pessoa esteja digitando
  useEffect(() => {
    const el = input.current;
    if (!el || document.activeElement === el) return;
    el.value = value;
    draft.current = value;
    saved.current = value;
  }, [value]);

  // o card fechou (Esc, outro card) com o texto em edição: grava o que ficou
  useEffect(() => () => commit(), []);

  return (
    <RxTextField.Root
      ref={input}
      defaultValue={value}
      onChange={(e) => (draft.current = e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        onKeyDown?.(e);
      }}
      {...rest}
    />
  );
}
