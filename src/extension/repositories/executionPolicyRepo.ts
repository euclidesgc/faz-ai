import type { Database } from 'sql.js';
import type { ModelOption } from '../../shared/models';
import {
  executionPolicyProblems,
  targetProblem,
  validateExecutionPolicy,
  validateExecutionPolicySnapshot,
  type ExecutionPolicy,
  type ExecutionPolicyRecord,
  type ExecutionPolicySnapshot,
  type PolicyProfile,
} from '../../shared/executionPolicies';
import { all, num, one, run, str, transaction, type Row } from '../db/query';
import { now } from '../db/ids';

export interface PolicyWrite {
  expectedRevision: number;
  policy: ExecutionPolicy;
  reviewed: boolean;
}
export interface PolicyCatalog {
  profiles: readonly PolicyProfile[];
  models: readonly ModelOption[];
}
const parse = (row: Row): ExecutionPolicyRecord => ({
  policy: JSON.parse(str(row.policy_json)),
  revision: num(row.revision),
  review: str(row.review_state) as ExecutionPolicyRecord['review'],
  updatedAt: num(row.updated_at),
});
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const part of Object.values(value)) freeze(part);
    Object.freeze(value);
  }
  return value;
}
/** Histórico é do board; revisão executável é local e nunca é herdada da importação. */
export class ExecutionPolicyRepo {
  constructor(private readonly db: Database) {}
  read(boardId: string, includeDeleted = false): ExecutionPolicyRecord[] {
    const records = all(
      this.db,
      `SELECT * FROM execution_policies WHERE board_id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'} ORDER BY id`,
      [boardId],
    ).map(parse);
    if (includeDeleted) for (const record of records) validateExecutionPolicySnapshot({ version: 1, records: [record] });
    else validateExecutionPolicySnapshot({ version: 1, records });
    return records;
  }
  snapshot(boardId: string): ExecutionPolicySnapshot {
    return freeze({ version: 1, records: this.read(boardId) });
  }
  history(boardId: string, id: string): ExecutionPolicyRecord[] {
    const rows = all(this.db, 'SELECT * FROM execution_policy_versions WHERE board_id = ? AND policy_id = ? ORDER BY revision', [
      boardId,
      id,
    ]).map(parse);
    for (const record of rows) validateExecutionPolicySnapshot({ version: 1, records: [record] });
    return rows;
  }
  save(boardId: string, input: PolicyWrite, catalog: PolicyCatalog, actor: 'person' | 'ai'): ExecutionPolicyRecord {
    if (actor !== 'person') throw new Error('Políticas executáveis exigem revisão humana.');
    return transaction(this.db, () => this.write(boardId, input, catalog));
  }
  private write(boardId: string, input: PolicyWrite, catalog: PolicyCatalog): ExecutionPolicyRecord {
    validateExecutionPolicy(input.policy);
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      input.expectedRevision >= 10000 ||
      typeof input.reviewed !== 'boolean'
    )
      throw new Error('Revisão de política inválida.');
    const old = one(this.db, 'SELECT * FROM execution_policies WHERE id = ?', [input.policy.id]);
    if (old && (old.board_id !== boardId || old.deleted_at !== null)) throw new Error('Política indisponível neste board.');
    if ((old ? num(old.revision) : 0) !== input.expectedRevision) throw new Error('A política mudou. Releia antes de salvar.');
    for (const target of input.policy.targets)
      if (targetProblem(target, catalog.profiles, catalog.models))
        throw new Error('Destino da política inválido ou indisponível no catálogo.');
    const record: ExecutionPolicyRecord = {
      policy: structuredClone(input.policy),
      revision: input.expectedRevision + 1,
      review: input.reviewed ? 'reviewed' : 'pending',
      updatedAt: now(),
    };
    const records = this.read(boardId).filter((r) => r.policy.id !== input.policy.id);
    records.push(record);
    validateExecutionPolicySnapshot({ version: 1, records });
    const problems = executionPolicyProblems(records, catalog.profiles, catalog.models);
    if (problems.length)
      throw new Error(`Políticas conflitantes: ${problems.map((p) => `${p.code} (${p.policyIds.join(', ')})`).join('; ')}.`);
    const json = JSON.stringify(record.policy);
    run(
      this.db,
      `INSERT INTO execution_policies (id, board_id, revision, review_state, policy_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, review_state = excluded.review_state, policy_json = excluded.policy_json, updated_at = excluded.updated_at`,
      [record.policy.id, boardId, record.revision, record.review, json, record.updatedAt],
    );
    run(
      this.db,
      'INSERT INTO execution_policy_versions (policy_id, board_id, revision, review_state, policy_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [record.policy.id, boardId, record.revision, record.review, json, record.updatedAt],
    );
    return record;
  }
  /** Remover não apaga o histórico nem as cópias já capturadas por um run. */
  remove(boardId: string, id: string, expectedRevision: number, catalog: PolicyCatalog, actor: 'person' | 'ai'): void {
    if (actor !== 'person') throw new Error('Políticas executáveis exigem revisão humana.');
    transaction(this.db, () => {
      const old = this.read(boardId).find((r) => r.policy.id === id);
      if (!old) throw new Error('Política indisponível neste board.');
      this.write(boardId, { expectedRevision, policy: { ...old.policy, enabled: false }, reviewed: false }, catalog);
      run(this.db, 'UPDATE execution_policies SET deleted_at = ? WHERE board_id = ? AND id = ?', [now(), boardId, id]);
    });
  }
  /** Antes de substituir o board: cabeçalho e histórico precisam representar as mesmas versões. */
  validateBoard(boardId: string): void {
    const heads = this.read(boardId, true);
    for (const head of heads) {
      const rows = all(this.db, 'SELECT * FROM execution_policy_versions WHERE policy_id = ? ORDER BY revision', [head.policy.id]);
      if (rows.length !== head.revision || rows.some((r, i) => r.board_id !== boardId || num(r.revision) !== i + 1))
        throw new Error('Histórico de política incompleto ou fora do board.');
      const history = this.history(boardId, head.policy.id);
      if (
        history.some((r) => r.policy.id !== head.policy.id) ||
        JSON.stringify(history.at(-1)!.policy) !== JSON.stringify(head.policy) ||
        history.at(-1)!.updatedAt !== head.updatedAt
      )
        throw new Error('Versão atual diverge do histórico da política.');
    }
    const orphans = one(
      this.db,
      'SELECT 1 FROM execution_policy_versions v LEFT JOIN execution_policies p ON p.id = v.policy_id WHERE v.board_id = ? AND (p.id IS NULL OR p.board_id != v.board_id)',
      [boardId],
    );
    if (orphans) throw new Error('Histórico de política fora do board.');
  }
}
