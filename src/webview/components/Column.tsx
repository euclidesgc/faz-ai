import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card, Column as ColumnModel, Workflow } from '../../shared/model';
import { useBoardStore } from '../store/boardStore';
import { SortableCard } from './Card';
import { Menu } from './Menu';

interface Props {
  column: ColumnModel;
  workflow: Workflow;
  /** cards visíveis (após filtros) */
  cards: Card[];
  /** total de cards ativos na coluna */
  total: number;
  index: number;
  siblings: ColumnModel[];
}

export function Column({ column, workflow, cards, total, index, siblings }: Props) {
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

  return (
    <div ref={setNodeRef} className={`column ${isOver ? 'over' : ''} ${column.isTerminal ? 'terminal' : ''}`}>
      <header className="column-header">
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
            {column.isTerminal && <span className="terminal-mark" title="Coluna de conclusão">✓ </span>}
            {column.name}
          </span>
        )}
        <span className="column-count">{cards.length === total ? total : `${cards.length}/${total}`}</span>
        <Menu
          title="Ações da coluna"
          items={[
            { label: 'Renomear', onClick: () => setRenaming(column.name) },
            { label: column.isTerminal ? 'Desmarcar como concluída' : 'Marcar como concluída', onClick: () => send({ type: 'settings.column.update', columnId: column.id, patch: { isTerminal: !column.isTerminal } }) },
            'sep',
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
