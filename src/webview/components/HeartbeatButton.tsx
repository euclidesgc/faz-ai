import { heartbeatState } from '../../shared/runner';
import { useBoardStore } from '../store/boardStore';
import { settings } from '../commands';
import { Button, IconHeart } from './ui';

/**
 * Coração do heartbeat, no topo do board: bate enquanto o heartbeat está rodando; parado, cinza e imóvel quando
 * está desligado ou não consegue rodar. Um clique liga e desliga (parado por falta de ligação ou de ferramenta, não há o que ligar).
 */
export function HeartbeatButton({ offline }: { offline: boolean }) {
  const state = useBoardStore((s) => s.state)!;
  const { runner } = state.board;
  const beat = heartbeatState(runner, { offline, unsupported: state.aiRunUnsupported });
  const every = `a cada ${runner.heartbeatMinutes} min`;
  const label =
    beat.kind === 'beating'
      ? `Heartbeat ligado: o board chama a IA ${every} quando há pendência com ela. Clique para desligar.`
      : beat.kind === 'off'
        ? `Heartbeat desligado. Clique para ligar: o board passa a chamar a IA ${every} quando há pendência com ela.`
        : `Heartbeat parado: ${beat.reason}`;

  return (
    <Button
      variant="icon"
      className={`heartbeat ${beat.kind}`}
      title={label}
      aria-label={label}
      aria-pressed={runner.heartbeat}
      aria-disabled={beat.kind === 'stopped'}
      onClick={() => beat.kind !== 'stopped' && settings.updateBoard({ runner: { heartbeat: beat.kind === 'off' } })}
    >
      <IconHeart />
    </Button>
  );
}
