import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { run, withSql } from '../src/extension/db/query';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

describe('erros do banco dizem qual comando falhou', () => {
  it('uma gravação recusada pela chave estrangeira traz o comando, sem os valores', async () => {
    const db = await openInMemory(WASM_DIR);
    let error: Error | undefined;
    try {
      run(db, 'INSERT INTO comments(id, card_id, author, body, created_at, updated_at, source) VALUES (?,?,?,?,?,?,?)', [
        'c1',
        'card-que-nao-existe',
        'Pessoa',
        'texto secreto',
        1,
        1,
        'human',
      ]);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toContain('FOREIGN KEY constraint failed');
    expect(error?.message).toContain('— SQL: INSERT INTO comments(id, card_id');
    expect(error?.message).not.toContain('texto secreto');
    expect(error?.message).not.toContain('card-que-nao-existe');
  });

  it('não repete o comando quando o erro já o traz', () => {
    const once = withSql(new Error('falhou'), 'UPDATE cards SET title = ?');
    expect(withSql(once, 'outro').message).toBe('falhou — SQL: UPDATE cards SET title = ?');
  });
});
