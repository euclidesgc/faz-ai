import type { Database } from 'sql.js';
import { norm } from '../../shared/filters';
import type { ColumnCategory, WorkflowKind } from '../../shared/model';
import { all, bool, num, one, run, str, transaction } from './query';

/**
 * Board padrão. Cada mudança no padrão sobe a versão; boards criados antes são atualizados no
 * lugar (com confirmação), sem recriar nada: os cards continuam na coluna em que estavam.
 */
export const BOARD_TEMPLATE_VERSION = 1;

export interface TemplateColumn {
  name: string;
  category: ColumnCategory;
  /** a IA trabalha nos cards desta coluna */
  aiActive?: boolean;
  /** a IA só avança o card depois que uma pessoa aprova */
  requiresApproval?: boolean;
}

export const BOARD_TEMPLATE: Record<WorkflowKind, TemplateColumn[]> = {
  parent: [
    { name: 'Backlog', category: 'open' },
    { name: 'PRD', category: 'open', aiActive: true, requiresApproval: true },
    { name: 'Spec', category: 'open', aiActive: true, requiresApproval: true },
    { name: 'Plan', category: 'open', aiActive: true, requiresApproval: true },
    { name: 'Implementação', category: 'open', aiActive: true },
    { name: 'Concluído', category: 'done' },
    { name: 'Cancelado', category: 'cancelled' },
  ],
  child: [
    { name: 'A fazer', category: 'open', aiActive: true },
    { name: 'Em andamento', category: 'open', aiActive: true },
    { name: 'Concluído', category: 'done' },
  ],
};

interface Step {
  description: string;
  apply: () => void;
}

/** O que falta para o board chegar ao padrão atual. Nunca move cards nem mexe no que a pessoa personalizou. */
function steps(db: Database, boardId: string): Step[] {
  const version = num(one(db, 'SELECT template_version AS v FROM boards WHERE id = ?', [boardId])?.v);
  const out: Step[] = [];
  if (version < 1) {
    for (const wf of all(db, 'SELECT id, kind FROM workflows WHERE board_id = ?', [boardId])) {
      const cols = all(db, 'SELECT id, name, ai_active, requires_approval FROM columns WHERE workflow_id = ?', [str(wf.id)]);
      for (const t of BOARD_TEMPLATE[str(wf.kind) as WorkflowKind]) {
        if (!t.aiActive) continue;
        const col = cols.find((c) => norm(str(c.name)) === norm(t.name));
        // só preenche o que ainda está no valor inicial
        if (!col || bool(col.ai_active) || bool(col.requires_approval)) continue;
        out.push({
          description: `Coluna "${str(col.name)}": a IA atua${t.requiresApproval ? ' e só avança o card com a sua aprovação' : ''}.`,
          apply: () => run(db, 'UPDATE columns SET ai_active = 1, requires_approval = ? WHERE id = ?', [t.requiresApproval ? 1 : 0, str(col.id)]),
        });
      }
    }
  }
  return out;
}

/** Descrição das mudanças pendentes; vazio quando o board já está no padrão atual. */
export function pendingUpgrade(db: Database, boardId: string): string[] {
  return steps(db, boardId).map((s) => s.description);
}

/** Aplica as mudanças pendentes e marca o board com a versão atual do padrão. */
export function upgradeBoard(db: Database, boardId: string): void {
  transaction(db, () => {
    steps(db, boardId).forEach((s) => s.apply());
    run(db, 'UPDATE boards SET template_version = ? WHERE id = ?', [BOARD_TEMPLATE_VERSION, boardId]);
  });
}
