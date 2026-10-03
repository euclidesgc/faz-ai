import type { Database } from 'sql.js';
import type { Attachment } from '../../shared/model';
import { now } from '../db/ids';
import { all, bool, num, one, run, str } from '../db/query';

export class AttachmentRepo {
  constructor(private db: Database) {}

  add(a: Omit<Attachment, 'createdAt' | 'artifact'>, artifact = false): void {
    run(this.db, 'INSERT INTO attachments(id, card_id, filename, stored_name, mime, size, created_at, artifact) VALUES (?,?,?,?,?,?,?,?)', [
      a.id,
      a.cardId,
      a.filename,
      a.storedName,
      a.mime,
      a.size,
      now(),
      artifact ? 1 : 0,
    ]);
  }

  /** Artefatos do card com este nome de arquivo (a revisão de um artefato substitui o anterior). */
  artifactsNamed(cardId: string, filename: string): Attachment[] {
    return all(this.db, 'SELECT id FROM attachments WHERE card_id = ? AND artifact = 1 AND lower(filename) = lower(?)', [
      cardId,
      filename,
    ]).map((r) => this.get(str(r.id))!);
  }

  get(id: string): Attachment | undefined {
    const r = one(this.db, 'SELECT * FROM attachments WHERE id = ?', [id]);
    if (!r) return undefined;
    return {
      id: str(r.id),
      cardId: str(r.card_id),
      filename: str(r.filename),
      storedName: str(r.stored_name),
      mime: str(r.mime),
      size: num(r.size),
      createdAt: num(r.created_at),
      artifact: bool(r.artifact),
    };
  }

  delete(id: string): void {
    run(this.db, 'DELETE FROM attachments WHERE id = ?', [id]);
  }
}
