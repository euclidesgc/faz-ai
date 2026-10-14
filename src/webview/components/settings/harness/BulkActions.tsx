import { SKILL_MODES, type HarnessItem } from '../../../../shared/harness';
import {
  HARNESS_USAGES,
  defaultUsage,
  isSelectableKind,
  selectionKey,
  usageOf,
  usageOptions,
  type HarnessUsage,
  type SelectableKind,
} from '../../../../shared/harnessSelection';
import { useAction } from '../../../useAction';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import type { ItemActions } from './useItemActions';
import { ActionButton } from '../../ui';
import { t } from '../../../i18n';

/**
 * O que cada ação em massa alcança entre os itens marcados: cada ação vale só para os que a aceitam
 * (o modo é de skill, a cópia é de arquivo de pasta, a remoção de entrada é de hook, permissão e MCP).
 */
export function bulkTargets(items: HarnessItem[], actions: ItemActions, projectTool: boolean) {
  const { copyable, twin, deletable, entryRemovable } = actions;
  return {
    // a marcação das execuções só existe para a ferramenta do projeto; os agentes têm a tabela própria, e um agente
    // de pasta importada não vai ao board: o board só executa agentes do projeto ou do global (copie-o antes)
    usage: projectTool ? items.filter((i) => isSelectableKind(i.kind) && i.kind !== 'agent') : [],
    mode: items.filter((i) => !!i.mode && i.scope !== 'plugin' && i.scope !== 'imported' && i.layout !== 'entry'),
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

/**
 * As ações sobre os itens marcados de um grupo, conforme o que eles são. A principal é enviar ao board (com
 * o modo de entrada de cada tipo: as regras entram desligadas); apagar e remover pedem confirmação.
 */
export function BulkActions({ items, actions, projectTool, onDone }: Props) {
  const x = bulkTargets(items, actions, projectTool);
  const selection = useBoardStore((s) => s.state!.harnessSelection);
  const toSend = x.usage.filter((i) => usageOf(selection, i) === null);
  const toRemove = x.usage.filter((i) => usageOf(selection, i) !== null);
  // quando a ação não vale para todos os marcados, o botão diz para quantos vale
  const count = (list: HarnessItem[]) => (list.length < items.length ? ` (${list.length})` : '');
  const keys = (list: HarnessItem[]) =>
    list.flatMap((i) => (isSelectableKind(i.kind) ? [{ kind: i.kind, location: selectionKey(i) }] : []));
  // a marcação é gravada no banco: a seleção só limpa quando o host confirma, e o botão mostra a espera
  const select = useAction(async (list: { kind: SelectableKind; location: string }[][], usage: HarnessUsage | null) => {
    for (const items of list) await harness.setSelection(items, usage);
  });
  const setUsage = async (usage: HarnessUsage) => {
    if (await select.run([keys(x.usage)], usage)) onDone();
  };
  // cada tipo entra com o seu modo (`defaultUsage`): uma mensagem por modo
  const send = () => {
    const byUsage = new Map<HarnessUsage, HarnessItem[]>();
    for (const i of toSend) {
      if (!isSelectableKind(i.kind)) continue;
      const usage = defaultUsage(i.kind);
      byUsage.set(usage, [...(byUsage.get(usage) ?? []), i]);
    }
    void (async () => {
      for (const [usage, list] of byUsage) if (!(await select.run([keys(list)], usage))) return;
      onDone();
    })();
  };
  // só os modos que valem para todos os marcados (uma regra aceita "Desligado"; uma skill, não)
  const usages = HARNESS_USAGES.filter((u) => x.usage.every((i) => isSelectableKind(i.kind) && usageOptions(i.kind).includes(u.id)));
  return (
    <>
      {toSend.length > 0 && (
        <ActionButton
          size="1"
          loading={select.busy}
          hint={t('Disponibiliza para os cards deste board; o board lê o arquivo da origem na hora de usar.')}
          onClick={send}
        >
          {t('Enviar para o board')}
          {count(toSend)}
        </ActionButton>
      )}
      {x.usage.length > 0 && (
        <span className="bulk-group">
          <span className="muted small">
            {t('Modo no board')}
            {count(x.usage)}
          </span>
          {usages.map((u) => (
            <ActionButton
              key={u.id}
              variant="soft"
              color="gray"
              size="1"
              loading={select.busy}
              hint={t(u.hint)}
              onClick={() => void setUsage(u.id)}
            >
              {t(u.label)}
            </ActionButton>
          ))}
        </span>
      )}
      {toRemove.length > 0 && (
        <ActionButton
          variant="soft"
          color="gray"
          size="1"
          loading={select.busy}
          hint={t('Tira os marcados do board; os arquivos de origem ficam.')}
          onClick={() => void select.run([keys(toRemove)], null).then((ok) => ok && onDone())}
        >
          {t('Remover do board')}
          {count(toRemove)}
        </ActionButton>
      )}
      {x.mode.length > 0 && (
        <span className="bulk-group">
          <span className="muted small">
            {t('Modo da skill')}
            {count(x.mode)}
          </span>
          {SKILL_MODES.map((m) => (
            <ActionButton
              key={m.id}
              variant="soft"
              color="gray"
              size="1"
              hint={t(m.hint)}
              onClick={() => actions.setMode(x.mode, m.id, onDone)}
            >
              {t(m.label)}
            </ActionButton>
          ))}
        </span>
      )}
      {x.toProject.length > 0 && (
        <ActionButton
          variant="soft"
          color="gray"
          size="1"
          hint={t('Cria uma cópia independente na pasta do projeto')}
          onClick={() => actions.copy(x.toProject, 'project', onDone)}
        >
          {t('Copiar para o projeto')}
          {count(x.toProject)}
        </ActionButton>
      )}
      {x.toUser.length > 0 && (
        <ActionButton
          variant="soft"
          color="gray"
          size="1"
          hint={t('Cria uma cópia na sua pasta de usuário, que vale em todos os projetos')}
          onClick={() => actions.copy(x.toUser, 'user', onDone)}
        >
          {t('Copiar para o global')}
          {count(x.toUser)}
        </ActionButton>
      )}
      {x.remove.length > 0 && (
        <ActionButton
          variant="soft"
          color="red"
          size="1"
          hint={t('Pede confirmação e apaga do disco os arquivos marcados.')}
          onClick={() => actions.remove(x.remove, onDone)}
        >
          {t('Apagar')}
          {count(x.remove)}
        </ActionButton>
      )}
      {x.entries.length > 0 && (
        <ActionButton
          variant="soft"
          color="red"
          size="1"
          hint={t('Pede confirmação e tira as entradas marcadas do arquivo de configurações.')}
          onClick={() => actions.removeEntries(x.entries, onDone)}
        >
          {t('Remover')}
          {count(x.entries)}
        </ActionButton>
      )}
      <ActionButton variant="ghost" size="1" hint={t('Desmarca tudo; nada muda.')} onClick={onDone}>
        {t('Limpar seleção')}
      </ActionButton>
    </>
  );
}
