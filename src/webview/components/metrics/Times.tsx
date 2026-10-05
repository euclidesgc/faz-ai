import { useId } from 'react';
import type { MetricsLead, MetricsLeadRow } from '../../../shared/metrics';
import { t, tn } from '../../i18n';
import type { MetricsSort } from '../../store/boardStore';
import { formatNumber, formatSpan, intlLocale } from './format';
import type { MetricsBlockProps } from './MetricsBlock';
import { Note } from './Note';
import { RankingNoteRow, RankingTable, type RankingColumn } from './RankingTable';

/**
 * Os dois blocos de tempo de relógio do painel (card 176): quanto tempo o card fica em cada fase
 * (`DwellTable`) e quanto leva da criação à primeira conclusão (`LeadTable`). Nenhum deles é o "tempo
 * de IA" do corte por fase (RF-11): aqui o card pode estar parado esperando gente, sem IA nenhuma.
 */

/** Texto no lugar do número quando a fase não tem permanência medida: não é "desconhecido" nem zero. */
const noneMeasured = (): string => t('sem permanência medida');

/**
 * Permanência por fase (RF-11 a RF-14): uma linha por fase, com cinco números em texto. O rótulo é
 * "permanências" e não "cards", porque um card que volta para a fase conta duas vezes (RF-12). Quem está
 * na fase agora fica em "aqui agora", fora da média (RF-13); entrada fora do horizonte é "desconhecida",
 * contada à parte (RF-14). Fase sem permanência terminada continua na lista.
 */
export function DwellTable({ sections }: MetricsBlockProps) {
  const uid = useId();
  const rows = sections.dwell;
  if (rows.length === 0) return <p className="metrics-times-empty">{t('Nenhuma fase com permanência neste período.')}</p>;
  const hasUnknown = rows.some((r) => r.unknown > 0);
  return (
    <>
      <table className="metrics-table" aria-describedby={`${uid}-n`}>
        <caption className="sr-only">{t('Permanência do card em cada fase')}</caption>
        <thead className="metrics-sticky-head">
          <tr>
            <th scope="col">{t('Fase')}</th>
            <th scope="col" className="is-number">
              {t('Permanências')}
            </th>
            <th scope="col" className="is-number">
              {t('Mediana')}
            </th>
            <th scope="col" className="is-number">
              {t('Média')}
            </th>
            <th scope="col" className="is-number">
              {t('Desconhecidas')}
            </th>
            <th scope="col" className="is-number">
              {t('Aqui agora')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.phase}>
              <th scope="row">{row.phase}</th>
              <td className="is-number">{formatNumber(row.permanences)}</td>
              <td className="is-number">{row.medianMs === null ? noneMeasured() : formatSpan(row.medianMs)}</td>
              <td className="is-number">{row.meanMs === null ? noneMeasured() : formatSpan(row.meanMs)}</td>
              <td className="is-number">{formatNumber(row.unknown)}</td>
              <td className="is-number">{formatNumber(row.openNow)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div id={`${uid}-n`} className="metrics-times-notes">
        <p className="metrics-times-hint">
          {t(
            'Permanências, não cards: um card que volta para uma fase conta duas vezes. Quem está na fase agora aparece em "aqui agora" e fica fora da média e da mediana.',
          )}
        </p>
        {hasUnknown && (
          <Note>
            {t(
              'Desconhecida é a permanência cuja entrada na fase ficou fora do detalhe guardado: ela é contada à parte, nunca como zero nem como tempo curto.',
            )}
          </Note>
        )}
      </div>
    </>
  );
}

interface LeadTableProps extends MetricsBlockProps {
  sort: MetricsSort | null;
  onSort: (sort: MetricsSort | null) => void;
}

/**
 * Lead time (RF-15 a RF-17, RF-32): a mediana em destaque, a média ao lado, quantos cards entraram e
 * quantos ficaram desconhecidos, e a lista por card. A mediana vem na frente porque um card parado três
 * semanas move a média do mês inteiro. Sem nenhum valor conhecido, a tela diz isso em vez de mostrar
 * mediana vazia ou zero.
 */
export function LeadTable({ sections, sort, onSort }: LeadTableProps) {
  const uid = useId();
  const lead = sections.lead;
  const known = lead.medianMs !== null;
  const hasAny = lead.counted > 0 || lead.unknown > 0 || lead.rows.length > 0;
  return (
    <div className="metrics-lead">
      <p className="metrics-times-hint">
        {t('Medido da criação do card até a primeira conclusão: um card concluído, reaberto e concluído de novo tem um lead time só.')}
      </p>
      {!hasAny ? (
        <p className="metrics-times-empty">{t('Nenhum card foi concluído neste período.')}</p>
      ) : (
        <>
          <LeadSummary lead={lead} known={known} noteId={`${uid}-u`} />
          {lead.unknown > 0 && (
            <Note id={`${uid}-u`}>
              {t(
                'Desconhecido é o lead time de um card sem data de criação no detalhe guardado. Há dois motivos possíveis e não dá para separá-los com honestidade: o mês em que o card foi criado pode ter sido descartado, ou o card pode ser anterior ao início da série. A data não é estimada.',
              )}
            </Note>
          )}
          {!known && <Note>{t('Nenhum lead time foi medido neste período: não há mediana nem média para mostrar.')}</Note>}
          {lead.rows.length > 0 && <LeadList rows={lead.rows} omitted={lead.omitted} sort={sort} onSort={onSort} />}
        </>
      )}
    </div>
  );
}

function LeadSummary({ lead, known, noteId }: { lead: MetricsLead; known: boolean; noteId: string }) {
  return (
    <dl className="metrics-lead-summary">
      <div className="metrics-lead-main">
        <dt>{t('Mediana')}</dt>
        <dd className="metrics-lead-median">{known ? formatSpan(lead.medianMs) : t('sem valor medido')}</dd>
      </div>
      <div>
        <dt>{t('Média')}</dt>
        <dd>{lead.meanMs === null ? t('sem valor medido') : formatSpan(lead.meanMs)}</dd>
      </div>
      <div>
        <dt>{t('Entraram na conta')}</dt>
        <dd>{formatNumber(lead.counted)}</dd>
      </div>
      <div>
        <dt>{t('Desconhecidos')}</dt>
        <dd aria-describedby={lead.unknown > 0 ? noteId : undefined}>{formatNumber(lead.unknown)}</dd>
      </div>
    </dl>
  );
}

/** A data em que o card concluiu, no idioma da interface. */
const doneDay = (ms: number): string => new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium' }).format(new Date(ms));

/** O padrão da lista: a ordem em que o host manda, da conclusão mais recente para a mais antiga. */
export const DEFAULT_LEAD_SORT: MetricsSort = { key: 'done', dir: 'desc' };

/**
 * A lista por card na `RankingTable` (RF-33): sem linha "outros", porque somar lead times não significa
 * nada; o corte vira a contagem "+N cards concluídos não listados", com N = linhas fora do limite da
 * tabela mais as que o host deixou fora do teto (`omitted`). "Desconhecido" vai para o fim nas duas
 * direções, nunca como o menor lead time.
 */
function LeadList({ rows, omitted, sort, onSort }: { rows: MetricsLeadRow[]; omitted: number } & Pick<LeadTableProps, 'sort' | 'onSort'>) {
  const columns: RankingColumn<MetricsLeadRow>[] = [
    {
      key: 'card',
      header: t('Card'),
      rowHeader: true,
      firstDir: 'asc',
      cell: (r) => `#${r.cardNumber} ${r.title}`,
      sortValue: (r) => r.cardNumber,
    },
    { key: 'lead', header: t('Lead time'), numeric: true, cell: (r) => formatSpan(r.leadMs), sortValue: (r) => r.leadMs },
    { key: 'done', header: t('Concluído em'), numeric: true, cell: (r) => doneDay(r.doneAt), sortValue: (r) => r.doneAt },
  ];
  return (
    <RankingTable
      caption={t('Lead time de cada card concluído')}
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.cardNumber)}
      sort={sort ?? DEFAULT_LEAD_SORT}
      onSort={onSort}
      sortReason={sort ? undefined : t('É o padrão: os concluídos mais recentes primeiro.')}
      footer={({ hidden, colSpan }) => {
        const n = hidden + omitted;
        return n > 0 ? (
          <RankingNoteRow colSpan={colSpan}>
            {tn(n, '+{n} card concluído não listado', '+{n} cards concluídos não listados', { n: formatNumber(n) })}
          </RankingNoteRow>
        ) : null;
      }}
    />
  );
}
