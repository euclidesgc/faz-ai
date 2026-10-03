import type { Database } from 'sql.js';
import type { LinkKind } from '../../shared/model';
import { newId } from '../db/ids';
import { run } from '../db/query';

/** Vínculos entre cards. As regras (ciclo, duplicado) ficam em `shared/links.ts`. */
export class LinkRepo {
  constructor(private db: Database) {}

  add(fromId: string, toId: string, kind: LinkKind): string {
    const id = newId();
    run(this.db, 'INSERT INTO card_links(id, from_id, to_id, kind) VALUES (?,?,?,?)', [id, fromId, toId, kind]);
    return id;
  }

  remove(linkId: string): void {
    run(this.db, 'DELETE FROM card_links WHERE id = ?', [linkId]);
  }
}
