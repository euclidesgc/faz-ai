import { cardRef } from '../../shared/model';

import { cardsIn, columnsOf, isLive } from '../../shared/selectors';
import { useBoardStore } from '../store/boardStore';
import { t, tn, dt } from '../i18n';
import { rich } from '../i18n/rich';
import { Button, IconChevronDown, IconChevronRight, IconClose } from './ui';
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
          {rich(
            '<b>Este board ainda não tem cards.</b> Crie uma história em <i>+ Novo card</i>, na primeira coluna. Um clique na história mostra as sub-tarefas dela no workflow de sub-tarefas; dois cliques abrem o card, onde ficam a descrição, a conversa com a IA e os botões <i>Trabalhar na fase</i> e <i>Refinar com IA</i>.',
          )}
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
                title={collapsed ? t('Expandir o workflow') : t('Colapsar o workflow')}
              >
                <Button variant="icon" className="collapse-toggle" aria-expanded={!collapsed}>
                  {collapsed ? <IconChevronRight /> : <IconChevronDown />}
                </Button>
                <h2>{dt(wf.name)}</h2>
                <span className="column-count">{tn(total, '{n} card', '{n} cards')}</span>
                {wf.kind === 'child' &&
                  !empty &&
                  (selected ? (
                    <span
                      className="filter-chip"
                      title={t('Mostrar as sub-tarefas de todas as histórias')}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectParent(null);
                      }}
                    >
                      {t('de {ref} {title}', { ref: cardRef(selected), title: selected.title })} <IconClose />
                    </span>
                  ) : (
                    <span className="muted small">{t('de todas as histórias · clique numa história para ver e criar as dela')}</span>
                  ))}
              </header>
              {!collapsed && <WorkflowRow workflow={wf} />}
            </section>
          );
        })}
    </div>
  );
}
