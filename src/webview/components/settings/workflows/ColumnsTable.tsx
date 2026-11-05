import { Fragment, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Column, ColumnCategory, Workflow } from '../../../../shared/model';
import { columnsOf } from '../../../../shared/selectors';
import { phaseModelBadge } from '../../../../shared/phaseModel';
import { modelDisplay } from '../../../modelText';
import { useBoardStore } from '../../../store/boardStore';
import { settings } from '../../../commands';
import { Button, Checkbox, TextField } from '@radix-ui/themes';
import { DeleteButton, IconChevronDown, SelectField } from '../../ui';
import { NewColumnRow } from './NewColumnRow';
import { ChecksEditor } from './ChecksEditor';
import { PhaseEditor } from './PhaseEditor';
import { SortableRow } from './SortableRow';
import { t } from '../../../i18n';
import { useAgentConnectStore } from '../../../store/agentConnectStore';

const CATEGORIES: { value: ColumnCategory; label: string }[] = [
  { value: 'open', label: 'Trabalho em aberto' },
  { value: 'done', label: 'Conclusão' },
  { value: 'cancelled', label: 'Cancelamento' },
];

const COLUMNS = 9;

/** Colunas de um workflow: nome, o que representa, IA, aprovação, fase e checagens; arrastar pela alça muda a ordem. */
export function ColumnsTable({ workflow, adding, onAddDone }: { workflow: Workflow; adding: boolean; onAddDone: () => void }) {
  const categories = CATEGORIES.map((o) => ({ ...o, label: t(o.label) }));
  const state = useBoardStore((s) => s.state)!;
  const [phaseOpen, setPhaseOpen] = useState<{ columnId: string; panel: 'phase' | 'checks' } | null>(null);
  // um painel por vez: abrir as checagens fecha a fase da mesma coluna (e o de outra coluna)
  const isOpen = (columnId: string, panel: 'phase' | 'checks') => phaseOpen?.columnId === columnId && phaseOpen.panel === panel;
  const toggle = (columnId: string, panel: 'phase' | 'checks') => setPhaseOpen(isOpen(columnId, panel) ? null : { columnId, panel });
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
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>{t('Coluna')}</th>
              <th>{t('Representa')}</th>
              <th>{t('IA atua')}</th>
              <th>{t('Exige aprovação')}</th>
              <th>{t('Fase')}</th>
              <th>{t('Modelo')}</th>
              <th>{t('Checagens')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <SortableContext items={cols.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {cols.map((c, i) => (
                <Fragment key={c.id}>
                  <SortableRow id={c.id} name={c.name} onStep={(d) => i + d >= 0 && i + d < cols.length && moveTo(c.id, i + d)}>
                    <td>
                      <TextField.Root
                        aria-label={t('Nome da coluna {name}', { name: c.name })}
                        key={c.name}
                        defaultValue={c.name}
                        onBlur={(e) =>
                          e.target.value.trim() &&
                          e.target.value.trim() !== c.name &&
                          settings.updateColumn(c.id, { name: e.target.value.trim() })
                        }
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </td>
                    <td>
                      <SelectField
                        aria-label={t('O que {name} representa', { name: c.name })}
                        options={categories}
                        value={c.category}
                        onChange={(category) => settings.updateColumn(c.id, { category })}
                      />
                    </td>
                    <td>
                      <Checkbox
                        aria-label={t('A IA atua em {name}', { name: c.name })}
                        disabled={c.category !== 'open'}
                        checked={c.aiActive}
                        onCheckedChange={(on) => settings.updateColumn(c.id, { aiActive: on === true })}
                      />
                    </td>
                    <td>
                      <Checkbox
                        aria-label={t('{name} exige aprovação', { name: c.name })}
                        disabled={c.category !== 'open'}
                        checked={c.requiresApproval}
                        onCheckedChange={(on) => settings.updateColumn(c.id, { requiresApproval: on === true })}
                      />
                    </td>
                    <td>
                      <Button
                        variant={isOpen(c.id, 'phase') ? 'soft' : 'ghost'}
                        size="1"
                        aria-pressed={isOpen(c.id, 'phase')}
                        disabled={c.category !== 'open'}
                        title={t('Instrução para a IA e modelo do documento desta fase')}
                        onClick={() => toggle(c.id, 'phase')}
                      >
                        {c.artifactName || (c.aiInstruction ? t('Editar instrução') : t('Definir instrução'))} <IconChevronDown />
                      </Button>
                    </td>
                    <td>
                      <Button
                        variant={isOpen(c.id, 'phase') ? 'soft' : 'ghost'}
                        size="1"
                        aria-pressed={isOpen(c.id, 'phase')}
                        aria-label={t('Modelo da fase {name}', { name: c.name })}
                        disabled={c.category !== 'open'}
                        title={t('Modelo da fase: o card recebe este modelo ao entrar na coluna')}
                        onClick={() => toggle(c.id, 'phase')}
                      >
                        {c.category === 'open' ? <ModelBadge column={c} /> : '—'}
                      </Button>
                    </td>
                    <td>
                      <Button
                        variant={isOpen(c.id, 'checks') ? 'soft' : 'ghost'}
                        size="1"
                        aria-pressed={isOpen(c.id, 'checks')}
                        disabled={c.category !== 'open'}
                        title={t('Comandos que o board roda quando a IA tira o card desta coluna para a frente')}
                        onClick={() => toggle(c.id, 'checks')}
                      >
                        {c.checks.length ? t('{n} checagem(ns)', { n: c.checks.length }) : t('Adicionar')} <IconChevronDown />
                      </Button>
                    </td>
                    <td>
                      <DeleteButton
                        disabled={cols.length <= 1}
                        title={cols.length <= 1 ? t('Um workflow precisa de ao menos uma coluna') : t('Excluir a coluna')}
                        question={t('Excluir a coluna "{name}"?', { name: c.name })}
                        message={
                          inColumn(c.id)
                            ? t('{n} card(s) serão movidos para a coluna escolhida.', { n: inColumn(c.id) })
                            : t('A coluna está vazia.')
                        }
                        confirmLabel={t('Excluir coluna')}
                        choices={
                          inColumn(c.id)
                            ? { label: t('Mover cards para'), options: others(c.id).map((x) => ({ value: x.id, label: x.name })) }
                            : undefined
                        }
                        onConfirm={(dest) => void settings.deleteColumn(c.id, dest ?? others(c.id)[0]!.id)}
                      />
                    </td>
                  </SortableRow>
                  {isOpen(c.id, 'phase') && (
                    <tr>
                      <td colSpan={COLUMNS}>
                        <PhaseEditor column={c} />
                      </td>
                    </tr>
                  )}
                  {isOpen(c.id, 'checks') && (
                    <tr>
                      <td colSpan={COLUMNS}>
                        <ChecksEditor column={c} />
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
      <p className="muted small">
        {t(
          'O modelo da fase é uma sugestão para o card ao entrar na coluna; um modelo escolhido à mão no card não muda. Na execução, valem as regras de fallback de Conectar agentes: com o limite de uso esgotado, o card roda no modelo reserva.',
        )}{' '}
        <Button
          variant="ghost"
          size="1"
          onClick={() => {
            useAgentConnectStore.getState().select(state.board.aiTool, 'connection');
            useBoardStore.getState().goToSection('execution-policies');
          }}
        >
          {t('Regras de fallback')}
        </Button>
      </p>
    </>
  );
}

/** O que decide o modelo da coluna, em poucas palavras. */
function ModelBadge({ column }: { column: Column }) {
  const state = useBoardStore((s) => s.state)!;
  const badge = phaseModelBadge(state, column);
  if (badge.kind === 'model') return <>{modelDisplay(state.board.modelCatalog, badge.value)}</>;
  if (badge.kind === 'reviewer') return <>{t('revisor independente')}</>;
  if (badge.kind === 'effort') return <>{t('pelo esforço')}</>;
  return <span className="muted">{t('Sem preferência')}</span>;
}
