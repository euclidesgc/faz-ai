import { activeProfile, catalogTool } from './aiProfiles';
import { norm } from './filters';
import type { BoardState, Column } from './model';
import { defaultModelOf, modelValue, parseModelValue } from './models';
import { isCheapTier } from './reviewerModel';
import { columnsOf } from './selectors';

export interface PhaseModelSuggestion {
  columnId: string;
  value: string | null;
  reason: string;
}

const isCode = (column: Column): boolean => ['implementacao', 'revisao'].includes(norm(column.name));

/** Sugere modelos sem alterar o snapshot nem persistir a proposta. */
export function suggestPhaseModels(state: BoardState, workflowId: string): PhaseModelSuggestion[] {
  const workflow = state.workflows.find((item) => item.id === workflowId);
  if (!workflow) return [];
  const columns = columnsOf(state, workflowId);
  if (workflow.kind === 'child')
    return columns.map((column) => ({ columnId: column.id, value: null, reason: 'Workflow filho sem preferência de modelo.' }));

  const { board } = state;
  const tool = catalogTool(activeProfile(board));
  const catalog = board.modelCatalog.filter((option) => option.tool === tool);
  const ladder = [
    ...new Set(
      (board.modelLadders[board.aiTool] ?? []).filter((value) => {
        const parsed = parseModelValue(value);
        const option = parsed && catalog.find((item) => item.id === parsed.id);
        return !!parsed && !!option && (parsed.effort === null || option.efforts.includes(parsed.effort));
      }),
    ),
  ];

  const pick = (high: boolean): Pick<PhaseModelSuggestion, 'value' | 'reason'> => {
    if (ladder.length >= 2) {
      const first = ladder[0]!;
      if (high) return { value: ladder[ladder.length - 1]!, reason: 'Planejamento usa o topo da escada.' };
      if (isCheapTier(catalog, { [tool]: ladder }, tool, first))
        return { value: first, reason: 'Homologação usa o degrau mais barato da escada.' };
    }
    const option = defaultModelOf(catalog, tool);
    if (!option) return { value: null, reason: 'Sem modelo padrão válido e dois degraus válidos na escada.' };
    if (!option.efforts.length) return { value: option.id, reason: 'Sem dois degraus válidos, usa o modelo padrão sem ajuste de esforço.' };
    const preferred = high ? 'high' : 'low';
    const effort = option.efforts.includes(preferred) ? preferred : option.efforts[high ? option.efforts.length - 1 : 0]!;
    return {
      value: modelValue(option.id, effort),
      reason: high
        ? 'Sem dois degraus válidos, planejamento usa o esforço alto do modelo padrão.'
        : 'Sem dois degraus válidos, homologação usa o esforço baixo do modelo padrão.',
    };
  };

  const eligible = columns.filter((column) => column.category === 'open' && column.aiActive);
  const last = eligible[eligible.length - 1];
  const code = eligible.find(isCode) ?? last;
  const codeIndex = code ? columns.indexOf(code) : -1;
  return columns.map((column, index) => {
    let suggestion: Pick<PhaseModelSuggestion, 'value' | 'reason'>;
    if (column.category !== 'open' || !column.aiActive) suggestion = { value: null, reason: 'Coluna sem atuação da IA.' };
    else if (isCode(column)) suggestion = { value: null, reason: 'Execução e revisão ficam sem preferência de modelo.' };
    else if (column === last) suggestion = pick(false);
    else if (column.artifactName.trim() || index < codeIndex) suggestion = pick(true);
    else suggestion = { value: null, reason: 'Execução fica sem preferência de modelo.' };
    return { columnId: column.id, ...suggestion };
  });
}
