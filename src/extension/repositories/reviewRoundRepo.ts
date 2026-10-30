import type { Database } from 'sql.js';
import { VERDICTS, type Finding, type Verdict } from '../../shared/reviewVerdict';
import { newId, now } from '../db/ids';
import { all, one, run, str, strOrNull, num, type Row } from '../db/query';

export interface ReviewRound {
  id: string;
  storyId: string;
  subtaskId: string;
  round: number;
  verdict: Verdict;
  headSha: string;
  implementerModel: string | null;
  reviewerModel: string | null;
  independence: string | null;
  findings: Finding[];
  unchecked: string[];
  createdAt: number;
}

function review(r: Row): ReviewRound {
  const verdict = str(r.verdict) as Verdict;
  if (!VERDICTS.includes(verdict)) throw new Error('Veredito de revisão local inválido.');
  return {
    id: str(r.id),
    storyId: str(r.story_id),
    subtaskId: str(r.subtask_id),
    round: num(r.round),
    verdict,
    headSha: str(r.head_sha),
    implementerModel: strOrNull(r.implementer_model),
    reviewerModel: strOrNull(r.reviewer_model),
    independence: strOrNull(r.independence),
    findings: JSON.parse(str(r.findings_json)) as Finding[],
    unchecked: JSON.parse(str(r.unchecked_json)) as string[],
    createdAt: num(r.created_at),
  };
}

/** Registro das rodadas da revisão independente (`review_rounds`): uma por sub-tarefa e por número na história. */
export class ReviewRoundRepo {
  constructor(private readonly db: Database) {}

  create(r: Omit<ReviewRound, 'id' | 'createdAt'>): ReviewRound {
    const id = newId();
    const createdAt = now();
    run(
      this.db,
      `INSERT INTO review_rounds (id, story_id, subtask_id, round, verdict, head_sha, implementer_model, reviewer_model,
         independence, findings_json, unchecked_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        r.storyId,
        r.subtaskId,
        r.round,
        r.verdict,
        r.headSha,
        r.implementerModel,
        r.reviewerModel,
        r.independence,
        JSON.stringify(r.findings),
        JSON.stringify(r.unchecked),
        createdAt,
      ],
    );
    return { ...r, id, createdAt };
  }

  lastForStory(storyId: string): ReviewRound | null {
    const r = one(this.db, 'SELECT * FROM review_rounds WHERE story_id = ? ORDER BY round DESC LIMIT 1', [storyId]);
    return r ? review(r) : null;
  }

  listForStory(storyId: string): ReviewRound[] {
    return all(this.db, 'SELECT * FROM review_rounds WHERE story_id = ? ORDER BY round', [storyId]).map(review);
  }

  /** Desfaz a rodada de uma sub-tarefa cujo fechamento não se completou (a mudança de coluna foi recusada). */
  deleteForSubtask(subtaskId: string): void {
    run(this.db, 'DELETE FROM review_rounds WHERE subtask_id = ?', [subtaskId]);
  }

  deleteForStory(storyId: string): void {
    run(this.db, 'DELETE FROM review_rounds WHERE story_id = ?', [storyId]);
  }
}
