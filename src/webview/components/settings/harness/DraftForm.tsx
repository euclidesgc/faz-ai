import type { ReactNode } from 'react';
import { Card, TextArea, TextField } from '@radix-ui/themes';
import { toItemName } from '../../../../shared/harnessProject';
import { FormField } from '../../ui';
import { FormActions } from './FormActions';
import type { Draft } from './useProjectEditing';
import { t } from '../../../i18n';

interface Props {
  title: string;
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
  title,
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
    <Card className="draft-card" aria-label={title}>
      <FormField label={t('Nome')} hint={draft.name && !nameOk ? t('Nome inválido ou já usado.') : undefined}>
        {(id) => (
          <TextField.Root
            id={id}
            autoFocus
            color={draft.name && !nameOk ? 'red' : undefined}
            value={draft.name}
            onChange={(e) => onChange({ name: toItemName(e.target.value) })}
            placeholder={namePlaceholder}
          />
        )}
      </FormField>
      <FormField label={descriptionLabel}>
        {(id) => (
          <TextField.Root
            id={id}
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={descriptionPlaceholder}
          />
        )}
      </FormField>
      {children}
      <FormField label={t('Instruções')}>
        {(id) => (
          <TextArea
            id={id}
            className="code-area"
            value={draft.body}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={10}
            placeholder={bodyPlaceholder}
            spellCheck={false}
          />
        )}
      </FormField>
      <FormActions label={submitLabel} disabled={!nameOk || !draft.description.trim()} onSubmit={onSubmit} onCancel={onCancel} />
    </Card>
  );
}
