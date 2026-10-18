import type { Database } from 'sql.js';
import {
  contextId,
  validateActivityContext,
  validateAgentContext,
  validateContextTarget,
  type ActivitySelectionRecord,
  type AgentContractRecord,
  type ContextActivityTarget,
  type ContextPlanningWrite,
} from '../../shared/contextPlanning';
import { all, num, one, run, str, transaction, type Row } from '../db/query';
import { newId, now } from '../db/ids';

/** Os documentos são rascunhos. Somente o manifesto legado é consumido pelo runtime nesta entrega. */
export class ContextPlanningRepo {
  constructor(private db: Database) {}

  read(boardId: string): { agents: AgentContractRecord[]; activities: ActivitySelectionRecord[] } {
    return {
      agents: all(this.db, 'SELECT * FROM agent_context_contracts WHERE board_id = ? ORDER BY artifact_id', [boardId]).map((r) => {
        validateRecord(r);
        const contract: unknown = JSON.parse(str(r.contract_json));
        validateAgentContext(contract);
        return { artifactId: str(r.artifact_id), revision: num(r.revision), updatedAt: num(r.updated_at), contract };
      }),
      activities: all(this.db, 'SELECT * FROM activity_context_selections WHERE board_id = ? ORDER BY id', [boardId]).map((r) => {
        validateRecord(r);
        const selection: unknown = JSON.parse(str(r.selection_json));
        validateActivityContext(selection);
        const target = targetOfRow(r);
        validateContextTarget(target);
        return { id: str(r.id), ...target, revision: num(r.revision), updatedAt: num(r.updated_at), selection };
      }),
    };
  }

  /** Revisão otimista evita que uma edição atrasada substitua outra já revisada. */
  save(boardId: string, input: ContextPlanningWrite): void {
    if (!input || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
      throw new Error('Revisão de contexto inválida.');
    transaction(this.db, () => {
      const stamp = now();
      if (input.kind === 'agent') {
        validateAgentContext(input.contract);
        this.owner(boardId, 'board_artifacts', input.artifactId, 'agent');
        const old = one(this.db, 'SELECT revision FROM agent_context_contracts WHERE artifact_id = ? AND board_id = ?', [
          input.artifactId,
          boardId,
        ]);
        this.revision(old, input.expectedRevision);
        this.artifacts(boardId, input.contract.essentialSkillIds, 'skill');
        this.artifacts(boardId, input.contract.availableSkillIds, 'skill');
        this.artifacts(boardId, input.contract.allowedMcpIds, 'mcp');
        run(
          this.db,
          `INSERT INTO agent_context_contracts (artifact_id, board_id, revision, contract_json, updated_at)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(artifact_id) DO UPDATE SET revision = excluded.revision, contract_json = excluded.contract_json, updated_at = excluded.updated_at`,
          [input.artifactId, boardId, input.expectedRevision + 1, JSON.stringify(input.contract), stamp],
        );
      } else if (input.kind === 'activity') {
        validateActivityContext(input.selection);
        validateContextTarget(input.target);
        const t = input.target;
        this.target(boardId, t, true);
        const old = one(
          this.db,
          `SELECT * FROM activity_context_selections WHERE board_id = ? AND card_id IS ? AND workflow_id IS ? AND phase_id = ? AND action = ?`,
          [boardId, t.cardId, t.workflowId, t.phaseId, t.action],
        );
        this.revision(old, input.expectedRevision);
        const c = input.selection;
        if (c.agent.mode === 'explicit' && c.agent.value !== null) this.artifacts(boardId, [c.agent.value], 'agent');
        if (c.additionalSkillIds.mode === 'explicit') this.artifacts(boardId, c.additionalSkillIds.value, 'skill');
        if (c.activeMcpIds.mode === 'explicit') this.artifacts(boardId, c.activeMcpIds.value, 'mcp');
        for (const id of c.inputAttachmentIds) this.reference(boardId, 'attachments', id);
        run(
          this.db,
          `INSERT INTO activity_context_selections (id, board_id, card_id, workflow_id, phase_id, action, revision, selection_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, selection_json = excluded.selection_json, updated_at = excluded.updated_at`,
          [
            old ? str(old.id) : newId(),
            boardId,
            t.cardId,
            t.workflowId,
            t.phaseId,
            t.action,
            input.expectedRevision + 1,
            JSON.stringify(c),
            stamp,
          ],
        );
      } else throw new Error('Tipo de configuração de contexto inválido.');
    });
  }

  /** Validação após materializar um import em memória, antes de substituir o board real. */
  validateBoard(boardId: string): void {
    const data = this.read(boardId);
    for (const a of data.agents) {
      this.owner(boardId, 'board_artifacts', a.artifactId, 'agent');
      this.artifacts(boardId, a.contract.essentialSkillIds, 'skill');
      this.artifacts(boardId, a.contract.availableSkillIds, 'skill');
      this.artifacts(boardId, a.contract.allowedMcpIds, 'mcp');
    }
    for (const a of data.activities) {
      this.target(boardId, a);
      const s = a.selection;
      if (s.agent.mode === 'explicit' && s.agent.value !== null) this.artifacts(boardId, [s.agent.value], 'agent');
      if (s.additionalSkillIds.mode === 'explicit') this.artifacts(boardId, s.additionalSkillIds.value, 'skill');
      if (s.activeMcpIds.mode === 'explicit') this.artifacts(boardId, s.activeMcpIds.value, 'mcp');
      for (const id of s.inputAttachmentIds) this.reference(boardId, 'attachments', id);
    }
  }

  private revision(row: Row | undefined, expected: number): void {
    if ((row ? num(row.revision) : 0) !== expected) throw new Error('A configuração de contexto mudou. Releia antes de salvar.');
  }

  private owner(boardId: string, table: 'board_artifacts' | 'cards' | 'workflows', id: string, kind?: string): void {
    if (!contextId(id)) throw new Error('Identidade de contexto inválida.');
    const row = one(this.db, `SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!row || row.board_id !== boardId || (kind && row.kind !== kind)) throw new Error('Origem de contexto ausente ou fora do board.');
  }

  /** Referências removidas permanecem revisáveis; uma referência existente nunca cruza boards ou tipos. */
  private artifacts(boardId: string, ids: string[], kind: string): void {
    for (const id of ids) {
      const row = one(this.db, 'SELECT board_id, kind FROM board_artifacts WHERE id = ?', [id]);
      if (row && (row.board_id !== boardId || row.kind !== kind))
        throw new Error('Referência de contexto incompatível com o board ou tipo.');
    }
  }

  private reference(boardId: string, table: 'attachments' | 'columns', id: string): void {
    const sql =
      table === 'attachments'
        ? 'SELECT c.board_id FROM attachments a JOIN cards c ON c.id = a.card_id WHERE a.id = ?'
        : 'SELECT w.board_id FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE c.id = ?';
    const row = one(this.db, sql, [id]);
    if (row && row.board_id !== boardId) throw new Error('Referência de contexto fora do board.');
  }

  private target(boardId: string, t: ContextActivityTarget, requireCurrentWorkflow = false): void {
    if (t.cardId !== null) this.owner(boardId, 'cards', t.cardId);
    if (t.workflowId !== null) this.owner(boardId, 'workflows', t.workflowId);
    if (t.phaseId) {
      this.reference(boardId, 'columns', t.phaseId);
      const phase = one(this.db, 'SELECT workflow_id FROM columns WHERE id = ?', [t.phaseId]);
      const workflowId =
        t.workflowId ?? (t.cardId ? one(this.db, 'SELECT workflow_id FROM cards WHERE id = ?', [t.cardId])?.workflow_id : undefined);
      if (requireCurrentWorkflow && phase && workflowId && phase.workflow_id !== workflowId)
        throw new Error('A fase não pertence ao workflow da atividade.');
    }
  }
}

function targetOfRow(r: Row): ContextActivityTarget {
  return {
    cardId: r.card_id === null ? null : str(r.card_id),
    workflowId: r.workflow_id === null ? null : str(r.workflow_id),
    phaseId: str(r.phase_id),
    action: str(r.action) as ContextActivityTarget['action'],
  };
}

function validateRecord(r: Row): void {
  if (
    !contextId(r.board_id) ||
    !Number.isSafeInteger(r.revision) ||
    num(r.revision) < 1 ||
    !Number.isSafeInteger(r.updated_at) ||
    num(r.updated_at) < 0
  )
    throw new Error('Revisão de contexto inválida.');
}
