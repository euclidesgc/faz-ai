import { useState } from 'react';
import { Badge } from '@radix-ui/themes';
import type { AgentListItem } from '../../../../shared/agentConnect';
import {
  PROFILE_CAPABILITIES,
  contextEnforced,
  isReadyProfile,
  profileIsolation,
  verifiableProfile,
  type AiProfile,
} from '../../../../shared/aiProfiles';
import { toolModeEntry } from '../../../../shared/aiTools';
import { settings } from '../../../commands';
import { t } from '../../../i18n';
import { isolationText, leaksList } from '../../../isolation';
import { useAgentConnectStore } from '../../../store/agentConnectStore';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, DeleteButton, Summary } from '../../ui';
import { profileKind } from './agentStatus';
import { reviewText } from './connectProgress';

const capabilityName: Record<(typeof PROFILE_CAPABILITIES)[number], string> = {
  conversation: 'Conversa nova',
  artifacts: 'Controle de artefatos',
  permissions: 'Permissões',
  mcp: 'MCP',
  delegation: 'Delegação',
  cancellation: 'Cancelamento',
  output: 'Saída',
};

/** O perfil pronto de um modo que o catálogo oferece: é ele que o Conectar conduz. */
export const connectable = (p: AiProfile): boolean => isReadyProfile(p) && !!toolModeEntry(p.tool, p.mode);

/** O isolamento do perfil num selo: contexto vazio, o que ele carrega por conta própria, ou sem prova. */
function IsolationBadge({ profile }: { profile: AiProfile }) {
  const iso = profileIsolation(profile);
  const enforced = contextEnforced(profile);
  const leaks = iso.loads.length > 0 || !!iso.unrecognized;
  return (
    <Badge
      variant="soft"
      color={enforced ? 'indigo' : leaks ? 'amber' : 'gray'}
      title={leaks ? leaksList(iso) : isolationText(iso, enforced)}
    >
      {t(enforced ? 'Contexto vazio' : leaks ? 'Carrega por conta própria' : 'Sem prova de isolamento')}
    </Badge>
  );
}

/** Os detalhes do agente do registro: de onde ele vem e como o board o inicia nesta máquina. */
function RegistryFacts({ item }: { item: AgentListItem }) {
  const r = item.registry;
  if (!r) return null;
  return (
    <dl className="agent-facts">
      <dt>{t('Registro do ACP')}</dt>
      <dd>
        {r.id} · {r.version}
      </dd>
      {r.authors.length > 0 && (
        <>
          <dt>{t('Autores')}</dt>
          <dd>{r.authors.join(', ')}</dd>
        </>
      )}
      <dt>{t('Distribuição')}</dt>
      <dd>{r.distribution === 'binary' ? t('binário') : r.distribution}</dd>
      {r.command && (
        <>
          <dt>{t('Comando da sessão de teste')}</dt>
          <dd>
            <code>{[r.command, ...r.args].join(' ')}</code>
          </dd>
        </>
      )}
    </dl>
  );
}

/**
 * Os detalhes técnicos do agente: o tipo do perfil, o isolamento, as capacidades verificadas e a ciência do regime,
 * com as ações de cópia e personalizado (duplicar, editar, apagar). O que importa no dia a dia está na aba Conexão.
 */
export function AgentDetails({ item, onEdit }: { item: AgentListItem; onEdit(profile: AiProfile): void }) {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  const openConnect = useBoardStore((s) => s.openConnect);
  const status = useAgentConnectStore((s) => (item.profile ? s.statuses[item.profile.id] : undefined));
  const duplicate = useAction((id: string) => settings.duplicateAiProfile(id));
  const remove = useAction((id: string) => settings.removeAiProfile(id));
  const review = useAction((id: string, accept: boolean) => settings.reviewAiProfile(id, accept));
  const [verifying, setVerifying] = useState(false);
  const profile = item.profile;
  if (!profile) return <RegistryFacts item={item} />;
  const standard = state.board.aiTool === profile.id;
  const reviewed = state.board.runner.compatibilityReviews?.[profile.id] ?? null;
  const customAcp = profile.kind === 'custom' && profile.mode === 'acp';
  const iso = profileIsolation(profile);
  const verify = async () => {
    setVerifying(true);
    try {
      await settings.verifyAiProfile(profile.id);
    } catch {
      // a recusa já virou aviso na tela
    } finally {
      setVerifying(false);
    }
  };
  return (
    <div className="agent-details">
      <dl className="agent-facts">
        <dt>{t('Tipo')}</dt>
        <dd>{profileKind(profile)}</dd>
        <dt>{t('Isolamento')}</dt>
        <dd>
          <IsolationBadge profile={profile} />
        </dd>
        <dt>{t('Regime compatível')}</dt>
        <dd>{reviewed !== null ? t('com a sua ciência (revisão {n})', { n: reviewed }) : t('sem ciência')}</dd>
        {status?.version && (
          <>
            <dt>{t('Versão')}</dt>
            <dd>{status.version}</dd>
          </>
        )}
        {profile.kind === 'custom' && (
          <>
            <dt>{t('Medição')}</dt>
            <dd>{t('Não mede tokens nem custo')}</dd>
          </>
        )}
      </dl>
      <RegistryFacts item={item} />
      {customAcp && (
        <div className="ai-profile-notice ai-profile-legacy" role="note">
          <p>
            {t(
              'Personalizado pelo ACP: continua rodando como está. O caminho normal é conectar o agente do catálogo no modo ACP; perfis personalizados novos são só de CLI.',
            )}
          </p>
          {toolModeEntry(String(profile.config.acpAgent), 'acp') && (
            <ActionButton
              size="1"
              variant="soft"
              hint={t('Mostra o agente do catálogo deste perfil, para conectar.')}
              onClick={() => openConnect(String(profile.config.acpAgent))}
            >
              {t('Abrir o agente do catálogo')}
            </ActionButton>
          )}
        </div>
      )}
      <details className="ai-profile-evidence">
        <Summary>{t('Capacidades e evidências')}</Summary>
        <div className="ai-profile-capabilities">
          {PROFILE_CAPABILITIES.map((capability) => (
            <span key={capability}>
              {t(capabilityName[capability])}:{' '}
              <Badge variant="soft" color="gray">
                {t(
                  profile.capabilities?.[capability] === 'verified'
                    ? 'Verificado'
                    : profile.capabilities?.[capability] === 'partial'
                      ? 'Parcial'
                      : 'Desconhecido',
                )}
              </Badge>
            </span>
          ))}
        </div>
        <p className="muted">
          {t('Fonte e versão da evidência: não informadas. Uma declaração da pessoa não recebe selo de verificação.')}
        </p>
        {iso.checked && (
          <p className="muted">
            {t('Conferido na documentação em {date} · versão {version}', { date: iso.checked.date, version: iso.checked.version })}
          </p>
        )}
        {status && (
          <p className="muted">
            {t('Fonte da situação: sonda local do host. Versão da CLI: {version}.', { version: status.version ?? t('desconhecida') })}
          </p>
        )}
      </details>
      <div className="row wrap end">
        {/* quem não passa pelo Conectar (cópias, personalizados) dá ou revoga a ciência e refaz as provas aqui */}
        {(reviewed !== null || (!connectable(profile) && verifiableProfile(profile))) && (
          <ActionButton
            size="1"
            variant="soft"
            color="gray"
            hint={
              reviewed !== null
                ? t('Tira a sua ciência do regime compatível: o perfil deixa de rodar até você dar a ciência de novo.')
                : t('Grava a sua ciência do regime compatível para este perfil, depois de ler o que ele carrega.')
            }
            disabled={!profile.enabled || review.busy}
            disabledReason={t('Ligue o perfil antes.')}
            onClick={() =>
              reviewed !== null
                ? void review.run(profile.id, false)
                : ask({
                    title: t('Usar o perfil "{name}" com o contexto aberto?', { name: profile.name }),
                    message: reviewText(profile.name),
                    confirmLabel: t('Usar assim mesmo'),
                    onConfirm: () => void review.run(profile.id, true),
                  })
            }
          >
            {t(reviewed !== null ? 'Parar de usar com o contexto aberto' : 'Usar com o contexto aberto')}
          </ActionButton>
        )}
        {!connectable(profile) && verifiableProfile(profile) && (
          <ActionButton
            size="1"
            variant="soft"
            color="gray"
            hint={t('Refaz as sondas de capacidade deste perfil numa pasta descartável e grava as provas, sem gastar a sua conta.')}
            disabled={!profile.enabled || profile.credentials?.review === 'pending'}
            disabledReason={
              profile.credentials?.review === 'pending'
                ? t('Revise o perfil antes: salve a configuração dele no formulário.')
                : t('Ligue o perfil antes.')
            }
            loading={verifying}
            onClick={() => void verify()}
          >
            {t('Verificar capacidades')}
          </ActionButton>
        )}
        <ActionButton
          size="1"
          variant="soft"
          color="gray"
          hint={t('Cria uma cópia desativada, pendente de revisão.')}
          loading={duplicate.busy}
          onClick={() => void duplicate.run(profile.id)}
        >
          {t('Duplicar')}
        </ActionButton>
        {!isReadyProfile(profile) && (
          <ActionButton
            size="1"
            variant="soft"
            color="gray"
            hint={t('Edita os metadados; valores salvos não são mostrados.')}
            onClick={() => onEdit(profile)}
          >
            {t('Editar')}
          </ActionButton>
        )}
        {!isReadyProfile(profile) && !standard && (
          <DeleteButton
            variant="ghost"
            question={t('Apagar o perfil "{name}"?', { name: profile.name })}
            message={t('Os cards que mencionam este perfil manterão o identificador antigo.')}
            onConfirm={() => remove.run(profile.id)}
          >
            {t('Apagar')}
          </DeleteButton>
        )}
      </div>
    </div>
  );
}
