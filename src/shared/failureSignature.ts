/** Disjuntor de falhas repetidas (#1097): regra pura que transforma falhas em assinatura e decide o limite. */

export const MAX_SIGNATURE_MESSAGE = 240;
export type FailureOrigin = 'run' | 'gate';

export interface FailureOccurrence {
  signature: string;
  origin: FailureOrigin;
  /** epoch ms */
  at: number;
  cardId: string;
  cardNumber: number | null;
  /** mensagem normalizada (trecho) */
  detail: string;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Minúsculas; sem ANSI, datas/horas, caminhos temporários e de worktree, hashes hex (>= 7), números; espaços colapsados; corte em 240. */
export function normalizeFailureMessage(raw: string): string {
  return raw
    .trim()
    .replace(ANSI, '')
    .toLowerCase()
    .replace(/\[[^\]]*\d{1,2}:\d{2}[^\]]*\]/g, '')
    .replace(/\d{4}-\d{2}-\d{2}(t|\s)?/g, '')
    .replace(/\d{1,2}:\d{2}(:\d{2})?(\.\d+)?z?/g, '')
    .replace(/(?:\/private)?\/tmp\/\S*|\/var\/folders\/\S*|\S*\.worktrees\/\S*|%temp%\S*/g, '<tmp>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '')
    .replace(/\b[0-9a-f]{7,}\b/g, '')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SIGNATURE_MESSAGE)
    .trim();
}

export const failureSignature = (column: string, origin: FailureOrigin, message: string): string =>
  `${column} | ${origin} | ${normalizeFailureMessage(message)}`;

const ERROR_LINE = /error|erro|fail|falh|exception|fatal|denied|not found/i;

/** A mensagem de uma execução falha: erro do processo; senão a última linha de erro do fim da saída; senão "código N" / "tempo limite" / "sem atividade". */
export function runFailureMessage(s: {
  errorMessage: string | null;
  tail: readonly string[];
  code: number | null;
  timedOut: boolean;
  stalled: boolean;
}): string {
  const err = s.errorMessage?.trim();
  if (err) return err;
  const lines = s.tail.map((l) => l.trim()).filter(Boolean);
  const line = [...lines].reverse().find((l) => ERROR_LINE.test(l));
  if (line) return line;
  if (s.timedOut) return 'tempo limite';
  if (s.stalled) return 'sem atividade';
  return `código ${s.code ?? '?'}`;
}

/** A mensagem de uma checagem que falhou: `<nome>: <última linha útil da saída>`. */
export function gateFailureMessage(checkName: string, outputTail: string): string {
  const lines = outputTail
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const line = [...lines].reverse().find((l) => ERROR_LINE.test(l)) ?? lines[lines.length - 1] ?? 'falhou';
  return `${checkName}: ${line}`;
}

export const BREAKER_MARK = '**Disjuntor de falhas repetidas**';
export const isBreakerNote = (m: { source?: string | null; body: string }): boolean => m.source === 'ai' && m.body.startsWith(BREAKER_MARK);

export interface BreakerTrip {
  signature: string;
  count: number;
  items: FailureOccurrence[];
}

/** A assinatura que mais se repetiu e já chegou ao limite, com as suas ocorrências em ordem; null se nenhuma chegou. */
export function breakerTrip(occurrences: readonly FailureOccurrence[], limit: number): BreakerTrip | null {
  const groups = new Map<string, FailureOccurrence[]>();
  for (const o of occurrences) groups.set(o.signature, [...(groups.get(o.signature) ?? []), o]);
  let best: BreakerTrip | null = null;
  for (const [signature, list] of groups) {
    if (list.length < limit) continue;
    if (!best || list.length > best.count) best = { signature, count: list.length, items: [...list].sort((a, b) => a.at - b.at) };
  }
  return best;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const when = (at: number): string => {
  const d = new Date(at);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A nota da conversa, com a marca e o histórico (até 10, as mais recentes). */
export function breakerNote(trip: BreakerTrip, limit: number): string {
  const shown = trip.items.slice(-10);
  const first = trip.items.length - shown.length;
  const rows = shown.map(
    (o, i) =>
      `${first + i + 1}. ${when(o.at)}, ${o.origin === 'gate' ? 'checagem' : 'execução'}${o.cardNumber != null ? `, #${o.cardNumber}` : ''}: ${o.detail}`,
  );
  return [
    `${BREAKER_MARK}: a mesma falha apareceu ${trip.count} vezes nesta história e o board a bloqueou (limite: ${limit}).`,
    '',
    `Assinatura: \`${trip.signature}\``,
    '',
    'Ocorrências:',
    ...rows,
    '',
    'Confira a causa, corrija ou ajuste o card e destrave: a contagem recomeça agora. O limite está em Configurações → Automação.',
  ].join('\n');
}
