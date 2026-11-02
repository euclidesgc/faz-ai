// Regra pura do selo "Modelo" da tabela de colunas: o que decide o modelo numa coluna (sem `vscode`).
import { REVIEW_PHASE } from './boardFields';
import type { BoardState, Column } from './model';
import { EFFORT_FIELD } from './models';

export type PhaseModelBadge = { kind: 'model'; value: string } | { kind: 'reviewer' } | { kind: 'effort' } | { kind: 'none' };

/**
 * O que decide o modelo dos cards que entram na coluna: o modelo dela; na "Revisão" do workflow de histórias, o board
 * escolhe o do revisor; uma regra ligada que olha o esforço; senão nada em particular (vale o agente ou o padrão).
 */
export function phaseModelBadge(state: BoardState, column: Column): PhaseModelBadge {
  if (column.phaseModel) return { kind: 'model', value: column.phaseModel };
  const workflow = state.workflows.find((w) => w.id === column.workflowId);
  if (column.name === REVIEW_PHASE && workflow?.kind === 'parent') return { kind: 'reviewer' };
  const effortId = state.fieldDefs.find((f) => f.name === EFFORT_FIELD)?.id;
  const byEffort =
    !!effortId && state.board.modelRules.some((r) => r.enabled && r.groups.some((g) => g.some((c) => c.fieldId === effortId)));
  return byEffort ? { kind: 'effort' } : { kind: 'none' };
}
