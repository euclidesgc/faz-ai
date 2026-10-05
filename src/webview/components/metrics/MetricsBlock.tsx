import { useId, type ReactNode } from 'react';
import type { MetricsPanelResult, MetricsPanelSections } from '../../../shared/metrics';
import { t } from '../../i18n';
import { formatMonth } from './format';
import { Note } from './Note';

/**
 * Até onde um bloco enxerga (RF-24, RF-29). `series` = a série inteira, inclusive os meses arquivados;
 * `detail` = só o detalhe guardado, que começa em `detailFrom` e some com a retenção.
 */
export type MetricsHorizon = 'series' | 'detail';

/**
 * O aviso de horizonte de um bloco, com o `Note` do painel (sem alterá-lo). Quem depende do detalhe diz
 * desde quando ele existe; quem não depende diz que alcança toda a série (RF-29). É um aviso por bloco,
 * não um no topo: dois blocos lado a lado podem ter horizontes diferentes.
 */
export function HorizonNote({ horizon, result, id }: { horizon: MetricsHorizon; result: MetricsPanelResult; id?: string }) {
  if (horizon === 'series') {
    return (
      <Note id={id} data-horizon="series">
        {t('Alcança toda a série do período, inclusive os meses já arquivados.')}
      </Note>
    );
  }
  return (
    <Note id={id} data-horizon="detail">
      {result.detailFrom
        ? t('Só alcança o detalhe guardado, desde {month}: o que aconteceu antes não aparece aqui.', {
            month: formatMonth(result.detailFrom, 'long'),
          })
        : t('Este bloco depende do detalhe guardado, e o board ainda não tem nenhum.')}
    </Note>
  );
}

/** O que todo componente de bloco (cards 174 a 177) recebe: o resultado inteiro e as seções dele. */
export interface MetricsBlockProps {
  result: MetricsPanelResult;
  sections: MetricsPanelSections;
}

interface MetricsBlockFrameProps {
  /** título do bloco (h3); o do subbloco de um bloco duplo é h4 */
  title: string;
  /** o que o bloco mostra, em uma ou duas frases */
  intro: string;
  horizon: MetricsHorizon;
  result: MetricsPanelResult;
  /** nível do título: 3 para um bloco, 4 para uma metade de bloco duplo */
  level?: 3 | 4;
  /** o componente do bloco (cards 174 a 177) entra aqui */
  children?: ReactNode;
}

/**
 * O contêiner de um bloco do painel: região com nome, título, texto explicativo, o aviso de horizonte e
 * o corpo. Os componentes finais só preenchem o corpo. As tabelas rolam dentro do próprio corpo
 * (`.metrics-block-body`), nunca empurram a página (RF-40).
 */
export function MetricsBlock({ title, intro, horizon, result, level = 3, children }: MetricsBlockFrameProps) {
  const uid = useId();
  const titleId = `${uid}-t`;
  const Heading = level === 3 ? 'h3' : 'h4';
  return (
    <section className="metrics-block" aria-labelledby={titleId} data-horizon={horizon}>
      <Heading id={titleId} className="metrics-block-title">
        {title}
      </Heading>
      <p className="metrics-block-intro">{intro}</p>
      <HorizonNote horizon={horizon} result={result} />
      <div className="metrics-block-body">{children}</div>
    </section>
  );
}

/**
 * Um bloco com duas metades lado a lado (os dois rankings). Cada metade é um `MetricsBlock` com o seu
 * título, o seu texto e o seu horizonte (RF-24); o grupo só dá o título comum e a grade `auto-fit`.
 */
export function MetricsBlockGroup({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const uid = useId();
  const titleId = `${uid}-t`;
  return (
    <section className="metrics-block-group" aria-labelledby={titleId}>
      <h3 id={titleId} className="metrics-block-title">
        {title}
      </h3>
      <p className="metrics-block-intro">{intro}</p>
      <div className="metrics-block-pair">{children}</div>
    </section>
  );
}
