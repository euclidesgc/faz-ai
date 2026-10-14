import { Button } from '@radix-ui/themes';
import { SKILL_MODES, type HarnessItem } from '../../../../shared/harness';
import { HARNESS_USAGES, isSelectableKind, selectionKey, usageOptions, type HarnessUsage } from '../../../../shared/harnessSelection';
import { harness } from '../../../commands';
import type { ItemActions } from './useItemActions';
import { t } from '../../../i18n';

/**
 * O que cada ação em massa alcança entre os itens marcados: cada ação vale só para os que a aceitam
 * (o modo é de skill, a cópia é de arquivo de pasta, a remoção de entrada é de hook, permissão e MCP).
 */
export function bulkTargets(items: HarnessItem[], actions: ItemActions, projectTool: boolean) {
  const { copyable, twin, deletable, entryRemovable } = actions;
  return {
    // a marcação das execuções só existe para a ferramenta do projeto; agentes têm a tabela própria
    usage: projectTool ? items.filter((i) => isSelectableKind(i.kind) && i.kind !== 'agent') : [],
    mode: items.filter((i) => !!i.mode && i.scope !== 'plugin' && i.layout !== 'entry'),
    toProject: items.filter((i) => copyable(i, 'project') && !twin(i, 'project')),
    toUser: items.filter((i) => copyable(i, 'user') && !twin(i, 'user')),
    remove: items.filter(deletable),
    entries: items.filter(entryRemovable),
  };
}

/** A linha ganha caixa de seleção quando alguma ação em massa vale para ela. */
export const bulkSelectable = (item: HarnessItem, actions: ItemActions, projectTool: boolean): boolean =>
  Object.values(bulkTargets([item], actions, projectTool)).some((list) => list.length > 0);

interface Props {
  items: HarnessItem[];
  actions: ItemActions;
  projectTool: boolean;
  /** limpa a seleção depois que a ação é feita (ou confirmada, nas que perguntam antes) */
  onDone: () => void;
}

/** As ações sobre os itens marcados de um grupo, conforme o que eles são. Apagar e remover pedem confirmação. */
export function BulkActions({ items, actions, projectTool, onDone }: Props) {
  const x = bulkTargets(items, actions, projectTool);
  // quando a ação não vale para todos os marcados, o botão diz para quantos vale
  const count = (list: HarnessItem[]) => (list.length < items.length ? ` (${list.length})` : '');
  const setUsage = (usage: HarnessUsage | null) => {
    harness.setSelection(
      x.usage.flatMap((i) => (isSelectableKind(i.kind) ? [{ kind: i.kind, location: selectionKey(i) }] : [])),
      usage,
    );
    onDone();
  };
  // só os modos que valem para todos os marcados (uma regra aceita "Desligado"; uma skill, não)
  const usages = HARNESS_USAGES.filter((u) => x.usage.every((i) => isSelectableKind(i.kind) && usageOptions(i.kind).includes(u.id)));
  return (
    <>
      {x.usage.length > 0 && (
        <span className="bulk-group">
          <span className="muted small">
            {t('Modo no board')}
            {count(x.usage)}
          </span>
          {usages.map((u) => (
            <Button key={u.id} variant="soft" color="gray" size="1" title={t(u.hint)} onClick={() => setUsage(u.id)}>
              {t(u.label)}
            </Button>
          ))}
          <Button variant="soft" color="gray" size="1" onClick={() => setUsage(null)}>
            {t('Fora do board')}
          </Button>
        </span>
      )}
      {x.mode.length > 0 && (
        <span className="bulk-group">
          <span className="muted small">
            {t('Modo da skill')}
            {count(x.mode)}
          </span>
          {SKILL_MODES.map((m) => (
            <Button key={m.id} variant="soft" color="gray" size="1" title={t(m.hint)} onClick={() => actions.setMode(x.mode, m.id, onDone)}>
              {t(m.label)}
            </Button>
          ))}
        </span>
      )}
      {x.toProject.length > 0 && (
        <Button variant="soft" color="gray" size="1" onClick={() => actions.copy(x.toProject, 'project', onDone)}>
          {t('Copiar para o projeto')}
          {count(x.toProject)}
        </Button>
      )}
      {x.toUser.length > 0 && (
        <Button variant="soft" color="gray" size="1" onClick={() => actions.copy(x.toUser, 'user', onDone)}>
          {t('Copiar para o global')}
          {count(x.toUser)}
        </Button>
      )}
      {x.remove.length > 0 && (
        <Button variant="soft" color="red" size="1" onClick={() => actions.remove(x.remove, onDone)}>
          {t('Apagar')}
          {count(x.remove)}
        </Button>
      )}
      {x.entries.length > 0 && (
        <Button variant="soft" color="red" size="1" onClick={() => actions.removeEntries(x.entries, onDone)}>
          {t('Remover')}
          {count(x.entries)}
        </Button>
      )}
      <Button variant="ghost" size="1" onClick={onDone}>
        {t('Limpar seleção')}
      </Button>
    </>
  );
}
