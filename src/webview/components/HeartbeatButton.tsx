import { heartbeatState } from '../../shared/runner';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { settings } from '../commands';
import { useAction } from '../useAction';
import { Button, IconHeart } from './ui';

/**
 * Coração do heartbeat, no topo do board: bate enquanto o heartbeat está rodando; parado, cinza e imóvel quando
 * está desligado ou não consegue rodar. Um clique liga e desliga (parado por falta de ligação ou de ferramenta, não há o que ligar).
 */
export function HeartbeatButton({ offline }: { offline: boolean }) {
  const state = useBoardStore((s) => s.state)!;
  const { runner } = state.board;
  const beat = heartbeatState(runner, { offline, unsupported: state.aiRunUnsupported });
  // ligar e desligar esperam o host: o coração fica travado (com o spinner) até a resposta
  const toggle = useAction((heartbeat: boolean) => settings.updateBoard({ runner: { heartbeat } }));
  const every = t('a cada {n} min', { n: runner.heartbeatMinutes });
  const label =
    beat.kind === 'beating'
      ? t('Desligar heartbeat. Ligado agora: o board chama a IA {every} quando há pendência com ela.', { every })
      : beat.kind === 'off'
        ? t('Ligar heartbeat: o board passa a chamar a IA {every} quando há pendência com ela.', { every })
        : t('Heartbeat parado: {reason}', { reason: t(beat.reason) });

  return (
    <Button
      variant="icon"
      className={`heartbeat ${beat.kind}`}
      title={label}
      aria-label={label}
      aria-disabled={beat.kind === 'stopped'}
      loading={toggle.busy}
      onClick={() => beat.kind !== 'stopped' && void toggle.run(beat.kind === 'off')}
    >
      <IconHeart />
    </Button>
  );
}
