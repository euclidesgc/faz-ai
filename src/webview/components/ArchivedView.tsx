import { useMemo, useState } from 'react';
import { TextField } from '@radix-ui/themes';
import { ARCHIVED_EMPTY_FILTERS, ARCHIVED_PAGE, archivedRowCards } from '../../shared/archived';
import { activeFilterCount, applyFilters, type Filters } from '../../shared/filters';
import type { Card, Id, Workflow } from '../../shared/model';
import { cardRef } from '../../shared/model';
import { isArchived } from '../../shared/selectors';
import { useBoardStore } from '../store/boardStore';
import { useCardBusy } from '../store/busyCards';
import { formatDateTime, t, tn, dt } from '../i18n';
import { requestRestoreArchived } from '../store/actions';
import { CardView } from './Card';
import { FilterPanel } from './FilterPanel';
import { Button } from './ui';

/**
 * Aba Arquivados: uma linha por workflow, na ordem do board, só com os cards arquivados dele (do mais recente ao
 * mais antigo). Preserva o histórico sem ocupar as linhas do board; restaurar devolve o card à primeira coluna.
 * Filtros, páginas e a história selecionada são estado local: sair da aba e voltar a abre limpa.
 */
export function ArchivedView() {
  const state = useBoardStore((s) => s.state)!;
  const workflows = state.workflows.slice().sort((a, b) => a.position - b.position);
  const [filters, setFiltersState] = useState<Filters>(ARCHIVED_EMPTY_FILTERS);
  const [limits, setLimits] = useState<Record<Id, number>>({});
  const [storyId, setStoryId] = useState<Id | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Mudar o filtro volta cada linha à primeira página.
  const setFilters = (patch: Partial<Filters>) => {
    setFiltersState((current) => ({ ...current, ...patch }));
    setLimits({});
  };
  const matched = useMemo(() => applyFilters(state, filters), [state, filters]);
  // Derivada do estado: história restaurada ou na lixeira deixa de valer sem efeito colateral.
  const story = storyId ? (state.cards.find((c) => c.id === storyId && isArchived(c)) ?? null) : null;
  const clearAll = () => {
    setFiltersState(ARCHIVED_EMPTY_FILTERS);
    setLimits({});
    setStoryId(null);
  };

  return (
    <div className="archived">
      <div className="row">
        <h2>{t('Arquivados')}</h2>
      </div>
      <p className="muted">
        {t(
          'Cards arquivados ficam aqui, por workflow, do mais recente ao mais antigo. Restaurar leva o card para a primeira coluna do workflow dele.',
        )}
      </p>
      <ArchivedFilterBar
        filters={filters}
        setFilters={setFilters}
        panelOpen={panelOpen}
        setPanelOpen={setPanelOpen}
        canClear={activeFilterCount(filters) > 0 || story !== null}
        clearAll={clearAll}
      />
      {workflows.map((wf) => (
        <ArchivedRow
          key={wf.id}
          workflow={wf}
          matched={matched}
          story={story}
          limit={limits[wf.id] ?? ARCHIVED_PAGE}
          showMore={() => setLimits((current) => ({ ...current, [wf.id]: (current[wf.id] ?? ARCHIVED_PAGE) + ARCHIVED_PAGE }))}
          toggleStory={(id) => setStoryId((current) => (current === id ? null : id))}
          clearStory={() => setStoryId(null)}
        />
      ))}
    </div>
  );
}

/** Busca e painel de filtros da aba, com as mesmas classes da barra do board. */
function ArchivedFilterBar({
  filters,
  setFilters,
  panelOpen,
  setPanelOpen,
  canClear,
  clearAll,
}: {
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  canClear: boolean;
  clearAll: () => void;
}) {
  const count = activeFilterCount(filters);
  return (
    <div className="filterbar">
      <div className="filterbar-main">
        <TextField.Root
          className="search"
          type="search"
          aria-label={t('Buscar nos arquivados')}
          placeholder={t('Buscar em título, descrição, conversa e campos…')}
          value={filters.text}
          onChange={(e) => setFilters({ text: e.target.value })}
        />
        <button className={panelOpen ? 'active' : ''} aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
          {panelOpen ? t('Esconder filtros') : t('Mostrar filtros')}
          {count > 0 && ` (${count})`}
        </button>
        {canClear && (
          <button className="ghost" onClick={clearAll}>
            {t('Limpar filtros')}
          </button>
        )}
      </div>
      {panelOpen && (
        <div className="filterbar-panel">
          <FilterPanel filters={filters} setFilters={setFilters} scope="archived" />
        </div>
      )}
    </div>
  );
}

function ArchivedRow({
  workflow,
  matched,
  story,
  limit,
  showMore,
  toggleStory,
  clearStory,
}: {
  workflow: Workflow;
  matched: Set<Id> | null;
  story: Card | null;
  limit: number;
  showMore: () => void;
  toggleStory: (id: Id) => void;
  clearStory: () => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const { total, cards } = archivedRowCards(state, workflow, matched, story?.id ?? null);
  const byStory = workflow.kind === 'child' && story !== null;
  return (
    <section className="archived-row" aria-label={dt(workflow.name)}>
      <header>
        <h2>{dt(workflow.name)}</h2>
        <span className="column-count">{tn(cards.length, '{n} card', '{n} cards')}</span>
      </header>
      {byStory && (
        <div className="archived-parent">
          <span>{t('Sub-tarefas de {card}', { card: `${cardRef(story)} ${story.title}` })}</span>
          <button className="ghost" onClick={clearStory}>
            {t('Limpar seleção')}
          </button>
        </div>
      )}
      {cards.length === 0 ? (
        <p className="muted small">
          {total === 0
            ? t('Nenhum card arquivado neste workflow.')
            : byStory
              ? t('Nenhuma sub-tarefa arquivada desta história.')
              : t('Nenhum card arquivado atende aos filtros.')}
        </p>
      ) : (
        <div className="archived-cards">
          {cards.slice(0, limit).map((card) => (
            <div key={card.id} className="archived-item">
              {workflow.kind === 'parent' ? (
                <CardView card={card} selected={story?.id === card.id} onSelect={() => toggleStory(card.id)} />
              ) : (
                <CardView card={card} />
              )}
              <div className="archived-meta">
                <span>{formatDateTime(card.archivedAt!)}</span>
                <span className="spacer" />
                <RestoreButton cardId={card.id} label={t('Restaurar {title}', { title: `${cardRef(card)} ${card.title}` })} />
              </div>
            </div>
          ))}
        </div>
      )}
      {cards.length > limit && (
        <div className="archived-more">
          <span className="muted small">{t('Mostrando {shown} de {total}', { shown: limit, total: cards.length })}</span>
          <button onClick={showMore}>{t('Mostrar mais')}</button>
        </div>
      )}
    </section>
  );
}

/** Restaurar mostra a espera no próprio botão enquanto o card tem um pedido no host. */
function RestoreButton({ cardId, label }: { cardId: string; label: string }) {
  const busy = useCardBusy(cardId);
  return (
    <Button title={label} aria-label={label} loading={busy} onClick={() => requestRestoreArchived(cardId)}>
      {t('Restaurar')}
    </Button>
  );
}
