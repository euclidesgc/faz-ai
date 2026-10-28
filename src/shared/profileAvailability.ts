// Se um perfil de IA pode responder agora: um só predicado para os seletores (chat, campo Modelo do card, agentes,
// regras) e para o `ready` do get_models. O perfil ligado mas sem a CLI, sem login, com a conexão falha ou pela
// metade, ou que o board não sabe rodar, não é oferecido: escolhê-lo só daria erro na hora de executar.
import { cliProblem } from './requirements';
import type { BoardState } from './model';
import { limitHolds, pauseOf } from './usageLimit';

export type ProfileBlock = 'off' | 'cli' | 'signin' | 'expired' | 'unsupported' | 'connection';

type AvailabilityState = Pick<BoardState, 'requirements' | 'authExpired' | 'aiRunUnsupportedBy' | 'connections' | 'usageLimit'> & {
  board: Pick<BoardState['board'], 'aiProfiles'>;
};

/** Por que o perfil não pode responder agora; null quando pode. O limite de uso não entra: ele é por modelo e passa. */
export function profileBlock(s: AvailabilityState, profileId: string): ProfileBlock | null {
  const profile = s.board.aiProfiles.find((p) => p.id === profileId);
  if (!profile?.enabled) return 'off';
  const cli = cliProblem(s, profileId);
  if (cli) return cli;
  if (s.aiRunUnsupportedBy?.[profileId]) return 'unsupported';
  const connection = s.connections?.[profileId];
  if (connection && (connection.status === 'failed' || (connection.status === 'waiting' && connection.needs))) return 'connection';
  return null;
}

export const profileAvailable = (s: AvailabilityState, profileId: string): boolean => profileBlock(s, profileId) === null;

/** Até quando o limite de uso segura as execuções automáticas do perfil; null sem pausa em vigor. */
export function limitUntil(s: Pick<BoardState, 'usageLimit'>, profileId: string, now: number): number | null {
  return limitHolds(s, profileId, now) ? (pauseOf(s, profileId)?.resumeAt ?? null) : null;
}
