import { useState } from 'react';
import { SKILL_NAME_PATTERN, type AiTool, type HarnessKind } from '../../../../shared/harness';
import type { CreateTarget } from '../../../../shared/harnessCatalog';
import { toItemName } from '../../../../shared/harnessProject';
import { harness } from '../../../commands';
import { Card, TextField } from '@radix-ui/themes';
import { FormField } from '../../ui';
import { FormActions } from './FormActions';
import { TargetPicker } from './TargetPicker';
import { useTargetForm } from './useTargetForm';
import { t } from '../../../i18n';

/** Formulário de um item novo: onde criar e, quando o lugar pede, nome e descrição. */
export function NewItem({
  tool,
  kind,
  targets,
  onClose,
}: {
  tool: AiTool;
  kind: HarnessKind;
  targets: CreateTarget[];
  onClose: () => void;
}) {
  const { source, setSource, target, submit } = useTargetForm(targets, onClose);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const named = target.layout !== 'file';
  const needsDescription = target.layout === 'skills' || kind === 'agent';
  const ok = (!named || SKILL_NAME_PATTERN.test(name)) && (!needsDescription || description.trim() !== '');
  const create = () =>
    submit(() => harness.createItem(tool, source, name, description.trim()), {
      title: t('Criar na pasta do usuário?'),
      message: target.label.replace('<nome>', name),
      confirmLabel: t('Criar'),
    });
  return (
    <Card className="draft-card" aria-label={t('Item novo')}>
      <TargetPicker label={t('Onde')} targets={targets} value={source} onChange={setSource} />
      {named && (
        <FormField label={t('Nome')}>
          {(id) => <TextField.Root id={id} value={name} onChange={(e) => setName(toItemName(e.target.value))} placeholder="revisar-spec" />}
        </FormField>
      )}
      {named && (
        <FormField label={needsDescription ? t('Descrição') : t('Descrição (opcional)')}>
          {(id) => (
            <TextField.Root
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('Quando a IA deve usar')}
            />
          )}
        </FormField>
      )}
      <FormActions label={t('Criar e abrir no editor')} disabled={!ok} onSubmit={create} onCancel={onClose} />
    </Card>
  );
}
