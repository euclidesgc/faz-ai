import type { Database } from 'sql.js';
import type { Attachment } from '../../shared/model';
import { now } from '../db/ids';
import { num, one, run, str } from '../db/query';

export class AttachmentRepo {
  constructor(private db: Database) {}

  add(a: Omit<Attachment, 'createdAt'>): void {
    run(this.db, 'INSERT INTO attachments(id, card_id, filename, stored_name, mime, size, created_at) VALUES (?,?,?,?,?,?,?)', [
      a.id, a.cardId, a.filename, a.storedName, a.mime, a.size, now(),
    ]);
  }

  get(id: string): Attachment | undefined {
    const r = one(this.db, 'SELECT * FROM attachments WHERE id = ?', [id]);
    if (!r) return undefined;
    return { id: str(r.id), cardId: str(r.card_id), filename: str(r.filename), storedName: str(r.stored_name), mime: str(r.mime), size: num(r.size), createdAt: num(r.created_at) };
  }

  delete(id: string): void {
    run(this.db, 'DELETE FROM attachments WHERE id = ?', [id]);
  }
}
