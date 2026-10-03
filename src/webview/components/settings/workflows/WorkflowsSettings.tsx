import { useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useBoardStore } from '../../../store/boardStore';
import { settings } from '../../../commands';
import { Button } from '@radix-ui/themes';
import { IconPlus } from '../../ui';
import { PageHeader } from '../PageHeader';
import { NewWorkflowCard } from './NewWorkflowCard';
import { WorkflowCard } from './WorkflowCard';
import { t } from '../../../i18n';

export function WorkflowsSettings() {
  const workflows = useBoardStore((s) => s.state!.workflows);
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const moveTo = (workflowId: string, position: number) => settings.updateWorkflow(workflowId, { position });
  const onDragEnd = (e: DragEndEvent) => {
    const to = workflows.findIndex((w) => w.id === e.over?.id);
    if (e.over && e.active.id !== e.over.id && to !== -1) moveTo(String(e.active.id), to);
  };

  return (
    <div>
      <PageHeader
        title={t('Workflows e colunas')}
        actions={
          <Button disabled={adding} onClick={() => setAdding(true)}>
            <IconPlus /> {t('Novo workflow')}
          </Button>
        }
      >
        {t(
          'Um workflow é um conjunto de colunas por onde os cards andam, e aparece como uma faixa no board. Você pode ter quantos quiser. Workflows de cards independentes recebem histórias, bugs e afins; os de sub-tarefas recebem as sub-tarefas de uma história. Uma história só entra numa coluna de conclusão quando não tem sub-tarefas em aberto. No board, cada workflow e cada coluna abre e fecha com um clique, e o board volta do jeito que você deixou. Para mudar a ordem dos workflows ou das colunas, arraste pela alça à esquerda (ou use ↑ e ↓ com a alça em foco).',
        )}
      </PageHeader>
      <p className="muted page-desc">
        {t(
          '"IA atua" marca as colunas em que a IA trabalha: ao entrar nelas o card fica Pronto. "Exige aprovação" é o ponto de revisão: a IA termina, pede a revisão e só avança o card depois que você aprova. Em "Fase" ficam a instrução da IA para a coluna e o modelo do documento que ela produz (PRD, Spec…).',
        )}
      </p>
      <div className="field-list">
        {adding && <NewWorkflowCard onDone={() => setAdding(false)} />}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={workflows.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            {workflows.map((wf, i) => (
              <WorkflowCard key={wf.id} workflow={wf} onStep={(d) => i + d >= 0 && i + d < workflows.length && moveTo(wf.id, i + d)} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
