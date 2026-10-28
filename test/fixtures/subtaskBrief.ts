import { BRIEF_SECTIONS } from '../../src/shared/subtaskBrief';

/** Descrição de sub-tarefa que passa na conferência das seções exigidas. */
export function validBrief(): string {
  return [
    `### ${BRIEF_SECTIONS.goal}\nEntregar a parte.`,
    `### ${BRIEF_SECTIONS.done}\nO teste passa.`,
    `### ${BRIEF_SECTIONS.may}\n- src/a.ts`,
    `### ${BRIEF_SECTIONS.mayNot}\n- src/b.ts`,
  ].join('\n\n');
}
