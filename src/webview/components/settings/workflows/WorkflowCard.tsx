import { useState } from 'react';
import { Badge, Button, Card, TextField } from '@radix-ui/themes';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Workflow } from '../../../../shared/model';
import { workflowDeleteBlocker } from '../../../../shared/selectors';
import { useBoardStore } from '../../../store/boardStore';
import { settings } from '../../../commands';
import { DeleteButton, IconPlus } from '../../ui';
import { ColumnsTable } from './ColumnsTable';
import { DragHandle } from './DragHandle';
import { kindLabel } from './kinds';
import { t } from '../../../i18n';

/** Um workflow: o nome (editável), o papel, o botão Nova coluna e a tabela de colunas. */
export function WorkflowCard({ workflow, onStep }: { workflow: Workflow; onStep: (delta: number) => void }) {
  const state = useBoardStore((s) => s.state)!;
  const [adding, setAdding] = useState(false);
  const blocker = workflowDeleteBlocker(state, workflow.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: workflow.id });

  return (
    <div ref={setNodeRef} className={isDragging ? 'dragging' : ''} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <Card className="workflow-card" aria-label={t('Workflow {name}', { name: workflow.name })}>
        <div className="workflow-card-head">
          <DragHandle name={workflow.name} onStep={onStep} drag={{ ...attributes, ...listeners }} />
          <TextField.Root
            key={workflow.name}
            className="workflow-name"
            aria-label={t('Nome do workflow')}
            defaultValue={workflow.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== workflow.name) settings.updateWorkflow(workflow.id, { name });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <Badge size="2" color="indigo" variant="soft">
            {t(kindLabel(workflow.kind))}
          </Badge>
          <span className="spacer" />
          <Button disabled={adding} onClick={() => setAdding(true)}>
            <IconPlus /> {t('Nova coluna')}
          </Button>
          <DeleteButton
            disabled={blocker !== null}
            title={blocker ? t(blocker) : t('Excluir o workflow')}
            question={t('Excluir o workflow "{name}"?', { name: workflow.name })}
            message={t('As colunas dele serão apagadas. Ele não tem cards.')}
            confirmLabel={t('Excluir workflow')}
            onConfirm={() => settings.deleteWorkflow(workflow.id)}
          />
        </div>
        <ColumnsTable workflow={workflow} adding={adding} onAddDone={() => setAdding(false)} />
      </Card>
    </div>
  );
}
