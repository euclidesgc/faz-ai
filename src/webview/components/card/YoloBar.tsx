import type { Card } from '../../../shared/model';
import { cardRef } from '../../../shared/model';
import { storyOf } from '../../../shared/story';
import { useBoardStore, type DialogSpec } from '../../store/boardStore';
import { t } from '../../i18n';
import { ai } from '../../commands';
import { Button, IconYolo } from '../ui';

/**
 * O aviso sobre o que o modo autônomo faz, mostrado na confirmação de ligar (aqui, em `CardFooter` e na
 * ação em lote de `SelectionBar`). Função (não constante) porque `t()` precisa ser chamada em tempo de
 * render, para pegar o idioma certo.
 */
export const yoloWarning = (): string =>
  t(
    'A IA toca esta história sozinha, do Backlog ao pull request — sem aprovação, pergunta ou confirmação. Pare a qualquer hora pelo botão do topo do board.',
  );

/**
 * Confirmação de ligar o modo autônomo, compartilhada por `YoloBar`, `CardFooter` e `SelectionBar`: pula o
 * diálogo quando a pessoa já marcou "não avisar novamente" (`dontWarnYolo`), senão mostra o aviso com esse
 * checkbox e só liga (`onEnable`) ao confirmar.
 */
export function confirmYoloOn(opts: {
  ask(dialog: DialogSpec | null): void;
  dontWarnYolo: boolean;
  setDontWarnYolo(value: boolean): void;
  title: string;
  confirmLabel?: string;
  onEnable(): void;
}): void {
  if (opts.dontWarnYolo) {
    opts.onEnable();
    return;
  }
  opts.ask({
    title: opts.title,
    message: yoloWarning(),
    confirmLabel: opts.confirmLabel ?? t('Ligar o modo autônomo'),
    danger: true,
    checkbox: { label: t('Não avisar novamente') },
    onConfirm: (_choice, checkboxChecked) => {
      if (checkboxChecked) opts.setDontWarnYolo(true);
      opts.onEnable();
    },
  });
}

/**
 * Liga/desliga o modo autônomo de um card (história): desligar aplica direto; ligar passa por
 * `confirmYoloOn`, que mostra (ou não, conforme `dontWarnYolo`) a confirmação com o aviso. Usado por
 * `YoloBar` e por `CardFooter` (o controle fora do detalhe).
 */
export function useYoloToggle(card: Card): { effectiveYolo: boolean; toggle(enabled: boolean): void } {
  const ask = useBoardStore((s) => s.ask);
  const yoloOverrides = useBoardStore((s) => s.yoloOverrides);
  const setYoloOptimistic = useBoardStore((s) => s.setYoloOptimistic);
  const dontWarnYolo = useBoardStore((s) => s.dontWarnYolo);
  const setDontWarnYolo = useBoardStore((s) => s.setDontWarnYolo);
  const effectiveYolo = yoloOverrides.get(card.id) ?? card.yolo;

  const toggle = (enabled: boolean) => {
    if (!enabled) return setYoloOptimistic(card.id, false);
    confirmYoloOn({
      ask,
      dontWarnYolo,
      setDontWarnYolo,
      title: t('Ligar o modo autônomo em {ref}?', { ref: cardRef(card) }),
      onEnable: () => setYoloOptimistic(card.id, true),
    });
  };

  return { effectiveYolo, toggle };
}

/** Modo autônomo (YOLO) da história: liga e desliga e mostra o andamento do autopiloto. A sub-tarefa mostra o da história. */
export function YoloBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const { autopilot } = state;
  const { effectiveYolo, toggle } = useYoloToggle(card);
  if (card.deletedAt !== null || card.archivedAt !== null) return null;
  const story = storyOf(state, card) ?? card;

  if (card.parentId)
    return story.yolo ? (
      <div className="drawer-workspace yolo-bar">
        <span title={t('A IA trabalha nesta sub-tarefa sem pedir aprovação, como na história')}>
          <IconYolo /> {t('Modo autônomo, da história {ref}', { ref: cardRef(story) })}
        </span>
      </div>
    ) : null;

  const warning = yoloWarning();

  return (
    <div className="drawer-workspace yolo-bar">
      <label title={warning}>
        <input type="checkbox" checked={effectiveYolo} onChange={(e) => toggle(e.target.checked)} /> <IconYolo /> {t('Modo autônomo')}
      </label>
      {effectiveYolo && (
        <>
          <span className="muted small">
            {autopilot.note
              ? t(autopilot.note)
              : autopilot.active
                ? t('O modo autônomo está tocando a fila.')
                : t('O modo autônomo está pausado.')}
          </span>
          {autopilot.active ? (
            <Button variant="ghost" size="small" onClick={() => ai.pauseAutopilot()}>
              {t('Pausar modo autônomo')}
            </Button>
          ) : (
            <Button variant="ghost" size="small" onClick={() => ai.resumeAutopilot()}>
              {t('Retomar modo autônomo')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
