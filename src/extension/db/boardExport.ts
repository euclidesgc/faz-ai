import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Database, SqlValue } from 'sql.js';
import { LARGE_EXPORT_BYTES, type ImportSummary } from '../../shared/backup';
import { isSafeSegment, safeName, type AttachmentStore } from '../attachments';
import { newDatabase } from './database';
import { all, num, one, run, str, transaction, type Row } from './query';
import { migrate, SCHEMA_VERSION } from './schema';

/**
 * Exportar e importar um board como um único arquivo JSON (`<nome>-<AAAA-MM-DD>.fazai.json`). O arquivo
 * é uma projeção tabela a tabela do SQLite, filtrada pelo board e com as colunas em `snake_case` como
 * estão no banco; os anexos vão embutidos em base64. Sem dependência da API do VS Code: serve ao editor,
 * ao navegador e a uma futura ferramenta MCP.
 */

export const EXPORT_MARKER = 'board-export';
export const FORMAT_VERSION = 1;

/** Uma tabela exportada e como as linhas dela se ligam ao board (`?` é o board_id). */
export interface ExportTable {
  name: string;
  /** condição SQL que seleciona as linhas do board */
  where: string;
  /** a tabela tem chave primária `id` (as demais usam chave composta) */
  hasId: boolean;
}

const byCard = 'card_id IN (SELECT id FROM cards WHERE board_id = ?)';

/**
 * Lista única das tabelas exportadas, em ordem de inserção (quem é referenciado vem antes). A tabela
 * `boards` vai à parte (em `board`); `log_months` fica fora de propósito (decisão do PRD). Tabela nova no
 * schema com `board_id`/`card_id` precisa entrar aqui: o teste contra o `sqlite_master` cobra.
 */
export const EXPORT_TABLES: readonly ExportTable[] = [
  { name: 'workflows', where: 'board_id = ?', hasId: true },
  { name: 'columns', where: 'workflow_id IN (SELECT id FROM workflows WHERE board_id = ?)', hasId: true },
  { name: 'card_types', where: 'board_id = ?', hasId: true },
  { name: 'field_defs', where: 'board_id = ?', hasId: true },
  { name: 'cards', where: 'board_id = ?', hasId: true },
  { name: 'field_values', where: byCard, hasId: false },
  { name: 'checklist_items', where: byCard, hasId: true },
  { name: 'comments', where: byCard, hasId: true },
  { name: 'card_links', where: 'from_id IN (SELECT id FROM cards WHERE board_id = ?)', hasId: true },
  { name: 'attachments', where: byCard, hasId: true },
  { name: 'card_events', where: 'board_id = ?', hasId: true },
  { name: 'ai_runs', where: 'board_id = ?', hasId: true },
  { name: 'ai_run_usage', where: 'run_id IN (SELECT id FROM ai_runs WHERE board_id = ?)', hasId: false },
  // a marcação do harness é deste board: vai junto (os caminhos relativos ao projeto e a `~` valem na outra máquina)
  { name: 'harness_selection', where: 'board_id = ?', hasId: false },
];

/** Tabelas que ficam fora do arquivo mesmo tendo `board_id` (o teste do `sqlite_master` as ignora). */
export const NOT_EXPORTED = ['boards', 'log_months'];

/** Colunas de `boards` que nunca saem no arquivo: `workspace_key` liga o board à pasta desta máquina. */
export const OMIT_BOARD_KEYS = ['workspace_key'];
/** Chaves dos JSONs de configuração de `boards` que seriam segredo (vazia na v1; fica o lugar). */
export const OMIT_KEYS: string[] = [];

export interface ExportedFile {
  attachmentId: string;
  /** ausente quando o arquivo do anexo não estava no disco (RF-08) */
  base64?: string;
}

export interface BoardExportFile {
  fazai: typeof EXPORT_MARKER;
  formatVersion: number;
  schemaVersion: number;
  extensionVersion: string;
  exportedAt: string;
  /** a linha de `boards`, sem `workspace_key` */
  board: Row;
  tables: Record<string, Row[]>;
  files: ExportedFile[];
}

export interface ExportResult {
  file: BoardExportFile;
  /** `#n` dos cards com anexo registrado sem arquivo em disco */
  warnings: string[];
}

/** Monta o arquivo de export do board `boardId`. Lê os anexos pelo `store`; anexo sem arquivo vira aviso. */
export function exportBoard(
  db: Database,
  boardId: string,
  store: Pick<AttachmentStore, 'pathOf'>,
  meta: { extensionVersion: string; now?: number },
): ExportResult {
  const boardRow = one(db, 'SELECT * FROM boards WHERE id = ?', [boardId]);
  if (!boardRow) throw new Error('Board não encontrado');
  const board: Row = {};
  for (const [k, v] of Object.entries(boardRow)) if (!OMIT_BOARD_KEYS.includes(k)) board[k] = omitSecrets(k, v);

  const tables: Record<string, Row[]> = {};
  for (const t of EXPORT_TABLES) tables[t.name] = all(db, `SELECT * FROM ${t.name} WHERE ${t.where} ORDER BY rowid`, [boardId]);

  const warnings: string[] = [];
  const numbers = new Map(tables.cards!.map((c) => [str(c.id), num(c.number)]));
  const files: ExportedFile[] = tables.attachments!.map((a) => {
    const attachmentId = str(a.id);
    try {
      const data = fs.readFileSync(store.pathOf({ cardId: str(a.card_id), storedName: str(a.stored_name) }));
      return { attachmentId, base64: data.toString('base64') };
    } catch {
      const n = `#${numbers.get(str(a.card_id)) ?? '?'}`;
      if (!warnings.includes(n)) warnings.push(n);
      return { attachmentId };
    }
  });

  return {
    file: {
      fazai: EXPORT_MARKER,
      formatVersion: FORMAT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      extensionVersion: meta.extensionVersion,
      exportedAt: new Date(meta.now ?? Date.now()).toISOString(),
      board,
      tables,
      files,
    },
    warnings,
  };
}

/** Tira de um JSON de configuração de `boards` as chaves listadas em `OMIT_KEYS` (nenhuma hoje). */
function omitSecrets(column: string, value: SqlValue): SqlValue {
  if (!OMIT_KEYS.length || !column.endsWith('_json') || typeof value !== 'string') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return value;
    const clean = Object.fromEntries(Object.entries(parsed).filter(([k]) => !OMIT_KEYS.includes(k)));
    return JSON.stringify(clean);
  } catch {
    return value;
  }
}

/** Nome sugerido para o arquivo exportado: `<nome do board>-<AAAA-MM-DD>.fazai.json`. */
export function exportFileName(boardName: string, now = Date.now()): string {
  const d = new Date(now);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${safeName(boardName.replace(/[\\/]+/g, '_')).replace(/\.+$/, '') || 'board'}-${day}.fazai.json`;
}

const invalid = (reason: string) => new Error(`Arquivo não é um export do Faz AI: ${reason}`);

/**
 * Lê e valida o texto de um arquivo de export. Recusa (com o motivo) JSON inválido, arquivo sem o marcador,
 * formato ou schema mais novos que esta versão da extensão, tabela obrigatória ausente e linha sem `id`.
 */
export function parseExportFile(text: string): BoardExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw invalid('o conteúdo não é um JSON válido.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('o conteúdo não é um objeto JSON.');
  const f = data as Partial<BoardExportFile>;
  if (f.fazai !== EXPORT_MARKER) throw invalid(`falta o marcador "${EXPORT_MARKER}".`);
  if (typeof f.formatVersion !== 'number' || !Number.isInteger(f.formatVersion) || f.formatVersion < 1)
    throw invalid('a versão do formato é inválida.');
  if (f.formatVersion > FORMAT_VERSION)
    throw new Error(`Este arquivo foi gerado por uma versão mais nova do Faz AI (formato ${f.formatVersion}). Atualize a extensão.`);
  if (typeof f.schemaVersion !== 'number' || !Number.isInteger(f.schemaVersion) || f.schemaVersion < 1)
    throw invalid('a versão do banco é inválida.');
  const extensionVersion = typeof f.extensionVersion === 'string' ? f.extensionVersion : '';
  if (f.schemaVersion > SCHEMA_VERSION)
    throw new Error(
      `Este arquivo precisa do Faz AI ${extensionVersion || '?'} ou superior (banco versão ${f.schemaVersion}). Atualize a extensão.`,
    );
  if (!isRow(f.board) || typeof f.board.id !== 'string' || !f.board.id) throw invalid('faltam os dados do board.');
  if (typeof f.board.name !== 'string') throw invalid('o board não tem nome.');
  if (!f.tables || typeof f.tables !== 'object' || Array.isArray(f.tables)) throw invalid('faltam as tabelas.');
  const tables = f.tables as Record<string, unknown>;
  for (const t of EXPORT_TABLES) {
    const rows = tables[t.name];
    if (!Array.isArray(rows)) throw invalid(`falta a tabela "${t.name}".`);
    for (const row of rows) {
      if (!isRow(row)) throw invalid(`linha inválida em "${t.name}".`);
      if (t.hasId && (typeof row.id !== 'string' || !row.id)) throw invalid(`linha sem id em "${t.name}".`);
    }
  }
  // id de card e nome gravado de anexo viram caminho em disco (<anexos>/<card>/<nome>): nada que saia da pasta
  for (const c of tables.cards as Row[]) if (!isSafeSegment(str(c.id))) throw invalid('id de card inválido.');
  for (const a of tables.attachments as Row[]) {
    if (typeof a.card_id !== 'string' || !isSafeSegment(a.card_id)) throw invalid('id de card inválido.');
    if (typeof a.stored_name !== 'string' || !isSafeSegment(a.stored_name)) throw invalid('nome de anexo inválido.');
  }
  if (!Array.isArray(f.files)) throw invalid('falta a lista de arquivos dos anexos.');
  for (const file of f.files) {
    if (!isRow(file) || typeof file.attachmentId !== 'string') throw invalid('item inválido na lista de arquivos dos anexos.');
    if (file.base64 !== undefined && typeof file.base64 !== 'string') throw invalid('conteúdo de anexo inválido.');
  }
  return {
    fazai: EXPORT_MARKER,
    formatVersion: f.formatVersion,
    schemaVersion: f.schemaVersion,
    extensionVersion,
    exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : '',
    board: f.board,
    tables: Object.fromEntries(EXPORT_TABLES.map((t) => [t.name, tables[t.name] as Row[]])),
    files: f.files as ExportedFile[],
  };
}

function isRow(v: unknown): v is Record<string, SqlValue> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v).every((x) => x === null || typeof x === 'string' || typeof x === 'number');
}

/** O resumo mostrado antes de confirmar a importação. */
export function summarize(file: BoardExportFile, sizeBytes: number): ImportSummary {
  return {
    boardName: str(file.board.name),
    cards: file.tables.cards?.length ?? 0,
    attachments: file.tables.attachments?.length ?? 0,
    sizeBytes,
    formatVersion: file.formatVersion,
    schemaVersion: file.schemaVersion,
    extensionVersion: file.extensionVersion,
    exportedAt: file.exportedAt,
    large: sizeBytes > LARGE_EXPORT_BYTES,
  };
}

/** Onde a importação escreve: o banco real (e a cópia de segurança dele), a pasta de anexos e a pasta aberta. */
export interface ImportTarget {
  db: Database;
  /** grava o `.bak` antes de apagar o board; sem ele (testes em memória) a importação segue sem cópia */
  backup?: () => void;
  store: Pick<AttachmentStore, 'pathOf' | 'backupCards'>;
  /** chave da pasta aberta: o board importado passa a ser o desta pasta */
  workspaceKey: string;
  /** o board atual, que é substituído */
  boardId: string;
}

export interface ImportResult {
  boardId: string;
  boardName: string;
  cards: number;
  attachments: number;
  /** `#n` dos cards cujo anexo ficou sem arquivo (sem conteúdo no export ou falha ao gravar) */
  warnings: string[];
  /** pasta para onde foram movidos os anexos do board substituído; ausente se ele não tinha anexos em disco */
  attachmentsBackup?: string;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Substitui o board `target.boardId` pelo do arquivo. Tudo o que pode falhar acontece antes de tocar o
 * banco real: os anexos são decodificados, o arquivo é materializado num banco em memória na versão de
 * schema dele e migrado até a atual. Só então o `.bak` é gravado, o board atual apagado e as tabelas
 * copiadas, numa transação. Os arquivos de anexos são gravados depois do COMMIT: falha neles vira aviso.
 * As pastas de anexos do board substituído não são apagadas: vão para `<anexos>.bak-<data>`, par do `.bak`.
 */
export function importBoard(target: ImportTarget, file: BoardExportFile): ImportResult {
  const db = target.db;
  const newBoardId = str(file.board.id);
  const boardName = str(file.board.name);

  // 1. anexos: decodifica tudo antes (base64 inválido lança aqui, com o board intacto)
  const attachmentRows = file.tables.attachments ?? [];
  const nameOf = new Map(attachmentRows.map((a) => [str(a.id), str(a.filename)]));
  const contents = new Map<string, Buffer>();
  for (const f of file.files) {
    if (f.base64 === undefined) continue;
    const clean = f.base64.replace(/\s+/g, '');
    if (!BASE64.test(clean) || clean.length % 4 !== 0)
      throw new Error(`Anexo "${nameOf.get(f.attachmentId) ?? f.attachmentId}" com conteúdo inválido no arquivo.`);
    contents.set(f.attachmentId, Buffer.from(clean, 'base64'));
  }

  // 2. banco em memória na versão do arquivo, com as linhas, migrado até a versão atual
  const mem = newDatabase();
  try {
    migrate(mem, file.schemaVersion);
    const boardRow: Row = { ...file.board, workspace_key: target.workspaceKey };
    if (columnsOf(mem, 'boards').includes('log_rollup_day')) boardRow.log_rollup_day = '';
    insertRows(mem, 'boards', [boardRow]);
    for (const t of EXPORT_TABLES) {
      const rows = file.tables[t.name] ?? [];
      if (!tableExists(mem, t.name)) {
        if (rows.length) throw invalid(`a tabela "${t.name}" não existe no banco versão ${file.schemaVersion}.`);
        continue;
      }
      insertRows(mem, t.name, t.name === 'cards' ? parentsFirst(rows) : rows);
    }
    migrate(mem);

    // 3. o outro board com o mesmo id (o mesmo arquivo importado em duas pastas do mesmo banco) não pode ser engolido
    const clash = one(db, 'SELECT id FROM boards WHERE id = ? AND id != ?', [newBoardId, target.boardId]);
    if (clash) throw new Error('Este board já foi importado em outra pasta que usa o mesmo banco.');

    // 4. cópia de segurança; se falhar, nada é apagado
    target.backup?.();

    // 5. troca no banco real, numa transação
    const oldCards = all(db, 'SELECT id FROM cards WHERE board_id = ?', [target.boardId]).map((r) => str(r.id));
    transaction(db, () => {
      run(db, 'DELETE FROM boards WHERE id = ?', [target.boardId]);
      insertRows(db, 'boards', all(mem, 'SELECT * FROM boards WHERE id = ?', [newBoardId]));
      for (const t of EXPORT_TABLES)
        insertRows(db, t.name, all(mem, `SELECT * FROM ${t.name} WHERE ${t.where} ORDER BY rowid`, [newBoardId]));
    });

    // 6. arquivos de anexos, depois do COMMIT; os do board substituído vão para a pasta de backup
    let attachmentsBackup: string | undefined;
    try {
      attachmentsBackup = target.store.backupCards(oldCards);
    } catch {
      // backup dos anexos é cortesia: o banco já trocou, e as pastas antigas ficam onde estão
    }
    const numbers = new Map((file.tables.cards ?? []).map((c) => [str(c.id), num(c.number)]));
    const warnings: string[] = [];
    const warn = (cardId: string) => {
      const n = `#${numbers.get(cardId) ?? '?'}`;
      if (!warnings.includes(n)) warnings.push(n);
    };
    for (const a of attachmentRows) {
      const data = contents.get(str(a.id));
      const cardId = str(a.card_id);
      if (!data) {
        warn(cardId);
        continue;
      }
      try {
        const dest = target.store.pathOf({ cardId, storedName: str(a.stored_name) });
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, data);
      } catch {
        warn(cardId);
      }
    }
    const result: ImportResult = { boardId: newBoardId, boardName, cards: numbers.size, attachments: attachmentRows.length, warnings };
    if (attachmentsBackup) result.attachmentsBackup = attachmentsBackup;
    return result;
  } finally {
    mem.close();
  }
}

const tableExists = (db: Database, table: string): boolean =>
  !!one(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);

const columnsOf = (db: Database, table: string): string[] => all(db, `PRAGMA table_info(${table})`).map((c) => str(c.name));

/** Insere as linhas usando só as colunas que a tabela tem (as demais ficam com o DEFAULT do schema). */
function insertRows(db: Database, table: string, rows: Row[]): void {
  if (!rows.length) return;
  const known = new Set(columnsOf(db, table));
  const cols = Object.keys(rows[0]!).filter((c) => known.has(c));
  if (!cols.length) return;
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const stmt = db.prepare(sql);
  try {
    for (const row of rows) {
      stmt.run(cols.map((c) => row[c] ?? null));
    }
  } finally {
    stmt.free();
  }
}

/** Cards com o pai antes dos filhos (a FK de `parent_id` exige), mantendo a ordem entre irmãos. */
function parentsFirst(rows: Row[]): Row[] {
  const ids = new Set(rows.map((r) => str(r.id)));
  const done = new Set<string>();
  const out: Row[] = [];
  let pending = rows;
  while (pending.length) {
    const next: Row[] = [];
    for (const r of pending) {
      const parent = r.parent_id == null ? null : str(r.parent_id);
      if (parent === null || done.has(parent) || !ids.has(parent)) {
        out.push(r);
        done.add(str(r.id));
      } else next.push(r);
    }
    // ciclo (pai aponta para descendente): entrega o resto como está e deixa a FK reclamar
    if (next.length === pending.length) return [...out, ...next];
    pending = next;
  }
  return out;
}
