import { isReadyCli } from '../../shared/aiProfiles';
import type { AiProfile, AiBase } from '../../shared/aiProfiles';
import { baseValue } from '../../shared/harness';
const AUTH_FAILURE_PATTERNS: Record<AiBase, RegExp[]> = {
  claude: [/oauth session expired/i, /failed to authenticate/i, /not logged in/i, /invalid api key/i],
  cursor: [/not authenticated/i, /please (log|sign) in/i],
  // calibrável: a CLI 2.1.1 não documenta os textos de erro de autenticação; amplie com saídas reais
  kimi: [/\b401\b/i, /unauthorized/i, /not logged in/i, /login required/i, /invalid api key/i],
};
/** Frases personalizadas são literais; não transformam uma configuração em regex executável. */
export function authFailed(profile: AiProfile, tail: readonly string[], includeNative = true): boolean {
  const output = tail.join('\n');
  return (
    (includeNative && (baseValue(AUTH_FAILURE_PATTERNS, profile.base) ?? []).some((pattern) => pattern.test(output))) ||
    (!isReadyCli(profile) &&
      (profile.config.authPatterns ?? []).some((phrase) => !!phrase.trim() && output.toLowerCase().includes(phrase.toLowerCase())))
  );
}
