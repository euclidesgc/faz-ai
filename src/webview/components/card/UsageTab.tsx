import { useMemo } from 'react';
import { ceilingOf, budgetLevel, type BudgetLevel } from '../../../shared/budget';
import { estimateContext } from '../../../shared/contextEstimate';
import { EFFORT_FIELD } from '../../../shared/models';
import { valueOf } from '../../../shared/selectors';
import { norm } from '../../../shared/filters';
import { settings } from '../../commands';
import { ActionButton, NumberField } from '../ui';
import type { CardUsageRow } from '../../../shared/cardUsage';
import { executionContextOf } from '../../../shared/executionContext';
import { ExecutionContext } from './ExecutionContext';
import type { Card } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { dt, t, tn } from '../../i18n';
import { ContextDetail } from '../cardView/ContextGauge';
import { Placeholder } from '../ui';
import { costBucketsTitle, formatCompact, formatCost, formatDuration, formatMonth, formatNumber, unmeasured } from '../metrics/format';
import { useCardUsage } from './useCardUsage';
import { FAILURE_CLASSES } from '../../../shared/failureClass';
import { failureClassLabel } from '../metrics/failureClassLabel';

/** Tokens compactos na célula, com o número exato na dica; "não medido" quando a linha não tem medição. */
function TokenCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <td className="is-number muted">{unmeasured()}</td>;
  return (
    <td className="is-number" title={formatNumber(value)}>
      {formatCompact(value)}
    </td>
  );
}

/** Custo da linha: valor, marca de estimado, aviso de parcial e os buckets na dica; "—" sem custo. */
function CostCell({ row }: { row: CardUsageRow }) {
  const cost = row.cost;
  if (!cost) return <td className="is-number muted">—</td>;
  const partial = row.costedRuns < row.runs;
  return (
    <td className="is-number" title={costBucketsTitle(cost.buckets, cost.estimatedUsd < cost.totalUsd)}>
      {formatCost(cost.totalUsd)}
      {cost.estimatedUsd > 0 && <div className="muted">{t('estimado por tabela de preços')}</div>}
      {partial && <div className="muted">{t('cobre {costed} de {runs} execuções', { costed: row.costedRuns, runs: row.runs })}</div>}
    </td>
  );
}

/** As falhas da linha por classe ("2 transitória, 1 determinística"); "—" sem nenhuma. */
function FailureCell({ row }: { row: CardUsageRow }) {
  const parts = FAILURE_CLASSES.filter((c) => row.failures?.[c]).map((c) => `${row.failures![c]} ${failureClassLabel(c)}`);
  if (!parts.length) return <td className="muted">—</td>;
  return <td>{parts.join(', ')}</td>;
}

function UsageLine({ label, row, total = false, showCost }: { label: string; row: CardUsageRow; total?: boolean; showCost: boolean }) {
  const tk = row.tokens ?? undefined;
  return (
    <tr className={total ? 'usage-total' : undefined}>
      <th scope="row">{label}</th>
      <td className="is-number">{formatNumber(row.runs)}</td>
      <td className="is-number">{formatDuration(row.durationMs)}</td>
      <TokenCell value={tk?.input} />
      <TokenCell value={tk?.output} />
      <TokenCell value={tk?.cacheRead} />
      <TokenCell value={tk?.cacheWrite} />
      <TokenCell value={tk?.total} />
      {showCost && <CostCell row={row} />}
      <FailureCell row={row} />
    </tr>
  );
}

const LEVEL_TEXT: Record<BudgetLevel, string> = { ok: 'Dentro do teto', warn: 'Perto do teto', exceeded: 'Teto atingido' };

/**
 * Teto de consumo da história: o gasto (o mesmo Total da tabela) contra o teto efetivo, o campo do teto do card e o
 * aviso quando o gasto mais a estimativa do contexto de entrada passa do teto. A regra vem de `shared/budget`.
 */
function BudgetBar({ card, spent }: { card: Card; spent: number }) {
  const state = useBoardStore((s) => s.state)!;
  const { config, cards } = state.budget;
  const own = cards[card.id] ?? null;
  const effortDef = state.fieldDefs.find((f) => norm(f.name) === norm(EFFORT_FIELD));
  const effortValue = effortDef ? valueOf(state, card.id, effortDef.id) : null;
  const ceiling = ceilingOf(config, own, typeof effortValue === 'string' ? effortValue : null);
  const estimate = useMemo(() => estimateContext(state, card).total, [state, card]);
  if (!config.enabled) return null;
  const level = ceiling ? budgetLevel(spent, ceiling, config.warnAt) : null;
  const pct = ceiling ? Math.floor((spent / ceiling) * 100) : 0;
  const over = ceiling !== null && spent + estimate > ceiling;
  return (
    <div className="budget-bar-block">
      {ceiling === null ? (
        <p className="muted">{t('Esta história está sem teto de consumo.')}</p>
      ) : (
        <>
          <div className="budget-bar-head">
            <span>{t('{spent} de {ceiling} tokens', { spent: formatNumber(spent), ceiling: formatNumber(ceiling) })}</span>
            <strong>{pct}%</strong>
          </div>
          <div
            className={`budget-bar is-${level}`}
            role="progressbar"
            aria-label={t('Consumo do teto')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, pct)}
            aria-valuetext={`${pct}% · ${t(LEVEL_TEXT[level!])}`}
          >
            <div className="budget-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </>
      )}
      {over && (
        <p className="budget-warning" role="status">
          {t(
            'Com a estimativa da próxima execução ({estimate} tokens), a história passa do teto. A estimativa cobre só o contexto de entrada: o que a IA escreve e lê no trabalho vem além.',
            { estimate: formatNumber(estimate) },
          )}
        </p>
      )}
      <div className="budget-bar-actions">
        <NumberField
          aria-label={t('Teto desta história')}
          value={typeof own === 'number' ? own : (ceiling ?? 1)}
          min={1}
          max={1_000_000_000_000}
          unit={t('tokens')}
          onCommit={(n) => void settings.setCardBudget(card.id, Math.round(n)).catch(() => undefined)}
        />
        <ActionButton
          size="1"
          variant="soft"
          hint={t('Esta história não é avisada nem parada pelo consumo.')}
          disabled={own === 'off'}
          onClick={() => void settings.setCardBudget(card.id, 'off').catch(() => undefined)}
        >
          {t('Sem teto')}
        </ActionButton>
        <ActionButton
          size="1"
          variant="soft"
          hint={t('Volta a usar o teto do esforço da história, definido em Automação.')}
          disabled={own === null}
          onClick={() => void settings.setCardBudget(card.id, null).catch(() => undefined)}
        >
          {t('Voltar ao padrão')}
        </ActionButton>
      </div>
    </div>
  );
}

/**
 * Aba Consumo do card aberto: o que o card já gastou, medido em cada execução, por fase e no total, e a
 * estimativa da próxima execução. O gasto é histórico e só cresce; a estimativa acompanha o card.
 */
export function UsageTab({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const showCost = state.board.rules.showCost;
  const preview = useMemo(() => executionContextOf(state, card), [state, card]);
  // uma execução do card (ou de uma sub-tarefa) que começa ou termina muda o que já foi gasto
  const childIds = state.cards.filter((c) => c.parentId === card.id).map((c) => c.id);
  const version = state.aiRuns.filter((id) => id === card.id || childIds.includes(id)).join(',');
  const { usage, loading, error } = useCardUsage(card.id, version);
  const empty = usage !== null && usage.total.runs === 0;

  return (
    <div className="usage-tab">
      <section className="drawer-section" aria-busy={loading}>
        <h3>{t('Gasto até agora')}</h3>
        {error && <p className="error">{error}</p>}
        {!card.parentId && <BudgetBar card={card} spent={usage?.total.tokens?.total ?? 0} />}
        {!usage && loading && <Placeholder label={t('Carregando…')} lines={4} />}
        {empty && (
          <p className="muted">
            {card.parentId
              ? t('Nenhuma execução neste card. As sub-tarefas rodam dentro da sessão da história: o consumo delas aparece na história.')
              : t('Nenhuma execução de IA neste card ainda.')}
          </p>
        )}
        {usage && !empty && (
          <>
            <div className="usage-table-wrap">
              <table className="metrics-table usage-table">
                <thead>
                  <tr>
                    <th scope="col">{t('Fase')}</th>
                    <th scope="col" className="is-number">
                      {t('Execuções')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Tempo')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Entrada')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Saída')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Leitura de cache')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Escrita de cache')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Total')}
                    </th>
                    {showCost && (
                      <th scope="col" className="is-number">
                        {t('Custo')}
                      </th>
                    )}
                    <th scope="col">{t('Classe da falha')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.phases.map((row) => (
                    <UsageLine key={row.phase} label={row.phase ? dt(row.phase) : t('sem fase')} row={row} showCost={showCost} />
                  ))}
                  {usage.subtasks && <UsageLine label={t('Sub-tarefas')} row={usage.subtasks} showCost={showCost} />}
                </tbody>
                <tfoot>
                  <UsageLine label={t('Total')} row={usage.total} total showCost={showCost} />
                </tfoot>
              </table>
            </div>
            <div className="context-notes">
              <p>
                {t(
                  'Medido pela ferramenta no fim de cada execução: inclui tudo o que a IA leu e escreveu no trabalho, não só o contexto inicial. Só cresce: apagar mensagens ou desmarcar itens muda as próximas execuções, não o que já foi gasto.',
                )}
              </p>
              {usage.total.open > 0 && (
                <p>
                  {tn(
                    usage.total.open,
                    'Uma execução em andamento: o consumo dela entra quando terminar.',
                    '{n} execuções em andamento: o consumo delas entra quando terminarem.',
                  )}
                </p>
              )}
              {usage.archivedUntil && (
                <p>
                  {t('As execuções até {month} ficaram só nos totais mensais do board (retenção do detalhe) e não aparecem aqui.', {
                    month: formatMonth(usage.archivedUntil, 'long'),
                  })}
                </p>
              )}
            </div>
          </>
        )}
      </section>
      <section className="drawer-section">
        <h3>{t('Próxima execução')}</h3>
        <div className="usage-estimate">
          <ContextDetail estimate={preview.estimate} />
          <ExecutionContext preview={preview} />
        </div>
      </section>
    </div>
  );
}
