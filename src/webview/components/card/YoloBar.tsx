import type { Card } from '../../../shared/model';
import { cardRef } from '../../../shared/model';
import { storyOf } from '../../../shared/story';
import { useBoardStore } from '../../store/boardStore';
import { usePending } from '../../usePending';
import { t } from '../../i18n';
import { ai, cards } from '../../commands';
import { Button, IconYolo } from '../ui';

/**
 * O aviso sobre o que o modo autônomo faz, mostrado na confirmação de ligar (aqui e na ação em lote de
 * `SelectionBar`). Função (não constante) porque `t()` precisa ser chamada em tempo de render, para pegar
 * o idioma certo.
 */
export const yoloWarning = (): string =>
  t(
    'A IA toca esta história sozinha, do Backlog até o pull request: cria os documentos de cada fase, o plano e as sub-tarefas, implementa uma por uma e abre o PR. Nada é pedido a você: não há aprovação, pergunta nem confirmação. A IA roda com a permissão "Sem restrições" (altera arquivos e roda comandos) e não faz o merge. As próximas histórias em modo autônomo entram na fila e viram uma pilha de pull requests. Pare a qualquer hora pelo botão do topo do board.',
  );

/** Modo autônomo (YOLO) da história: liga e desliga e mostra o andamento do autopiloto. A sub-tarefa mostra o da história. */
export function YoloBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  // a caixa reflete o clique na hora e fica travada até o boardState confirmar (ou o tempo esgotar)
  const [yolo, applying, markYolo] = usePending(card.yolo);
  if (card.deletedAt !== null || card.archivedAt !== null) return null;
  const story = storyOf(state, card) ?? card;
  const { autopilot } = state;

  if (card.parentId)
    return story.yolo ? (
      <div className="drawer-workspace yolo-bar">
        <span title={t('A IA trabalha nesta sub-tarefa sem pedir aprovação, como na história')}>
          <IconYolo /> {t('Modo autônomo, da história {ref}', { ref: cardRef(story) })}
        </span>
      </div>
    ) : null;

  const warning = yoloWarning();
  const toggle = (enabled: boolean) => {
    if (!enabled) {
      markYolo(false);
      return cards.setYolo(card.id, false);
    }
    ask({
      title: t('Ligar o modo autônomo em {ref}?', { ref: cardRef(card) }),
      message: warning,
      confirmLabel: t('Ligar o modo autônomo'),
      danger: true,
      onConfirm: () => {
        markYolo(true);
        cards.setYolo(card.id, true);
      },
    });
  };

  return (
    <div className="drawer-workspace yolo-bar">
      <label title={warning}>
        <input type="checkbox" checked={yolo} disabled={applying} onChange={(e) => toggle(e.target.checked)} /> <IconYolo />{' '}
        {t('Modo autônomo')}
      </label>
      {card.yolo && (
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
