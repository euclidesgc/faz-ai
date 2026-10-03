import { useState } from 'react';
import { SKILL_NAME_PATTERN, type AiTool, type HarnessKind } from '../../../../shared/harness';
import type { CreateTarget } from '../../../../shared/harnessCatalog';
import { harness } from '../../../commands';
import { FieldRow } from '../../ui';
import { FormActions } from './FormActions';
import { TargetPicker } from './TargetPicker';
import { useTargetForm } from './useTargetForm';

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
      title: 'Criar na pasta do usuário?',
      message: target.label.replace('<nome>', name),
      confirmLabel: 'Criar',
    });
  return (
    <div className="harness-new">
      <TargetPicker label="Onde" targets={targets} value={source} onChange={setSource} />
      {named && (
        <FieldRow label="Nome">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="revisar-spec"
          />
        </FieldRow>
      )}
      {named && (
        <FieldRow label={`Descrição${needsDescription ? '' : ' (opcional)'}`}>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quando a IA deve usar" />
        </FieldRow>
      )}
      <FormActions label="Criar e abrir no editor" disabled={!ok} onSubmit={create} onCancel={onClose} />
    </div>
  );
}
