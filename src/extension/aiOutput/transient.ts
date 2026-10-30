import { USAGE_LIMIT_TEXT } from '../../shared/conversation';
import { TRANSIENT_TEXT } from '../../shared/failureClass';

// Os padrões de falha passageira vivem em `shared/failureClass.ts` (o fallback do tail do gateway os
// usa lá); os leitores os usam por aqui, para que uma CLI nova só dependa deste módulo.
export { TRANSIENT_TEXT };

/**
 * O texto descreve uma falha passageira (rede, 5xx/529, sobrecarga, rate limit curto)? O limite de
 * uso do plano tem precedência e nunca é transitório: continua `usageLimitReached`.
 */
export function isTransientText(text: string | null | undefined): boolean {
  if (!text) return false;
  return !USAGE_LIMIT_TEXT.test(text) && TRANSIENT_TEXT.test(text);
}

/** O status HTTP é 5xx ou 529 (sobrecarga)? */
export function isTransientStatus(status: number | null | undefined): boolean {
  return typeof status === 'number' && status >= 500 && status <= 599;
}
