import { t } from '../../i18n';
import { useBoardStore } from '../../store/boardStore';
import type { MetricsPanelResult } from '../../../shared/metrics';
import { MetricsBlock, MetricsBlockGroup } from './MetricsBlock';

/**
 * Os cinco blocos abaixo da série por mês (card 173): cortes, permanência por fase, lead time, os dois
 * rankings lado a lado e o inventário. Cada um é um contêiner com título, texto e aviso de horizonte
 * (`MetricsBlock`); o corpo fica para o card indicado na linha de montagem.
 *
 * Pontos de montagem: UMA linha comentada por bloco, com o card que a preenche e a sugestão de props.
 * Quem faz o bloco troca só a sua linha, dentro do `MetricsBlock` dele, e não mexe nas outras. Todo
 * componente de bloco recebe `MetricsBlockProps` (`result` e `sections`); a dimensão, a medida e a
 * ordenação vêm da store (`metricsBlocks`, fora de `persist()`) e `setMetricsBlocks` as troca.
 *
 * Horizonte (RF-24, RF-29): cortes e ranking de fases alcançam a série inteira e dizem isso; ranking
 * por card, permanência, lead time e inventário só veem o detalhe e trazem o aviso com o mês de início.
 */
export function MetricsBlocks({ result }: { result: MetricsPanelResult }) {
  const sections = result.sections;
  const blocks = useBoardStore((s) => s.metricsBlocks);
  const setBlocks = useBoardStore((s) => s.setMetricsBlocks);
  // enquanto os quatro cards de baixo não montam seus componentes, estes valores só esperam por eles
  void sections;
  void blocks;
  void setBlocks;

  return (
    <div className="metrics-blocks">
      <MetricsBlock
        title={t('Onde o consumo aconteceu')}
        intro={t('O consumo do período repartido por fase, tipo de card, modelo, ferramenta, esforço ou perfil.')}
        horizon="series"
        result={result}
      >
        {/* card 175 Cortes: <Breakdown result={result} sections={sections} dim={blocks.dim} measure={blocks.measure} onChange={setBlocks} /> */}
      </MetricsBlock>

      <MetricsBlock
        title={t('Quanto tempo o card fica na fase')}
        intro={t('Média e mediana de cada passagem por uma fase, e quantos cards estão nela agora.')}
        horizon="detail"
        result={result}
      >
        {/* card 176 Permanência: <DwellTable result={result} sections={sections} /> */}
      </MetricsBlock>

      <MetricsBlock
        title={t('Lead time')}
        intro={t('Do primeiro registro do card até a conclusão, dos cards concluídos no período.')}
        horizon="detail"
        result={result}
      >
        {/* card 176 Lead time: <LeadTable result={result} sections={sections} sort={blocks.leadSort} onSort={(leadSort) => setBlocks({ leadSort })} /> */}
      </MetricsBlock>

      <MetricsBlockGroup
        title={t('Mais caros e mais demorados')}
        intro={t('Os dois rankings olham horizontes diferentes: leia o aviso de cada um antes de compará-los.')}
      >
        <MetricsBlock
          title={t('Fases mais caras')}
          intro={t('As fases ordenadas pelo consumo, com a série inteira do período.')}
          horizon="series"
          result={result}
          level={4}
        >
          {/* card 174 Ranking de fases: <RankingTable ... rows das fases de sections.breakdowns, sort={blocks.phaseSort} onSort={(phaseSort) => setBlocks({ phaseSort })} /> */}
        </MetricsBlock>
        <MetricsBlock
          title={t('Cards mais caros')}
          intro={t('Os cards ordenados pelo consumo, com as execuções que o detalhe ainda guarda.')}
          horizon="detail"
          result={result}
          level={4}
        >
          {/* card 174 Ranking por card: <RankingTable ... rows de sections.cards, sort={blocks.cardSort} onSort={(cardSort) => setBlocks({ cardSort })} /> */}
        </MetricsBlock>
      </MetricsBlockGroup>

      <MetricsBlock
        title={t('O que a IA usou')}
        intro={t('Ferramentas, ferramentas MCP, agentes e skills que apareceram nas execuções.')}
        horizon="detail"
        result={result}
      >
        {/* card 177 Inventário: <Inventory result={result} sections={sections} /> */}
      </MetricsBlock>
    </div>
  );
}
