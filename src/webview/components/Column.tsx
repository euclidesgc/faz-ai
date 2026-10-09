import { useState, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card, Column as ColumnModel, ColumnCategory, Workflow } from '../../shared/model';
import { isCardCollapsed, isLive } from '../../shared/selectors';
import { useBoardStore } from '../store/boardStore';
import { t, dt } from '../i18n';
import { cards, settings } from '../commands';
import { SortableCard } from './Card';
import { Menu } from './Menu';
import { TextField } from '@radix-ui/themes';
import { Button, IconApproval, IconCheck, IconChevronLeft, IconChevronRight, IconClose, SelectField } from './ui';

const CATEGORIES: { value: ColumnCategory; label: string; hint: string }[] = [
  { value: 'open', label: 'Trabalho em aberto', hint: '' },
  {
    value: 'done',
    label: 'Conclusão',
    hint: 'Coluna de conclusão: cards aqui contam como concluídos. Uma história só entra quando não tem sub-tarefas em aberto.',
  },
  { value: 'cancelled', label: 'Cancelamento', hint: 'Coluna de cancelamento: cards aqui contam como encerrados sem conclusão.' },
];

interface Props {
  column: ColumnModel;
  workflow: Workflow;
  /** cards visíveis (após filtros); base da contagem do cabeçalho */
  cards: Card[];
  /** cards da lista renderizada (faixas do arraste); padrão `cards` */
  shown?: Card[];
  /** total de cards ativos na coluna */
  total: number;
  index: number;
  siblings: ColumnModel[];
  collapsed: boolean;
  onToggle: () => void;
}

/** Marca de coluna concluída ou cancelada; nada nas abertas. */
function TerminalMark({ category }: { category: ColumnCategory }) {
  if (category === 'open') return null;
  return (
    <span className={`terminal-mark ${category}`} title={t(CATEGORIES.find((c) => c.value === category)!.hint)}>
      {category === 'done' ? <IconCheck /> : <IconClose />}{' '}
    </span>
  );
}

/** Coluna fechada: uma faixa estreita com o nome na vertical, que ainda aceita cards arrastados. */
export function CollapsedColumn({
  setNodeRef,
  isOver,
  name,
  mark,
  count,
  className = '',
  onExpand,
}: {
  setNodeRef: (el: HTMLElement | null) => void;
  isOver: boolean;
  name: string;
  /** marca antes do nome (concluída/cancelada) */
  mark?: ReactNode;
  count: string;
  className?: string;
  onExpand: () => void;
}) {
  return (
    <div
      ref={setNodeRef}
      className={`column collapsed ${className} ${isOver ? 'over' : ''}`}
      onClick={onExpand}
      title={t('Expandir "{name}"', { name })}
    >
      <Button variant="icon" className="collapse-toggle" aria-expanded={false}>
        <IconChevronRight />
      </Button>
      <span className="column-count">{count}</span>
      <span className="column-name-vertical">
        {mark}
        {name}
      </span>
    </div>
  );
}

export function Column({ column, workflow, cards: visibleCards, shown, total, index, siblings, collapsed, onToggle }: Props) {
  const listed = shown ?? visibleCards;
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const state = useBoardStore((s) => s.state)!;
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const collapsedMap = useBoardStore((s) => s.collapsed);
  const setManyCollapsed = useBoardStore((s) => s.setManyCollapsed);
  const ask = useBoardStore((s) => s.ask);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState<string>('');
  const [renaming, setRenaming] = useState<string | null>(null);

  const types = state.cardTypes.filter((ct) => ct.defaultWorkflowId === workflow.id);
  const canAdd = workflow.kind === 'parent' || !!selectedParentId;

  const submit = () => {
    const type = typeId || types[0]?.id;
    if (!title.trim() || !type) return;
    cards.create({ typeId: type, columnId: column.id, parentId: workflow.kind === 'child' ? selectedParentId : null, title: title.trim() });
    setTitle('');
  };

  const rename = () => {
    const name = renaming?.trim();
    if (name && name !== column.name) settings.updateColumn(column.id, { name });
    setRenaming(null);
  };

  const remove = () => {
    const others = siblings.filter((c) => c.id !== column.id);
    // conta todos os cards que apontam para a coluna, inclusive arquivados e na lixeira
    const n = state.cards.filter((c) => c.columnId === column.id).length;
    ask({
      title: t('Excluir a coluna "{name}"?', { name: dt(column.name) }),
      message: n ? t('{n} card(s) desta coluna serão movidos para a coluna escolhida.', { n }) : t('A coluna está vazia.'),
      confirmLabel: t('Excluir coluna'),
      danger: true,
      choices: n ? { label: t('Mover cards para'), options: others.map((c) => ({ value: c.id, label: dt(c.name) })) } : undefined,
      onConfirm: (dest) => settings.deleteColumn(column.id, dest ?? others[0]!.id),
    });
  };

  const count = visibleCards.length === total ? String(total) : `${visibleCards.length}/${total}`;
  const liveCardIds = state.cards.filter((c) => c.columnId === column.id && isLive(c)).map((c) => c.id);
  const allCardsCollapsed = liveCardIds.length > 0 && liveCardIds.every((id) => isCardCollapsed(collapsedMap, id));
  if (collapsed) {
    return (
      <CollapsedColumn
        setNodeRef={setNodeRef}
        isOver={isOver}
        name={column.name}
        mark={<TerminalMark category={column.category} />}
        count={count}
        className={column.isTerminal ? 'terminal' : ''}
        onExpand={onToggle}
      />
    );
  }

  return (
    <div ref={setNodeRef} className={`column ${isOver ? 'over' : ''} ${column.isTerminal ? 'terminal' : ''}`}>
      <header className="column-header">
        <Button variant="icon" className="collapse-toggle" title={t('Colapsar a coluna')} onClick={onToggle}>
          <IconChevronLeft />
        </Button>
        {renaming !== null ? (
          <input
            autoFocus
            className="column-rename"
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <span className="column-name" title={t('Duplo clique para renomear')} onDoubleClick={() => setRenaming(column.name)}>
            <TerminalMark category={column.category} />
            {dt(column.name)}
            {column.requiresApproval && (
              <span className="approval-mark" title={t('Exige aprovação: a IA só avança o card desta coluna depois que você aprova')}>
                {' '}
                <IconApproval />
              </span>
            )}
          </span>
        )}
        <span className="column-count">{count}</span>
        <Menu
          title={t('Ações da coluna')}
          items={[
            { label: t('Renomear'), onClick: () => setRenaming(column.name) },
            { label: t('Colapsar'), onClick: onToggle },
            {
              label: allCardsCollapsed ? t('Expandir cards') : t('Colapsar cards'),
              disabled: liveCardIds.length === 0,
              onClick: () => setManyCollapsed(liveCardIds, !allCardsCollapsed),
            },
            'sep',
            { header: t('Esta coluna representa') },
            ...CATEGORIES.map((c) => ({
              label: t(c.label),
              checked: column.category === c.value,
              onClick: () => settings.updateColumn(column.id, { category: c.value }),
            })),
            'sep' as const,
            {
              label: t('Mover para a esquerda'),
              disabled: index === 0,
              onClick: () => settings.updateColumn(column.id, { position: index - 1 }),
            },
            {
              label: t('Mover para a direita'),
              disabled: index === siblings.length - 1,
              onClick: () => settings.updateColumn(column.id, { position: index + 1 }),
            },
            'sep',
            { label: t('Excluir coluna'), danger: true, disabled: siblings.length <= 1, onClick: remove },
          ]}
        />
      </header>
      <div className="column-footer column-footer--top">
        {adding ? (
          <div className="add-form">
            <TextField.Root
              autoFocus
              aria-label={t('Título do card')}
              placeholder={t('Título (Enter adiciona)')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setAdding(false);
              }}
            />
            {types.length > 1 && (
              <SelectField
                aria-label={t('Tipo do card')}
                options={types.map((ct) => ({ value: ct.id, label: dt(ct.name) }))}
                value={typeId || types[0]!.id}
                onChange={setTypeId}
              />
            )}
            <div className="row">
              <Button variant="primary" onClick={submit}>
                {workflow.kind === 'child' ? t('Criar sub-tarefa') : t('Criar card')}
              </Button>
              <Button onClick={() => setAdding(false)}>{t('Cancelar')}</Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            disabled={!canAdd}
            title={canAdd ? '' : t('Clique numa história para criar sub-tarefas dela')}
            onClick={() => setAdding(true)}
          >
            {workflow.kind === 'child' ? t('+ Nova sub-tarefa') : t('+ Novo card')}
          </Button>
        )}
      </div>
      <SortableContext items={listed.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="column-body">
          {listed.map((card) => (
            <SortableCard key={card.id} card={card} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
