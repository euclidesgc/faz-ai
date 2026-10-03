import { useState } from 'react';

/** Arquivo existente que pode ser aberto no editor da página. */
export type EditableKind = 'rule' | 'skill' | 'agent';

/** O que está aberto na página: o editor de um arquivo ou um dos formulários de criação. Um por vez. */
export type Editing = { kind: EditableKind; name: string } | { kind: 'newSkill' } | { kind: 'newAgent' } | null;

/** Rascunho dos formulários de criação; skill e agente compartilham os campos. */
export interface Draft {
  name: string;
  description: string;
  body: string;
  /** modelo fixado no agente; vazio = o modelo da sessão */
  model: string;
}

const EMPTY_DRAFT: Draft = { name: '', description: '', body: '', model: '' };

/**
 * Estado de edição do harness do projeto: abrir um editor ou formulário fecha o que estava aberto,
 * e o rascunho sobrevive a fechar o formulário de skill (só o Cancelar do agente e as criações o limpam).
 */
export function useProjectEditing() {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const isEditing = (kind: EditableKind, name: string) => editing !== null && editing.kind === kind && editing.name === name;
  const toggle = (kind: EditableKind, name: string) => setEditing(isEditing(kind, name) ? null : { kind, name });
  const toggleNew = (kind: 'newSkill' | 'newAgent') => setEditing(editing?.kind === kind ? null : { kind });
  const close = () => setEditing(null);
  const patchDraft = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  /** limpa o rascunho todo e fecha */
  const clearForm = () => {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
  };

  return { editing, isEditing, toggle, toggleNew, close, draft, patchDraft, clearForm };
}

export type ProjectEditing = ReturnType<typeof useProjectEditing>;
