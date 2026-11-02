import { useRef, useState } from 'react';
import { Button, Card } from '@radix-ui/themes';
import type { Workflow } from '../../../../shared/model';
import { columnsOf } from '../../../../shared/selectors';
import { suggestPhaseModels, type PhaseModelSuggestion } from '../../../../shared/suggestPhaseModels';
import { settings } from '../../../commands';
import { dt, t } from '../../../i18n';
import { modelDisplay } from '../../../modelText';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';

export function PhaseModelsProposal({
  workflow,
  proposal,
  onClose,
}: {
  workflow: Workflow;
  proposal: PhaseModelSuggestion[];
  onClose: () => void;
}) {
  const state = useBoardStore((s) => s.state)!;
  const [names] = useState(() => new Map(columnsOf(state, workflow.id).map((column) => [column.id, column.name])));
  const [original] = useState(() => new Map(columnsOf(state, workflow.id).map((column) => [column.id, column.phaseModel])));
  const confirmed = useRef(new Set<string>());
  const [stale, setStale] = useState(false);
  const apply = useAction(async () => {
    const current = useBoardStore.getState().state!;
    const fresh = suggestPhaseModels(current, workflow.id);
    if (
      fresh.length !== proposal.length ||
      fresh.some((item, i) => item.columnId !== proposal[i]?.columnId || item.value !== proposal[i]?.value) ||
      proposal.some((item) => {
        const column = current.columns.find((c) => c.id === item.columnId && c.workflowId === workflow.id);
        return !column || (column.phaseModel !== original.get(item.columnId) && column.phaseModel !== item.value);
      })
    ) {
      setStale(true);
      throw new Error(t('A proposta mudou. Descarte e abra novamente para conferir.'));
    }
    for (const item of proposal) {
      const column = useBoardStore.getState().state?.columns.find((c) => c.id === item.columnId && c.workflowId === workflow.id);
      if (!column) {
        setStale(true);
        throw new Error(t('A proposta mudou. Descarte e abra novamente para conferir.'));
      }
      if (confirmed.current.has(item.columnId) && column.phaseModel === item.value) continue;
      if (column.phaseModel !== item.value) await settings.updateColumn(item.columnId, { phaseModel: item.value });
      confirmed.current.add(item.columnId);
    }
  });

  return (
    <Card className="draft-card" aria-label={t('Prévia de modelos sugeridos')}>
      <strong>{t('Prévia de modelos sugeridos')}</strong>
      <p>{t('Aplicar substitui os modelos existentes e limpa os que estão sem preferência.')}</p>
      <table className="table">
        <thead>
          <tr>
            <th>{t('Coluna')}</th>
            <th>{t('Sugestão')}</th>
            <th>{t('Por quê')}</th>
          </tr>
        </thead>
        <tbody>
          {proposal.map((item) => (
            <tr key={item.columnId}>
              <td>{dt(names.get(item.columnId) ?? '')}</td>
              <td>{item.value ? modelDisplay(state.board.modelCatalog, item.value, true) : t('Sem preferência')}</td>
              <td>{t(item.reason)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {apply.error && (
        <p role="alert">
          {stale
            ? t('A proposta mudou. Descarte e abra novamente para conferir.')
            : t('Não foi possível aplicar todos os modelos. Tente novamente.')}
        </p>
      )}
      <div className="form-actions">
        <Button variant="soft" color="gray" disabled={apply.busy} onClick={onClose}>
          {t('Descartar')}
        </Button>
        <Button
          disabled={!proposal.length || stale}
          loading={apply.busy}
          onClick={() =>
            void apply.run().then((ok) => {
              if (ok) onClose();
            })
          }
        >
          {t('Aplicar sugeridos')}
        </Button>
      </div>
    </Card>
  );
}
