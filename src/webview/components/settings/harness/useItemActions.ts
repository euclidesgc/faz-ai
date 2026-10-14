import type { AiTool, HarnessItem, SkillMode } from '../../../../shared/harness';
import { copyTarget, groupOf, hookTargets, mcpTargets } from '../../../../shared/harnessCatalog';
import { harness, type HarnessScope } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { GLOBAL_WARNING, withGlobalWarning } from './text';
import { t } from '../../../i18n';

/**
 * Ações sobre os itens já listados de uma ferramenta, usadas pela linha e pela barra de ações em massa.
 * As que pedem confirmação chamam `after` só quando a pessoa confirma.
 */
export function useItemActions(tool: AiTool, items: HarnessItem[]) {
  const ask = useBoardStore((s) => s.ask);
  const copyable = (i: HarnessItem, to: HarnessScope) =>
    (i.layout === 'files' || i.layout === 'skills') && i.scope !== to && !!copyTarget(tool, i.kind, i.layout, to);
  /** o mesmo item no outro escopo: dá para ver se já foi copiado e se a cópia divergiu */
  const twin = (i: HarnessItem, scope: HarnessScope) =>
    items.find((x) => x.kind === i.kind && x.name === i.name && x.scope === scope && x.layout === i.layout);
  const copy = (list: HarnessItem[], to: HarnessScope, after?: () => void) => {
    const run = () => {
      harness.copyItems(
        tool,
        list.map((i) => ({ kind: i.kind, path: i.path })),
        to,
      );
      after?.();
    };
    const what = list.length === 1 ? `"${list[0]!.name}"` : t('{n} itens', { n: list.length });
    if (to === 'user')
      ask({
        title: t('Copiar {what} para a pasta do usuário?', { what }),
        message: t(GLOBAL_WARNING),
        confirmLabel: t('Copiar'),
        onConfirm: run,
      });
    else if (list.length > 1)
      ask({
        title: t('Copiar {what} para o projeto?', { what }),
        message: t('Cada item vira uma cópia independente na pasta do projeto.'),
        confirmLabel: t('Copiar'),
        onConfirm: run,
      });
    else run();
  };
  const setMode = (list: HarnessItem[], mode: SkillMode, after?: () => void) => {
    const run = () => {
      harness.setSkillMode(
        tool,
        list.map((i) => i.path),
        mode,
      );
      after?.();
    };
    if (list.some((i) => i.scope === 'user'))
      ask({
        title: t('Alterar skills da pasta do usuário?'),
        message: t('A mudança é gravada no arquivo da skill. {warning}', { warning: t(GLOBAL_WARNING) }),
        confirmLabel: t('Alterar'),
        onConfirm: run,
      });
    else run();
  };
  /**
   * só o que é um arquivo ou pasta própria, fora de plugin e da política da organização, pode ser apagado daqui; uma
   * pasta importada é de outro lugar (outro repositório, a coleção do time): o board a lê, não a apaga
   */
  const deletable = (i: HarnessItem) =>
    i.scope !== 'plugin' && i.scope !== 'imported' && i.layout !== 'entry' && i.kind !== 'settings' && groupOf(tool, i) !== 'managed';
  const remove = (list: HarnessItem[], after?: () => void) => {
    const global = list.some((i) => i.scope === 'user') ? 'user' : 'project';
    ask({
      title: list.length === 1 ? t('Apagar "{name}"?', { name: list[0]!.name }) : t('Apagar {n} itens?', { n: list.length }),
      message: withGlobalWarning(
        list.length === 1
          ? list[0]!.layout === 'skills'
            ? t('A pasta da skill é removida, com todos os arquivos dela: {location}', { location: list[0]!.location })
            : t('O arquivo é removido: {location}', { location: list[0]!.location })
          : list.map((i) => `${i.name} (${i.location})`).join('\n'),
        global,
      ),
      confirmLabel: t('Apagar'),
      danger: true,
      onConfirm: () => {
        list.forEach((i) => harness.deleteItem(tool, i.kind, i.path));
        after?.();
      },
    });
  };
  /** entrada de um arquivo de configuração (hook, regra de permissão, servidor MCP) que o board sabe tirar de lá */
  const entryRemovable = (i: HarnessItem) =>
    i.scope !== 'plugin' &&
    i.scope !== 'imported' &&
    ((i.kind === 'hook' && hookTargets(tool).length > 0 && i.path.endsWith('.json')) ||
      (i.kind === 'settings' && i.layout === 'entry') ||
      (i.kind === 'mcp' && mcpTargets(tool).some((x) => x.label === i.location)));
  const removeEntry = (i: HarnessItem) => {
    if (i.kind === 'hook') harness.removeHook(tool, i.path, i.name, i.detail ?? '');
    else if (i.kind === 'settings') harness.removePermission(tool, i.path, i.detail ?? '', i.name);
    else harness.removeMcp(tool, i.path, i.name);
  };
  const removeEntries = (list: HarnessItem[], after?: () => void) =>
    ask({
      title: t('Remover {n} entradas?', { n: list.length }),
      message: withGlobalWarning(
        list.map((i) => `${i.detail ? `${i.name}: ${i.detail}` : i.name} (${i.location})`).join('\n'),
        list.some((i) => i.scope === 'user') ? 'user' : 'project',
      ),
      confirmLabel: t('Remover'),
      danger: true,
      onConfirm: () => {
        list.forEach(removeEntry);
        after?.();
      },
    });
  return { copyable, twin, copy, setMode, deletable, remove, entryRemovable, removeEntries };
}

export type ItemActions = ReturnType<typeof useItemActions>;
