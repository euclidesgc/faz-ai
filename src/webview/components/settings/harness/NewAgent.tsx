import { useState } from 'react';
import { Card, TextArea, TextField } from '@radix-ui/themes';
import { isFreeName, toItemName } from '../../../../shared/harnessProject';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { ModelEditor } from '../../FieldRenderer';
import { FormField } from '../../ui';
import { FormActions } from './FormActions';
import { t } from '../../../i18n';

const EMPTY = { name: '', description: '', body: '', model: '' };

/** Formulário de um agente novo do board: nome, o que faz, modelo e instruções. Depois de criado, o editor da linha ajusta o resto. */
export function NewAgent({ onClose }: { onClose: () => void }) {
  const state = useBoardStore((s) => s.state)!;
  const [draft, setDraft] = useState(EMPTY);
  const existing = [...state.harness.agents, ...(state.harness.library?.artifacts ?? []).filter((a) => a.kind === 'agent')];
  const nameOk = isFreeName(draft.name, existing);
  const create = () => {
    harness.createAgent({
      name: draft.name,
      description: draft.description.trim(),
      body: draft.body,
      model: draft.model,
      tools: [],
      deniedTools: [],
      skills: [],
      mcp: [],
    });
    onClose();
  };
  return (
    <Card className="draft-card" aria-label={t('Agente novo')}>
      <FormField label={t('Nome')} hint={draft.name && !nameOk ? t('Nome inválido ou já usado.') : undefined}>
        {(id) => (
          <TextField.Root
            id={id}
            autoFocus
            color={draft.name && !nameOk ? 'red' : undefined}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: toItemName(e.target.value) })}
            placeholder="revisor-de-spec"
          />
        )}
      </FormField>
      <FormField label={t('Descrição (quando usar)')}>
        {(id) => (
          <TextField.Root
            id={id}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={t('Revisa uma Spec e aponta lacunas antes do Plan')}
          />
        )}
      </FormField>
      <FormField label={t('Modelo e esforço')} hint={t('O modelo indicado no card tem preferência.')}>
        {() => <ModelEditor value={draft.model || null} onChange={(v) => setDraft({ ...draft, model: typeof v === 'string' ? v : '' })} />}
      </FormField>
      <FormField label={t('Instruções')}>
        {(id) => (
          <TextArea
            id={id}
            className="code-area"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={10}
            placeholder={t('Como este agente trabalha: padrões, comandos, o que nunca fazer')}
            spellCheck={false}
          />
        )}
      </FormField>
      <FormActions label={t('Criar agente')} disabled={!nameOk || !draft.description.trim()} onSubmit={create} onCancel={onClose} />
    </Card>
  );
}
