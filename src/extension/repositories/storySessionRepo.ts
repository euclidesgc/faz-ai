import type { Database } from 'sql.js';
import { newId, now } from '../db/ids';
import { all, one, run, str, num, transaction, type Row } from '../db/query';

export type StorySessionStatus = 'opening' | 'active' | 'checkpointed' | 'reconciling' | 'lost' | 'closed';
export type SessionIntentStatus = 'pending' | 'dispatching' | 'reconciling' | 'linked' | 'completed' | 'failed' | 'cancelled';
export type ChildSessionStatus = 'active' | 'completed' | 'failed' | 'cancelled' | 'unknown';

export interface StorySession {
  id: string;
  boardId: string;
  storyId: string;
  generation: number;
  executor: string;
  transport: string;
  nativeSessionId: string | null;
  configFingerprint: string;
  workspace: string;
  status: StorySessionStatus;
  checkpoint: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface SessionIntent {
  id: string;
  sessionId: string;
  workId: string;
  attempt: number;
  intentKey: string;
  config: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  status: SessionIntentStatus;
  result: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChildSession {
  intentId: string;
  nativeSessionId: string;
  executor: string;
  transport: string;
  status: ChildSessionStatus;
  result: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

const json = (value: string): Record<string, unknown> => JSON.parse(value) as Record<string, unknown>;
const nullableJson = (value: unknown): Record<string, unknown> | null => (value == null ? null : json(String(value)));

function session(r: Row): StorySession {
  return {
    id: str(r.id),
    boardId: str(r.board_id),
    storyId: str(r.story_id),
    generation: num(r.generation),
    executor: str(r.executor),
    transport: str(r.transport),
    nativeSessionId: r.native_session_id == null ? null : str(r.native_session_id),
    configFingerprint: str(r.config_fingerprint),
    workspace: str(r.workspace),
    status: str(r.status) as StorySessionStatus,
    checkpoint: json(str(r.checkpoint_json)),
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
  };
}

function intent(r: Row): SessionIntent {
  return {
    id: str(r.id),
    sessionId: str(r.session_id),
    workId: str(r.work_id),
    attempt: num(r.attempt),
    intentKey: str(r.intent_key),
    config: json(str(r.config_json)),
    snapshot: json(str(r.snapshot_json)),
    status: str(r.status) as SessionIntentStatus,
    result: nullableJson(r.result_json),
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
  };
}

function child(r: Row): ChildSession {
  return {
    intentId: str(r.intent_id),
    nativeSessionId: str(r.native_session_id),
    executor: str(r.executor),
    transport: str(r.transport),
    status: str(r.status) as ChildSessionStatus,
    result: nullableJson(r.result_json),
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
  };
}

/** Persistência da sessão lógica da História e do protocolo durável de delegação. */
export class StorySessionRepo {
  constructor(private readonly db: Database) {}

  createSession(
    input: Pick<
      StorySession,
      'boardId' | 'storyId' | 'generation' | 'executor' | 'transport' | 'nativeSessionId' | 'configFingerprint' | 'workspace'
    > & { status?: StorySessionStatus; checkpoint?: Record<string, unknown> },
  ): StorySession {
    const id = newId();
    const at = now();
    run(
      this.db,
      `INSERT INTO story_sessions
      (id,board_id,story_id,generation,executor,transport,native_session_id,config_fingerprint,workspace,status,checkpoint_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.boardId,
        input.storyId,
        input.generation,
        input.executor,
        input.transport,
        input.nativeSessionId,
        input.configFingerprint,
        input.workspace,
        input.status ?? 'opening',
        JSON.stringify(input.checkpoint ?? {}),
        at,
        at,
      ],
    );
    return this.getSession(id)!;
  }

  getSession(id: string): StorySession | null {
    const row = one(this.db, 'SELECT * FROM story_sessions WHERE id = ?', [id]);
    return row ? session(row) : null;
  }

  latestForStory(storyId: string): StorySession | null {
    const row = one(this.db, 'SELECT * FROM story_sessions WHERE story_id = ? ORDER BY generation DESC LIMIT 1', [storyId]);
    return row ? session(row) : null;
  }

  updateSession(
    id: string,
    patch: Partial<Pick<StorySession, 'nativeSessionId' | 'configFingerprint' | 'workspace' | 'status' | 'checkpoint'>>,
  ): StorySession {
    const current = this.getSession(id);
    if (!current) throw new Error(`Sessão da História não encontrada: ${id}`);
    const next = { ...current, ...patch };
    run(
      this.db,
      `UPDATE story_sessions SET native_session_id=?,config_fingerprint=?,workspace=?,status=?,checkpoint_json=?,updated_at=? WHERE id=?`,
      [next.nativeSessionId, next.configFingerprint, next.workspace, next.status, JSON.stringify(next.checkpoint), now(), id],
    );
    return this.getSession(id)!;
  }

  createIntent(input: Pick<SessionIntent, 'sessionId' | 'workId' | 'attempt' | 'intentKey' | 'config' | 'snapshot'>): SessionIntent {
    const id = newId();
    const at = now();
    run(
      this.db,
      `INSERT INTO story_session_intents
      (id,session_id,work_id,attempt,intent_key,config_json,snapshot_json,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'pending',?,?)`,
      [
        id,
        input.sessionId,
        input.workId,
        input.attempt,
        input.intentKey,
        JSON.stringify(input.config),
        JSON.stringify(input.snapshot),
        at,
        at,
      ],
    );
    return this.getIntent(id)!;
  }

  getIntent(id: string): SessionIntent | null {
    const row = one(this.db, 'SELECT * FROM story_session_intents WHERE id = ?', [id]);
    return row ? intent(row) : null;
  }

  intentByKey(sessionId: string, intentKey: string): SessionIntent | null {
    const row = one(this.db, 'SELECT * FROM story_session_intents WHERE session_id=? AND intent_key=?', [sessionId, intentKey]);
    return row ? intent(row) : null;
  }

  listIntents(sessionId: string): SessionIntent[] {
    return all(this.db, 'SELECT * FROM story_session_intents WHERE session_id=? ORDER BY created_at,id', [sessionId]).map(intent);
  }

  updateIntent(id: string, status: SessionIntentStatus, result: Record<string, unknown> | null = null): SessionIntent {
    run(this.db, 'UPDATE story_session_intents SET status=?,result_json=?,updated_at=? WHERE id=?', [
      status,
      result == null ? null : JSON.stringify(result),
      now(),
      id,
    ]);
    const updated = this.getIntent(id);
    if (!updated) throw new Error(`Intenção de sessão não encontrada: ${id}`);
    return updated;
  }

  linkChild(
    input: Pick<ChildSession, 'intentId' | 'nativeSessionId' | 'executor' | 'transport'> & { status?: ChildSessionStatus },
  ): ChildSession {
    const at = now();
    transaction(this.db, () => {
      run(
        this.db,
        `INSERT INTO story_session_children (intent_id,native_session_id,executor,transport,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`,
        [input.intentId, input.nativeSessionId, input.executor, input.transport, input.status ?? 'active', at, at],
      );
      this.updateIntent(input.intentId, 'linked');
    });
    return this.getChild(input.intentId)!;
  }

  getChild(intentId: string): ChildSession | null {
    const row = one(this.db, 'SELECT * FROM story_session_children WHERE intent_id=?', [intentId]);
    return row ? child(row) : null;
  }

  listChildren(sessionId: string): Array<{ intent: SessionIntent; child: ChildSession | null }> {
    return all(this.db, `SELECT i.* FROM story_session_intents i WHERE i.session_id=? ORDER BY i.created_at,i.id`, [sessionId]).map((r) => {
      const item = intent(r);
      return { intent: item, child: this.getChild(item.id) };
    });
  }

  updateChild(intentId: string, status: ChildSessionStatus, result: Record<string, unknown> | null = null): ChildSession {
    transaction(this.db, () => {
      run(this.db, 'UPDATE story_session_children SET status=?,result_json=?,updated_at=? WHERE intent_id=?', [
        status,
        result == null ? null : JSON.stringify(result),
        now(),
        intentId,
      ]);
      if (status === 'completed' || status === 'failed' || status === 'cancelled') this.updateIntent(intentId, status, result);
    });
    const updated = this.getChild(intentId);
    if (!updated) throw new Error(`Sessão filha não encontrada para intenção: ${intentId}`);
    return updated;
  }
}
