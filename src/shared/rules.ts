/** Quando pedir confirmação antes de uma ação sobre um card. */
export type ConfirmMode = 'whenDependents' | 'always' | 'never';
/** O que fazer com as sub-tarefas em aberto quando a história é cancelada. */
export type CancelChildrenMode = 'ask' | 'cascade' | 'keep';

/** Regras do board, configuráveis em Configurações → Regras. */
export interface BoardRules {
  /** história não entra em coluna de conclusão com sub-tarefas em aberto */
  blockDoneWithOpenChildren: boolean;
  onCancelParent: CancelChildrenMode;
  confirmTrash: ConfirmMode;
  confirmArchive: ConfirmMode;
}

export const DEFAULT_RULES: BoardRules = {
  blockDoneWithOpenChildren: true,
  onCancelParent: 'ask',
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
    onCancelParent: pick(raw.onCancelParent, ['ask', 'cascade', 'keep'] as const, DEFAULT_RULES.onCancelParent),
    confirmTrash: pick(raw.confirmTrash, confirm, DEFAULT_RULES.confirmTrash),
    confirmArchive: pick(raw.confirmArchive, confirm, DEFAULT_RULES.confirmArchive),
  };
}
