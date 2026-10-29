import type { BoardState, Id } from './model';

// Pausa por limite de uso do plano (história #800). Quando a ferramenta de IA esgota o limite (sessão, semana, rate
// limit), repetir a execução antes da renovação só gasta tentativas e, no autopiloto, bloqueava o card pela regra das
// 3 execuções sem avanço. A pausa diz até quando nada da ferramenta deve ser disparado. Aqui ficam só as regras puras
// (sem banco nem `vscode`), usadas pelo host e pela webview; o relógio entra sempre por parâmetro (`now`).

/** A dica de renovação que o leitor achou na saída; o leitor não tem relógio, quem a resolve é `resetAtOf`. */
export interface UsageLimitHint {
  /** `resetsAt` do `rate_limit_event` (Claude Code), como veio: segundos ou milissegundos Unix */
  resetsAt: number | null;
  /** a linha de texto com o limite, para ler "resets 1:50pm (America/Sao_Paulo)" */
  text: string | null;
  /**
   * A espera que a própria API pediu, em ms a partir do fim da execução: o `retryDelay` do `google.rpc.RetryInfo`
   * do 429 do Gemini (`RESOURCE_EXHAUSTED`), ou o "Please retry in 41s" da mensagem. É a pausa curta do limite por
   * minuto; o leitor não tem relógio, então guarda a duração, e não o instante.
   */
  retryAfterMs?: number | null;
  /**
   * A cota é diária e renova à meia-noite deste fuso (a do Gemini: "RPD quotas reset at midnight Pacific time",
   * ai.google.dev/gemini-api/docs/rate-limits). Vence o `retryAfterMs`: na cota diária a API pode mandar um
   * `retryDelay` curto, e a fila voltaria a esbarrar no limite a cada poucos minutos até a meia-noite.
   */
  dailyResetZone?: string | null;
}

/**
 * Uma falha da ferramenta como o transporte a viu (o erro do `result` da CLI, o erro JSON-RPC do `session/prompt`
 * no ACP, a resposta HTTP da API), para a classificação de cada ferramenta (`classifyFailure` do driver).
 */
export interface ToolFailure {
  /** a mensagem, como veio (pode trazer o JSON do erro da API embutido) */
  message: string;
  /** o status HTTP, ou o código JSON-RPC no ACP (o Gemini CLI devolve 429 no `session/prompt`) */
  code?: number | null;
  /** o status do `google.rpc.Status` (`RESOURCE_EXHAUSTED`) */
  status?: string | null;
  /** o corpo do erro, quando veio estruturado (`{ error: { code, status, message, details } }` ou o `data` do JSON-RPC) */
  body?: unknown;
}

/**
 * Junta a dica que já havia com uma nova da mesma execução, ficando com a mais restritiva: a cota diária nunca é
 * trocada por uma espera curta que veio depois (a fila voltaria a esbarrar no limite até a meia-noite); entre duas
 * do mesmo tipo, vale a mais recente.
 */
export function stricterHint(prev: UsageLimitHint | undefined, next: UsageLimitHint | undefined): UsageLimitHint | undefined {
  if (!prev || !next) return next ?? prev;
  if (prev.dailyResetZone && !next.dailyResetZone) return prev;
  return next;
}

/** O que a classificação diz da falha: se foi o limite de uso e, quando a falha diz, até quando. */
export interface FailureClass {
  usageLimitReached: boolean;
  usageLimitHint?: UsageLimitHint;
}

/** A pausa por limite de uso de um perfil de CLI, como fica gravada. */
export interface UsageLimitPause {
  profileId: string;
  /** quando a fila volta a disparar (ms): a renovação + a folga, ou o fim do backoff */
  resumeAt: number;
  /** de onde veio o horário: a saída da ferramenta ou o backoff */
  source: 'reset' | 'backoff';
  /** quantas falhas seguidas sem horário (o degrau do backoff); 0 quando o horário veio da saída */
  attempts: number;
}

/** O que a tela e os despachantes veem: a pausa e a execução de teste em curso (só em memória). */
export interface UsageLimitState extends UsageLimitPause {
  /** card da execução de teste depois que a pausa venceu; null quando nenhuma está em curso */
  probe: Id | null;
}

/** Folga depois da renovação: a tentativa no minuto exato falhou no caso real (#615), e a pessoa pediu 3 min. */
export const LIMIT_SLACK_MS = 3 * 60_000;
export const BACKOFF_FIRST_MS = 5 * 60_000;
export const BACKOFF_MAX_MS = 60 * 60_000;
/** Horário mais longe que isso é tratado como ilegível (backoff): nenhum limite conhecido renova depois de uma semana. */
export const RESET_MAX_AHEAD_MS = 8 * 24 * 60 * 60_000;
export const USAGE_LIMIT_META_KEY = 'usage_limit_pause';

/** O fuso, se o `Intl` o reconhece; senão null (quem chama cai no fuso local). */
function validZone(zone: string | null | undefined): string | undefined {
  if (!zone) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    // RangeError de fuso desconhecido: o horário ainda vale, no fuso local
    return undefined;
  }
}

/** "resets 1:50pm", "resets 3pm", "resets at 13:50", com ou sem "(America/Sao_Paulo)": hora, minuto e fuso; null sem horário. */
export function parseResetText(text: string): { hour: number; minute: number; zone: string | null } | null {
  const m = /\bresets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?(?:\s*\(([^)\s]+)\))?/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  const meridiem = m[3]?.toLowerCase().replace(/\./g, '');
  // sem am/pm e sem minutos ("resets 5") não dá para saber o horário
  if (!meridiem && m[2] === undefined) return null;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
  } else if (hour > 23) return null;
  return { hour, minute, zone: m[4] ?? null };
}

/** Os campos de data e hora de `at` no relógio do fuso (o local, sem fuso). */
function wallParts(at: number, zone: string | undefined) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Quanto o relógio do fuso está à frente do UTC no instante `at` (ms). */
function zoneOffset(at: number, zone: string | undefined): number {
  const p = wallParts(at, zone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

/** O instante em que o relógio do fuso marca a data e a hora dadas (corrige o deslocamento duas vezes, por causa do horário de verão). */
function wallToInstant(year: number, month: number, day: number, hour: number, minute: number, zone: string | undefined): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - zoneOffset(guess, zone);
  return guess - zoneOffset(first, zone);
}

/** O próximo instante (> now) em que o relógio do fuso marca hora:minuto; fuso inválido cai no local. */
export function nextWallTime(hour: number, minute: number, zone: string | null, now: number): number {
  const tz = validZone(zone);
  const today = wallParts(now, tz);
  const at = wallToInstant(today.year, today.month, today.day, hour, minute, tz);
  // "resets 1:50am" lido às 23:00 é a 1:50 de amanhã
  if (at > now) return at;
  // o dia seguinte pelo calendário, a partir da data de parede: somar 24 h ao instante erra no dia de 25 h do fim
  // do horário de verão (a meia-noite de 1º/11 no Pacífico + 24 h ainda é 1º/11, e a pausa cairia no passado)
  const next = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return wallToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hour, minute, tz);
}

const plausible = (at: number, now: number): boolean => Number.isFinite(at) && at > now && at - now <= RESET_MAX_AHEAD_MS;

/**
 * O instante da renovação (ms), ou null quando a dica não tem horário legível. Ordem: `resetsAt` → cota diária
 * (a próxima meia-noite do fuso dela) → espera pedida pela API → texto com fuso → texto no fuso local.
 */
export function resetAtOf(hint: UsageLimitHint | null | undefined, now: number, localZone?: string): number | null {
  if (!hint) return null;
  if (typeof hint.resetsAt === 'number' && hint.resetsAt > 0) {
    // a documentação do SDK não diz a unidade; a CLI gravou segundos. Abaixo de 10^12 só pode ser segundo
    const at = hint.resetsAt < 1e12 ? hint.resetsAt * 1000 : hint.resetsAt;
    if (plausible(at, now)) return at;
  }
  if (hint.dailyResetZone) {
    const at = nextWallTime(0, 0, validZone(hint.dailyResetZone) ?? localZone ?? null, now);
    if (plausible(at, now)) return at;
  }
  if (typeof hint.retryAfterMs === 'number' && hint.retryAfterMs > 0) {
    const at = now + hint.retryAfterMs;
    if (plausible(at, now)) return at;
  }
  const parsed = hint.text ? parseResetText(hint.text) : null;
  if (!parsed) return null;
  const at = nextWallTime(parsed.hour, parsed.minute, validZone(parsed.zone) ?? localZone ?? null, now);
  return plausible(at, now) ? at : null;
}

/** Espera do degrau `attempts` (1, 2, 3...): 5, 10, 20, 40, 60, 60... min. */
export function backoffMs(attempts: number): number {
  const step = Math.max(1, Math.floor(attempts)) - 1;
  return Math.min(BACKOFF_FIRST_MS * 2 ** Math.min(step, 30), BACKOFF_MAX_MS);
}

/**
 * A pausa depois de mais uma falha por limite. Com horário: renovação + folga (a mais tarde, se já
 * havia uma). Sem horário: se a pausa atual ainda vale, fica como está (várias execuções em paralelo
 * esbarrando juntas não sobem o degrau várias vezes); se já venceu (era a execução de teste), sobe um degrau.
 */
export function nextPause(prev: UsageLimitPause | null, profileId: string, resetAt: number | null, now: number): UsageLimitPause {
  const current = prev && prev.profileId === profileId ? prev : null;
  const holding = current && current.resumeAt > now ? current : null;
  if (resetAt !== null) {
    const resumeAt = resetAt + LIMIT_SLACK_MS;
    if (holding && holding.resumeAt > resumeAt) return holding;
    return { profileId, resumeAt, source: 'reset', attempts: 0 };
  }
  if (holding) return holding;
  const attempts = (current?.attempts ?? 0) + 1;
  return { profileId, resumeAt: now + backoffMs(attempts), source: 'backoff', attempts };
}

/** A pausa do perfil, valendo ou vencida; null quando não há. */
export const pauseOf = (s: Pick<BoardState, 'usageLimit'>, profileId: string): UsageLimitState | null =>
  s.usageLimit?.find((p) => p.profileId === profileId) ?? null;

/** A pausa segura o perfil agora (ainda não venceu). */
export function limitHolds(s: Pick<BoardState, 'usageLimit'>, profileId: string, now: number): boolean {
  const pause = pauseOf(s, profileId);
  return !!pause && pause.resumeAt > now;
}

/**
 * Os despachantes automáticos podem iniciar uma execução do perfil: sem pausa, ou vencida e sem execução de teste em
 * curso. A pausa vencida deixa sair uma execução só (o teste), para não disparar a fila inteira contra um limite que
 * talvez ainda não tenha renovado.
 */
export function canDispatch(s: Pick<BoardState, 'usageLimit'>, profileId: string, now: number): boolean {
  const pause = pauseOf(s, profileId);
  if (!pause) return true;
  return pause.resumeAt <= now && pause.probe === null;
}

/** Perfis com pausa valendo agora. */
export function heldProfiles(s: Pick<BoardState, 'usageLimit'>, now: number): UsageLimitState[] {
  return (s.usageLimit ?? []).filter((p) => p.resumeAt > now);
}

/** Lê uma pausa do JSON; qualquer coisa inválida vira null (nunca segura a fila). */
export function parsePause(v: unknown): UsageLimitPause | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Partial<UsageLimitPause>;
  if (typeof p.profileId !== 'string' || !p.profileId) return null;
  if (typeof p.resumeAt !== 'number' || !Number.isFinite(p.resumeAt)) return null;
  if (p.source !== 'reset' && p.source !== 'backoff') return null;
  if (typeof p.attempts !== 'number' || !Number.isInteger(p.attempts) || p.attempts < 0) return null;
  return { profileId: p.profileId, resumeAt: p.resumeAt, source: p.source, attempts: p.attempts };
}

/** Lê a lista gravada na `meta` (uma entrada por perfil); valor antigo, corrompido ou duplicado não segura a fila. */
export function parsePauses(json: string | undefined): UsageLimitPause[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    const out: UsageLimitPause[] = [];
    for (const item of v) {
      const p = parsePause(item);
      if (p && !seen.has(p.profileId)) {
        seen.add(p.profileId);
        out.push(p);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Um modelo de um perfil que esgotou o limite e foi trocado sozinho pela regra de fallback (#1100). */
export interface ModelLimit {
  profileId: string;
  model: string;
  /** até quando a marca vale (ms): a renovação + a folga, ou o fim do backoff */
  resumeAt: number;
  source: 'reset' | 'backoff';
  attempts: number;
}
export const MODEL_LIMIT_META_KEY = 'usage_limit_models';

/** A marca depois de mais um esgotamento do modelo: mesma regra de `nextPause` (renovação + folga, ou backoff). */
export function nextModelLimit(prev: ModelLimit | null, profileId: string, model: string, resetAt: number | null, now: number): ModelLimit {
  const current = prev && prev.profileId === profileId && prev.model === model ? prev : null;
  const pause = nextPause(current, profileId, resetAt, now);
  return { profileId, model, resumeAt: pause.resumeAt, source: pause.source, attempts: pause.attempts };
}

/** A marca do modelo, valendo ou vencida; null quando não há. */
export function modelLimitOf(list: readonly ModelLimit[], profileId: string, model: string | null): ModelLimit | null {
  if (model === null) return null;
  return list.find((l) => l.profileId === profileId && l.model === model) ?? null;
}

/** A marca segura o modelo agora. Modelo null (o padrão do perfil) nunca é marcado. */
export function modelLimitHolds(list: readonly ModelLimit[], profileId: string, model: string | null, now: number): boolean {
  const mark = modelLimitOf(list, profileId, model);
  return !!mark && mark.resumeAt > now;
}

/** Lê a lista da `meta`; inválido, corrompido ou duplicado (mesmo perfil + modelo) vira "sem marca". */
export function parseModelLimits(json: string | undefined): ModelLimit[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    const out: ModelLimit[] = [];
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const m = item as Partial<ModelLimit>;
      if (typeof m.model !== 'string' || !m.model) continue;
      const pause = parsePause({ profileId: m.profileId, resumeAt: m.resumeAt, source: m.source, attempts: m.attempts });
      if (!pause) continue;
      const key = JSON.stringify([pause.profileId, m.model]);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...pause, model: m.model });
    }
    return out;
  } catch {
    return [];
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Horário da pausa nas mensagens que o host grava (conversa, log, nota do autopiloto): `HH:MM` no fuso local, ou
 * `DD/MM HH:MM` quando não é hoje. A tela formata o seu no idioma da interface.
 */
export function limitClock(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? time : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}
