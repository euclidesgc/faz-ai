import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card, Column as ColumnModel, ColumnCategory, Workflow } from '../../shared/model';
import { useBoardStore } from '../store/boardStore';
import { SortableCard } from './Card';
import { Menu } from './Menu';

const CATEGORIES: { value: ColumnCategory; label: string; hint: string }[] = [
  { value: 'open', label: 'Trabalho em aberto', hint: '' },
  { value: 'done', label: 'Conclusão', hint: 'Coluna de conclusão: cards aqui contam como concluídos. Uma história só entra quando não tem sub-tarefas em aberto.' },
  { value: 'cancelled', label: 'Cancelamento', hint: 'Coluna de cancelamento: cards aqui contam como encerrados sem conclusão.' },
];

interface Props {
  column: ColumnModel;
  workflow: Workflow;
  /** cards visíveis (após filtros) */
  cards: Card[];
  /** total de cards ativos na coluna */
  total: number;
  index: number;
  siblings: ColumnModel[];
  collapsed: boolean;
  onToggle: () => void;
}

/** Coluna fechada: uma faixa estreita com o nome na vertical, que ainda aceita cards arrastados. */
export function CollapsedColumn({ setNodeRef, isOver, name, count, className = '', onExpand }: { setNodeRef: (el: HTMLElement | null) => void; isOver: boolean; name: string; count: string; className?: string; onExpand: () => void }) {
  return (
    <div ref={setNodeRef} className={`column collapsed ${className} ${isOver ? 'over' : ''}`} onClick={onExpand} title={`Expandir "${name}"`}>
      <button className="icon collapse-toggle" aria-expanded={false}>›</button>
      <span className="column-count">{count}</span>
      <span className="column-name-vertical">{name}</span>
    </div>
  );
}

export function Column({ column, workflow, cards, total, index, siblings, collapsed, onToggle }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const state = useBoardStore((s) => s.state)!;
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState<string>('');
  const [renaming, setRenaming] = useState<string | null>(null);

  const types = state.cardTypes.filter((t) => t.defaultWorkflowId === workflow.id);
  const canAdd = workflow.kind === 'parent' || !!selectedParentId;

  const submit = () => {
    const t = typeId || types[0]?.id;
    if (!title.trim() || !t) return;
    send({ type: 'card.create', typeId: t, columnId: column.id, parentId: workflow.kind === 'child' ? selectedParentId : null, title: title.trim() });
    setTitle('');
  };

  const rename = () => {
    const name = renaming?.trim();
    if (name && name !== column.name) send({ type: 'settings.column.update', columnId: column.id, patch: { name } });
    setRenaming(null);
  };

  const remove = () => {
    const others = siblings.filter((c) => c.id !== column.id);
    // conta todos os cards que apontam para a coluna, inclusive arquivados e na lixeira
    const n = state.cards.filter((c) => c.columnId === column.id).length;
    ask({
      title: `Excluir a coluna "${column.name}"?`,
      message: n ? `${n} card(s) desta coluna serão movidos para a coluna escolhida.` : 'A coluna está vazia.',
      confirmLabel: 'Excluir coluna',
      danger: true,
      choices: n ? { label: 'Mover cards para', options: others.map((c) => ({ value: c.id, label: c.name })) } : undefined,
      onConfirm: (dest) => send({ type: 'settings.column.delete', columnId: column.id, moveCardsTo: dest ?? others[0]!.id }),
    });
  };

  const count = cards.length === total ? String(total) : `${cards.length}/${total}`;
  if (collapsed) {
    const mark = column.category === 'done' ? '✓ ' : column.category === 'cancelled' ? '✕ ' : '';
    return <CollapsedColumn setNodeRef={setNodeRef} isOver={isOver} name={`${mark}${column.name}`} count={count} className={column.isTerminal ? 'terminal' : ''} onExpand={onToggle} />;
  }

  return (
    <div ref={setNodeRef} className={`column ${isOver ? 'over' : ''} ${column.isTerminal ? 'terminal' : ''}`}>
      <header className="column-header">
        <button className="icon collapse-toggle" title="Colapsar a coluna" onClick={onToggle}>‹</button>
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
          <span className="column-name" title="Duplo clique para renomear" onDoubleClick={() => setRenaming(column.name)}>
            {column.category !== 'open' && (
              <span className={`terminal-mark ${column.category}`} title={CATEGORIES.find((c) => c.value === column.category)!.hint}>{column.category === 'done' ? '✓ ' : '✕ '}</span>
            )}
            {column.name}
          </span>
        )}
        <span className="column-count">{count}</span>
        <Menu
          title="Ações da coluna"
          items={[
            { label: 'Renomear', onClick: () => setRenaming(column.name) },
            { label: 'Colapsar', onClick: onToggle },
            'sep',
            { header: 'Esta coluna representa' },
            ...CATEGORIES.map((c) => ({
              label: c.label,
              checked: column.category === c.value,
              onClick: () => send({ type: 'settings.column.update', columnId: column.id, patch: { category: c.value } }),
            })),
            'sep' as const,
            { label: '← Mover para a esquerda', disabled: index === 0, onClick: () => send({ type: 'settings.column.update', columnId: column.id, patch: { position: index - 1 } }) },
            { label: '→ Mover para a direita', disabled: index === siblings.length - 1, onClick: () => send({ type: 'settings.column.update', columnId: column.id, patch: { position: index + 1 } }) },
            'sep',
            { label: 'Excluir coluna', danger: true, disabled: siblings.length <= 1, onClick: remove },
          ]}
        />
      </header>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="column-body">
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} />
          ))}
        </div>
      </SortableContext>
      <footer className="column-footer">
        {adding ? (
          <div className="add-form">
            <input
              autoFocus
              placeholder="Título (Enter adiciona)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setAdding(false);
              }}
            />
            {types.length > 1 && (
              <select value={typeId || types[0]?.id} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            <div className="row">
              <button className="primary" onClick={submit}>Adicionar</button>
              <button onClick={() => setAdding(false)}>Fechar</button>
            </div>
          </div>
        ) : (
          <button className="ghost" disabled={!canAdd} title={canAdd ? '' : 'Selecione uma história para adicionar sub-tarefas'} onClick={() => setAdding(true)}>
            + Novo card
          </button>
        )}
      </footer>
    </div>
  );
}
