import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AttachmentStore } from '../src/extension/attachments';
import { exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import { cleanOrphans, openFile, type DbHandle } from '../src/extension/db/database';
import { all, num, run } from '../src/extension/db/query';
import { MessageRouter } from '../src/extension/panel/messageRouter';

/**
 * Os cenários da revisão da 0.32.0 com o banco EM ARQUIVO: no sql.js, `db.export()` (o save e o `.bak`)
 * fecha e reabre a conexão e zera os PRAGMAs, e os testes em memória nunca exportam.
 */

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let dbFile: string;
let attDir: string;
let handle: DbHandle;
let router: MessageRouter;

const newRouter = (h: DbHandle) =>
  new MessageRouter(h, {
    workspaceKey: 'ws-file',
    folderName: 'F',
    author: 'Pessoa',
    attachmentsDir: attDir,
    workspaceDir: path.join(dir, 'ws-file'),
    homeDir: path.join(dir, 'home'),
  });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-export-file-'));
  dbFile = path.join(dir, 'boards', 'a.db');
  attDir = path.join(dir, 'attachments');
  handle = await openFile(dbFile, WASM_DIR, 10);
  router = newRouter(handle);
});

afterEach(async () => {
  await handle.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Cria um card na primeira coluna do workflow de histórias. */
function createStory(title: string): string {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  const type = s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!;
  const col = s.columns.find((c) => c.workflowId === wf.id)!;
  return router.createCard({ typeId: type.id, columnId: col.id, parentId: null, title });
}

const doExport = () => exportBoard(handle.db, router.boardId, router.store, { extensionVersion: '0.32.0' }).file;
const doImport = (text: string) =>
  importBoard(
    { db: handle.db, backup: () => handle.backup(), store: router.store, workspaceKey: 'ws-file', boardId: router.boardId },
    parseExportFile(text),
  );

describe('chaves estrangeiras com o banco em arquivo', () => {
  it('continuam ligadas depois do save e do .bak', async () => {
    await handle.flush();
    expect(all(handle.db, 'PRAGMA foreign_keys')[0]!.foreign_keys).toBe(1);
    handle.backup();
    expect(all(handle.db, 'PRAGMA foreign_keys')[0]!.foreign_keys).toBe(1);
  });

  it('exportar e importar o mesmo arquivo (restaurar o próprio backup) funciona', async () => {
    const story = createStory('História');
    router.handle({ type: 'attachment.addData', cardId: story, filename: 'spec.md', base64: Buffer.from('# Spec').toString('base64') });
    await handle.flush();
    const text = JSON.stringify(doExport());
    const result = doImport(text);
    expect(result.cards).toBe(1);
    await handle.flush();
    const reopened = newRouter(handle);
    expect(reopened.snapshot().cards.map((c) => c.title)).toEqual(['História']);
    const a = reopened.snapshot().attachments[0]!;
    expect(fs.readFileSync(reopened.store.pathOf(a)).toString()).toBe('# Spec');
    // nada órfão de board apagado
    expect(all(handle.db, 'SELECT COUNT(*) AS n FROM workflows WHERE board_id NOT IN (SELECT id FROM boards)')[0]!.n).toBe(0);
  });

  it('A precede B, apagar B de vez, exportar e importar funciona', async () => {
    const a = createStory('A');
    const b = createStory('B');
    router.handle({ type: 'link.add', fromId: a, toId: b, kind: 'precedes' });
    await handle.flush();
    router.handle({ type: 'card.trash', cardId: b });
    router.handle({ type: 'card.deletePermanent', cardId: b });
    expect(all(handle.db, 'SELECT COUNT(*) AS n FROM card_links')[0]!.n).toBe(0);
    await handle.flush();
    const text = JSON.stringify(doExport());
    expect(() => doImport(text)).not.toThrow();
    expect(
      newRouter(handle)
        .snapshot()
        .cards.map((c) => c.title),
    ).toEqual(['A']);
  });

  it('cleanOrphans apaga as linhas órfãs deixadas com as chaves desligadas (e o efeito em cascata)', () => {
    const a = createStory('A');
    const b = createStory('B');
    router.handle({ type: 'link.add', fromId: a, toId: b, kind: 'precedes' });
    handle.db.run('PRAGMA foreign_keys = OFF;');
    run(handle.db, 'DELETE FROM cards WHERE id = ?', [b]);
    run(handle.db, "INSERT INTO boards (id, workspace_key, name) VALUES ('fantasma', 'ws-x', 'X')");
    run(handle.db, "INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('wf-orfao', 'fantasma', 'W', 0, 'parent')");
    run(handle.db, "INSERT INTO columns (id, workflow_id, name, position) VALUES ('col-orfa', 'wf-orfao', 'C', 0)");
    run(handle.db, "DELETE FROM boards WHERE id = 'fantasma'");
    handle.db.run('PRAGMA foreign_keys = ON;');
    expect(all(handle.db, 'PRAGMA foreign_key_check').length).toBeGreaterThan(0);
    expect(cleanOrphans(handle.db)).toBeGreaterThan(0);
    expect(all(handle.db, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(all(handle.db, 'SELECT COUNT(*) AS n FROM card_links')[0]!.n).toBe(0);
    expect(all(handle.db, "SELECT COUNT(*) AS n FROM columns WHERE id = 'col-orfa'")[0]!.n).toBe(0);
    expect(num(all(handle.db, 'SELECT COUNT(*) AS n FROM cards')[0]!.n)).toBe(1);
    expect(cleanOrphans(handle.db)).toBe(0);
  });

  it('cleanOrphans apaga o workflow órfão que um tipo de card órfão segura, sem estourar', () => {
    handle.db.run('PRAGMA foreign_keys = OFF;');
    run(handle.db, "INSERT INTO boards (id, workspace_key, name) VALUES ('fantasma', 'ws-x', 'X')");
    run(handle.db, "INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('wf-orfao', 'fantasma', 'W', 0, 'parent')");
    run(
      handle.db,
      "INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('tipo-orfao', 'fantasma', 'T', '#000', 'wf-orfao')",
    );
    run(handle.db, "DELETE FROM boards WHERE id = 'fantasma'");
    handle.db.run('PRAGMA foreign_keys = ON;');
    expect(() => cleanOrphans(handle.db)).not.toThrow();
    expect(all(handle.db, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(all(handle.db, "SELECT COUNT(*) AS n FROM workflows WHERE id = 'wf-orfao'")[0]!.n).toBe(0);
  });

  it('o banco que já tem órfãos é limpo uma vez ao abrir', async () => {
    const a = createStory('A');
    const b = createStory('B');
    router.handle({ type: 'link.add', fromId: a, toId: b, kind: 'precedes' });
    handle.db.run('PRAGMA foreign_keys = OFF;');
    run(handle.db, 'DELETE FROM cards WHERE id = ?', [b]);
    run(handle.db, "DELETE FROM meta WHERE key = 'orphans_cleaned'");
    await handle.flush();
    const reopened = await openFile(dbFile, WASM_DIR);
    expect(all(reopened.db, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(all(reopened.db, "SELECT value FROM meta WHERE key = 'orphans_cleaned'")).toHaveLength(1);
    await reopened.close();
  });
});

describe('importação: caminhos de anexos', () => {
  const withAttachment = async () => {
    const story = createStory('História');
    router.handle({ type: 'attachment.addData', cardId: story, filename: 'spec.md', base64: Buffer.from('# Spec').toString('base64') });
    await handle.flush();
    return doExport();
  };

  it('recusa anexo com nome gravado que sai da pasta de anexos', async () => {
    const file = await withAttachment();
    file.tables.attachments![0]!.stored_name = '../../../PWNED.txt';
    expect(() => parseExportFile(JSON.stringify(file))).toThrow('Arquivo não é um export do Faz AI: nome de anexo inválido.');
    for (const bad of ['..', '.', 'a/b', 'a\\b', '/etc/passwd', 'C:x', '']) {
      file.tables.attachments![0]!.stored_name = bad;
      expect(() => parseExportFile(JSON.stringify(file)), bad).toThrow('nome de anexo inválido');
    }
    expect(fs.existsSync(path.join(dir, 'PWNED.txt'))).toBe(false);
  });

  it('recusa card com id que sai da pasta de anexos (no card e no anexo)', async () => {
    const file = await withAttachment();
    const bad = JSON.parse(JSON.stringify(file)) as typeof file;
    bad.tables.cards![0]!.id = '../victim';
    expect(() => parseExportFile(JSON.stringify(bad))).toThrow('Arquivo não é um export do Faz AI: id de card inválido.');
    const bad2 = JSON.parse(JSON.stringify(file)) as typeof file;
    bad2.tables.attachments![0]!.card_id = '../victim';
    expect(() => parseExportFile(JSON.stringify(bad2))).toThrow('Arquivo não é um export do Faz AI: id de card inválido.');
  });

  it('AttachmentStore recusa caminho fora da pasta de anexos (leitura, gravação e exclusão)', () => {
    fs.mkdirSync(path.join(dir, 'victim'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'victim', 'x.txt'), 'x');
    const store = new AttachmentStore(attDir);
    expect(() => store.pathOf({ cardId: 'card', storedName: '../../../PWNED.txt' })).toThrow('Caminho de anexo fora da pasta de anexos');
    expect(() => store.pathOf({ cardId: '../victim', storedName: 'x.txt' })).toThrow('Caminho de anexo fora da pasta de anexos');
    expect(() => store.removeCard('../victim')).toThrow('Caminho de anexo fora da pasta de anexos');
    expect(() => store.removeCard('')).toThrow('Caminho de anexo fora da pasta de anexos');
    expect(() => store.removeCard('..')).toThrow('Caminho de anexo fora da pasta de anexos');
    expect(fs.existsSync(path.join(dir, 'victim', 'x.txt'))).toBe(true);
    expect(store.pathOf({ cardId: 'card', storedName: 'ab-spec.md' })).toBe(path.join(attDir, 'card', 'ab-spec.md'));
  });
});

describe('importação: os anexos anteriores ficam numa pasta de backup', () => {
  it('as pastas dos cards substituídos vão para <anexos>.bak-<data> em vez de serem apagadas', async () => {
    const story = createStory('Antiga');
    router.handle({ type: 'attachment.addData', cardId: story, filename: 'velho.md', base64: Buffer.from('velho').toString('base64') });
    const old = router.snapshot().attachments[0]!;
    await handle.flush();

    // um outro board, exportado de outro banco, entra no lugar
    const otherHandle = await openFile(path.join(dir, 'boards', 'b.db'), WASM_DIR, 10);
    const other = new MessageRouter(otherHandle, {
      workspaceKey: 'ws-b',
      folderName: 'B',
      author: 'Pessoa',
      attachmentsDir: path.join(dir, 'att-b'),
      workspaceDir: path.join(dir, 'ws-b'),
      homeDir: path.join(dir, 'home'),
    });
    const text = JSON.stringify(exportBoard(otherHandle.db, other.boardId, other.store, { extensionVersion: '0.32.0' }).file);
    await otherHandle.close();

    const result = doImport(text);
    expect(result.attachmentsBackup).toMatch(/attachments\.bak-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    expect(fs.existsSync(path.join(attDir, story))).toBe(false);
    expect(fs.readFileSync(path.join(result.attachmentsBackup!, story, old.storedName)).toString()).toBe('velho');
    // e o banco não ficou com workflows/campos órfãos do board substituído
    expect(all(handle.db, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(all(handle.db, 'SELECT COUNT(*) AS n FROM workflows WHERE board_id NOT IN (SELECT id FROM boards)')[0]!.n).toBe(0);
    expect(all(handle.db, 'SELECT COUNT(*) AS n FROM field_defs WHERE board_id NOT IN (SELECT id FROM boards)')[0]!.n).toBe(0);
  });

  it('sem cards com anexo no board substituído, nenhuma pasta de backup é criada', async () => {
    await handle.flush();
    const result = doImport(JSON.stringify(doExport()));
    expect(result.attachmentsBackup).toBeUndefined();
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('attachments.bak-'))).toEqual([]);
  });
});
