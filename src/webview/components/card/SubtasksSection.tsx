import { cardRef, type Card } from '../../../shared/model';
import { childrenOf, columnOf, isAiWorking, subtaskSlot } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { AddInput, Button } from '../ui';
import { AiLed } from '../cardView/AiLed';
import { t, dt } from '../../i18n';

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
    <section id="subtasks-section" className="drawer-section">
      <div className="section-head">
        <h3>
          {t('Sub-tarefas')} <small>{children.length}</small>
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
          {t('Ver no board')}
        </Button>
      </div>
      <ul className="children">
        {children.map((c) => {
          const col = columnOf(state, c);
          return (
            <li key={c.id} className={col?.isTerminal ? 'done' : ''}>
              {/* LED de atividade da sub-tarefa: acende enquanto a IA trabalha nela, fica vermelho se bloqueada */}
              <AiLed work={isAiWorking(state, c) ? { mode: 'self' } : null} status={c.status} />
              <a onClick={() => openCard(c.id)}>
                <span className="card-id">{cardRef(c)}</span> {c.title}
              </a>
              <span className="muted">{c.archivedAt ? t('Arquivada') : col && dt(col.name)}</span>
            </li>
          );
        })}
      </ul>
      <AddInput placeholder={t('+ Nova sub-tarefa (Enter)')} onAdd={addSub} />
    </section>
  );
}
