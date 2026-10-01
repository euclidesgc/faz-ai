import type { Database } from 'sql.js';
import { newId, now } from '../db/ids';
import { run } from '../db/query';

export class CommentRepo {
  constructor(private db: Database) {}

  add(cardId: string, author: string, body: string): string {
    const id = newId();
    const t = now();
    run(this.db, 'INSERT INTO comments(id, card_id, author, body, created_at, updated_at) VALUES (?,?,?,?,?,?)', [id, cardId, author, body, t, t]);
    return id;
  }

  update(commentId: string, body: string): void {
    run(this.db, 'UPDATE comments SET body = ?, updated_at = ? WHERE id = ?', [body, now(), commentId]);
  }

  delete(commentId: string): void {
    run(this.db, 'DELETE FROM comments WHERE id = ?', [commentId]);
  }
}
