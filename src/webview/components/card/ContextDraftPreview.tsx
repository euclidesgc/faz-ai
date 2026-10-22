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
  'admission-blocked': 'Não admitido pela execução',
  'invalid-target': 'O alvo da atividade não pertence ao board ou à fase indicada.',
  'invalid-selection': 'Seleção de contexto inválida.',
  'agent-required': 'Escolha um agente válido para a atividade.',
  'contract-required': 'O agente ainda não tem contrato v1.',
  'invalid-contract': 'O contrato do agente é inválido.',
  'missing-artifact': 'Recurso ausente.',
  'disabled-artifact': 'Recurso desligado ou indisponível.',
  'mcp-review-required': 'Este MCP exige revisão humana antes de executar.',
  'mcp-credential-missing': 'A configuração local deste MCP está ausente.',
  'wrong-kind': 'O recurso tem um tipo diferente do esperado.',
  'mcp-outside-agent': 'MCP fora do contrato do agente.',
  'missing-input': 'Anexo de entrada ausente.',
  'input-outside-board': 'Anexo de entrada de outro board.',
};

const REASONS: Record<string, string> = {
  'capability-not-verified': 'capacidade sem prova verificada do host',
  'environment-not-verified': 'ambiente do executor não verificado',
  'executor-unavailable': 'executor indisponível',
  'invalid-request': 'pedido de execução inválido',
  'mcp-outside-boundary': 'MCP fora do limite do agente ou do board',
  'mcp-operation-outside-boundary': 'operação MCP fora do limite',
  'native-executor-mismatch': 'restrição nativa de outro executor',
  'native-executor-required': 'restrição nativa sem executor definido',
  'unsupported-native-restriction': 'restrição nativa não reconhecida',
  'tool-mapping-unavailable': 'tradução de ferramentas indisponível para este executor',
  'compatibility-not-reviewed': 'compatibilidade sem revisão humana',
};
const CAPABILITIES: Record<string, string> = {
  conversation: 'conversa',
  artifacts: 'artefatos',
  permissions: 'permissões',
  mcp: 'MCP',
  delegation: 'delegação',
};
function admissionText(d: ContextDraftDiagnostic): string {
  const reason = d.reason ? t(REASONS[d.reason] ?? d.reason) : '';
  const capability = d.capability ? ` (${t(CAPABILITIES[d.capability] ?? d.capability)})` : '';
  return `${t(DIAGNOSTICS['admission-blocked'])}: ${reason}${capability}`;
}

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
            {d.code === 'admission-blocked' ? admissionText(d) : t(DIAGNOSTICS[d.code])}
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
