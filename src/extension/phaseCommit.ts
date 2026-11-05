import { TRAILER_KEYS } from './commitTrailers';

/**
 * O commit da fase pelo board (rodada real de 04/11/2026): as sub-tarefas não fazem commit, por desenho do ciclo
 * (um escritor por vez na pasta da história, um commit por fase), e a história gastava uma execução inteira da IA
 * só para rodar os testes, fazer esse commit e mover o card. Quando todas terminam sem ressalvas, o board faz o
 * commit ele mesmo, com a mensagem montada a partir da história e das sub-tarefas e os trailers de rastreio que a
 * execução da IA levaria (sem o da run, porque não há run).
 */
export interface PhaseCommitInput {
  storyNumber: number;
  storyTitle: string;
  /** a coluna da história (a fase que fecha) */
  phase: string;
  /** os títulos das sub-tarefas da fase, na ordem em que terminaram */
  subtasks: string[];
}

export function phaseCommitMessage(i: PhaseCommitInput): string {
  return [
    i.storyTitle.trim() || `História #${i.storyNumber}`,
    '',
    `Fechamento da fase ${i.phase} pelo board, com as sub-tarefas:`,
    ...i.subtasks.map((t) => `- ${t}`),
    '',
    `${TRAILER_KEYS.card}: #${i.storyNumber}`,
    `${TRAILER_KEYS.phase}: ${i.phase}`,
  ].join('\n');
}

export type GitFn = (cwd: string, args: string[]) => string;

/** `git add -A` e o commit da fase; devolve o sha. Lança quando não há o que commitar ou o git recusa (hook, identidade). */
export function commitPhase(folder: string, input: PhaseCommitInput, git: GitFn): { sha: string } {
  git(folder, ['add', '-A']);
  if (!git(folder, ['status', '--porcelain']).trim()) throw new Error('A pasta da história não tem alterações para o commit da fase.');
  git(folder, ['commit', '-q', '-m', phaseCommitMessage(input)]);
  return { sha: git(folder, ['rev-parse', 'HEAD']).trim() };
}
