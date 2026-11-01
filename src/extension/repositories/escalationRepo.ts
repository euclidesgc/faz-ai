import type { Database } from 'sql.js';
import { newId, now } from '../db/ids';
import { all, one, run, str, strOrNull, num, type Row } from '../db/query';

export interface Escalation {
  id: string;
  cardId: string;
  /** a unidade é o card + a coluna do portão que falhou */
  columnId: string;
  gateRunId: string;
  check: string;
  fromModel: string;
  toModel: string;
  /** null = pendente: a correção ainda não foi criada */
  targetCardId: string | null;
  status: 'pending' | 'applied';
  createdAt: number;
  appliedAt: number | null;
}

function escalation(r: Row): Escalation {
  const status = str(r.status);
  if (status !== 'pending' && status !== 'applied') throw new Error('Estado de subida de modelo inválido.');
  return {
    id: str(r.id),
    cardId: str(r.card_id),
    columnId: str(r.column_id),
    gateRunId: str(r.gate_run_id),
    check: str(r.check_name),
    fromModel: str(r.from_model),
    toModel: str(r.to_model),
    targetCardId: strOrNull(r.target_card_id),
    status,
    createdAt: num(r.created_at),
    appliedAt: r.applied_at === null ? null : num(r.applied_at),
  };
}

/** Registro das subidas de modelo (`model_escalations`): no máximo uma por unidade (card + coluna do portão). */
export class EscalationRepo {
  constructor(private readonly db: Database) {}

  forUnit(cardId: string, columnId: string): Escalation | undefined {
    const r = one(this.db, 'SELECT * FROM model_escalations WHERE card_id = ? AND column_id = ?', [cardId, columnId]);
    return r ? escalation(r) : undefined;
  }

  /** A subida ainda sem correção para consumir, a mais antiga primeiro. */
  pendingFor(cardId: string): Escalation | undefined {
    const r = one(this.db, "SELECT * FROM model_escalations WHERE card_id = ? AND status = 'pending' ORDER BY created_at, rowid LIMIT 1", [
      cardId,
    ]);
    return r ? escalation(r) : undefined;
  }

  /** Lança se a unidade já tem subida (UNIQUE): o chamador trata como "já tem". */
  record(e: Omit<Escalation, 'id' | 'createdAt' | 'appliedAt'>): Escalation {
    const id = newId();
    const t = now();
    run(
      this.db,
      `INSERT INTO model_escalations
         (id, card_id, column_id, gate_run_id, check_name, from_model, to_model, target_card_id, status, created_at, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        e.cardId,
        e.columnId,
        e.gateRunId,
        e.check,
        e.fromModel,
        e.toModel,
        e.targetCardId,
        e.status,
        t,
        e.status === 'applied' ? t : null,
      ],
    );
    return escalation(one(this.db, 'SELECT * FROM model_escalations WHERE id = ?', [id])!);
  }

  markApplied(id: string, targetCardId: string): void {
    run(this.db, "UPDATE model_escalations SET status = 'applied', target_card_id = ?, applied_at = ? WHERE id = ?", [
      targetCardId,
      now(),
      id,
    ]);
  }

  deleteForCard(cardId: string): void {
    run(this.db, 'DELETE FROM model_escalations WHERE card_id = ?', [cardId]);
  }

  /** Para testes e suporte: todas as subidas de um card. */
  listFor(cardId: string): Escalation[] {
    return all(this.db, 'SELECT * FROM model_escalations WHERE card_id = ? ORDER BY created_at, rowid', [cardId]).map(escalation);
  }
}
