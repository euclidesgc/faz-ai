// O limite de uso do Gemini, o mesmo nos três modos (épica "ferramenta por modo", história 12): a CLI (o erro do
// `result` do `stream-json`), o ACP (o erro JSON-RPC do `session/prompt`) e a API (a resposta HTTP do
// `generateContent`) falam da mesma cota da API do Gemini, e a classificação é uma só, `classifyGeminiFailure`,
// que os três drivers expõem como `classifyFailure`.
//
// O que foi conferido, e onde (2026-10-23):
// - ai.google.dev/gemini-api/docs/rate-limits: o limite estourado volta como "429 RESOURCE_EXHAUSTED", e "Requests
//   per day (RPD) quotas reset at midnight Pacific time";
// - o corpo do erro é um `google.rpc.Status` (`{ error: { code, status, message, details } }`), com
//   `google.rpc.QuotaFailure` (as violações, com o `quotaId`, `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
//   na cota diária) e `google.rpc.RetryInfo` (`retryDelay`, uma `Duration` em JSON: "41s", "0.5s");
// - o Gemini CLI 0.65.0 (lido no pacote instalado, `classifyGoogleError` em `googleQuotaErrors.js`): uma violação
//   com `PerDay`/`Daily` no `quotaId` vira `TerminalQuotaError("You have exhausted your daily quota on this
//   model.")`; sem detalhes, a mensagem com "Please retry in 41.5s" dá a espera; o `retryDelay` vira "Suggested
//   retry after 41s."; `MODEL_CAPACITY_EXHAUSTED`, `INSUFFICIENT_G1_CREDITS_BALANCE` e `QUOTA_EXHAUSTED` são cota;
// - no ACP (`GeminiAgent.prompt` da 0.65.0), o erro do turno volta no `session/prompt` como erro JSON-RPC com o
//   status HTTP no `code` (`RequestError(429, "You have exhausted your daily quota on this model.")`), e um 429
//   que escapou das tentativas da CLI volta como `RequestError(429, "Rate limit exceeded. Try again later.")`;
// - na CLI, o mesmo erro sai no `result` com `status: "error"` (a fixture `gemini-stream-json-quota.jsonl`).
import type { FailureClass, ToolFailure, UsageLimitHint } from '../../../../shared/usageLimit';
import { asList, asNumber, asObject, asText, type Json } from '../../../aiOutput/json';

/** O fuso da renovação da cota diária da API do Gemini (meia-noite do horário do Pacífico). */
export const GEMINI_DAILY_RESET_ZONE = 'America/Los_Angeles';

/** As mensagens de cota da API e da CLI (as das classes `TerminalQuotaError` e `RetryableQuotaError` da 0.65.0). */
const LIMIT_TEXT =
  /exhausted your (daily )?quota|exhausted your capacity|capacity exceeded|quota exceeded|exceeded your current quota|RESOURCE_EXHAUSTED|rate limit exceeded|INSUFFICIENT_G1_CREDITS_BALANCE|MODEL_CAPACITY_EXHAUSTED/i;
/**
 * O 429 escrito no texto só vale como status ("status 429", "HTTP 429", "code: 429", "429 Too Many Requests"): um
 * número solto ("Lines 1-429 processed") não é limite. No ACP e na API o código numérico vem à parte (`code`).
 */
const STATUS_429 = /\b(?:status|code|HTTP|error)\W{0,3}429\b|\b429\W{0,3}(?:Too Many Requests|RESOURCE_EXHAUSTED)/i;
/** A cota diária pelo texto: a frase da CLI ou o `quotaId` embutido na mensagem. */
const DAILY_TEXT = /daily quota|PerDay|per[ _-]day\b/i;
/** Os motivos do `google.rpc.ErrorInfo` que a CLI trata como cota esgotada. */
const LIMIT_REASONS = new Set([
  'RATE_LIMIT_EXCEEDED',
  'QUOTA_EXHAUSTED',
  'MODEL_CAPACITY_EXHAUSTED',
  'MODEL_CAPACITY_EXCEEDED',
  'INSUFFICIENT_G1_CREDITS_BALANCE',
]);
/** A espera escrita no texto: "Please retry in 41.5s", "Suggested retry after 41s", `"retryDelay": "41s"`. */
const RETRY_TEXT = /(?:retry in|retry after|"retryDelay"\s*:\s*")\s*(\d+(?:\.\d+)?)\s*(ms|s)\b/i;

/** Uma `google.protobuf.Duration` em JSON ("41s", "0.5s", "1500ms"), em ms; null quando não é uma. */
export function durationMs(value: string | null | undefined): number | null {
  const m = value ? /^\s*(\d+(?:\.\d+)?)\s*(ms|s)\s*$/i.exec(value) : null;
  if (!m) return null;
  const n = Number(m[1]) * (m[2]!.toLowerCase() === 'ms' ? 1 : 1000);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}

/** O `google.rpc.Status` do corpo: `{ error: {...} }`, o próprio status, ou o `[{ error }]` que a API às vezes manda. */
function statusOf(body: unknown): Json | null {
  const o = asObject(Array.isArray(body) ? body[0] : body);
  if (!o) return null;
  const inner = asObject(o.error);
  if (inner) return inner;
  return 'details' in o || 'status' in o || 'code' in o ? o : null;
}

/** O JSON do erro que a CLI escreve dentro da mensagem ("[API Error: {"error":{...}}]"); null quando não há. */
function embedded(message: string): Json | null {
  const start = message.indexOf('{');
  const end = message.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return statusOf(JSON.parse(message.slice(start, end + 1)) as unknown);
  } catch {
    return null;
  }
}

/**
 * Classifica uma falha do Gemini: o limite de uso (cota diária, por minuto, créditos ou capacidade) liga
 * `usageLimitReached`, e a dica diz até quando: a cota diária renova à meia-noite do Pacífico; o `retryDelay`
 * (ou o "Please retry in") é a pausa curta; sem nenhum dos dois, não há dica, e a pausa usa o backoff. A chave
 * recusada, o modelo inexistente e os demais erros não são limite.
 */
export function classifyGeminiFailure(failure: ToolFailure): FailureClass {
  const message = failure.message ?? '';
  const status = statusOf(failure.body) ?? embedded(message);
  const details = asList(status?.details)
    .map((d) => asObject(d))
    .filter((d): d is Json => !!d);
  const ofType = (type: string) => details.filter((d) => asText(d['@type'])?.endsWith(`google.rpc.${type}`));
  const quotaIds = ofType('QuotaFailure').flatMap((d) => asList(d.violations).map((v) => asText(asObject(v)?.quotaId) ?? ''));
  const reasons = ofType('ErrorInfo').map((d) => asText(d.reason) ?? '');
  const code = failure.code ?? asNumber(status?.code);
  const rpcStatus = failure.status ?? asText(status?.status);
  const text = [message, asText(status?.message) ?? ''].join('\n');

  const limited =
    code === 429 ||
    rpcStatus === 'RESOURCE_EXHAUSTED' ||
    reasons.some((r) => LIMIT_REASONS.has(r)) ||
    ofType('QuotaFailure').length > 0 ||
    LIMIT_TEXT.test(text) ||
    STATUS_429.test(text);
  if (!limited) return { usageLimitReached: false };

  const daily = quotaIds.some((id) => /PerDay|Daily/.test(id)) || DAILY_TEXT.test(text);
  const retryInfo = ofType('RetryInfo').map((d) => durationMs(asText(d.retryDelay)))[0] ?? null;
  const retryText = RETRY_TEXT.exec(text);
  const retryAfterMs = retryInfo ?? (retryText ? durationMs(`${retryText[1]}${retryText[2]}`) : null);
  let hint: UsageLimitHint | undefined;
  if (daily) hint = { resetsAt: null, text: null, dailyResetZone: GEMINI_DAILY_RESET_ZONE };
  else if (retryAfterMs !== null) hint = { resetsAt: null, text: null, retryAfterMs };
  return hint ? { usageLimitReached: true, usageLimitHint: hint } : { usageLimitReached: true };
}
