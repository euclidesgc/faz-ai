import { checklistOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { checklist } from '../../commands';
import { AddInput, Button, IconClose } from '../ui';

/** Checklist do card: marcar, renomear, excluir e adicionar itens. */
export function ChecklistSection({ cardId }: { cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const items = checklistOf(state, cardId);

  return (
    <section className="drawer-section">
      <h3>
        Checklist{' '}
        {items.length > 0 && (
          <small>
            {items.filter((i) => i.done).length}/{items.length}
          </small>
        )}
      </h3>
      <ul className="checklist">
        {items.map((item) => (
          <li key={item.id} className={item.done ? 'done' : ''}>
            <input type="checkbox" checked={item.done} onChange={(e) => checklist.update(item.id, { done: e.target.checked })} />
            <input
              className="inline-edit"
              defaultValue={item.text}
              onBlur={(e) => e.target.value !== item.text && checklist.update(item.id, { text: e.target.value })}
            />
            <Button variant="icon" title="Remover o item" aria-label="Remover o item" onClick={() => checklist.delete(item.id)}>
              <IconClose />
            </Button>
          </li>
        ))}
      </ul>
      <AddInput placeholder="+ Novo item (Enter)" onAdd={(text) => checklist.add(cardId, text)} />
    </section>
  );
}
