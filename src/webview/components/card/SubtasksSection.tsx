import { cardRef, type Card } from '../../../shared/model';
import { childrenOf, columnOf, subtaskSlot } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { AddInput, Button } from '../ui';

/** Sub-tarefas da história: lista com a coluna de cada uma, atalho para o board e criação rápida. */
export function SubtasksSection({ story }: { story: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const openCard = useBoardStore((s) => s.openCard);
  const selectParent = useBoardStore((s) => s.selectParent);
  if (!state.workflows.some((w) => w.kind === 'child')) return null;
  const children = childrenOf(state, story.id);

  const addSub = (title: string) => {
    const slot = subtaskSlot(state);
    if (!slot) return false;
    cards.create({ ...slot, parentId: story.id, title });
  };

  return (
    <section className="drawer-section">
      <div className="section-head">
        <h3>
          Sub-tarefas <small>{children.length}</small>
        </h3>
        <Button
          variant="ghost"
          size="small"
          onClick={() => {
            selectParent(null);
            selectParent(story.id);
            openCard(null);
          }}
        >
          Ver no board
        </Button>
      </div>
      <ul className="children">
        {children.map((c) => {
          const col = columnOf(state, c);
          return (
            <li key={c.id} className={col?.isTerminal ? 'done' : ''}>
              <a onClick={() => openCard(c.id)}>
                <span className="card-id">{cardRef(c)}</span> {c.title}
              </a>
              <span className="muted">{c.archivedAt ? 'Arquivada' : col?.name}</span>
            </li>
          );
        })}
      </ul>
      <AddInput placeholder="+ Nova sub-tarefa (Enter)" onAdd={addSub} />
    </section>
  );
}
