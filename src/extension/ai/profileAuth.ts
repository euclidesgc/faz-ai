import { isGeminiCli, isReadyCli } from '../../shared/aiProfiles';
import type { AiProfile, AiBase } from '../../shared/aiProfiles';
import { baseValue } from '../../shared/harness';
const AUTH_FAILURE_PATTERNS: Record<AiBase, RegExp[]> = {
  claude: [/oauth session expired/i, /failed to authenticate/i, /not logged in/i, /invalid api key/i],
  cursor: [/not authenticated/i, /please (log|sign) in/i],
  // calibrável: a CLI 2.1.1 não documenta os textos de erro de autenticação; amplie com saídas reais
  kimi: [/\b401\b/i, /unauthorized/i, /not logged in/i, /login required/i, /invalid api key/i],
};
/**
 * O Gemini pela CLI (fora de `AiBase`): a chave recusada pela API, como a 0.65.0 escreve no `result` e no
 * `stderr` (test/fixtures/gemini-stream-json-auth.jsonl). Só no modo CLI: no ACP a recusa volta pelo protocolo
 * (`auth_required`), e a classificação do limite de uso nos três modos é a história 12.
 */
const GEMINI_CLI_AUTH_FAILURE: RegExp[] = [/API_KEY_INVALID/, /API key not valid/i, /API key expired/i];
/** Frases personalizadas são literais; não transformam uma configuração em regex executável. */
export function authFailed(profile: AiProfile, tail: readonly string[], includeNative = true): boolean {
  const output = tail.join('\n');
  const native = [...(baseValue(AUTH_FAILURE_PATTERNS, profile.base) ?? []), ...(isGeminiCli(profile) ? GEMINI_CLI_AUTH_FAILURE : [])];
  return (
    (includeNative && native.some((pattern) => pattern.test(output))) ||
    (!isReadyCli(profile) &&
      (profile.config.authPatterns ?? []).some((phrase) => !!phrase.trim() && output.toLowerCase().includes(phrase.toLowerCase())))
  );
}
