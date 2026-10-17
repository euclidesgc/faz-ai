import { useEffect, useRef } from 'react';
import { useBoardStore, useFilteredIds } from '../store/boardStore';
import { usePending } from '../usePending';
import { isLive } from '../../shared/selectors';
import { t } from '../i18n';
import { selectionActions } from './selectionActions';
import { Button, IconYolo } from './ui';

/** Barra de ações sobre as histórias selecionadas e visíveis; usa o mesmo modelo do menu da coluna. */
export function SelectionBar() {
  const state = useBoardStore((s) => s.state)!;
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const clearSelected = useBoardStore((s) => s.clearSelected);
  const collapsed = useBoardStore((s) => s.collapsed);
  const bulkBusy = useBoardStore((s) => s.bulkBusy);

  // defesa extra: a caixa de marcação (card 324) só existe em histórias vivas, mas confere de novo aqui
  const filtered = useFilteredIds();
  const selectedStories = state.cards.filter((c) => selectedIds.has(c.id) && !c.parentId && isLive(c) && (!filtered || filtered.has(c.id)));
  const allYolo = selectedStories.every((c) => c.yolo);
  // em lote, a barra mostra "Aplicando…" até os cards mudarem (ou o tempo esgotar) e só então limpa a seleção
  const [target, applying, markYolo] = usePending(allYolo);
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    if (applying && allYolo === targetRef.current) clearSelected();
  }, [allYolo, applying, clearSelected]);
  if (selectedStories.length < 2) return null;

  const n = selectedStories.length;
  const workflowId = selectedStories[0]!.workflowId;
  const columnId = selectedStories[0]!.columnId;
  const actions = selectionActions({
    state,
    selected: selectedStories,
    collapsed,
    destinations: state.columns.filter((c) => c.workflowId === workflowId && c.id !== columnId).sort((a, b) => a.position - b.position),
    onYoloMark: markYolo,
  });

  return (
    <div className="selectionbar">
      <span>{t('{n} selecionados', { n })}</span>
      {bulkBusy && (
        <span role="status" className="muted small">
          <span className="spinner" aria-hidden /> {bulkBusy}
        </span>
      )}
      <Button variant="ghost" size="small" onClick={clearSelected}>
        {t('Limpar')}
      </Button>
      {actions.map((action) => (
        <Button
          key={action.id}
          size="small"
          danger={action.danger}
          disabled={action.disabled || applying || !!bulkBusy}
          onClick={action.run}
        >
          {action.id === 'yolo' && <IconYolo />}
          {action.id === 'yolo' && applying ? t('Aplicando…') : action.label}
        </Button>
      ))}
    </div>
  );
}
