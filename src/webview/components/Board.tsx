import { cardRef } from '../../shared/model';
import { cardsIn, columnsOf, isLive } from '../../shared/selectors';
import { useBoardStore } from '../store/boardStore';
import { Button } from './ui';
import { WorkflowRow } from './WorkflowRow';

export function Board() {
  const state = useBoardStore((s) => s.state)!;
  const overrides = useBoardStore((s) => s.collapsed);
  const setCollapsed = useBoardStore((s) => s.setCollapsed);
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const selectParent = useBoardStore((s) => s.selectParent);
  const selected = state.cards.find((c) => c.id === selectedParentId);
  const empty = !state.cards.some(isLive);

  return (
    <div className="board">
      {empty && (
        <div className="board-hint">
          <strong>Este board ainda não tem cards.</strong> Crie uma história em <em>+ Novo card</em>, na primeira coluna. Um clique na
          história mostra as sub-tarefas dela na linha de baixo; dois cliques abrem o card, onde ficam a descrição, a conversa com a IA e o
          botão <em>Chamar IA</em>.
        </div>
      )}
      {state.workflows
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((wf) => {
          const collapsed = overrides[wf.id] ?? wf.collapsed;
          const total = columnsOf(state, wf.id).reduce((n, c) => n + cardsIn(state, c.id).length, 0);
          return (
            <section key={wf.id} className={`workflow workflow-${wf.kind} ${collapsed ? 'collapsed' : ''}`}>
              <header
                className="workflow-header"
                onClick={() => setCollapsed(wf.id, !collapsed)}
                title={collapsed ? 'Expandir a linha' : 'Colapsar a linha'}
              >
                <Button variant="icon" className="collapse-toggle" aria-expanded={!collapsed}>
                  {collapsed ? '▸' : '▾'}
                </Button>
                <h2>{wf.name}</h2>
                <span className="column-count">
                  {total} {total === 1 ? 'card' : 'cards'}
                </span>
                {wf.kind === 'child' &&
                  !empty &&
                  (selected ? (
                    <span
                      className="filter-chip"
                      title="Mostrar as sub-tarefas de todas as histórias"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectParent(null);
                      }}
                    >
                      de {cardRef(selected)} {selected.title} ✕
                    </span>
                  ) : (
                    <span className="muted small">de todas as histórias · clique numa história para ver e criar as dela</span>
                  ))}
              </header>
              {!collapsed && <WorkflowRow workflow={wf} />}
            </section>
          );
        })}
    </div>
  );
}
