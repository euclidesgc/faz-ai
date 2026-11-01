import type { Comment, Id } from './model';

/**
 * Texto conhecido de limite de uso esgotado, como a ferramenta de IA escreve (na saída estruturada ou
 * no texto do bloqueio que o board gravou). Serve para o heartbeat reconhecer um card bloqueado por
 * limite e devolvê-lo para a IA: o limite renova sozinho e não há nada para a pessoa resolver.
 */
export const USAGE_LIMIT_TEXT =
  /usage limit|rate limit|hit your (usage |weekly |session )?limit|limit (will )?reset|resets? (at|in) |out of (extra )?usage|limite de uso|limite esgotado/i;

/**
 * As mensagens da conversa do card a partir do último resumo (ele incluído), ou todas se não houver
 * resumo. É o que a IA recebe: um resumo "desativa" as mensagens anteriores, que ficam só para a
 * pessoa ler. A tela esmaece as anteriores e dá destaque ao resumo pelo mesmo corte.
 */
export function activeComments(comments: readonly Comment[], cardId: Id): Comment[] {
  const all = comments.filter((c) => c.cardId === cardId);
  const last = all.map((c, i) => (c.kind === 'summary' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  return last < 0 ? all : all.slice(last);
}

/** As mensagens depois do último resumo (sem ele); todas, se não houver resumo. */
export function commentsSinceSummary(comments: readonly Comment[], cardId: Id): Comment[] {
  const active = activeComments(comments, cardId);
  return active[0]?.kind === 'summary' ? active.slice(1) : active;
}

/** Quantas mensagens da conversa do card a IA recebe no máximo (o resumo, se houver, conta nelas). */
export const AI_CONVERSATION_LIMIT = 20;

/**
 * A conversa que vai para a IA: `activeComments` limitada a `limit` mensagens. Sem resumo, ficam as últimas
 * `limit`; com resumo, ele fica sempre (nunca é cortado) e o resto é cortado pelo fim, até `limit` no total.
 * `omitted` diz quantas mensagens ativas ficaram de fora. Só o get_card usa: a tela segue com `activeComments`.
 */
export function contextComments(
  comments: readonly Comment[],
  cardId: Id,
  limit: number = AI_CONVERSATION_LIMIT,
): { comments: Comment[]; omitted: number } {
  const active = activeComments(comments, cardId);
  if (active.length <= limit) return { comments: active, omitted: 0 };
  const summary = active[0]?.kind === 'summary' ? active[0] : undefined;
  const rest = summary ? active.slice(1) : active;
  const keep = Math.max(summary ? limit - 1 : limit, 0);
  const tail = keep > 0 ? rest.slice(-keep) : [];
  return { comments: summary ? [summary, ...tail] : tail, omitted: rest.length - tail.length };
}
