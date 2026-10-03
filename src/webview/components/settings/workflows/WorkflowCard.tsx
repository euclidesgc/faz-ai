import { useState } from 'react';
import { Badge, Card, TextField } from '@radix-ui/themes';
import type { Workflow } from '../../../../shared/model';
import { workflowDeleteBlocker } from '../../../../shared/selectors';
import { useBoardStore } from '../../../store/boardStore';
import { settings } from '../../../commands';
import { Button, DeleteButton, IconPlus } from '../../ui';
import { ColumnsTable } from './ColumnsTable';
import { kindLabel } from './kinds';

/** Um workflow: o nome (editável), o papel, o botão Nova coluna e a tabela de colunas. */
export function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const state = useBoardStore((s) => s.state)!;
  const [adding, setAdding] = useState(false);
  const blocker = workflowDeleteBlocker(state, workflow.id);

  return (
    <Card className="workflow-card" aria-label={`Workflow ${workflow.name}`}>
      <div className="workflow-card-head">
        <TextField.Root
          key={workflow.name}
          className="workflow-name"
          aria-label="Nome do workflow"
          defaultValue={workflow.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== workflow.name) settings.updateWorkflow(workflow.id, { name });
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <Badge size="2" color="indigo" variant="soft">
          {kindLabel(workflow.kind)}
        </Badge>
        <span className="spacer" />
        <Button variant="primary" disabled={adding} onClick={() => setAdding(true)}>
          <IconPlus /> Nova coluna
        </Button>
        <DeleteButton
          disabled={blocker !== null}
          title={blocker ?? 'Excluir o workflow'}
          question={`Excluir o workflow "${workflow.name}"?`}
          message="As colunas dele serão apagadas. Ele não tem cards."
          confirmLabel="Excluir workflow"
          onConfirm={() => settings.deleteWorkflow(workflow.id)}
        />
      </div>
      <ColumnsTable workflow={workflow} adding={adding} onAddDone={() => setAdding(false)} />
    </Card>
  );
}
