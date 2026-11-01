import type { BoardState } from '../../shared/model';

// O estado chega do host inteiro a cada mudança, com objetos novos mesmo para o que não mudou (#1066). Aqui
// o que é igual ao anterior volta com a identidade anterior, para `memo` e os seletores do store
// reconhecerem o que ficou como estava e redesenharem só o que mudou.

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Lista de entidades com `id`: cada item igual ao anterior volta com a identidade dele; lista toda igual, a lista anterior. */
function reconcileList<T extends { id: string }>(prev: T[] | undefined, next: T[]): T[] {
  if (!prev) return next;
  const byId = new Map(prev.map((p) => [p.id, p]));
  let changed = prev.length !== next.length;
  const out = next.map((n, i) => {
    const p = byId.get(n.id);
    if (p && same(p, n)) {
      if (prev[i] !== p) changed = true;
      return p;
    }
    changed = true;
    return n;
  });
  return changed ? out : prev;
}

const LISTS = ['workflows', 'columns', 'cardTypes', 'cards', 'fieldDefs', 'checklistItems', 'links', 'comments', 'attachments'] as const;

/** O estado novo, com a identidade do anterior em tudo o que não mudou. */
export function reconcileState(prev: BoardState | null, next: BoardState): BoardState {
  if (!prev) return next;
  const out = { ...next };
  for (const key of LISTS)
    (out as Record<string, unknown>)[key] = reconcileList(prev[key] as { id: string }[] | undefined, next[key] as { id: string }[]);
  for (const key of Object.keys(next) as (keyof BoardState)[]) {
    if ((LISTS as readonly string[]).includes(key)) continue;
    if (same(prev[key], next[key])) (out as Record<string, unknown>)[key] = prev[key];
  }
  return out;
}
