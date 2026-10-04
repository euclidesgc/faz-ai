import * as fs from 'node:fs';
import type { Database, SqlValue } from 'sql.js';
import { LARGE_EXPORT_BYTES, type ImportSummary } from '../../shared/backup';
import { safeName, type AttachmentStore } from '../attachments';
import { all, num, one, str, type Row } from './query';
import { SCHEMA_VERSION } from './schema';

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
