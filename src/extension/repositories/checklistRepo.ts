import type { Database } from 'sql.js';
import { newId } from '../db/ids';
import { num, one, run } from '../db/query';

export class ChecklistRepo {
  constructor(private db: Database) {}

  add(cardId: string, text: string): string {
    const pos = num(one(this.db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM checklist_items WHERE card_id = ?', [cardId])?.p);
    const id = newId();
    run(this.db, 'INSERT INTO checklist_items(id, card_id, text, done, position) VALUES (?,?,?,?,?)', [id, cardId, text, 0, pos]);
    return id;
  }

  update(itemId: string, patch: { text?: string; done?: boolean }): void {
    if (patch.text !== undefined) run(this.db, 'UPDATE checklist_items SET text = ? WHERE id = ?', [patch.text, itemId]);
    if (patch.done !== undefined) run(this.db, 'UPDATE checklist_items SET done = ? WHERE id = ?', [patch.done ? 1 : 0, itemId]);
  }

  delete(itemId: string): void {
    run(this.db, 'DELETE FROM checklist_items WHERE id = ?', [itemId]);
  }
}
