// Grava e lê `ai_runs`: uma linha por execução de IA, do início (`start`) à configuração completada
// (`describe`) e ao desfecho (`finish`). A ligação com o executor é do passo 4 (`runLog.ts` /
// `runner.ts`); aqui é só o repositório.
import type { Database } from 'sql.js';
import type { FailureClass } from '../../shared/failureClass';
import type {
  AiRunConfig,
  AiRunMeasure,
  AiRunOrigin,
  AiRunOutcome,
  AiRunStart,
  InventoryItem,
  InventoryKind,
  RunReport,
} from '../../shared/log';
import type { CostBuckets } from '../../shared/cost';
import { monthOf, truncateTitle, type BashCommandItem } from '../../shared/log';
import { runCheckDetail, runCheckFrom, type RunCheck } from '../../shared/runCheck';
import { newId } from '../db/ids';
import { validateAdmissionDecision, type ExecutionAdmissionDecision } from '../../shared/executionAdmission';
import { all, num, one, run, str, strOrNull, transaction, type Row } from '../db/query';
import { PROFILE_MODES, type ProfileMode } from '../../shared/aiProfiles';

/** Uma linha de `ai_runs`, como lida de volta (ver `AiRunStart`/`AiRunConfig` para o que cada campo significa). */
export interface AiRun {
  admission?: ExecutionAdmissionDecision;
  admissionCorrupt?: true;
  id: string;
  boardId: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  month: string;
  outcome: AiRunOutcome | null;
  exitCode: number | null;
  /** a classe da falha; null = terminou bem, ou execução anterior à migração 55 */
  failureClass: FailureClass | null;
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
  /** o modo da execução; `null` nas gravadas antes da migração 48 (não registrado) */
  mode: ProfileMode | null;
  autonomous: boolean;
  clean: boolean;
  skills: string[];
  mcp: string[] | null;
  /** consumo (#70): `null` em tudo quando `measure` é 'none' — "não medido" não é zero */
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number | null;
  /** true = custo estimado pelo preço do catálogo, no fim da execução; false = informado pela ferramenta; null = sem custo */
  costEstimated: boolean | null;
  /** custo por bucket pelo preço do catálogo, congelado no fim da execução; `null` = sem preço (ou execução anterior à migração 51) */
  costBuckets: CostBuckets | null;
  turns: number | null;
  sessionId: string | null;
  /** linha gravada antes da migração 24 lê 'none' (RF-16) */
  measure: AiRunMeasure;
  /** a conferência gravada; linha anterior à migração 47 lê 'não conferida' */
  check: RunCheck;
}

const numOrNull = (v: Row[string] | undefined): number | null => (v == null ? null : num(v));

/** Os quatro custos por bucket de uma linha; `null` quando nenhum foi gravado (modelo sem preço ou linha anterior à migração 51). */
function costBucketsOf(r: Row): CostBuckets | null {
  const buckets: CostBuckets = {
    input: numOrNull(r.cost_input_usd),
    output: numOrNull(r.cost_output_usd),
    cacheRead: numOrNull(r.cost_cache_read_usd),
    cacheWrite: numOrNull(r.cost_cache_write_usd),
  };
  return Object.values(buckets).every((v) => v === null) ? null : buckets;
}

function toRun(r: Row): AiRun {
  const mcpJson = strOrNull(r.mcp_json);
  let admission: Pick<AiRun, 'admission' | 'admissionCorrupt'> = {};
  if (r.admission_json != null) {
    try {
      const value: unknown = JSON.parse(str(r.admission_json));
      validateAdmissionDecision(value);
      admission = { admission: value };
    } catch {
      admission = { admissionCorrupt: true };
    }
  }
  return {
    ...admission,
    id: str(r.id),
    boardId: str(r.board_id),
    startedAt: num(r.started_at),
    endedAt: r.ended_at == null ? null : num(r.ended_at),
    durationMs: r.duration_ms == null ? null : num(r.duration_ms),
    month: str(r.month),
    outcome: strOrNull(r.outcome) as AiRunOutcome | null,
    exitCode: r.exit_code == null ? null : num(r.exit_code),
    failureClass: strOrNull(r.failure_class) as FailureClass | null,
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
    // um valor que nenhuma versão grava (banco adulterado) lê como não registrado
    mode: PROFILE_MODES.find((m) => m === r.mode) ?? null,
    autonomous: num(r.autonomous) === 1,
    clean: num(r.clean) === 1,
    skills: JSON.parse(str(r.skills_json) || '[]'),
    mcp: mcpJson == null ? null : JSON.parse(mcpJson),
    inputTokens: numOrNull(r.input_tokens),
    outputTokens: numOrNull(r.output_tokens),
    cacheReadTokens: numOrNull(r.cache_read_tokens),
    cacheWriteTokens: numOrNull(r.cache_write_tokens),
    costUsd: numOrNull(r.cost_usd),
    costEstimated: r.cost_estimated == null ? null : num(r.cost_estimated) === 1,
    costBuckets: costBucketsOf(r),
    turns: numOrNull(r.turns),
    sessionId: strOrNull(r.session_id),
    measure: str(r.measure) as AiRunMeasure,
    check: runCheckFrom(strOrNull(r.check_status), strOrNull(r.check_detail)),
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
    if (config.admission) {
      validateAdmissionDecision(config.admission);
      if (!one(this.db, 'SELECT id FROM ai_runs WHERE id = ?', [id]))
        throw new Error('Execução de IA não encontrada para registrar a admissão.');
    }
    run(
      this.db,
      `UPDATE ai_runs SET model = ?, effort = ?, profile = ?, agent = ?, permission = ?, mode = ?, autonomous = ?, clean = ?,
         skills_json = ?, mcp_json = ?, admission_json = ?
       WHERE id = ?`,
      [
        config.model,
        config.effort,
        config.profile,
        config.agent,
        config.permission,
        config.mode ?? null,
        config.autonomous ? 1 : 0,
        config.clean ? 1 : 0,
        JSON.stringify(config.skills),
        config.mcp == null ? null : JSON.stringify(config.mcp),
        config.admission ? JSON.stringify(config.admission) : null,
        id,
      ],
    );
  }

  /** Grava o desfecho: `ended_at`, `duration_ms` (nulo quando `outcome` é `unknown`) e `exit_code`. */
  finish(id: string, outcome: AiRunOutcome, exitCode?: number | null, failureClass?: FailureClass | null): void {
    const row = one(this.db, 'SELECT started_at FROM ai_runs WHERE id = ?', [id]);
    if (!row) throw new Error('Execução de IA não encontrada');
    const endedAt = Date.now();
    const durationMs = outcome === 'unknown' ? null : endedAt - num(row.started_at);
    run(this.db, 'UPDATE ai_runs SET ended_at = ?, duration_ms = ?, outcome = ?, exit_code = ?, failure_class = ? WHERE id = ?', [
      endedAt,
      durationMs,
      outcome,
      exitCode ?? null,
      failureClass ?? null,
      id,
    ]);
  }

  /**
   * Grava o consumo e o inventário da execução, numa transação só: um `UPDATE` em `ai_runs` e os
   * `INSERT` em `ai_run_usage`. Uma escrita por execução, no fim (o `sql.js` reescreve o arquivo inteiro
   * a cada gravação).
   *
   * `measure: 'none'` deixa tokens, custo, turnos e sessão NULL e não escreve inventário: "não medido"
   * não é "zero" (RF-14). `partial` sem consumo grava o inventário com os tokens NULL. O custo (total e por bucket, já completado pelo gateway) é congelado aqui (RF-30): nada o recalcula depois, e mudar o preço
   * vale da próxima execução em diante. O inventário usa `INSERT OR REPLACE` sobre a chave
   * `(run_id, kind, name)`: uma segunda chamada com o mesmo inventário não duplica linha.
   */
  measure(id: string, report: RunReport, check?: RunCheck): void {
    const c = report.measure === 'none' ? null : report.consumption;
    // o inventário vale sempre que algo foi medido, com ou sem consumo: `partial` sem tokens é o caso
    // normal do Cursor, que não informa uso mas dizem quais ferramentas chamaram
    const inventory = report.measure === 'none' ? [] : report.inventory;
    transaction(this.db, () => {
      run(
        this.db,
        `UPDATE ai_runs SET input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ?,
           cost_usd = ?, cost_estimated = ?, cost_input_usd = ?, cost_output_usd = ?, cost_cache_read_usd = ?,
           cost_cache_write_usd = ?, turns = ?, session_id = ?, measure = ?,
           check_status = ?, check_detail = ?
         WHERE id = ?`,
        [
          c ? c.inputTokens : null,
          c ? c.outputTokens : null,
          c ? c.cacheReadTokens : null,
          c ? c.cacheWriteTokens : null,
          c ? c.costUsd : null,
          c && c.costUsd != null ? (c.costEstimated ? 1 : 0) : null,
          c?.costBuckets?.input ?? null,
          c?.costBuckets?.output ?? null,
          c?.costBuckets?.cacheRead ?? null,
          c?.costBuckets?.cacheWrite ?? null,
          c ? c.turns : null,
          c ? c.sessionId : null,
          report.measure,
          check ? check.status : null,
          check ? JSON.stringify(runCheckDetail(check)) : null,
          id,
        ],
      );
      if (this.db.getRowsModified() === 0) throw new Error('Execução de IA não encontrada');
      for (const item of inventory) {
        run(this.db, 'INSERT OR REPLACE INTO ai_run_usage(run_id, kind, name, calls) VALUES (?,?,?,?)', [
          id,
          item.kind,
          item.name,
          item.calls,
        ]);
      }
      for (const item of report.measure === 'none' ? [] : (report.bashCommands ?? [])) {
        run(this.db, 'INSERT OR REPLACE INTO ai_run_bash(run_id, command, calls, failed) VALUES (?,?,?,?)', [
          id,
          item.command,
          item.calls,
          item.failed,
        ]);
      }
    });
  }

  /** O inventário gravado de uma execução (ferramentas, ferramentas MCP, subagentes e skills), ordenado por tipo e nome. */
  usage(id: string): InventoryItem[] {
    return all(this.db, 'SELECT kind, name, calls FROM ai_run_usage WHERE run_id = ? ORDER BY kind, name', [id]).map((r) => ({
      kind: str(r.kind) as InventoryKind,
      name: str(r.name),
      calls: num(r.calls),
    }));
  }

  /** Os comandos de Bash gravados de uma execução (#604), ordenados por comando. */
  bashUsage(id: string): BashCommandItem[] {
    return all(this.db, 'SELECT command, calls, failed FROM ai_run_bash WHERE run_id = ? ORDER BY command', [id]).map((r) => ({
      command: str(r.command),
      calls: num(r.calls),
      failed: num(r.failed),
    }));
  }

  /**
   * Marca como `unknown` toda linha que a sessão anterior não chegou a fechar (`outcome IS NULL`),
   * com `ended_at` preenchido e `duration_ms` nulo (RF-18). Não toca em linha já fechada. Devolve os
   * cards dessas execuções, para o board devolvê-los à IA (ficaram "Em execução" sem execução).
   */
  closeOpen(at: number): string[] {
    const cardIds = all(this.db, 'SELECT DISTINCT card_id FROM ai_runs WHERE outcome IS NULL AND card_id IS NOT NULL')
      .map((r) => strOrNull(r.card_id))
      .filter((id): id is string => id !== null);
    run(this.db, "UPDATE ai_runs SET outcome = 'unknown', ended_at = ?, duration_ms = NULL WHERE outcome IS NULL", [at]);
    return cardIds;
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
