import { Fragment, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ColumnCategory, Workflow } from '../../../../shared/model';
import { columnsOf } from '../../../../shared/selectors';
import { useBoardStore } from '../../../store/boardStore';
import { settings } from '../../../commands';
import { DeleteButton, EnumSelect, IconChevronDown, Button } from '../../ui';
import { NewColumnRow } from './NewColumnRow';
import { PhaseEditor } from './PhaseEditor';
import { SortableRow } from './SortableRow';

const CATEGORIES: { value: ColumnCategory; label: string }[] = [
  { value: 'open', label: 'Trabalho em aberto' },
  { value: 'done', label: 'Conclusão' },
  { value: 'cancelled', label: 'Cancelamento' },
];

const COLUMNS = 7;

/** Colunas de um workflow: nome, o que representa, IA, aprovação e fase; arrastar pela alça muda a ordem. */
export function ColumnsTable({ workflow, adding, onAddDone }: { workflow: Workflow; adding: boolean; onAddDone: () => void }) {
  const state = useBoardStore((s) => s.state)!;
  const [phaseOpen, setPhaseOpen] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const cols = columnsOf(state, workflow.id);
  const moveTo = (columnId: string, position: number) => settings.updateColumn(columnId, { position });
  // para a exclusão: quantos cards apontam para a coluna (inclusive arquivados e na lixeira) e para onde podem ir
  const inColumn = (columnId: string) => state.cards.filter((k) => k.columnId === columnId).length;
  const others = (columnId: string) => cols.filter((x) => x.id !== columnId);
  const onDragEnd = (e: DragEndEvent) => {
    const to = cols.findIndex((c) => c.id === e.over?.id);
    if (e.over && e.active.id !== e.over.id && to !== -1) moveTo(String(e.active.id), to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <table className="table">
        <thead>
          <tr>
            <th></th>
            <th>Coluna</th>
            <th>Representa</th>
            <th>IA atua</th>
            <th>Exige aprovação</th>
            <th>Fase</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <SortableContext items={cols.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cols.map((c, i) => (
              <Fragment key={c.id}>
                <SortableRow id={c.id} name={c.name} onStep={(d) => i + d >= 0 && i + d < cols.length && moveTo(c.id, i + d)}>
                  <td>
                    <input
                      aria-label={`Nome da coluna ${c.name}`}
                      defaultValue={c.name}
                      onBlur={(e) =>
                        e.target.value.trim() && e.target.value !== c.name && settings.updateColumn(c.id, { name: e.target.value.trim() })
                      }
                    />
                  </td>
                  <td>
                    <EnumSelect
                      options={CATEGORIES}
                      value={c.category}
                      onChange={(category) => settings.updateColumn(c.id, { category })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`A IA atua em ${c.name}`}
                      disabled={c.category !== 'open'}
                      checked={c.aiActive}
                      onChange={(e) => settings.updateColumn(c.id, { aiActive: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${c.name} exige aprovação`}
                      disabled={c.category !== 'open'}
                      checked={c.requiresApproval}
                      onChange={(e) => settings.updateColumn(c.id, { requiresApproval: e.target.checked })}
                    />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="small"
                      on={phaseOpen === c.id}
                      disabled={c.category !== 'open'}
                      title="Instrução para a IA e modelo do documento desta fase"
                      onClick={() => setPhaseOpen(phaseOpen === c.id ? null : c.id)}
                    >
                      {c.artifactName || (c.aiInstruction ? 'Instrução' : 'Definir')} <IconChevronDown />
                    </Button>
                  </td>
                  <td>
                    <DeleteButton
                      disabled={cols.length <= 1}
                      title={cols.length <= 1 ? 'Um workflow precisa de ao menos uma coluna' : 'Excluir a coluna'}
                      question={`Excluir a coluna "${c.name}"?`}
                      message={inColumn(c.id) ? `${inColumn(c.id)} card(s) serão movidos para a coluna escolhida.` : 'A coluna está vazia.'}
                      confirmLabel="Excluir coluna"
                      choices={
                        inColumn(c.id)
                          ? { label: 'Mover cards para', options: others(c.id).map((x) => ({ value: x.id, label: x.name })) }
                          : undefined
                      }
                      onConfirm={(dest) => settings.deleteColumn(c.id, dest ?? others(c.id)[0]!.id)}
                    />
                  </td>
                </SortableRow>
                {phaseOpen === c.id && (
                  <tr>
                    <td colSpan={COLUMNS}>
                      <PhaseEditor column={c} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </SortableContext>
          {adding && <NewColumnRow workflowId={workflow.id} cols={cols} colSpan={COLUMNS} onDone={onAddDone} />}
        </tbody>
      </table>
    </DndContext>
  );
}
