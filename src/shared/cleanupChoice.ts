// A escolha da pessoa quando a limpeza local depois do merge fica bloqueada (branch aberta na pasta do projeto ou em
// outra pasta, mudanças não commitadas, commits fora do PR): o board não mexe nisso sozinho, então pergunta se a IA
// pode fazer ou se a pessoa faz. A pergunta vai pelo caminho normal e a escolha pendente fica no `meta` do board.

/** As duas opções da pergunta, na ordem em que aparecem. */
export const CLEANUP_OPTIONS = ['Pode fazer', 'Eu mesmo faço'] as const;

/** A consequência de cada opção, na mesma ordem de `CLEANUP_OPTIONS` (o campo de consequência da pergunta). */
export const CLEANUP_CONSEQUENCES = [
  'A IA remove a worktree e apaga a branch local, depois o card volta para a fila',
  'Nada é alterado; os comandos ficam no aviso da conversa',
] as const;

export interface CleanupChoice {
  question: string;
  options: readonly ['Pode fazer', 'Eu mesmo faço'];
  branch: string;
  worktreePath: string | null;
  /** os comandos prontos, para o comentário de "Pode fazer" */
  commands: string;
}

/** A chave da escolha pendente de um card no `meta` do board. */
export const cleanupChoiceKey = (cardId: string): string => `cleanup_choice:${cardId}`;

/** A pergunta de limpeza para a história `branch`, com os comandos que a IA rodaria (em ordem, um por linha). */
export function cleanupChoice(branch: string, worktreePath: string | null, develop: string): CleanupChoice {
  const commands = [
    `git switch ${develop}`,
    ...(worktreePath ? [`git worktree remove ${worktreePath}`] : []),
    `git branch -D ${branch}`,
  ].join('\n');
  return {
    question: `A limpeza local da branch ${branch} ficou bloqueada. Posso fazer a limpeza agora?`,
    options: CLEANUP_OPTIONS,
    branch,
    worktreePath,
    commands,
  };
}
