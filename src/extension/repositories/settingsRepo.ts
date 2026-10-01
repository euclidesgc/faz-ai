import type { Database } from 'sql.js';
import type { ColumnCategory, FieldDisplay, FieldKind, FieldValue } from '../../shared/model';
import { newId } from '../db/ids';
import { all, num, one, run, str, transaction } from '../db/query';

export class SettingsRepo {
  constructor(private db: Database) {}

  // ---- Colunas ----
  createColumn(workflowId: string, name: string): string {
    const pos = num(one(this.db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM columns WHERE workflow_id = ?', [workflowId])?.p);
    const id = newId();
    run(this.db, 'INSERT INTO columns(id, workflow_id, name, position, is_terminal) VALUES (?,?,?,?,0)', [id, workflowId, name, pos]);
    return id;
  }

  updateColumn(columnId: string, patch: { name?: string; category?: ColumnCategory; position?: number; collapsed?: boolean }): void {
    const db = this.db;
    transaction(db, () => {
      if (patch.name !== undefined) run(db, 'UPDATE columns SET name = ? WHERE id = ?', [patch.name, columnId]);
      if (patch.collapsed !== undefined) run(db, 'UPDATE columns SET collapsed = ? WHERE id = ?', [patch.collapsed ? 1 : 0, columnId]);
      if (patch.category !== undefined)
        run(db, 'UPDATE columns SET category = ?, is_terminal = ? WHERE id = ?', [patch.category, patch.category === 'open' ? 0 : 1, columnId]);
      if (patch.position !== undefined) {
        const col = one(db, 'SELECT workflow_id FROM columns WHERE id = ?', [columnId]);
        if (!col) throw new Error('Coluna não encontrada');
        const ids = all(db, 'SELECT id FROM columns WHERE workflow_id = ? AND id != ? ORDER BY position', [str(col.workflow_id), columnId]).map((r) => str(r.id));
        ids.splice(Math.max(0, Math.min(patch.position, ids.length)), 0, columnId);
        ids.forEach((id, i) => run(db, 'UPDATE columns SET position = ? WHERE id = ?', [i, id]));
      }
    });
  }

  /** Apaga a coluna movendo os cards para outra coluna do mesmo workflow. */
  deleteColumn(columnId: string, moveCardsTo: string): void {
    const db = this.db;
    transaction(db, () => {
      const a = one(db, 'SELECT workflow_id FROM columns WHERE id = ?', [columnId]);
      const b = one(db, 'SELECT workflow_id FROM columns WHERE id = ?', [moveCardsTo]);
      if (!a || !b) throw new Error('Coluna não encontrada');
      if (columnId === moveCardsTo || str(a.workflow_id) !== str(b.workflow_id)) throw new Error('Coluna de destino inválida');
      const count = num(one(db, 'SELECT COUNT(*) AS n FROM columns WHERE workflow_id = ?', [str(a.workflow_id)])?.n);
      if (count <= 1) throw new Error('Um workflow precisa de ao menos uma coluna');
      const base = num(one(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM cards WHERE column_id = ?', [moveCardsTo])?.p);
      all(db, 'SELECT id FROM cards WHERE column_id = ? ORDER BY position', [columnId]).forEach((r, i) =>
        run(db, 'UPDATE cards SET column_id = ?, position = ? WHERE id = ?', [moveCardsTo, base + i, str(r.id)]),
      );
      run(db, 'DELETE FROM columns WHERE id = ?', [columnId]);
    });
  }

  // ---- Tipos ----
  createType(boardId: string, name: string, color: string, defaultWorkflowId: string): string {
    const id = newId();
    run(this.db, 'INSERT INTO card_types(id, board_id, name, color, default_workflow_id) VALUES (?,?,?,?,?)', [id, boardId, name, color, defaultWorkflowId]);
    return id;
  }

  updateType(typeId: string, patch: { name?: string; color?: string; defaultWorkflowId?: string; defaults?: Record<string, FieldValue> }): void {
    if (patch.name !== undefined) run(this.db, 'UPDATE card_types SET name = ? WHERE id = ?', [patch.name, typeId]);
    if (patch.color !== undefined) run(this.db, 'UPDATE card_types SET color = ? WHERE id = ?', [patch.color, typeId]);
    if (patch.defaultWorkflowId !== undefined) run(this.db, 'UPDATE card_types SET default_workflow_id = ? WHERE id = ?', [patch.defaultWorkflowId, typeId]);
    if (patch.defaults !== undefined) {
      const clean = Object.fromEntries(Object.entries(patch.defaults).filter(([, v]) => v !== null && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0)));
      run(this.db, 'UPDATE card_types SET defaults_json = ? WHERE id = ?', [JSON.stringify(clean), typeId]);
    }
  }

  deleteType(typeId: string): void {
    const used = num(one(this.db, 'SELECT COUNT(*) AS n FROM cards WHERE type_id = ?', [typeId])?.n);
    if (used > 0) throw new Error(`Tipo em uso por ${used} card(s)`);
    run(this.db, 'DELETE FROM card_types WHERE id = ?', [typeId]);
  }

  // ---- Campos ----
  createField(boardId: string, input: { name: string; kind: FieldKind; options: string[]; appliesToTypes: string[] | null; display: FieldDisplay }): string {
    const pos = num(one(this.db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM field_defs WHERE board_id = ?', [boardId])?.p);
    const id = newId();
    run(
      this.db,
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [id, boardId, input.name, input.kind, JSON.stringify(input.options), input.appliesToTypes ? JSON.stringify(input.appliesToTypes) : null, input.display, pos],
    );
    return id;
  }

  updateField(fieldId: string, patch: { name?: string; options?: string[]; appliesToTypes?: string[] | null; display?: FieldDisplay }): void {
    if (patch.name !== undefined) run(this.db, 'UPDATE field_defs SET name = ? WHERE id = ?', [patch.name, fieldId]);
    if (patch.options !== undefined) run(this.db, 'UPDATE field_defs SET options_json = ? WHERE id = ?', [JSON.stringify(patch.options), fieldId]);
    if (patch.appliesToTypes !== undefined)
      run(this.db, 'UPDATE field_defs SET applies_to_types_json = ? WHERE id = ?', [patch.appliesToTypes ? JSON.stringify(patch.appliesToTypes) : null, fieldId]);
    if (patch.display !== undefined) run(this.db, 'UPDATE field_defs SET display = ? WHERE id = ?', [patch.display, fieldId]);
  }

  deleteField(fieldId: string): void {
    run(this.db, 'DELETE FROM field_defs WHERE id = ?', [fieldId]);
  }
}
