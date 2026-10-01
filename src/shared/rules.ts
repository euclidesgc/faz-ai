/** Quando pedir confirmação antes de uma ação sobre um card. */
export type ConfirmMode = 'whenDependents' | 'always' | 'never';
/** O que fazer com as sub-tarefas em aberto quando a história é cancelada. */
export type CancelChildrenMode = 'ask' | 'cascade' | 'keep';
/** O que fazer com a história quando a última sub-tarefa em aberto é concluída. */
export type CompleteParentMode = 'ask' | 'auto' | 'off';

/** Regras do board, configuráveis em Configurações → Regras. */
export interface BoardRules {
  /** história não entra em coluna de conclusão com sub-tarefas em aberto */
  blockDoneWithOpenChildren: boolean;
  /** história não avança de coluna enquanto houver sub-tarefas em aberto cuja Fase é a coluna atual */
  blockPhaseAdvanceWithOpenChildren: boolean;
  onCancelParent: CancelChildrenMode;
  onAllChildrenDone: CompleteParentMode;
  confirmTrash: ConfirmMode;
  confirmArchive: ConfirmMode;
}

export const DEFAULT_RULES: BoardRules = {
  blockDoneWithOpenChildren: true,
  blockPhaseAdvanceWithOpenChildren: true,
  onCancelParent: 'ask',
  onAllChildrenDone: 'ask',
  confirmTrash: 'whenDependents',
  confirmArchive: 'whenDependents',
};

/** Lê o JSON salvo, completando com os padrões o que faltar ou for inválido. */
export function parseRules(json: string | null | undefined): BoardRules {
  let raw: Partial<Record<keyof BoardRules, unknown>> = {};
  try {
    const v: unknown = json ? JSON.parse(json) : {};
    if (v && typeof v === 'object') raw = v as typeof raw;
  } catch {
    /* JSON inválido: usa os padrões */
  }
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  const confirm = ['whenDependents', 'always', 'never'] as const;
  return {
    blockDoneWithOpenChildren: typeof raw.blockDoneWithOpenChildren === 'boolean' ? raw.blockDoneWithOpenChildren : DEFAULT_RULES.blockDoneWithOpenChildren,
    blockPhaseAdvanceWithOpenChildren:
      typeof raw.blockPhaseAdvanceWithOpenChildren === 'boolean' ? raw.blockPhaseAdvanceWithOpenChildren : DEFAULT_RULES.blockPhaseAdvanceWithOpenChildren,
    onCancelParent: pick(raw.onCancelParent, ['ask', 'cascade', 'keep'] as const, DEFAULT_RULES.onCancelParent),
    onAllChildrenDone: pick(raw.onAllChildrenDone, ['ask', 'auto', 'off'] as const, DEFAULT_RULES.onAllChildrenDone),
    confirmTrash: pick(raw.confirmTrash, confirm, DEFAULT_RULES.confirmTrash),
    confirmArchive: pick(raw.confirmArchive, confirm, DEFAULT_RULES.confirmArchive),
  };
}
