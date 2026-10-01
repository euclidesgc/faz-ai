import type { BoardState, Card, FieldValue, Id } from './model';

export type DatePreset = 'today' | '7d' | '30d' | 'custom';
export type Relation = 'any' | 'withChildren' | 'withoutChildren' | 'pendingChildren';

export interface Filters {
  /** palavras-chave: todas precisam aparecer em título, descrição, comentários ou campos */
  text: string;
  typeIds: Id[];
  /** fieldId → valores aceitos (checkbox usa 'true' / 'false') */
  fields: Record<Id, string[]>;
  /** 'createdAt', 'updatedAt' ou o id de um campo do tipo data */
  dateField: string | null;
  datePreset: DatePreset | null;
  /** yyyy-mm-dd, usados quando datePreset = 'custom' */
  dateFrom: string;
  dateTo: string;
  relation: Relation;
  /** mostrar também o pai e as sub-tarefas dos cards encontrados */
  includeRelated: boolean;
}

export const EMPTY_FILTERS: Filters = {
  text: '', typeIds: [], fields: {}, dateField: null, datePreset: null, dateFrom: '', dateTo: '', relation: 'any', includeRelated: true,
};

/** Estado de visualização compartilhado entre o board e a barra lateral. */
export interface ViewState {
  filters: Filters;
  selectedParentId: Id | null;
  showArchived: boolean;
}

export const EMPTY_VIEW_STATE: ViewState = { filters: EMPTY_FILTERS, selectedParentId: null, showArchived: false };

const DAY = 24 * 60 * 60 * 1000;

export function activeFilterCount(f: Filters): number {
  return (
    (f.text.trim() ? 1 : 0) +
    (f.typeIds.length ? 1 : 0) +
    Object.values(f.fields).filter((v) => v.length).length +
    (dateRange(f, Date.now()) ? 1 : 0) +
    (f.relation !== 'any' ? 1 : 0)
  );
}

/** Intervalo [from, to] em ms, ou null se o filtro de data não está ativo. */
export function dateRange(f: Filters, now: number): [number, number] | null {
  if (!f.dateField || !f.datePreset) return null;
  const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  switch (f.datePreset) {
    case 'today':
      return [startOfDay(now), startOfDay(now) + DAY - 1];
    case '7d':
      return [startOfDay(now - 6 * DAY), startOfDay(now) + DAY - 1];
    case '30d':
      return [startOfDay(now - 29 * DAY), startOfDay(now) + DAY - 1];
    case 'custom': {
      const from = f.dateFrom ? parseDay(f.dateFrom) : null;
      const to = f.dateTo ? parseDay(f.dateTo) : null;
      if (from === null && to === null) return null;
      return [from ?? -Infinity, to === null ? Infinity : to + DAY - 1];
    }
  }
}

function parseDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

const valueText = (v: FieldValue): string => (v === null ? '' : Array.isArray(v) ? v.join(' ') : String(v));
export const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Devolve os ids dos cards que passam nos filtros, ou null quando nenhum filtro está ativo.
 * Só considera cards fora da lixeira.
 */
export function applyFilters(state: BoardState, f: Filters, now: number = Date.now()): Set<Id> | null {
  const range = dateRange(f, now);
  const words = norm(f.text).split(/\s+/).filter(Boolean);
  const fieldFilters = Object.entries(f.fields).filter(([, v]) => v.length);
  if (!words.length && !f.typeIds.length && !fieldFilters.length && !range && f.relation === 'any') return null;

  const cards = state.cards.filter((c) => c.deletedAt === null);
  const values = new Map<string, FieldValue>();
  for (const v of state.fieldValues) values.set(`${v.cardId}:${v.fieldId}`, v.value);
  const childrenByParent = new Map<Id, Card[]>();
  for (const c of cards) if (c.parentId) childrenByParent.set(c.parentId, [...(childrenByParent.get(c.parentId) ?? []), c]);
  const terminal = new Set(state.columns.filter((c) => c.isTerminal).map((c) => c.id));
  const childWorkflows = new Set(state.workflows.filter((w) => w.kind === 'child').map((w) => w.id));

  const haystack = (c: Card): string => {
    const parts = [c.title, c.description];
    for (const cm of state.comments) if (cm.cardId === c.id) parts.push(cm.body);
    for (const fv of state.fieldValues) if (fv.cardId === c.id) parts.push(valueText(fv.value));
    return norm(parts.join('\n'));
  };

  const matches = (c: Card): boolean => {
    if (f.typeIds.length && !f.typeIds.includes(c.typeId)) return false;

    for (const [fieldId, accepted] of fieldFilters) {
      const v = values.get(`${c.id}:${fieldId}`) ?? null;
      const actual = Array.isArray(v) ? v : v === null ? [] : [String(v)];
      // checkbox desmarcado não tem linha no banco: conta como 'false'
      const list = actual.length ? actual : ['false'];
      if (!accepted.some((a) => list.includes(a))) return false;
    }

    if (range) {
      let t: number | null;
      if (f.dateField === 'createdAt') t = c.createdAt;
      else if (f.dateField === 'updatedAt') t = c.updatedAt;
      else {
        const v = values.get(`${c.id}:${f.dateField}`);
        t = typeof v === 'string' ? parseDay(v) : null;
      }
      if (t === null || t < range[0] || t > range[1]) return false;
    }

    if (f.relation !== 'any') {
      if (childWorkflows.has(c.workflowId)) return false;
      const kids = childrenByParent.get(c.id) ?? [];
      if (f.relation === 'withChildren' && !kids.length) return false;
      if (f.relation === 'withoutChildren' && kids.length) return false;
      if (f.relation === 'pendingChildren' && !kids.some((k) => !terminal.has(k.columnId))) return false;
    }

    if (words.length) {
      const h = haystack(c);
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  };

  const result = new Set<Id>();
  for (const c of cards) if (matches(c)) result.add(c.id);

  if (f.includeRelated) {
    for (const c of cards) {
      if (!result.has(c.id)) continue;
      if (c.parentId) result.add(c.parentId);
    }
    const direct = new Set([...result].filter((id) => cards.find((c) => c.id === id && matches(c))));
    for (const c of cards) if (c.parentId && direct.has(c.parentId)) result.add(c.id);
  }
  return result;
}
