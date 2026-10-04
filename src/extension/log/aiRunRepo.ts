// Grava e lê `ai_runs`: uma linha por execução de IA, do início (`start`) à configuração completada
// (`describe`) e ao desfecho (`finish`). A ligação com o executor é do passo 4 (`runLog.ts` /
// `runner.ts`); aqui é só o repositório.
import type { Database } from 'sql.js';
import type { AiRunConfig, AiRunOrigin, AiRunOutcome, AiRunStart } from '../../shared/log';
import { monthOf, truncateTitle } from '../../shared/log';
import { newId } from '../db/ids';
import { all, num, one, run, str, strOrNull, type Row } from '../db/query';

/** Uma linha de `ai_runs`, como lida de volta (ver `AiRunStart`/`AiRunConfig` para o que cada campo significa). */
export interface AiRun {
  id: string;
  boardId: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  month: string;
  outcome: AiRunOutcome | null;
  exitCode: number | null;
  origin: AiRunOrigin;
  cardId: string | null;
  cardNumber: number | null;
  cardTitle: string;
  cardType: string;
  workflow: string;
  columnName: string;
  phase: string;
  tool: string;
  model: string | null;
  effort: string | null;
  profile: string | null;
  agent: string | null;
  permission: string;
  autonomous: boolean;
  clean: boolean;
  skills: string[];
  mcp: string[] | null;
}

function toRun(r: Row): AiRun {
  const mcpJson = strOrNull(r.mcp_json);
  return {
    id: str(r.id),
    boardId: str(r.board_id),
    startedAt: num(r.started_at),
    endedAt: r.ended_at == null ? null : num(r.ended_at),
    durationMs: r.duration_ms == null ? null : num(r.duration_ms),
    month: str(r.month),
    outcome: strOrNull(r.outcome) as AiRunOutcome | null,
    exitCode: r.exit_code == null ? null : num(r.exit_code),
    origin: str(r.origin) as AiRunOrigin,
    cardId: strOrNull(r.card_id),
    cardNumber: r.card_number == null ? null : num(r.card_number),
    cardTitle: str(r.card_title),
    cardType: str(r.card_type),
    workflow: str(r.workflow),
    columnName: str(r.column_name),
    phase: str(r.phase),
    tool: str(r.tool),
    model: strOrNull(r.model),
    effort: strOrNull(r.effort),
    profile: strOrNull(r.profile),
    agent: strOrNull(r.agent),
    permission: str(r.permission),
    autonomous: num(r.autonomous) === 1,
    clean: num(r.clean) === 1,
    skills: JSON.parse(str(r.skills_json) || '[]'),
    mcp: mcpJson == null ? null : JSON.parse(mcpJson),
  };
}

export class AiRunRepo {
  constructor(private db: Database) {}

  /**
   * Abre a linha da execução: contexto, ferramenta, origem e `started_at`, com `outcome` nulo.
   * `permission` ainda não é conhecida aqui — fica `''` até `describe()` completá-la. Devolve o id.
   */
  start(meta: AiRunStart): string {
    const id = newId();
    run(
      this.db,
      `INSERT INTO ai_runs(id, board_id, started_at, month, origin, card_id, card_number, card_title, card_type,
         workflow, column_name, phase, tool, permission)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        meta.boardId,
        meta.startedAt,
        monthOf(meta.startedAt),
        meta.origin,
        meta.cardId,
        meta.cardNumber,
        truncateTitle(meta.cardTitle),
        meta.cardType,
        meta.workflow,
        meta.columnName,
        meta.phase,
        meta.tool,
        '',
      ],
    );
    return id;
  }

  /**
   * Completa a configuração depois do plano de execução. `null` em `model`/`effort`/`profile`/`agent`
   * quer dizer "não definido"; `''` quer dizer "definido e vazio" (RF-15) — não troque um pelo outro.
   * `mcp: null` quer dizer "sem restrição de servidores MCP".
   */
  describe(id: string, config: AiRunConfig): void {
    run(
      this.db,
      `UPDATE ai_runs SET model = ?, effort = ?, profile = ?, agent = ?, permission = ?, autonomous = ?, clean = ?,
         skills_json = ?, mcp_json = ?
       WHERE id = ?`,
      [
        config.model,
        config.effort,
        config.profile,
        config.agent,
        config.permission,
        config.autonomous ? 1 : 0,
        config.clean ? 1 : 0,
        JSON.stringify(config.skills),
        config.mcp == null ? null : JSON.stringify(config.mcp),
        id,
      ],
    );
  }

  /** Grava o desfecho: `ended_at`, `duration_ms` (nulo quando `outcome` é `unknown`) e `exit_code`. */
  finish(id: string, outcome: AiRunOutcome, exitCode?: number | null): void {
    const row = one(this.db, 'SELECT started_at FROM ai_runs WHERE id = ?', [id]);
    if (!row) throw new Error('Execução de IA não encontrada');
    const endedAt = Date.now();
    const durationMs = outcome === 'unknown' ? null : endedAt - num(row.started_at);
    run(this.db, 'UPDATE ai_runs SET ended_at = ?, duration_ms = ?, outcome = ?, exit_code = ? WHERE id = ?', [
      endedAt,
      durationMs,
      outcome,
      exitCode ?? null,
      id,
    ]);
  }

  /**
   * Marca como `unknown` toda linha que a sessão anterior não chegou a fechar (`outcome IS NULL`),
   * com `ended_at` preenchido e `duration_ms` nulo (RF-18). Não toca em linha já fechada.
   */
  closeOpen(at: number): void {
    run(this.db, "UPDATE ai_runs SET outcome = 'unknown', ended_at = ?, duration_ms = NULL WHERE outcome IS NULL", [at]);
  }

  /** Execuções de um mês ('YYYY-MM'), da mais antiga para a mais recente. */
  byMonth(month: string): AiRun[] {
    return all(this.db, 'SELECT * FROM ai_runs WHERE month = ? ORDER BY started_at', [month]).map(toRun);
  }

  /** Descarta o detalhe de um mês (a consolidação já arquivou os totais em `log_months`). */
  deleteMonth(month: string): void {
    run(this.db, 'DELETE FROM ai_runs WHERE month = ?', [month]);
  }
}
