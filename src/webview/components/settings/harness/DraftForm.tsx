import type { ReactNode } from 'react';
import { toItemName } from '../../../../shared/harnessProject';
import { FieldRow } from '../../ui';
import { FormActions } from './FormActions';
import type { Draft } from './useProjectEditing';

interface Props {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  /** nome válido e livre */
  nameOk: boolean;
  namePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  bodyPlaceholder: string;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  /** campos extras entre a descrição e as instruções */
  children?: ReactNode;
}

/** Formulário de uma skill ou agente novo no projeto: nome, descrição e instruções. */
export function DraftForm({
  draft,
  onChange,
  nameOk,
  namePlaceholder,
  descriptionLabel,
  descriptionPlaceholder,
  bodyPlaceholder,
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: Props) {
  return (
    <section className="settings-block">
      <FieldRow label="Nome">
        <input value={draft.name} onChange={(e) => onChange({ name: toItemName(e.target.value) })} placeholder={namePlaceholder} />
      </FieldRow>
      <FieldRow label={descriptionLabel}>
        <input value={draft.description} onChange={(e) => onChange({ description: e.target.value })} placeholder={descriptionPlaceholder} />
      </FieldRow>
      {children}
      <textarea
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
        rows={10}
        placeholder={bodyPlaceholder}
        spellCheck={false}
      />
      <FormActions label={submitLabel} disabled={!nameOk || !draft.description.trim()} onSubmit={onSubmit} onCancel={onCancel}>
        {draft.name && !nameOk && <span className="muted small">Nome inválido ou já usado.</span>}
      </FormActions>
    </section>
  );
}
