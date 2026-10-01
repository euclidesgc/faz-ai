import type { Database } from 'sql.js';
import type { Attachment, Board, BoardState, Card, CardType, ChecklistItem, Column, Comment, FieldDef, FieldValueRow, Workflow } from '../../shared/model';
import { all, bool, num, one, run, str } from '../db/query';
import { parseRules, type BoardRules } from '../../shared/rules';
import { seedBoard } from '../db/seed';
import { EMPTY_HARNESS } from '../../shared/harness';

export class BoardRepo {
  constructor(private db: Database) {}

  /** Devolve o board do workspace, criando com seed se não existir. */
  getOrCreate(workspaceKey: string, name: string): Board {
    let row = one(this.db, 'SELECT * FROM boards WHERE workspace_key = ?', [workspaceKey]);
    if (!row) {
      seedBoard(this.db, workspaceKey, name);
      row = one(this.db, 'SELECT * FROM boards WHERE workspace_key = ?', [workspaceKey])!;
    }
    return { id: str(row.id), workspaceKey: str(row.workspace_key), name: str(row.name), rules: parseRules(str(row.rules_json)) };
  }

  updateRules(boardId: string, patch: Partial<BoardRules>): void {
    const row = one(this.db, 'SELECT rules_json FROM boards WHERE id = ?', [boardId]);
    if (!row) throw new Error('Board não encontrado');
    // parseRules valida o resultado: valores desconhecidos voltam ao padrão
    const next = parseRules(JSON.stringify({ ...parseRules(str(row.rules_json)), ...patch }));
    run(this.db, 'UPDATE boards SET rules_json = ? WHERE id = ?', [JSON.stringify(next), boardId]);
  }

  /** Apaga o board com tudo o que há nele. Devolve os ids dos cards (para limpar anexos). */
  deleteBoard(boardId: string): string[] {
    const ids = all(this.db, 'SELECT id FROM cards WHERE board_id = ?', [boardId]).map((r) => str(r.id));
    run(this.db, 'DELETE FROM boards WHERE id = ?', [boardId]);
    return ids;
  }

  updateBoard(boardId: string, patch: { name?: string }): void {
    if (patch.name !== undefined) run(this.db, 'UPDATE boards SET name = ? WHERE id = ?', [patch.name, boardId]);
  }

  updateWorkflow(workflowId: string, patch: { name?: string }): void {
    if (patch.name !== undefined) run(this.db, 'UPDATE workflows SET name = ? WHERE id = ?', [patch.name, workflowId]);
  }

  snapshot(boardId: string, currentUser = ''): BoardState {
    const db = this.db;
    const b = one(db, 'SELECT * FROM boards WHERE id = ?', [boardId]);
    if (!b) throw new Error('Board não encontrado');
    const board: Board = { id: str(b.id), workspaceKey: str(b.workspace_key), name: str(b.name), rules: parseRules(str(b.rules_json)) };

    const workflows: Workflow[] = all(db, 'SELECT * FROM workflows WHERE board_id = ? ORDER BY position', [boardId]).map((r) => ({
      id: str(r.id), boardId, name: str(r.name), position: num(r.position), kind: str(r.kind) as Workflow['kind'],
    }));

    const columns: Column[] = all(
      db,
      'SELECT c.* FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE w.board_id = ? ORDER BY c.position',
      [boardId],
    ).map((r) => ({ id: str(r.id), workflowId: str(r.workflow_id), name: str(r.name), position: num(r.position), category: str(r.category) as Column['category'], isTerminal: str(r.category) !== 'open' }));

    const cardTypes: CardType[] = all(db, 'SELECT * FROM card_types WHERE board_id = ? ORDER BY rowid', [boardId]).map((r) => ({
      id: str(r.id), boardId, name: str(r.name), color: str(r.color), defaultWorkflowId: str(r.default_workflow_id),
      defaults: JSON.parse(str(r.defaults_json) || '{}') as CardType['defaults'],
    }));

    const cards: Card[] = all(db, 'SELECT * FROM cards WHERE board_id = ? ORDER BY position', [boardId]).map((r) => ({
      id: str(r.id), number: num(r.number), boardId, workflowId: str(r.workflow_id), columnId: str(r.column_id), typeId: str(r.type_id),
      parentId: r.parent_id == null ? null : str(r.parent_id), title: str(r.title), description: str(r.description),
      position: num(r.position), createdAt: num(r.created_at), updatedAt: num(r.updated_at),
      deletedAt: r.deleted_at == null ? null : num(r.deleted_at), archivedAt: r.archived_at == null ? null : num(r.archived_at),
    }));

    const fieldDefs: FieldDef[] = all(db, 'SELECT * FROM field_defs WHERE board_id = ? ORDER BY position', [boardId]).map((r) => ({
      id: str(r.id), boardId, name: str(r.name), kind: str(r.kind) as FieldDef['kind'],
      options: JSON.parse(str(r.options_json) || '[]'),
      appliesToTypes: r.applies_to_types_json == null ? null : JSON.parse(str(r.applies_to_types_json)),
      display: str(r.display) as FieldDef['display'], position: num(r.position),
    }));

    const fieldValues: FieldValueRow[] = all(
      db,
      'SELECT fv.* FROM field_values fv JOIN cards c ON c.id = fv.card_id WHERE c.board_id = ?',
      [boardId],
    ).map((r) => ({ cardId: str(r.card_id), fieldId: str(r.field_id), value: JSON.parse(str(r.value_json)) }));

    const checklistItems: ChecklistItem[] = all(
      db,
      'SELECT ci.* FROM checklist_items ci JOIN cards c ON c.id = ci.card_id WHERE c.board_id = ? ORDER BY ci.position',
      [boardId],
    ).map((r) => ({ id: str(r.id), cardId: str(r.card_id), text: str(r.text), done: bool(r.done), position: num(r.position) }));

    const comments: Comment[] = all(
      db,
      'SELECT cm.* FROM comments cm JOIN cards c ON c.id = cm.card_id WHERE c.board_id = ? ORDER BY cm.created_at',
      [boardId],
    ).map((r) => ({ id: str(r.id), cardId: str(r.card_id), author: str(r.author), body: str(r.body), createdAt: num(r.created_at), updatedAt: num(r.updated_at) }));

    const attachments: Attachment[] = all(
      db,
      'SELECT a.* FROM attachments a JOIN cards c ON c.id = a.card_id WHERE c.board_id = ? ORDER BY a.created_at',
      [boardId],
    ).map((r) => ({ id: str(r.id), cardId: str(r.card_id), filename: str(r.filename), storedName: str(r.stored_name), mime: str(r.mime), size: num(r.size), createdAt: num(r.created_at) }));

    return { board, workflows, columns, cardTypes, cards, fieldDefs, fieldValues, checklistItems, comments, attachments, currentUser, harness: EMPTY_HARNESS };
  }
}
