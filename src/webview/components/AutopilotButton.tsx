import { cardRef } from '../../shared/model';
import { columnOf, isLive } from '../../shared/selectors';
import { yoloStories } from '../../shared/story';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { ai, cards } from '../commands';
import { useAction } from '../useAction';
import { confirmYoloOn, yoloStopChoices } from './card/YoloBar';
import { Button, IconYolo } from './ui';

/**
 * Modo autônomo do board, no topo: liga, pausa ou retoma o autopiloto das histórias.
 * - Sem história em modo autônomo: **Ligar modo autônomo** põe no modo todas as histórias ainda não
 *   concluídas (ou só as marcadas, quando há seleção), que entram na fila na ordem do board, e o
 *   autopiloto começa a tocá-las respeitando os tetos de execuções em paralelo.
 * - Tocando (aceso): um clique pausa e interrompe a IA.
 * - Pausado (apagado): um clique retoma; as histórias ainda fora do modo (ou as marcadas) entram junto.
 */
export function AutopilotButton() {
  const state = useBoardStore((s) => s.state)!;
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const clearSelected = useBoardStore((s) => s.clearSelected);
  const ask = useBoardStore((s) => s.ask);
  const dontWarnYolo = useBoardStore((s) => s.dontWarnYolo);
  const setDontWarnYolo = useBoardStore((s) => s.setDontWarnYolo);
  const untilName = useBoardStore((s) => s.yoloUntilName);
  const setUntilName = useBoardStore((s) => s.setYoloUntilName);
  const queue = yoloStories(state);
  const { active, note } = state.autopilot;
  // pausar e retomar esperam o host: o botão mostra o spinner até o autopiloto mudar de estado
  const toggle = useAction((fn: () => Promise<void>) => fn());
  // as histórias em aberto que ainda não estão no modo: as marcadas, quando há seleção; senão, todas
  const open = state.cards.filter((c) => !c.parentId && isLive(c) && columnOf(state, c)?.category === 'open');
  const selected = open.filter((c) => selectedIds.has(c.id));
  const scope = selected.length ? selected : open;
  const toEnable = scope.filter((c) => !c.yolo);
  if (!open.length && !active) return null;
  const detail = note ? ` ${t(note)}` : '';

  const enable = () => {
    if (!toEnable.length) return void toggle.run(() => ai.resumeAutopilot());
    confirmYoloOn({
      ask,
      dontWarnYolo,
      setDontWarnYolo,
      stops: yoloStopChoices(state, toEnable),
      untilName,
      setUntilName,
      title: selected.length
        ? t('Ligar o modo autônomo em {n} história(s) selecionada(s)?', { n: toEnable.length })
        : t('Ligar o modo autônomo em todas as {n} história(s) em aberto?', { n: toEnable.length }),
      confirmLabel: t('Ligar modo autônomo'),
      onEnable: (until) =>
        void toggle.run(async () => {
          await cards.setYoloMany(
            toEnable.map((c) => c.id),
            true,
            until,
          );
          // ligar numa história religa o autopiloto; retomar explícito cobre a pausa gravada no board
          if (queue.length) await ai.resumeAutopilot();
          clearSelected();
        }),
    });
  };

  const label = active
    ? t('Modo autônomo: tocando {n} história(s) em fila.{detail} Clique para pausar e interromper a IA.', { n: queue.length, detail })
    : queue.length
      ? t('Modo autônomo pausado.{detail} {n} história(s) esperando. Clique para retomar.', { n: queue.length, detail })
      : selected.length
        ? t('Ligar o modo autônomo nas histórias selecionadas ({refs}): elas entram na fila e a IA as toca sozinha.', {
            refs: selected.map(cardRef).join(', '),
          })
        : t('Ligar o modo autônomo em todas as histórias em aberto: elas entram na fila e a IA as toca sozinha, na ordem do board.');
  const text = active ? t('Pausar modo autônomo') : queue.length ? t('Retomar modo autônomo') : t('Ligar modo autônomo');

  return (
    <Button
      variant="ghost"
      className={`autopilot ${active ? 'on' : 'off'}`}
      title={label}
      loading={toggle.busy}
      onClick={() => (active ? void toggle.run(() => ai.pauseAutopilot()) : enable())}
    >
      <IconYolo /> {text}
    </Button>
  );
}
