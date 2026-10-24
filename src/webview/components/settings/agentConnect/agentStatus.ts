// A situação de cada agente na lista de Conectar agentes, numa palavra: o que a pessoa precisa saber para decidir o
// próximo passo (instalar, conectar, ligar, testar). O "Padrão" fica à parte, num selo: ele se soma à situação.
import type { AgentListItem } from '../../../../shared/agentConnect';
import { isReadyProfile, modeLabel, toolLabel, type AiProfile } from '../../../../shared/aiProfiles';
import type { ConnectState } from '../../../../shared/connect';
import { t } from '../../../i18n';

export type AgentState = 'connected' | 'connecting' | 'waiting' | 'failed' | 'enabled' | 'off' | 'missing' | 'test-only' | 'unavailable';

export const STATE_LABEL: Record<AgentState, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  waiting: 'Espera você',
  failed: 'O Conectar parou',
  enabled: 'Ligado',
  off: 'Desligado',
  missing: 'Não instalado',
  'test-only': 'Só teste',
  unavailable: 'Indisponível',
};

export const STATE_COLOR: Record<AgentState, 'indigo' | 'amber' | 'red' | 'gray'> = {
  connected: 'indigo',
  connecting: 'gray',
  waiting: 'amber',
  failed: 'red',
  enabled: 'indigo',
  off: 'gray',
  missing: 'amber',
  'test-only': 'gray',
  unavailable: 'gray',
};

/**
 * A situação do agente: o Conectar em curso ou parado vence (é o que espera a pessoa); depois, ligado (conectado
 * quando o Conectar terminou), desligado ou não instalado. O agente só do registro serve para teste.
 */
export function agentState(
  item: Pick<AgentListItem, 'profile' | 'registry'>,
  connections: Record<string, ConnectState> | undefined,
  installed: Record<string, boolean>,
): AgentState {
  const p = item.profile;
  if (!p) return item.registry?.available ? 'test-only' : 'unavailable';
  const c = connections?.[p.id];
  if (c?.status === 'running') return 'connecting';
  if (c?.status === 'waiting') return 'waiting';
  if (c?.status === 'failed') return 'failed';
  if (p.enabled) return c?.status === 'connected' ? 'connected' : 'enabled';
  return installed[p.id] === false ? 'missing' : 'off';
}

/** "Claude Code · CLI", "Cópia de Claude Code · CLI", "Personalizado · CLI": o tipo do perfil e o modo. */
export function profileKind(p: AiProfile): string {
  const mode = modeLabel(p.mode);
  if (isReadyProfile(p)) return `${toolLabel(p.tool)} · ${mode}`;
  return p.kind === 'custom' ? t('Personalizado · {mode}', { mode }) : t('Cópia de {base}', { base: `${toolLabel(p.tool)} · ${mode}` });
}
