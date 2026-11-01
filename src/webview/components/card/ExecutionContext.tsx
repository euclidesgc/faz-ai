import type { ContextOrigin } from '../../../shared/contextSources';
import type { ExecutionContextPreview } from '../../../shared/executionContext';
import { t } from '../../i18n';
import { formatNumber } from '../metrics/format';
import { Summary } from '../ui';

export const CONTEXT_ORIGINS: Record<ContextOrigin, string> = {
  board: 'Servidor obrigatório do board',
  always: 'Sempre no board',
  agent: 'Configuração do agente',
  card: 'Escolha no card',
  phase: 'Agente da fase',
  story: 'Agente da história',
  'story-phase': 'Agente da fase da história',
  default: 'Agente padrão das instruções',
};

const KINDS = { agent: 'Agente', subagent: 'Subagente', rule: 'Rule', skill: 'Skill', mcp: 'Servidor MCP' };

/** Proveniência e limitações da configuração atual; abrir a prévia não dispara comandos. */
export function ExecutionContext({ preview, agent = false }: { preview: ExecutionContextPreview; agent?: boolean }) {
  return (
    <details className="execution-context">
      <Summary>{t('Contexto da execução')}</Summary>
      <p className="muted small">
        {agent
          ? t('Prévia do rascunho com os itens Sempre do board. O card e a fase podem acrescentar contexto na execução.')
          : t('Configuração efetiva atual, resolvida pelo manifesto da execução. Uma linha por identidade, com todas as origens.')}
      </p>
      <p>
        {t('Contexto inicial estimado: cerca de {tokens} tokens, sem os itens não medidos.', {
          tokens: formatNumber(preview.estimate.total),
        })}
      </p>
      <dl className="execution-context-items">
        {preview.items.map((item) => (
          <div key={item.id}>
            <dt>
              <span className="muted small">{t(KINDS[item.kind])}</span> <code>{item.name}</code>
            </dt>
            <dd>
              <span>{item.origins.map((origin) => t(CONTEXT_ORIGINS[origin])).join(' · ')}</span>
              <span className="muted small">
                {item.tokens === null
                  ? t('Tamanho não medido')
                  : t('Cerca de {tokens} tokens iniciais', { tokens: formatNumber(item.tokens) })}
              </span>
              {item.location && <code className="muted small">{item.location}</code>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="context-notes">
        <p>{t('Itens selecionados por várias origens são contabilizados uma vez por identidade.')}</p>
        {preview.overlaps.map((overlap, index) => (
          <p key={index}>
            {t('Possível sobreposição: {agents} repetem um parágrafo de {characters} caracteres.', {
              agents: overlap.agents.join(', '),
              characters: formatNumber(overlap.characters),
            })}
          </p>
        ))}
        <p>
          {t(
            'A comparação de sobreposição cobre parágrafos idênticos das instruções dos agentes; o conteúdo de rules e skills não é comparado.',
          )}
        </p>
        <p>
          {preview.enforcement.mcp === 'enforced'
            ? t('A seleção de servidores MCP é imposta pelo executor.')
            : t('A seleção de servidores MCP segue como orientação; este executor pode carregar outros servidores por conta própria.')}
        </p>
        <p>
          {preview.enforcement.tools === 'enforced'
            ? t('As restrições de ferramentas são impostas pelo executor.')
            : t('As restrições de ferramentas seguem como orientação; este executor não garante isolamento por ferramenta.')}
        </p>
        <p>
          {t(
            'Rules e skills seguem como instruções de leitura. O tamanho inicial não prevê o consumo total; o gasto medido aparece na aba Consumo.',
          )}
        </p>
        <p>{t('Consumo futuro: desconhecido. Esta prévia não estima o custo total da tarefa.')}</p>
      </div>
    </details>
  );
}
