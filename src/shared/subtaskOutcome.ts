import type { BoardState, Card } from './model';
import type { OutcomeRead } from './phaseOutcome';

export const CONTEXT_MARK = '**Pedido de contexto**';
export const CONTEXT_DONE_MARK = '**Contexto completado**';
export const CONCERN_MARK = '**Ressalva da sub-tarefa**';
/** Pedidos de contexto por sub-tarefa, desde o último gesto da pessoa. */
export const MAX_CONTEXT_REQUESTS = 2;

export type DeclaredRoute =
  | { kind: 'none'; note?: string }
  | { kind: 'concern'; text: string }
  | { kind: 'needs-context'; summary: string; pending: string }
  | { kind: 'block'; reason: string };

export interface ClaimEvidence {
  cardClosed: boolean;
  cardWithPerson: boolean;
  mutations: number;
  workspaceChanged: boolean | null;
}

/** A ferramenta vence: o bloco é só uma alegação, confrontada com o estado do card. */
export function routeDeclared(read: OutcomeRead | null, e: ClaimEvidence): DeclaredRoute {
  if (!read) return { kind: 'none' };
  if (read.kind === 'missing') return { kind: 'none', note: 'Bloco final: ausente.' };
  if (read.kind === 'invalid') return { kind: 'none', note: `Bloco final: inválido (${read.problem}).` };
  if (e.cardWithPerson) return { kind: 'none' };
  const { outcome, summary, failure_reason, pending } = read.value;
  const extra = (outcome === 'BLOCKED' ? failure_reason : pending)?.trim();
  if (e.cardClosed) {
    if (outcome === 'DONE') {
      return e.mutations === 0 && e.workspaceChanged === false
        ? { kind: 'concern', text: 'declarou DONE sem alterar a pasta nem o board.' }
        : { kind: 'none' };
    }
    if (outcome === 'DONE_WITH_CONCERNS') return { kind: 'concern', text: (pending ?? '').trim() || summary };
    return {
      kind: 'concern',
      text: `declarou ${outcome}, mas a sub-tarefa foi concluída pela ferramenta: ${summary}${extra ? ` / ${extra}` : ''}`,
    };
  }
  if (outcome === 'NEEDS_CONTEXT') return { kind: 'needs-context', summary, pending: (pending ?? '').trim() };
  if (outcome === 'BLOCKED') return { kind: 'block', reason: `${(failure_reason ?? '').trim()}\n\n${summary}`.trim() };
  return { kind: 'none' };
}

/** FNV-1a de 32 bits, em hexadecimal: puro, sem `node:crypto`, para rodar também na webview. */
export const descriptionHash = (text: string | null | undefined): string => {
  let h = 0x811c9dc5;
  for (const ch of text ?? '') {
    const code = ch.codePointAt(0) ?? 0;
    h = Math.imul(h ^ code, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

export function contextReason(card: { description?: string | null }, r: { summary: string; pending: string }): string {
  return `${CONTEXT_MARK} (${descriptionHash(card.description)}): ${r.summary}\n\nPreciso de: ${r.pending}`;
}
export const isContextReason = (reason: string): boolean => reason.startsWith(CONTEXT_MARK);
/** O hash da descrição que o pedido viu, ou null se o texto não é um pedido de contexto. */
export const contextHashOf = (reason: string): string | null => {
  const m = /^\*\*Pedido de contexto\*\* \(([0-9a-f]+)\)/.exec(reason);
  return m?.[1] ?? null;
};
/** Nota do pedido de contexto na conversa da sub-tarefa (copiada do motivo do resultado). */
export const isContextNote = (m: { source?: string | null; body: string }): boolean => m.source === 'ai' && m.body.includes(CONTEXT_MARK);

/** A nota que o board escreve na sub-tarefa quando a descrição mudou: conta como gesto em `handedBackAt`. */
export const isContextDoneNote = (m: { source?: string | null; body: string }): boolean =>
  m.source === 'ai' && m.body.startsWith(CONTEXT_DONE_MARK);

export function contextKey(story: Card, requests: readonly { cardId: string; hash: string }[], handedBack: number): string {
  const ids = requests.map((r) => `${r.cardId}:${r.hash}`).sort();
  return JSON.stringify(['story', story.id, story.columnId, 'context', ids, handedBack]);
}
export function isContextKey(key: string): boolean {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && parsed[0] === 'story' && parsed[3] === 'context';
  } catch {
    return false;
  }
}

export function contextBlockedReason(story: Card, cards: readonly Card[], why: 'unchanged' | 'limit'): string {
  const refs = [...cards]
    .sort((a, b) => a.number - b.number)
    .map((c) => `#${c.number}`)
    .join(', ');
  return why === 'limit'
    ? `A história #${story.number} pausou: ${refs} pediu contexto mais de ${MAX_CONTEXT_REQUESTS} vezes sem que a pessoa interviesse. Complete a descrição e libere o card.`
    : `A história #${story.number} pausou: ${refs} pediu contexto e a descrição continua a mesma. Complete a descrição e libere o card.`;
}

export const concernNote = (sub: Card, workId: string, text: string): string => `${CONCERN_MARK} (#${sub.number}, ${workId}): ${text}`;

/** Ressalvas declaradas pelas sub-tarefas na conversa da história, sem repetir a mesma execução. */
export function concernsOf(s: BoardState, story: Card): { ref: string; text: string }[] {
  const seen = new Set<string>();
  const out: { ref: string; text: string }[] = [];
  for (const m of s.comments) {
    if (m.cardId !== story.id || m.source !== 'ai') continue;
    const parsed = /^\*\*Ressalva da sub-tarefa\*\* \((#\d+), ([^)]*)\): ([\s\S]*)$/.exec(m.body);
    if (!parsed) continue;
    const [, ref = '', workId = '', text = ''] = parsed;
    if (seen.has(`${ref} ${workId}`)) continue;
    seen.add(`${ref} ${workId}`);
    out.push({ ref, text: text.trim() });
  }
  return out;
}
