// Artefatos do board (#615): leitura e gravação de board_artifacts e board_artifact_files. Só banco: a
// leitura das origens e a cópia de leitura em disco são de outros módulos.
import type { Database } from 'sql.js';
import {
  artifactLocation,
  selectableOfKind,
  type AgentMeta,
  type ArtifactDraft,
  type ArtifactKind,
  type BoardArtifact,
} from '../../shared/artifacts';
import { defaultUsage, type HarnessSelection, type HarnessUsage } from '../../shared/harnessSelection';
import { isAiBase, type AiTool } from '../../shared/harness';
import { all, bool, num, one, run, str, transaction, type Row } from '../db/query';
import { newId, now } from '../db/ids';
import { credentialsFor, validSecretRef } from '../credentials';
const credentialOwner = (boardId: string, id: string) => JSON.stringify(['mcp', boardId, id]);
const transportOf = (s: Record<string, unknown>): 'stdio' | 'http' | 'sse' | '' =>
  typeof s.command === 'string' ? 'stdio' : typeof s.url === 'string' ? (s.type === 'sse' ? 'sse' : 'http') : '';

/** Um artefato lido do banco: o `BoardArtifact` sem o `path` (que o host preenche), com o corpo inteiro e o `meta` cru. */
export type ArtifactRow = Omit<BoardArtifact, 'path'> & { meta: ArtifactDraft['meta'] };

const USAGES: readonly string[] = ['always', 'contextual', 'off'];
const KINDS: readonly string[] = ['rule', 'skill', 'agent', 'mcp'];

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

/** O que o servidor MCP roda ou onde ele está (o mesmo texto do inventário): sem argumentos, variáveis ou cabeçalhos. */
function mcpSummaryOf(transport: unknown): string {
  return transport === 'stdio' ? 'MCP stdio' : transport === 'http' || transport === 'sse' ? 'MCP HTTP' : 'MCP';
}

function serverOf(meta: ArtifactDraft['meta']): Record<string, unknown> | undefined {
  const s = (meta as { server?: unknown }).server;
  return s && typeof s === 'object' && !Array.isArray(s) ? (s as Record<string, unknown>) : undefined;
}

/** Importar conserva referências, mas nunca importa uma autorização de executar. */
export function protectImportedMcpRow(db: Database, row: Row): Row {
  if (row.kind !== 'mcp') return row;
  let meta: { server?: unknown; transport?: unknown };
  try {
    meta = JSON.parse(str(row.meta_json)) as typeof meta;
  } catch {
    throw new Error('Definição MCP importada inválida.');
  }
  const server =
    meta && typeof meta === 'object' && meta.server && typeof meta.server === 'object' && !Array.isArray(meta.server)
      ? (meta.server as Record<string, unknown>)
      : undefined;
  if (!server) throw new Error('Definição MCP importada inválida.');
  const ref = validSecretRef(server.secretRef)
    ? server.secretRef
    : credentialsFor(db).put(credentialOwner(str(row.board_id), str(row.id)), server);
  const transport = ['stdio', 'http', 'sse'].includes(String(meta.transport)) ? meta.transport : transportOf(server);
  return { ...row, secret_ref: ref, review_state: 'pending', meta_json: JSON.stringify({ server: { secretRef: ref }, transport }) };
}

export class ArtifactRepo {
  constructor(private db: Database) {
    this.protectLegacy();
  }

  /** Salva todos os valores primeiro; qualquer falha preserva o JSON legado inteiro no banco. */
  protectLegacy(): void {
    this.db.run('PRAGMA secure_delete = ON;');
    const rows = all(this.db, "SELECT * FROM board_artifacts WHERE kind = 'mcp' AND secret_ref IS NULL AND review_state = 'legacy'");
    const protectedRows = rows.map((r) => {
      const server = serverOf(parseJson(str(r.meta_json), {}));
      if (!server) throw new Error('Definição MCP legada inválida; valores originais preservados.');
      const ref = credentialsFor(this.db).put(credentialOwner(str(r.board_id), str(r.id)), server);
      return { id: str(r.id), ref, transport: transportOf(server) };
    });
    if (protectedRows.length)
      transaction(this.db, () => {
        for (const r of protectedRows)
          run(this.db, "UPDATE board_artifacts SET meta_json = ?, secret_ref = ?, review_state = 'reviewed' WHERE id = ?", [
            JSON.stringify({ server: { secretRef: r.ref }, transport: r.transport }),
            r.ref,
            r.id,
          ]);
      });
  }

  /** Os artefatos do board, sem conteúdo de regra/skill (o do agente entra) e sem a definição MCP (só o resumo). */
  list(boardId: string): Omit<BoardArtifact, 'path'>[] {
    const files = new Map<string, string[]>();
    for (const r of all(
      this.db,
      `SELECT f.artifact_id, f.path FROM board_artifact_files f JOIN board_artifacts a ON a.id = f.artifact_id
       WHERE a.board_id = ? ORDER BY f.path`,
      [boardId],
    )) {
      const id = str(r.artifact_id);
      files.set(id, [...(files.get(id) ?? []), str(r.path)]);
    }
    return all(this.db, 'SELECT * FROM board_artifacts WHERE board_id = ? ORDER BY kind, name', [boardId]).map((r) => {
      const { meta: _meta, ...a } = this.toRow(r, files.get(str(r.id)) ?? []);
      const publicBody = a.kind === 'agent' ? a.body : '';
      return { ...a, body: publicBody };
    });
  }

  get(boardId: string, kind: ArtifactKind, name: string): ArtifactRow | undefined {
    const r = one(this.db, 'SELECT * FROM board_artifacts WHERE board_id = ? AND kind = ? AND name = ?', [boardId, kind, name]);
    return r && this.toRow(r, this.filePaths(str(r.id)));
  }

  /** Pela identidade na marcação (`artifactLocation`): a origem, ou `board:<nome>` no criado no board. */
  findByLocation(boardId: string, kind: ArtifactKind, location: string): ArtifactRow | undefined {
    const r = all(this.db, 'SELECT * FROM board_artifacts WHERE board_id = ? AND kind = ?', [boardId, kind]).find(
      (x) => artifactLocation({ kind, origin: str(x.origin), name: str(x.name) }) === location,
    );
    return r && this.toRow(r, this.filePaths(str(r.id)));
  }

  /** O corpo e os arquivos de apoio, para a cópia de leitura. */
  content(id: string): { body: string; files: ArtifactDraft['files'] } {
    const body = str(one(this.db, 'SELECT body FROM board_artifacts WHERE id = ?', [id])?.body);
    const files = all(this.db, 'SELECT path, content, encoding, size FROM board_artifact_files WHERE artifact_id = ? ORDER BY path', [
      id,
    ]).map((f) => ({
      path: str(f.path),
      content: str(f.content),
      encoding: str(f.encoding) === 'base64' ? ('base64' as const) : ('utf8' as const),
      size: num(f.size),
    }));
    return { body, files };
  }

  /**
   * Cria ou substitui (mesmo tipo e nome): mantém `id`, `created_at` e, sem `usage`, o modo atual (num
   * novo, o padrão do tipo); troca todos os arquivos de apoio. Devolve o id.
   */
  upsert(boardId: string, draft: ArtifactDraft, usage?: HarnessUsage, reviewed = false): string {
    return transaction(this.db, () => this.write(boardId, draft, usage, reviewed));
  }

  /** Importação em lote: nenhum item fica pela metade se uma gravação falhar. */
  upsertMany(boardId: string, items: { draft: ArtifactDraft; usage?: HarnessUsage }[]): void {
    transaction(this.db, () => {
      for (const { draft, usage } of items) this.write(boardId, draft, usage);
    });
  }

  setUsage(boardId: string, id: string, usage: HarnessUsage): void {
    run(this.db, 'UPDATE board_artifacts SET usage = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND board_id = ?', [
      usage,
      now(),
      id,
      boardId,
    ]);
  }

  /** Os arquivos de apoio saem pelo ON DELETE CASCADE. */
  remove(boardId: string, id: string): void {
    run(this.db, 'DELETE FROM board_artifacts WHERE id = ? AND board_id = ?', [id, boardId]);
  }

  /** `{ nome: definição }` completas dos servidores MCP não ausentes, com `env` e `headers`: só o host usa. */
  mcpDefinitions(boardId: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const r of all(
      this.db,
      "SELECT id, name, secret_ref FROM board_artifacts WHERE board_id = ? AND kind = 'mcp' AND missing = 0 AND review_state = 'reviewed' ORDER BY name",
      [boardId],
    )) {
      const server = credentialsFor(this.db).get(credentialOwner(boardId, str(r.id)), str(r.secret_ref));
      if (server) out[str(r.name)] = server;
    }
    return out;
  }

  /** A definição completa (com `env` e `headers`) de um servidor MCP: só o host usa, nunca vai à interface. */
  mcpServer(boardId: string, id: string): Record<string, unknown> | null {
    const r = one(this.db, "SELECT secret_ref FROM board_artifacts WHERE id = ? AND board_id = ? AND kind = 'mcp'", [id, boardId]);
    return r ? credentialsFor(this.db).get(credentialOwner(boardId, id), str(r.secret_ref)) : null;
  }

  /** A marcação antiga (harness_selection) que ainda falta copiar. */
  legacySelection(boardId: string): HarnessSelection[] {
    return all(this.db, 'SELECT kind, location, usage FROM harness_selection WHERE board_id = ? ORDER BY kind, location', [boardId]).map(
      (r) => ({
        kind: str(r.kind) as HarnessSelection['kind'],
        location: str(r.location),
        usage: (USAGES.includes(str(r.usage)) ? str(r.usage) : 'off') as HarnessUsage,
      }),
    );
  }

  /** Grava os rascunhos e apaga de harness_selection as linhas copiadas, numa transação: falha no meio não deixa nada. */
  importLegacy(boardId: string, items: { selection: HarnessSelection; draft: ArtifactDraft }[]): void {
    transaction(this.db, () => {
      for (const { selection, draft } of items) {
        this.write(boardId, draft, selection.usage);
        run(this.db, 'DELETE FROM harness_selection WHERE board_id = ? AND kind = ? AND location = ?', [
          boardId,
          selection.kind,
          selection.location,
        ]);
      }
    });
  }

  // --- internos ---

  private write(boardId: string, d: ArtifactDraft, usage?: HarnessUsage, reviewed = false): string {
    const t = now();
    const existing = one(
      this.db,
      'SELECT id, usage, secret_ref, review_state FROM board_artifacts WHERE board_id = ? AND kind = ? AND name = ?',
      [boardId, d.kind, d.name],
    );
    const id = existing ? str(existing.id) : newId();
    let meta = d.meta;
    let ref: string | null = null;
    let review = 'reviewed';
    if (d.kind === 'mcp') {
      const server = serverOf(d.meta);
      if (!server) throw new Error('Definição MCP inválida.');
      if (validSecretRef(server.secretRef)) {
        if (!existing || existing.secret_ref !== server.secretRef) throw new Error('Referência de credencial fora deste artefato.');
        ref = server.secretRef;
        review = str(existing.review_state);
      } else {
        ref = credentialsFor(this.db).put(credentialOwner(boardId, id), server);
        review = reviewed ? 'reviewed' : 'pending';
        meta = { server: { secretRef: ref }, transport: transportOf(server) };
      }
    }
    const common = [
      d.description,
      d.body,
      JSON.stringify(meta),
      d.origin,
      d.originTool,
      d.missing ? 1 : 0,
      JSON.stringify(d.skipped),
      t,
    ] as const;
    if (existing) {
      const keep = usage ?? (str(existing.usage) as HarnessUsage);
      run(
        this.db,
        `UPDATE board_artifacts SET description = ?, body = ?, meta_json = ?, origin = ?, origin_tool = ?, missing = ?,
           skipped_json = ?, updated_at = ?, usage = ?, revision = revision + 1 WHERE id = ?`,
        [...common, keep, id],
      );
      run(this.db, 'DELETE FROM board_artifact_files WHERE artifact_id = ?', [id]);
    } else {
      run(
        this.db,
        `INSERT INTO board_artifacts (id, board_id, kind, name, description, body, meta_json, origin, origin_tool, missing,
           skipped_json, updated_at, usage, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, boardId, d.kind, d.name, ...common, usage ?? defaultUsage(selectableOfKind(d.kind)), t],
      );
    }
    if (d.kind === 'mcp') run(this.db, 'UPDATE board_artifacts SET secret_ref = ?, review_state = ? WHERE id = ?', [ref, review, id]);
    for (const f of d.files) {
      run(this.db, 'INSERT INTO board_artifact_files (artifact_id, path, content, encoding, size) VALUES (?,?,?,?,?)', [
        id,
        f.path,
        f.content,
        f.encoding,
        f.size,
      ]);
    }
    return id;
  }

  private filePaths(id: string): string[] {
    return all(this.db, 'SELECT path FROM board_artifact_files WHERE artifact_id = ? ORDER BY path', [id]).map((f) => str(f.path));
  }

  private toRow(row: Row, files: string[]): ArtifactRow {
    const kind = (KINDS.includes(str(row.kind)) ? str(row.kind) : 'rule') as ArtifactKind;
    const meta = parseJson<ArtifactDraft['meta']>(str(row.meta_json), {});
    const usage = (USAGES.includes(str(row.usage)) ? str(row.usage) : 'off') as HarnessUsage;
    const a: ArtifactRow = {
      id: str(row.id),
      kind,
      name: str(row.name),
      description: str(row.description),
      usage,
      origin: str(row.origin),
      originTool: isAiBase(row.origin_tool) ? (str(row.origin_tool) as AiTool) : '',
      missing: bool(row.missing),
      skipped: parseJson<BoardArtifact['skipped']>(str(row.skipped_json), []),
      files,
      body: str(row.body),
      meta,
      createdAt: num(row.created_at),
      updatedAt: num(row.updated_at),
      revision: num(row.revision),
    };
    if (kind === 'agent') a.agent = meta as AgentMeta;
    if (kind === 'mcp') {
      const transport = (meta as { transport?: unknown }).transport;
      a.mcpSummary = mcpSummaryOf(transport);
      a.mcpCredential = {
        secretRef: str(row.secret_ref),
        available: credentialsFor(this.db).has(credentialOwner(str(row.board_id), a.id), str(row.secret_ref)),
        review: row.review_state === 'reviewed' ? 'reviewed' : 'pending',
        transport: transport === 'stdio' || transport === 'http' || transport === 'sse' ? transport : '',
      };
    }
    if (kind === 'skill' && (meta as { generated?: unknown }).generated === true) a.generated = true;
    return a;
  }
}
