import { yoloStories } from '../../shared/story';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { ai } from '../commands';
import { Button, IconYolo } from './ui';

/**
 * Autopiloto das histórias em modo autônomo, no topo do board: aparece enquanto houver história na fila.
 * Aceso quando está tocando a fila, apagado quando está pausado; um clique pausa (e interrompe a IA) ou retoma.
 */
export function AutopilotButton() {
  const state = useBoardStore((s) => s.state)!;
  const queue = yoloStories(state);
  const { active, note } = state.autopilot;
  if (!queue.length && !active) return null;
  const detail = note ? ` ${t(note)}` : '';
  const label = active
    ? t('Modo autônomo: tocando {n} história(s) em fila.{detail} Clique para pausar e interromper a IA.', { n: queue.length, detail })
    : t('Modo autônomo pausado.{detail} {n} história(s) esperando. Clique para retomar.', { n: queue.length, detail });

  return (
    <Button
      variant="ghost"
      className={`autopilot ${active ? 'on' : 'off'}`}
      title={label}
      onClick={() => (active ? ai.pauseAutopilot() : ai.resumeAutopilot())}
    >
      <IconYolo /> {active ? t('Pausar modo autônomo') : t('Retomar modo autônomo')}
    </Button>
  );
}
