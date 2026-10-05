import { useId } from 'react';
import { LOG_BYTES_PER_ROW } from '../../../shared/log';
import type { MetricsPanelResult } from '../../../shared/metrics';
import { LOG_RETENTION_MAX, LOG_RETENTION_MIN } from '../../../shared/rules';
import { settings } from '../../commands';
import { intlLocale } from './format';
import { t, tn } from '../../i18n';
import { useBoardStore } from '../../store/boardStore';
import { NumberField } from '../ui';
import { Note } from './Note';

/** Tamanho aproximado em MB, uma casa; abaixo de 50 KB diz "menos de 100 KB" em vez de "0,0 MB". */
function formatSize(bytes: number): string {
  const mb = bytes / 1_000_000;
  const nf = new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return mb < 0.05 ? t('menos de 100 KB') : t('cerca de {size} MB', { size: nf.format(mb) });
}

/**
 * O bloco "Detalhe guardado" (RF-23 a RF-27): a janela de retenção do log, com o preço do número à
 * vista. O valor em vigor é a regra do board (configuração, não log); o preço vem da consulta do
 * painel (`result.retention`). Subir grava direto; baixar abre a confirmação do board, dizendo quantos
 * meses perdem o detalhe e quando. A janela é o mês corrente mais N meses completos.
 */
export function RetentionCard({ result, onChanged }: { result: MetricsPanelResult; onChanged?: () => void }) {
  const months = useBoardStore((s) => s.state?.board.rules.logRetentionMonths) ?? result.retention.months;
  const ask = useBoardStore((s) => s.ask);
  const id = useId();
  const { detailMonths, detailRows } = result.retention;

  const write = (next: number) => {
    settings.updateRules({ logRetentionMonths: next });
    // a gravação não devolve a consulta: o preço do número só muda quando a visão consulta de novo
    onChanged?.();
  };

  const change = (next: number) => {
    if (next >= months) return write(next);
    // a janela guarda o mês corrente e `next` meses anteriores: o resto do que já tem detalhe sai
    const lost = Math.max(0, detailMonths - (next + 1));
    ask({
      title: tn(next, 'Guardar o detalhe de {n} mês?', 'Guardar o detalhe de {n} meses?'),
      message:
        lost > 0
          ? tn(
              lost,
              'Na próxima abertura do board, {n} mês perde o detalhe por card, o lead time de card antigo e o inventário de ferramentas e skills. Não acontece agora. Os totais por mês continuam.',
              'Na próxima abertura do board, {n} meses perdem o detalhe por card, o lead time de card antigo e o inventário de ferramentas e skills. Não acontece agora. Os totais por mês continuam.',
            )
          : t(
              'Nenhum mês guardado hoje sai da janela, mas a partir da próxima abertura do board o detalhe antigo passa a ser descartado mais cedo. Os totais por mês continuam.',
            ),
      confirmLabel: tn(next, 'Guardar só {n} mês', 'Guardar só {n} meses'),
      danger: true,
      onConfirm: () => write(next),
    });
  };

  return (
    <section className="retention-card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t('Detalhe guardado')}</h3>
      <div className="retention-field">
        <label htmlFor={id}>{t('Meses de detalhe guardados')}</label>
        <NumberField
          id={id}
          aria-describedby={`${id}-price`}
          value={months}
          min={LOG_RETENTION_MIN}
          max={LOG_RETENTION_MAX}
          onCommit={change}
        />
        <span id={`${id}-price`} className="retention-price">
          {formatSize(detailRows * LOG_BYTES_PER_ROW)} · {tn(detailMonths, '{n} mês com detalhe', '{n} meses com detalhe')}
        </span>
      </div>
      {months > 12 && <Note>{t('Acima de 12 meses o arquivo do board pode passar do teto de 10 MB.')}</Note>}
      <p className="retention-text">
        {t(
          'Fora da janela some o detalhe por card, o lead time de card antigo e o inventário de ferramentas e skills. Os totais por mês nunca expiram.',
        )}
      </p>
    </section>
  );
}
