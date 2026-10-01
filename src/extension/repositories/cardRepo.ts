import type { Database } from 'sql.js';
import type { FieldValue } from '../../shared/model';
import { newId, now } from '../db/ids';
import { all, num, one, run, str, transaction } from '../db/query';

export class CardRepo {
  constructor(private db: Database) {}

  create(boardId: string, input: { typeId: string; columnId: string; parentId: string | null; title: string }): string {
    const db = this.db;
    const col = one(db, 'SELECT c.workflow_id, w.kind FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE c.id = ?', [input.columnId]);
    if (!col) throw new Error('Coluna não encontrada');
    const kind = str(col.kind);
    if (kind === 'child' && !input.parentId) throw new Error('Sub-tarefa precisa de um card pai');
    if (kind === 'parent' && input.parentId) throw new Error('Card de história não pode ter pai');
    if (input.parentId) {
      const parent = one(db, 'SELECT id FROM cards WHERE id = ? AND board_id = ?', [input.parentId, boardId]);
      if (!parent) throw new Error('Card pai não encontrado');
    }
    const pos = num(one(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM cards WHERE column_id = ?', [input.columnId])?.p);
    const id = newId();
    const t = now();
    run(
      db,
      `INSERT INTO cards(id, board_id, workflow_id, column_id, type_id, parent_id, title, description, position, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, boardId, str(col.workflow_id), input.columnId, input.typeId, input.parentId, input.title.trim() || 'Sem título', '', pos, t, t],
    );
    return id;
  }

  update(cardId: string, patch: { title?: string; description?: string; typeId?: string }): void {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (patch.title !== undefined) { sets.push('title = ?'); params.push(patch.title); }
    if (patch.description !== undefined) { sets.push('description = ?'); params.push(patch.description); }
    if (patch.typeId !== undefined) { sets.push('type_id = ?'); params.push(patch.typeId); }
    if (!sets.length) return;
    sets.push('updated_at = ?');
    params.push(now(), cardId);
    run(this.db, `UPDATE cards SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  /** Move para coluna (mesmo workflow) e reindexa as posições das colunas afetadas. */
  move(cardId: string, columnId: string, position: number): void {
    const db = this.db;
    transaction(db, () => {
      const card = one(db, 'SELECT workflow_id, column_id FROM cards WHERE id = ?', [cardId]);
      if (!card) throw new Error('Card não encontrado');
      const col = one(db, 'SELECT workflow_id FROM columns WHERE id = ?', [columnId]);
      if (!col) throw new Error('Coluna não encontrada');
      if (str(col.workflow_id) !== str(card.workflow_id)) throw new Error('Não é possível mover entre workflows');

      const fromCol = str(card.column_id);
      const ids = all(db, 'SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position', [columnId, cardId]).map((r) => str(r.id));
      const idx = Math.max(0, Math.min(position, ids.length));
      ids.splice(idx, 0, cardId);
      ids.forEach((id, i) => run(db, 'UPDATE cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?', [columnId, i, now(), id]));

      if (fromCol !== columnId) {
        all(db, 'SELECT id FROM cards WHERE column_id = ? ORDER BY position', [fromCol]).forEach((r, i) =>
          run(db, 'UPDATE cards SET position = ? WHERE id = ?', [i, str(r.id)]),
        );
      }
    });
  }

  /** Manda o card (e suas sub-tarefas ainda ativas) para a lixeira. */
  trash(cardId: string): void {
    this.mark('deleted_at', cardId);
  }

  restore(cardId: string): void {
    this.unmark('deleted_at', cardId, 'Restaure a história pai primeiro');
  }

  archive(cardId: string): void {
    this.mark('archived_at', cardId);
  }

  /** Desarquiva; opcionalmente já move para uma coluna/posição. */
  unarchive(cardId: string, columnId?: string, position?: number): void {
    this.unmark('archived_at', cardId, 'Desarquive a história pai primeiro');
    if (columnId) this.move(cardId, columnId, position ?? Number.MAX_SAFE_INTEGER);
  }

  /** Apaga de vez o card e seus filhos. Devolve os ids removidos (para limpar anexos). */
  deletePermanent(cardId: string): string[] {
    const ids = all(this.db, 'SELECT id FROM cards WHERE id = ? OR parent_id = ?', [cardId, cardId]).map((r) => str(r.id));
    run(this.db, 'DELETE FROM cards WHERE id = ?', [cardId]);
    return ids;
  }

  emptyTrash(boardId: string): string[] {
    const db = this.db;
    return transaction(db, () => {
      const ids = all(
        db,
        `SELECT id FROM cards WHERE board_id = ? AND (deleted_at IS NOT NULL
           OR parent_id IN (SELECT id FROM cards WHERE board_id = ? AND deleted_at IS NOT NULL))`,
        [boardId, boardId],
      ).map((r) => str(r.id));
      run(db, 'DELETE FROM cards WHERE board_id = ? AND deleted_at IS NOT NULL', [boardId]);
      return ids;
    });
  }

  private mark(col: 'deleted_at' | 'archived_at', cardId: string): void {
    const t = now();
    run(this.db, `UPDATE cards SET ${col} = ?, updated_at = ? WHERE (id = ? OR parent_id = ?) AND ${col} IS NULL`, [t, t, cardId, cardId]);
  }

  /** Limpa a marca do card e dos filhos que foram marcados junto (mesmo timestamp). */
  private unmark(col: 'deleted_at' | 'archived_at', cardId: string, parentError: string): void {
    const db = this.db;
    const card = one(db, `SELECT ${col} AS t, parent_id FROM cards WHERE id = ?`, [cardId]);
    if (!card) throw new Error('Card não encontrado');
    if (card.t == null) return;
    if (card.parent_id != null) {
      const parent = one(db, `SELECT ${col} AS t FROM cards WHERE id = ?`, [str(card.parent_id)]);
      if (parent && parent.t != null) throw new Error(parentError);
    }
    run(db, `UPDATE cards SET ${col} = NULL, updated_at = ? WHERE id = ? OR (parent_id = ? AND ${col} = ?)`, [now(), cardId, cardId, num(card.t)]);
  }

  setFieldValue(cardId: string, fieldId: string, value: FieldValue): void {
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      run(this.db, 'DELETE FROM field_values WHERE card_id = ? AND field_id = ?', [cardId, fieldId]);
    } else {
      run(this.db, 'INSERT OR REPLACE INTO field_values(card_id, field_id, value_json) VALUES (?,?,?)', [cardId, fieldId, JSON.stringify(value)]);
    }
    run(this.db, 'UPDATE cards SET updated_at = ? WHERE id = ?', [now(), cardId]);
  }
}
