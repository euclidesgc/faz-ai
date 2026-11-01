import { profileLabel } from '../../shared/aiProfiles';
import { heldProfiles } from '../../shared/usageLimit';
import { formatClock, t } from '../i18n';
import { useBoardStore } from '../store/boardStore';
import { useNow } from '../useNow';

/**
 * A fila pausada pelo limite de uso do plano (história #1047), uma linha por perfil de CLI: logo abaixo da barra
 * superior, como o aviso "Sem ligação". Usa o relógio da página para sumir quando a pausa vence, sem esperar outro
 * estado do host. Perfil que não existe mais no board fica de fora.
 */
export function UsageLimitBanner() {
  const state = useBoardStore((s) => s.state);
  const now = useNow();
  if (!state) return null;
  const held = heldProfiles(state, now).filter((p) => state.board.aiProfiles.some((a) => a.id === p.profileId));
  if (!held.length) return null;
  return (
    <>
      {held.map(({ profileId, resumeAt, source }) => {
        const params = { profile: profileLabel(state.board, profileId), time: formatClock(resumeAt, now) };
        return (
          <div
            key={profileId}
            className="banner warn usage-limit"
            role="status"
            title={t(
              'O perfil esgotou o limite de uso do plano: o autopiloto e o heartbeat não disparam nada dele até a hora indicada; os outros perfis seguem. A execução pedida à mão continua liberada.',
            )}
          >
            {source === 'reset'
              ? t('Limite de uso do {profile}: a fila dele retoma às {time}.', params)
              : t('Limite de uso do {profile}: nova tentativa às {time}.', params)}
          </div>
        );
      })}
    </>
  );
}
