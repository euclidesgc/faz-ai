import { useEffect, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import { usePending } from '../usePending';
import { isCardCollapsed } from '../../shared/selectors';
import { t } from '../i18n';
import { cards } from '../commands';
import { confirmYoloOn, yoloWarning } from './card/YoloBar';
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
  const dontWarnYolo = useBoardStore((s) => s.dontWarnYolo);
  const setDontWarnYolo = useBoardStore((s) => s.setDontWarnYolo);

  // defesa extra: a caixa de marcação (card 324) só existe em histórias vivas, mas confere de novo aqui
  const selectedStories = state.cards.filter((c) => selectedIds.has(c.id));
  const allYolo = selectedStories.every((c) => c.yolo);
  // em lote, a barra mostra "Aplicando…" até os cards mudarem (ou o tempo esgotar) e só então limpa a seleção
  const [target, applying, markYolo] = usePending(allYolo);
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    if (applying && allYolo === targetRef.current) clearSelected();
  }, [allYolo, applying, clearSelected]);
  if (selectedStories.length < 2) return null;

  const allCollapsed = selectedStories.every((c) => isCardCollapsed(collapsed, c.id));
  const n = selectedStories.length;

  const toggleCollapse = () => {
    setManyCollapsed(
      selectedStories.map((c) => c.id),
      !allCollapsed,
    );
  };

  const toggle = () => {
    const ids = selectedStories.map((c) => c.id);
    const apply = (enabled: boolean) => {
      markYolo(enabled);
      cards.setYoloMany(ids, enabled);
    };
    // desligar em lote sempre pede confirmação (diferente do controle de uma história só, que desliga
    // direto): desligar várias histórias de uma vez para o autopiloto de todas, maior impacto. É uma
    // ação fora do "não avisar novamente", que é só sobre ligar: por isso aqui não há checkbox.
    if (allYolo) {
      ask({
        title: t('Desligar o modo autônomo em {n} história(s)?', { n }),
        message: yoloWarning(),
        confirmLabel: t('Desligar modo autônomo'),
        danger: true,
        onConfirm: () => apply(false),
      });
      return;
    }
    confirmYoloOn({
      ask,
      dontWarnYolo,
      setDontWarnYolo,
      title: t('Ligar o modo autônomo em {n} história(s)?', { n }),
      confirmLabel: t('Ligar modo autônomo'),
      onEnable: () => apply(true),
    });
  };

  return (
    <div className="selectionbar">
      <span>{t('{n} selecionados', { n })}</span>
      <Button variant="ghost" size="small" onClick={clearSelected}>
        {t('Limpar')}
      </Button>
      <Button size="small" danger disabled={applying} onClick={toggle}>
        <IconYolo /> {applying ? t('Aplicando…') : allYolo ? t('Desligar modo autônomo') : t('Ligar modo autônomo')}
      </Button>
      <Button size="small" onClick={toggleCollapse}>
        {allCollapsed ? t('Expandir selecionados') : t('Colapsar selecionados')}
      </Button>
    </div>
  );
}
