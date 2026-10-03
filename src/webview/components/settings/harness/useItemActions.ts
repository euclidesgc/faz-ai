import type { AiTool, HarnessItem, SkillMode } from '../../../../shared/harness';
import { copyTarget } from '../../../../shared/harnessCatalog';
import { harness, type HarnessScope } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { GLOBAL_WARNING } from './text';

/** Ações sobre os itens já listados de uma ferramenta, usadas pela linha e pelos botões "todas" de cada escopo. */
export function useItemActions(tool: AiTool, items: HarnessItem[]) {
  const ask = useBoardStore((s) => s.ask);
  const copyable = (i: HarnessItem, to: HarnessScope) =>
    (i.layout === 'files' || i.layout === 'skills') && i.scope !== to && !!copyTarget(tool, i.kind, i.layout, to);
  /** o mesmo item no outro escopo: dá para ver se já foi copiado e se a cópia divergiu */
  const twin = (i: HarnessItem, scope: HarnessScope) =>
    items.find((x) => x.kind === i.kind && x.name === i.name && x.scope === scope && x.layout === i.layout);
  const copy = (list: HarnessItem[], to: HarnessScope) => {
    const run = () =>
      harness.copyItems(
        tool,
        list.map((i) => ({ kind: i.kind, path: i.path })),
        to,
      );
    const what = list.length === 1 ? `"${list[0]!.name}"` : `${list.length} itens`;
    if (to === 'user')
      ask({ title: `Copiar ${what} para a pasta do usuário?`, message: GLOBAL_WARNING, confirmLabel: 'Copiar', onConfirm: run });
    else if (list.length > 1)
      ask({
        title: `Copiar ${what} para o projeto?`,
        message: 'Cada item vira uma cópia independente na pasta do projeto.',
        confirmLabel: 'Copiar',
        onConfirm: run,
      });
    else run();
  };
  const setMode = (list: HarnessItem[], mode: SkillMode) => {
    const run = () =>
      harness.setSkillMode(
        tool,
        list.map((i) => i.path),
        mode,
      );
    if (list.some((i) => i.scope === 'user'))
      ask({
        title: 'Alterar skills da pasta do usuário?',
        message: `A mudança é gravada no arquivo da skill. ${GLOBAL_WARNING}`,
        confirmLabel: 'Alterar',
        onConfirm: run,
      });
    else run();
  };
  return { copyable, twin, copy, setMode };
}

export type ItemActions = ReturnType<typeof useItemActions>;
