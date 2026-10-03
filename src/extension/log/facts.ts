// Recorte de fatos do card para a sonda do log (passo 4): nunca o `snapshot()` do board, que monta
// o `BoardState` inteiro (todos os cards, comentários, anexos) — custo que a sonda não pode pagar em
// toda mutação. Uma consulta com `IN (...)`, sem N+1.
import type { Database } from 'sql.js';
import { all, num, str, strOrNull, type Row } from '../db/query';

/** O que a sonda do log precisa saber de um card no momento da mutação. */
export interface CardFacts {
  id: string;
  number: number;
  title: string;
  cardType: string;
  workflow: string;
  columnName: string;
  columnCategory: string;
  status: string | null;
  archived: boolean;
  trashed: boolean;
  parentId: string | null;
  prUrl: string;
}

const SELECT = `
  SELECT c.id AS id, c.number AS number, c.title AS title, t.name AS card_type, w.name AS workflow,
         col.name AS column_name, col.category AS column_category, c.status AS status,
         c.archived_at AS archived_at, c.deleted_at AS deleted_at, c.parent_id AS parent_id, c.pr_url AS pr_url
  FROM cards c
  JOIN columns col ON col.id = c.column_id
  JOIN card_types t ON t.id = c.type_id
  JOIN workflows w ON w.id = c.workflow_id
`;

function toFacts(r: Row): CardFacts {
  return {
    id: str(r.id),
    number: num(r.number),
    title: str(r.title),
    cardType: str(r.card_type),
    workflow: str(r.workflow),
    columnName: str(r.column_name),
    columnCategory: str(r.column_category),
    status: strOrNull(r.status),
    archived: r.archived_at != null,
    trashed: r.deleted_at != null,
    parentId: strOrNull(r.parent_id),
    prUrl: str(r.pr_url),
  };
}

function toMap(rows: Row[]): Map<string, CardFacts> {
  const map = new Map<string, CardFacts>();
  for (const r of rows) {
    const facts = toFacts(r);
    map.set(facts.id, facts);
  }
  return map;
}

/** Fatos dos cards `ids`, numa única consulta com `IN (...)`. */
export function cardFacts(db: Database, ids: string[]): Map<string, CardFacts> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(db, `${SELECT} WHERE c.id IN (${placeholders})`, ids);
  return toMap(rows);
}

/**
 * Fatos do card `id` e dos filhos dele, numa única consulta — o escopo que a sonda do log precisa
 * (as cascatas do board, como cancelar a história, mexem nos filhos).
 */
export function cardAndChildrenFacts(db: Database, id: string): Map<string, CardFacts> {
  const rows = all(db, `${SELECT} WHERE c.id = ? OR c.parent_id = ?`, [id, id]);
  return toMap(rows);
}
