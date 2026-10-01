import { useBoardStore } from '../store/boardStore';
import { WorkflowRow } from './WorkflowRow';

export function Board() {
  const state = useBoardStore((s) => s.state)!;

  return (
    <div className="board">
      {state.workflows
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((wf) => (
          <section key={wf.id} className={`workflow workflow-${wf.kind}`}>
            <header className="workflow-header">
              <h2>{wf.name}</h2>
            </header>
            <WorkflowRow workflow={wf} />
          </section>
        ))}
    </div>
  );
}
