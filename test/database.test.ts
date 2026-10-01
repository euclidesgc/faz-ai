import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';
import { openFile } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

describe('persistência em arquivo', () => {
  it('grava, fecha e reabre mantendo os dados', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fazai-'));
    const file = path.join(dir, 'nested', 'fazai.db');

    const h1 = await openFile(file, WASM_DIR, 10);
    const boards = new BoardRepo(h1.db);
    const boardId = boards.getOrCreate('ws', 'P').id;
    const col = boards.snapshot(boardId).columns[0]!;
    const type = boards.snapshot(boardId).cardTypes[0]!;
    new CardRepo(h1.db).create(boardId, { typeId: type.id, columnId: col.id, parentId: null, title: 'persistido' });
    h1.scheduleSave();
    await h1.close();

    const h2 = await openFile(file, WASM_DIR);
    const s = new BoardRepo(h2.db).snapshot(boardId);
    expect(s.cards.map((c) => c.title)).toEqual(['persistido']);
    await h2.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
