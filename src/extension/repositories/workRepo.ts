import { createHash, randomBytes } from 'node:crypto';
import type { Database } from 'sql.js';
import {
  LIVE_WORK_STATES,
  WORK_TRANSITIONS,
  type Reconciled,
  type WorkKind,
  type WorkState,
  type WorkUnit,
} from '../../shared/orchestration';
import { validProcessIdentity, processGroupState, type ProcessIdentity } from '../processIdentity';
import { all, one, run, str, num, strOrNull, transaction, type Row } from '../db/query';
import { newId } from '../db/ids';

export interface WorkRecord extends WorkUnit {
  id: string;
  boardId: string;
  state: WorkState;
  generation: number;
  owner: string | null;
  workspace: string | null;
  reason: string;
  createdAt: number;
  updatedAt: number;
}
export interface WorkAttempt {
  id: string;
  workId: string;
  generation: number;
  runId: string | null;
  process: ProcessIdentity | null;
  workspaceBefore: string | null;
  mutations: number;
  outcome: Reconciled['kind'] | 'cancelled' | null;
  resultCommentId: string | null;
  startedAt: number;
  endedAt: number | null;
}
export interface WorkClaim {
  work: WorkRecord;
  attempt: WorkAttempt;
  token: string;
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const text = (value: unknown, max = 8192): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0');
const liveSql = "('prepared','started','reconciling')";
function record(r: Row): WorkRecord {
  if (!Object.hasOwn(WORK_TRANSITIONS, str(r.state)) || !['subtask', 'story', 'closing', 'activity'].includes(str(r.kind)))
    throw new Error('Estado de trabalho local inválido.');
  return {
    id: str(r.id),
    boardId: str(r.board_id),
    key: str(r.work_key),
    kind: str(r.kind) as WorkKind,
    storyId: strOrNull(r.story_id),
    cardId: strOrNull(r.card_id),
    columnId: str(r.column_id),
    state: str(r.state) as WorkState,
    generation: num(r.generation),
    owner: strOrNull(r.owner),
    workspace: strOrNull(r.workspace),
    reason: str(r.reason),
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
  };
}
function attempt(r: Row): WorkAttempt {
  const identity: unknown = r.identity_json === null ? null : JSON.parse(str(r.identity_json));
  if (identity !== null && !validProcessIdentity(identity)) throw new Error('Identidade persistida do processo inválida.');
  return {
    id: str(r.id),
    workId: str(r.work_id),
    generation: num(r.generation),
    runId: strOrNull(r.run_id),
    process: identity,
    workspaceBefore: strOrNull(r.workspace_before),
    mutations: num(r.mutations),
    outcome: strOrNull(r.outcome) as WorkAttempt['outcome'],
    resultCommentId: strOrNull(r.result_comment_id),
    startedAt: num(r.started_at),
    endedAt: r.ended_at === null ? null : num(r.ended_at),
  };
}

/** Estado local: nunca exportar tentativas, tokens ou posses para outro board/máquina. */
export class WorkRepo {
  constructor(
    private db: Database,
    readonly boardId: string,
    private now = Date.now,
  ) {}
  get(id: string): WorkRecord | undefined {
    const row = one(this.db, 'SELECT * FROM ai_work WHERE id = ? AND board_id = ?', [id, this.boardId]);
    return row && record(row);
  }
  byKey(key: string): WorkRecord | undefined {
    const row = one(this.db, 'SELECT * FROM ai_work WHERE board_id = ? AND work_key = ?', [this.boardId, key]);
    return row && record(row);
  }
  live(): WorkRecord[] {
    return all(this.db, `SELECT * FROM ai_work WHERE board_id = ? AND state IN ${liveSql} ORDER BY created_at, id`, [this.boardId]).map(
      record,
    );
  }
  records(): WorkRecord[] {
    return all(this.db, 'SELECT * FROM ai_work WHERE board_id = ? ORDER BY created_at, id', [this.boardId]).map(record);
  }
  /** Inclui o intervalo entre a conclusão durável e a liberação física da trava. */
  reservations(): WorkRecord[] {
    return this.records().filter((w) => w.workspace !== null);
  }
  workspaceReleased(id: string, generation: number, owner: string): void {
    transaction(this.db, () => {
      const work = this.owned(id, generation, owner);
      if (LIVE_WORK_STATES.includes(work.state)) throw new Error('A unidade viva ainda reserva a pasta.');
      run(this.db, 'UPDATE ai_work SET workspace = NULL WHERE id = ?', [id]);
    });
  }
  preparedWorkspace(id: string, generation: number, owner: string, before: string): void {
    if (!text(before, 65536)) throw new Error('Impressão da pasta inválida.');
    transaction(this.db, () => {
      const work = this.owned(id, generation, owner);
      if (work.state !== 'prepared') throw new Error('A unidade não está preparada.');
      run(this.db, 'UPDATE ai_work_attempts SET workspace_before = ? WHERE work_id = ? AND generation = ?', [before, id, generation]);
    });
  }
  latest(workId: string): WorkAttempt | undefined {
    if (!this.get(workId)) return undefined;
    const row = one(this.db, 'SELECT * FROM ai_work_attempts WHERE work_id = ? ORDER BY generation DESC LIMIT 1', [workId]);
    return row && attempt(row);
  }
  /** Tentativas anteriores da unidade que terminaram em `retry-safe` por falha transitória (#1099). */
  transientRetries(workId: string): number {
    const row = one(
      this.db,
      `SELECT COUNT(*) AS n FROM ai_work_attempts a JOIN ai_runs r ON r.id = a.run_id
       WHERE a.work_id = ? AND a.outcome = 'retry-safe' AND r.failure_class = 'transient'`,
      [workId],
    );
    return row ? num(row.n) : 0;
  }
  /** A transação é atômica no host dono do sql.js. A exclusão entre processos exige a trava da pasta. */
  claim(unit: WorkUnit, owner: string, workspace: string | null, retryFailed = false): WorkClaim | null {
    if (
      !text(owner, 240) ||
      !text(unit.key, 1024 * 1024) ||
      !['subtask', 'story', 'closing', 'activity'].includes(unit.kind) ||
      typeof unit.columnId !== 'string' ||
      unit.columnId.includes('\0') ||
      (unit.cardId !== null && !text(unit.cardId, 240)) ||
      (unit.storyId !== null && !text(unit.storyId, 240)) ||
      (workspace !== null && !text(workspace)) ||
      (unit.kind !== 'activity' && (!unit.cardId || !unit.storyId || !unit.columnId))
    )
      throw new Error('Identidade ou origem da unidade inválida.');
    return transaction(this.db, () => {
      const old = this.byKey(unit.key);
      if (old && (old.cardId !== unit.cardId || old.storyId !== unit.storyId || old.columnId !== unit.columnId || old.kind !== unit.kind))
        throw new Error('A chave de trabalho pertence a outra unidade.');
      if (old && old.state !== 'waiting' && !(old.state === 'failed' && retryFailed)) return null;
      if (old?.workspace) return null;
      if (
        unit.cardId &&
        one(this.db, `SELECT 1 FROM ai_work WHERE board_id = ? AND card_id = ? AND state IN ${liveSql}`, [this.boardId, unit.cardId])
      )
        return null;
      if (workspace && one(this.db, 'SELECT 1 FROM ai_work WHERE workspace = ?', [workspace])) return null;
      for (const id of [unit.storyId, unit.cardId])
        if (id && !one(this.db, 'SELECT 1 FROM cards WHERE id = ? AND board_id = ?', [id, this.boardId]))
          throw new Error('Card da unidade ausente ou fora do board.');
      if (unit.kind !== 'activity') {
        const story = one(this.db, 'SELECT * FROM cards WHERE id = ?', [unit.storyId])!;
        const card = one(this.db, 'SELECT * FROM cards WHERE id = ?', [unit.cardId])!;
        if (story.parent_id !== null || (unit.kind === 'subtask' ? card.parent_id !== unit.storyId : unit.cardId !== unit.storyId))
          throw new Error('A unidade não pertence à história indicada.');
        if (story.column_id !== unit.columnId) throw new Error('A fase da história mudou antes da posse.');
        if (story.deleted_at !== null || story.archived_at !== null || card.deleted_at !== null || card.archived_at !== null)
          throw new Error('O card da unidade não está ativo.');
      }
      const stamp = this.now();
      const id = old?.id ?? newId();
      const generation = (old?.generation ?? 0) + 1;
      if (!Number.isSafeInteger(generation)) throw new Error('Geração de trabalho inválida.');
      if (old) {
        run(this.db, 'UPDATE ai_work_attempts SET token_hash = NULL WHERE work_id = ?', [id]);
        run(
          this.db,
          "UPDATE ai_work SET state = 'prepared', generation = ?, owner = ?, workspace = ?, reason = '', updated_at = ? WHERE id = ?",
          [generation, owner, workspace, stamp, id],
        );
      } else
        run(
          this.db,
          `INSERT INTO ai_work (id, board_id, work_key, kind, story_id, card_id, column_id, state, generation, owner, workspace, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?, ?, ?, ?)`,
          [id, this.boardId, unit.key, unit.kind, unit.storyId, unit.cardId, unit.columnId, generation, owner, workspace, stamp, stamp],
        );
      const token = randomBytes(32).toString('hex');
      run(this.db, 'INSERT INTO ai_work_attempts (id, work_id, generation, token_hash, started_at) VALUES (?, ?, ?, ?, ?)', [
        newId(),
        id,
        generation,
        tokenHash(token),
        stamp,
      ]);
      return { work: this.get(id)!, attempt: this.latest(id)!, token };
    });
  }
  /** Owner e geração são conferidos em toda alteração; uma instância velha nunca recupera a posse. */
  transition(id: string, generation: number, owner: string, next: WorkState, reason = ''): WorkRecord {
    return transaction(this.db, () => {
      const work = this.owned(id, generation, owner);
      if (next === 'prepared' || next === 'started' || next === 'done' || next === 'cancelled')
        throw new Error('Use a operação de posse, início ou reconciliação correspondente.');
      if (!WORK_TRANSITIONS[work.state].includes(next)) throw new Error('Transição de trabalho inválida.');
      this.move(work, next, reason);
      return this.get(id)!;
    });
  }
  started(id: string, generation: number, owner: string, runId: string, identity: ProcessIdentity, workspaceBefore: string | null): void {
    if (!text(runId, 240) || !validProcessIdentity(identity)) throw new Error('Processo ou runId inválido.');
    if (workspaceBefore !== null && !text(workspaceBefore, 65536)) throw new Error('Impressão da pasta inválida.');
    transaction(this.db, () => {
      const work = this.owned(id, generation, owner);
      const previous = this.latest(id)!;
      if (work.state !== 'prepared' && work.state !== 'started') throw new Error('A unidade não está preparada.');
      if (work.state === 'started' && (!previous.process || processGroupState(previous.process) !== 'dead'))
        throw new Error('A tentativa anterior ainda não teve o fim confirmado.');
      const boundRun = previous.runId;
      if (boundRun !== null && boundRun !== runId) throw new Error('A tentativa já está vinculada a outra execução.');
      if (
        !one(
          this.db,
          'SELECT 1 FROM ai_work_attempts WHERE work_id = ? AND generation = ? AND token_hash IS NOT NULL AND ended_at IS NULL',
          [id, generation],
        )
      )
        throw new Error('A tentativa foi revogada antes de iniciar.');
      if (!one(this.db, 'SELECT 1 FROM ai_runs WHERE id = ? AND board_id = ? AND card_id IS ?', [runId, this.boardId, work.cardId]))
        throw new Error('A execução não pertence ao board da unidade.');
      run(this.db, 'UPDATE ai_work_attempts SET run_id = ?, identity_json = ?, workspace_before = ? WHERE work_id = ? AND generation = ?', [
        runId,
        JSON.stringify(identity),
        workspaceBefore,
        id,
        generation,
      ]);
      this.move(work, 'started', '');
    });
  }
  tokenAlive(token: string): boolean {
    return !!this.forToken(token);
  }
  /** O log abre antes do processo; esse vínculo permite atribuir o MCP sem inferir pelo card. */
  bindRun(id: string, generation: number, owner: string, runId: string): void {
    transaction(this.db, () => {
      const work = this.owned(id, generation, owner);
      const current = this.latest(id)!;
      if (
        work.state !== 'prepared' ||
        current.endedAt !== null ||
        (current.runId !== null && current.runId !== runId) ||
        !one(this.db, 'SELECT 1 FROM ai_work_attempts WHERE id = ? AND token_hash IS NOT NULL', [current.id]) ||
        !one(this.db, 'SELECT 1 FROM ai_runs WHERE id = ? AND board_id = ? AND card_id IS ?', [runId, this.boardId, work.cardId])
      )
        throw new Error('Não foi possível vincular a tentativa à execução.');
      run(this.db, 'UPDATE ai_work_attempts SET run_id = ? WHERE id = ?', [runId, current.id]);
    });
  }
  forToken(token: string): { work: WorkRecord; attempt: WorkAttempt } | null {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const row = one(
      this.db,
      `SELECT a.* FROM ai_work_attempts a JOIN ai_work w ON w.id = a.work_id
      WHERE w.board_id = ? AND a.token_hash = ? AND a.generation = w.generation AND a.ended_at IS NULL AND w.state IN ('prepared','started')`,
      [this.boardId, tokenHash(token)],
    );
    return row ? { work: this.get(str(row.work_id))!, attempt: attempt(row) } : null;
  }
  countMutation(token: string): void {
    transaction(this.db, () => {
      const binding = this.forToken(token);
      if (!binding) throw new Error('Esta execução foi encerrada pelo board; nada foi alterado.');
      run(this.db, 'UPDATE ai_work_attempts SET mutations = mutations + 1 WHERE id = ?', [binding.attempt.id]);
    });
  }
  revoke(id: string, generation: number, owner: string): void {
    transaction(this.db, () => {
      this.owned(id, generation, owner);
      run(this.db, 'UPDATE ai_work_attempts SET token_hash = NULL WHERE work_id = ? AND generation = ?', [id, generation]);
    });
  }
  /** Revoga primeiro e mantém a reserva: a reconciliação do processo/pasta decide quando liberar. */
  recoverOwner(owner: string): WorkRecord[] {
    if (!text(owner, 240)) throw new Error('Instância dona do trabalho inválida.');
    return transaction(this.db, () => {
      const stale = this.live().filter((w) => w.owner !== owner);
      for (const work of stale) {
        run(this.db, 'UPDATE ai_work_attempts SET token_hash = NULL WHERE work_id = ?', [work.id]);
        run(this.db, "UPDATE ai_work SET owner = ?, state = 'reconciling', reason = ?, updated_at = ? WHERE id = ?", [
          owner,
          'A instância anterior encerrou; processo e pasta aguardam reconciliação.',
          this.now(),
          work.id,
        ]);
      }
      for (const work of this.reservations().filter((w) => !LIVE_WORK_STATES.includes(w.state) && w.owner !== owner))
        run(this.db, 'UPDATE ai_work SET owner = ? WHERE id = ?', [owner, work.id]);
      return stale.map((w) => this.get(w.id)!);
    });
  }
  /** O callback é síncrono e grava comentário e estado na mesma transação, sem duplicar em retomadas. */
  finish(id: string, generation: number, owner: string, outcome: Reconciled | { kind: 'cancelled' }, comment?: () => string): WorkRecord {
    return transaction(this.db, () => {
      const work = this.owned(id, generation, owner);
      const latest = this.latest(id)!;
      if (!LIVE_WORK_STATES.includes(work.state)) {
        if (latest.outcome === outcome.kind) return work;
        throw new Error('A tentativa já foi reconciliada com outro desfecho.');
      }
      if (work.state !== 'reconciling') throw new Error('A unidade precisa entrar em reconciliação antes de terminar.');
      if (outcome.kind === 'unconfirmed') {
        run(this.db, "UPDATE ai_work_attempts SET outcome = 'unconfirmed' WHERE id = ?", [latest.id]);
        this.move(work, 'reconciling', outcome.reason);
        return this.get(id)!;
      }
      const state: WorkState =
        outcome.kind === 'retry-safe'
          ? 'waiting'
          : outcome.kind === 'needs-decision'
            ? 'failed'
            : outcome.kind === 'cancelled'
              ? 'cancelled'
              : 'done';
      let commentId = latest.resultCommentId;
      if (!commentId && comment && state !== 'waiting') {
        commentId = comment();
        if (!text(commentId, 240)) throw new Error('Comentário de resultado inválido.');
      }
      run(this.db, 'UPDATE ai_work_attempts SET outcome = ?, result_comment_id = ?, token_hash = NULL, ended_at = ? WHERE id = ?', [
        outcome.kind,
        commentId,
        this.now(),
        latest.id,
      ]);
      this.move(work, state, 'reason' in outcome ? outcome.reason : '');
      return this.get(id)!;
    });
  }
  private owned(id: string, generation: number, owner: string): WorkRecord {
    const work = this.get(id);
    if (!work || work.owner !== owner || work.generation !== generation) throw new Error('Posse ou geração de trabalho expirada.');
    return work;
  }
  private move(work: WorkRecord, next: WorkState, reason: string): void {
    if (typeof reason !== 'string' || reason.length > 16000 || reason.includes('\0')) throw new Error('Motivo de trabalho inválido.');
    if (next !== 'started' && next !== 'prepared')
      run(this.db, 'UPDATE ai_work_attempts SET token_hash = NULL WHERE work_id = ?', [work.id]);
    run(this.db, 'UPDATE ai_work SET state = ?, reason = ?, updated_at = ?, workspace = ? WHERE id = ?', [
      next,
      reason,
      this.now(),
      work.workspace,
      work.id,
    ]);
  }
}
