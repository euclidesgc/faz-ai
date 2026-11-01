import { useState } from 'react';
import { Button as RxButton, Card, SegmentedControl, Text, TextField } from '@radix-ui/themes';
import type { WorkflowKind } from '../../../../shared/model';
import { settings } from '../../../commands';
import { useAction } from '../../../useAction';
import { FormField } from '../../ui';
import { WORKFLOW_KINDS } from './kinds';
import { t } from '../../../i18n';

/** Rascunho do workflow novo: nome e papel (que não muda depois). Ele nasce com A fazer, Em andamento e Concluído. */
export function NewWorkflowCard({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WorkflowKind>('parent');
  const ready = name.trim() !== '';
  const hint = WORKFLOW_KINDS.find((k) => k.value === kind)!.hint;

  // o rascunho só fecha quando o host confirma o workflow novo
  const creating = useAction(() => settings.createWorkflow(name.trim(), kind));
  const create = async () => {
    if (!ready) return;
    if (await creating.run()) onDone();
  };

  return (
    <Card className="workflow-card draft" aria-label={t('Workflow novo')}>
      <div className="workflow-draft-fields">
        <FormField label={t('Nome')}>
          {(id) => (
            <TextField.Root
              id={id}
              autoFocus
              placeholder={t('Ex.: Suporte, Bugs, Pesquisa')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
                if (e.key === 'Escape') onDone();
              }}
            />
          )}
        </FormField>
        <FormField label={t('Papel')} hint={t('{hint} O papel não muda depois de criado.', { hint: t(hint) })}>
          {(id) => (
            <SegmentedControl.Root id={id} size="1" value={kind} onValueChange={(v) => setKind(v as WorkflowKind)}>
              {WORKFLOW_KINDS.map((k) => (
                <SegmentedControl.Item key={k.value} value={k.value}>
                  {t(k.label)}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>
          )}
        </FormField>
      </div>
      <Text as="p" size="1" color="gray" className="workflow-draft-note">
        {t('Começa com as colunas A fazer, Em andamento e Concluído; depois você muda como quiser.')}
      </Text>
      <div className="field-card-actions">
        <RxButton variant="soft" color="gray" onClick={onDone}>
          {t('Cancelar')}
        </RxButton>
        <RxButton disabled={!ready} loading={creating.busy} onClick={() => void create()}>
          {t('Criar workflow')}
        </RxButton>
      </div>
    </Card>
  );
}
