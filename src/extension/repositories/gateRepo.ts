import type { Database } from 'sql.js';
import type { GateKind, GateResult } from '../../shared/gate';
import { all, one, run, str, num, strOrNull, transaction, type Row } from '../db/query';
import { newId, now } from '../db/ids';

export interface GateRun {
  id: string;
  cardId: string;
  columnId: string;
  targetColumnId: string | null;
  kind: GateKind;
  /** HEAD da pasta no começo das checagens; vazio até o executor gravar */
  sha: string;
  result: GateResult;
  outputTail: string;
  /** assinatura da falha, para o circuit breaker da #1097; vazia até lá */
  signature: string;
  startedAt: number;
  finishedAt: number | null;
}

function gateRun(r: Row): GateRun {
  const kind = str(r.kind);
  const result = str(r.result);
  if (kind !== 'move' && kind !== 'review') throw new Error('Tipo de portão local inválido.');
  if (!['running', 'passed', 'failed', 'interrupted'].includes(result)) throw new Error('Resultado de portão local inválido.');
  return {
    id: str(r.id),
    cardId: str(r.card_id),
    columnId: str(r.column_id),
    targetColumnId: strOrNull(r.target_column_id),
    kind,
    sha: str(r.sha),
    result: result as GateResult,
    outputTail: str(r.output_tail),
    signature: str(r.signature),
    startedAt: num(r.started_at),
    finishedAt: r.finished_at === null ? null : num(r.finished_at),
  };
}

/** Registro das execuções do portão (`gate_runs`): quem pediu, em que commit rodou e como terminou. */
export class GateRepo {
  constructor(private readonly db: Database) {}

  start(input: { cardId: string; columnId: string; targetColumnId: string | null; kind: GateKind }): GateRun {
    const id = newId();
    run(
      this.db,
      "INSERT INTO gate_runs (id, card_id, column_id, target_column_id, kind, result, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?)",
      [id, input.cardId, input.columnId, input.targetColumnId, input.kind, now()],
    );
    return this.get(id)!;
  }

  setSha(id: string, sha: string): void {
    run(this.db, 'UPDATE gate_runs SET sha = ? WHERE id = ?', [sha, id]);
  }

  finish(id: string, result: Exclude<GateResult, 'running'>, outputTail: string, signature = ''): void {
    run(this.db, 'UPDATE gate_runs SET result = ?, output_tail = ?, signature = ?, finished_at = ? WHERE id = ?', [
      result,
      outputTail,
      signature,
      now(),
      id,
    ]);
  }

  get(id: string): GateRun | null {
    const r = one(this.db, 'SELECT * FROM gate_runs WHERE id = ?', [id]);
    return r ? gateRun(r) : null;
  }

  runningFor(cardId: string): GateRun | null {
    const r = one(
      this.db,
      "SELECT * FROM gate_runs WHERE card_id = ? AND result = 'running' ORDER BY started_at DESC, rowid DESC LIMIT 1",
      [cardId],
    );
    return r ? gateRun(r) : null;
  }

  /** Da mais antiga para a mais nova. */
  listFor(cardId: string): GateRun[] {
    return all(this.db, 'SELECT * FROM gate_runs WHERE card_id = ? ORDER BY started_at, rowid', [cardId]).map(gateRun);
  }

  /** Reinício da janela: o que estava rodando não tem mais executor vivo. Devolve as execuções afetadas. */
  interruptAllRunning(): GateRun[] {
    return transaction(this.db, () => {
      const rows = all(this.db, "SELECT * FROM gate_runs WHERE result = 'running' ORDER BY started_at, rowid").map(gateRun);
      run(this.db, "UPDATE gate_runs SET result = 'interrupted', finished_at = ? WHERE result = 'running'", [now()]);
      return rows.map((r) => this.get(r.id)!);
    });
  }
}
