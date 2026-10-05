import { useRef } from 'react';

/**
 * Uma lista das configurações que a tela altera e envia inteira ao board (agentes, modelos, regras).
 * Duas mudanças seguidas (sair de um campo e clicar num botão) acontecem antes de o board devolver a
 * primeira: a segunda precisa partir da última lista enviada, e não da que a tela desenhou, senão
 * desfaz a primeira. Quando a lista do board muda, ela volta a valer.
 */
export function useSentList<T>(value: T[], send: (next: T[]) => void): { current: () => T[]; save: (next: T[]) => void } {
  const latest = useRef(value);
  const seen = useRef(value);
  if (seen.current !== value) {
    seen.current = value;
    latest.current = value;
  }
  return {
    current: () => latest.current,
    save: (next) => {
      latest.current = next;
      send(next);
    },
  };
}
