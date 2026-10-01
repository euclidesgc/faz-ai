import { cardsIn, columnsOf, useBoardStore } from '../store/boardStore';
import { WorkflowRow } from './WorkflowRow';

export function Board() {
  const state = useBoardStore((s) => s.state)!;
  const overrides = useBoardStore((s) => s.collapsed);
  const setCollapsed = useBoardStore((s) => s.setCollapsed);

  return (
    <div className="board">
      {state.workflows
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((wf) => {
          const collapsed = overrides[wf.id] ?? wf.collapsed;
          const total = columnsOf(state, wf.id).reduce((n, c) => n + cardsIn(state, c.id).length, 0);
          return (
            <section key={wf.id} className={`workflow workflow-${wf.kind} ${collapsed ? 'collapsed' : ''}`}>
              <header className="workflow-header" onClick={() => setCollapsed(wf.id, !collapsed)} title={collapsed ? 'Expandir a linha' : 'Colapsar a linha'}>
                <button className="icon collapse-toggle" aria-expanded={!collapsed}>{collapsed ? '▸' : '▾'}</button>
                <h2>{wf.name}</h2>
                <span className="column-count">{total} card(s)</span>
              </header>
              {!collapsed && <WorkflowRow workflow={wf} />}
            </section>
          );
        })}
    </div>
  );
}
