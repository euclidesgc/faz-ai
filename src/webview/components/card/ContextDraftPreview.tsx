import type { ContextDraftDiagnostic, ContextDraftOrigin, ContextDraftResolution } from '../../../shared/contextDraftResolution';
import { t } from '../../i18n';

export const CONTEXT_DRAFT_ORIGINS: Record<ContextDraftOrigin, string> = {
  'card-phase': 'Fase no card',
  'card-action': 'Ação no card',
  'workflow-phase': 'Fase no workflow',
  'workflow-action': 'Ação no workflow',
  'board-phase': 'Fase no board',
  'board-action': 'Ação no board',
  'agent-essential': 'Essencial do agente',
  'board-always': 'Sempre no board',
};
const DIAGNOSTICS: Record<ContextDraftDiagnostic['code'], string> = {
  'admission-unavailable': 'Admissão indisponível (#729). Esta prévia não autoriza execução.',
  'invalid-target': 'O alvo da atividade não pertence ao board ou à fase indicada.',
  'invalid-selection': 'Seleção de contexto inválida.',
  'agent-required': 'Escolha um agente válido para a atividade.',
  'contract-required': 'O agente ainda não tem contrato v1.',
  'invalid-contract': 'O contrato do agente é inválido.',
  'missing-artifact': 'Recurso ausente.',
  'disabled-artifact': 'Recurso desligado ou indisponível.',
  'wrong-kind': 'O recurso tem um tipo diferente do esperado.',
  'mcp-outside-agent': 'MCP fora do contrato do agente.',
  'missing-input': 'Anexo de entrada ausente.',
  'input-outside-board': 'Anexo de entrada de outro board.',
};

export function ContextDraftPreview({ preview }: { preview: ContextDraftResolution }) {
  return (
    <section className="execution-context" aria-label={t('Prévia do contrato')}>
      <h3>{t('Prévia do contrato')}</h3>
      <dl className="execution-context-items">
        {preview.items.map((item) => (
          <div key={item.artifactId}>
            <dt>{item.name}</dt>
            <dd>{item.origins.map((origin) => t(CONTEXT_DRAFT_ORIGINS[origin])).join(' · ')}</dd>
          </div>
        ))}
      </dl>
      <ul>
        {preview.diagnostics.map((d) => (
          <li key={`${d.code}:${d.artifactId ?? ''}`}>
            {t(DIAGNOSTICS[d.code])}
            {d.artifactId && (
              <>
                {' '}
                <code>{d.artifactId}</code>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
