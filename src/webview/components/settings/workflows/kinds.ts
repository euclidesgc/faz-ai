import type { WorkflowKind } from '../../../../shared/model';

/** O papel de um workflow: o que as regras do board fazem com os cards dele. */
export const WORKFLOW_KINDS: { value: WorkflowKind; label: string; hint: string }[] = [
  { value: 'parent', label: 'Cards independentes', hint: 'Recebe histórias, bugs, retrabalho e débitos. Cada card pode ter sub-tarefas.' },
  { value: 'child', label: 'Sub-tarefas', hint: 'Recebe as sub-tarefas de uma história. Cada card tem sempre uma história como pai.' },
];

export const kindLabel = (kind: WorkflowKind): string => WORKFLOW_KINDS.find((k) => k.value === kind)!.label;
