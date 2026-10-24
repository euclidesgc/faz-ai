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
 * O Gemini pela CLI e pelo ACP (fora de `AiBase`): a chave recusada pela API, como a 0.65.0 escreve no `result` e
 * no `stderr` (test/fixtures/gemini-stream-json-auth.jsonl). No ACP a recusa não volta como `auth_required`: o
 * `authenticate` aceita qualquer chave, e o `session/prompt` falha com o erro 400 da API (`API_KEY_INVALID`) no
 * texto, visto no teste real com o rastreio do board. A classificação do limite de uso nos três modos é a história 12.
 */
const GEMINI_AUTH_FAILURE: RegExp[] = [/API_KEY_INVALID/, /API key not valid/i, /API key expired/i];
const isGeminiAgent = (profile: AiProfile): boolean => isGeminiCli(profile) || (profile.tool === 'gemini' && profile.mode === 'acp');
/** Frases personalizadas são literais; não transformam uma configuração em regex executável. */
export function authFailed(profile: AiProfile, tail: readonly string[], includeNative = true): boolean {
  const output = tail.join('\n');
  const native = [...(baseValue(AUTH_FAILURE_PATTERNS, profile.base) ?? []), ...(isGeminiAgent(profile) ? GEMINI_AUTH_FAILURE : [])];
  return (
    (includeNative && native.some((pattern) => pattern.test(output))) ||
    (!isReadyCli(profile) &&
      (profile.config.authPatterns ?? []).some((phrase) => !!phrase.trim() && output.toLowerCase().includes(phrase.toLowerCase())))
  );
}
