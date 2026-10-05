/**
 * Linhas que a CLI de IA escreve e que não explicam nada à pessoa: hoje, os avisos do Claude Code
 * sobre regras de permissão das configurações dele (`Permission allow rule (…) …`). Elas continuam
 * no canal de log do editor, para quem depura; só saem do que a pessoa lê no chat e na falha do card.
 */

/**
 * Um aviso de regra de permissão, com ou sem marca na frente ("Warning:", "[warn]", o sinal de
 * atenção) e com ou sem espaços. O `\u26a0` é o sinal de atenção escrito por código.
 */
const PERMISSION_RULE = /^\s*(?:(?:\u26a0\ufe0f?|warning:|warn:|\[warn(?:ing)?\])\s*)*permission (?:allow|deny|ask) rules?\b/i;

/** A linha é um aviso de configuração da CLI que não deve chegar à pessoa. */
export function isCliNoise(line: string): boolean {
  return PERMISSION_RULE.test(line);
}
