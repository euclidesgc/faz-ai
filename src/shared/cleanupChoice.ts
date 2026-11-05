// A limpeza depois do merge e a atualização da base da pilha usam a mesma pergunta.
// Os textos ficam na escolha para a resposta retomar a ação certa, inclusive depois de reabrir o board.

/** As duas opções da pergunta, na ordem em que aparecem. */
export const CLEANUP_OPTIONS = ['Pode fazer', 'Eu mesmo faço'] as const;

/** A consequência de cada opção, na mesma ordem de `CLEANUP_OPTIONS` (o campo de consequência da pergunta). */
export const CLEANUP_CONSEQUENCES = [
  'A IA remove a worktree e apaga a branch local, depois o card volta para a fila',
  'Nada é alterado. Os comandos ficam no aviso da conversa',
] as const;

export interface CleanupChoice {
  question: string;
  options: readonly ['Pode fazer', 'Eu mesmo faço'];
  branch: string;
  worktreePath: string | null;
  /** os comandos prontos, para o comentário de "Pode fazer" */
  commands: string;
  /** Opcionais para ler escolhas antigas já gravadas no meta. */
  consequences?: readonly [string, string];
  goComment?: string;
  skipComment?: string;
}

/** A chave da escolha pendente de um card no `meta` do board. */
export const cleanupChoiceKey = (cardId: string): string => `cleanup_choice:${cardId}`;

/** A pergunta de limpeza para a história `branch`, com os comandos que a IA rodaria (em ordem, um por linha). */
export function cleanupChoice(
  branch: string,
  worktreePath: string | null,
  develop: string,
  remote?: { commands: readonly string[]; localBlocked: boolean },
): CleanupChoice {
  const local = !remote || remote.localBlocked;
  const commands = [
    ...(local
      ? [`git switch ${develop}`, ...(worktreePath ? [`git worktree remove ${worktreePath}`] : []), `git branch -D ${branch}`]
      : []),
    ...(remote?.commands ?? []),
  ].join('\n');
  const scope = remote ? (local ? 'local e remota' : 'remota') : 'local';
  return {
    question: `A limpeza ${scope} da branch ${branch} ficou bloqueada. Posso fazer a limpeza agora?`,
    options: CLEANUP_OPTIONS,
    branch,
    worktreePath,
    commands,
    consequences: remote
      ? [`A IA faz a limpeza ${scope} da branch, depois o card volta para a fila`, CLEANUP_CONSEQUENCES[1]]
      : CLEANUP_CONSEQUENCES,
    goComment: `A IA foi autorizada a fazer a limpeza ${scope} da branch ${branch}. A limpeza automática ficou bloqueada. O card volta para a fila. Confira antes que não há mudanças nem commits que só existam aí e, se estiver tudo no pull request, rode:\n\n\`\`\`\n${commands}\n\`\`\``,
    skipComment: `A limpeza ${scope} da branch ${branch} ficou com você. Você escolheu fazer a limpeza. Nada foi alterado. Quando puder, rode:\n\n\`\`\`\n${commands}\n\`\`\``,
  };
}

/** O merge da base é feito pela IA só depois da autorização da pessoa. */
export function stackMergeChoice(branch: string, base: string): CleanupChoice {
  const commands = `git fetch origin ${base}\ngit merge origin/${base}`;
  return {
    question: `A base da branch ${branch} passou para ${base}. Posso trazer a nova base para a branch?`,
    options: CLEANUP_OPTIONS,
    branch,
    worktreePath: null,
    commands,
    consequences: [
      `A IA traz origin/${base} para a branch com merge, sem rebase nem push forçado, e o card volta para a fila`,
      CLEANUP_CONSEQUENCES[1],
    ],
    goComment: `A IA foi autorizada a atualizar a branch ${branch}. A base da pilha passou para ${base}. O card volta para a fila. Na pasta da história, traga a nova base com merge, sem rebase nem push forçado:\n\n\`\`\`\n${commands}\n\`\`\``,
    skipComment: `A atualização da branch ${branch} ficou com você. A base da pilha passou para ${base}. Nada foi alterado. Na pasta da história, traga a nova base com merge, sem rebase nem push forçado:\n\n\`\`\`\n${commands}\n\`\`\``,
  };
}
