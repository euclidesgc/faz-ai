import { useBoardStore } from '../store/boardStore';
import { isCardCollapsed } from '../../shared/selectors';
import { t } from '../i18n';
import { cards } from '../commands';
import { yoloWarning } from './card/YoloBar';
import { Button, IconYolo } from './ui';

/**
 * Barra de seleção múltipla do board (card 326): aparece quando 2 ou mais histórias estão marcadas
 * e liga (ou desliga) o modo autônomo em todas de uma vez. Mesmo padrão de se auto-esconder de
 * `FilterBar`/`AutopilotButton`: lê o store direto e devolve `null` quando não há nada a mostrar.
 */
export function SelectionBar() {
  const state = useBoardStore((s) => s.state)!;
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const clearSelected = useBoardStore((s) => s.clearSelected);
  const ask = useBoardStore((s) => s.ask);
  const collapsed = useBoardStore((s) => s.collapsed);
  const setManyCollapsed = useBoardStore((s) => s.setManyCollapsed);

  // defesa extra: a caixa de marcação (card 324) só existe em histórias vivas, mas confere de novo aqui
  const selectedStories = state.cards.filter((c) => selectedIds.has(c.id));
  if (selectedStories.length < 2) return null;

  const allYolo = selectedStories.every((c) => c.yolo);
  const allCollapsed = selectedStories.every((c) => isCardCollapsed(collapsed, c.id));
  const n = selectedStories.length;

  const toggleCollapse = () => {
    setManyCollapsed(
      selectedStories.map((c) => c.id),
      !allCollapsed,
    );
  };

  const toggle = () => {
    ask({
      title: allYolo ? t('Desligar o modo autônomo em {n} história(s)?', { n }) : t('Ligar o modo autônomo em {n} história(s)?', { n }),
      message: yoloWarning(),
      confirmLabel: allYolo ? t('Desligar modo autônomo') : t('Ligar modo autônomo'),
      // desligar em lote também pede confirmação (diferente do botão de uma história só, que desliga
      // direto): desligar várias histórias de uma vez para o autopiloto de todas, maior impacto.
      danger: true,
      onConfirm: () => {
        cards.setYoloMany(
          selectedStories.map((c) => c.id),
          !allYolo,
        );
        clearSelected();
      },
    });
  };

  return (
    <div className="selectionbar">
      <span>{t('{n} selecionados', { n })}</span>
      <Button variant="ghost" size="small" onClick={clearSelected}>
        {t('Limpar')}
      </Button>
      <Button size="small" danger onClick={toggle}>
        <IconYolo /> {allYolo ? t('Desligar modo autônomo') : t('Ligar modo autônomo')}
      </Button>
      <Button size="small" onClick={toggleCollapse}>
        {allCollapsed ? t('Expandir selecionados') : t('Colapsar selecionados')}
      </Button>
    </div>
  );
}
