import { useState } from 'react';
import { isReadyProfile, verifiableProfile, type AiProfile } from '../../../../shared/aiProfiles';
import { toolModeEntry } from '../../../../shared/aiTools';
import { settings } from '../../../commands';
import { t } from '../../../i18n';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, DeleteButton } from '../../ui';
import { reviewText } from './connectProgress';

/** O perfil pronto de um modo que o catálogo oferece: é ele que o Conectar conduz. */
export const connectable = (p: AiProfile): boolean => isReadyProfile(p) && !!toolModeEntry(p.tool, p.mode);

/**
 * As ações do perfil no fim da aba Conexão: duplicar e, para cópias e personalizados (que não passam pelo
 * Conectar), a ciência do regime, a verificação das capacidades, editar e apagar. As capacidades verificadas e o
 * isolamento ficam no Verificar ambiente, que lê as provas do host.
 */
export function ProfileActions({ profile, onEdit }: { profile: AiProfile; onEdit(profile: AiProfile): void }) {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  const openConnect = useBoardStore((s) => s.openConnect);
  const duplicate = useAction((id: string) => settings.duplicateAiProfile(id));
  const remove = useAction((id: string) => settings.removeAiProfile(id));
  const review = useAction((id: string, accept: boolean) => settings.reviewAiProfile(id, accept));
  const [verifying, setVerifying] = useState(false);
  const standard = state.board.aiTool === profile.id;
  const reviewed = state.board.runner.compatibilityReviews?.[profile.id] ?? null;
  const customAcp = profile.kind === 'custom' && profile.mode === 'acp';
  // o pronto do catálogo revoga a ciência nos detalhes do Conectar; aqui só quem não passa por ele
  const ownReview = !connectable(profile) && (reviewed !== null || verifiableProfile(profile));
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
    <>
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
      <div className="row wrap end" aria-label={t('Ações do perfil')}>
        {ownReview && (
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
    </>
  );
}
