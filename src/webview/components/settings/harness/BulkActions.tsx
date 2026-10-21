import { artifactLocation, selectableOfKind, type ArtifactKind, type BoardArtifact } from '../../../../shared/artifacts';
import { HARNESS_USAGES, usageOptions, type HarnessUsage } from '../../../../shared/harnessSelection';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton } from '../../ui';
import { t } from '../../../i18n';

interface Props {
  kind: ArtifactKind;
  /** os artefatos marcados */
  items: BoardArtifact[];
  /** limpa a seleção depois que a ação é feita */
  onDone: () => void;
}

/**
 * As ações sobre os artefatos marcados de um assunto: o modo (os que o assunto aceita; o agente não tem) e apagar,
 * que pede confirmação com a quantidade. Grava por `harness.selection.set`, com a identidade de cada artefato.
 */
export function BulkActions({ kind, items, onDone }: Props) {
  const ask = useBoardStore((s) => s.ask);
  const selectable = selectableOfKind(kind);
  const targets = items.map((a) => ({ kind: selectable, location: artifactLocation(a) }));
  // a seleção só limpa quando o host confirma; o botão mostra a espera
  const write = useAction((usage: HarnessUsage | null) => harness.setSelection(targets, usage));
  const run = async (usage: HarnessUsage | null) => {
    if (await write.run(usage)) onDone();
  };
  const modes = HARNESS_USAGES.filter((u) => usageOptions(selectable).length > 1 && usageOptions(selectable).includes(u.id));
  return (
    <>
      {modes.length > 0 && (
        <span className="bulk-group">
          <span className="muted small">{t('Modo no board')}</span>
          {modes.map((u) => (
            <ActionButton
              key={u.id}
              variant="soft"
              color="gray"
              size="1"
              loading={write.busy}
              hint={t(u.hint)}
              onClick={() => void run(u.id)}
            >
              {t(u.label)}
            </ActionButton>
          ))}
        </span>
      )}
      <ActionButton
        variant="soft"
        color="red"
        size="1"
        loading={write.busy}
        hint={t('Apaga os artefatos marcados do board; os arquivos de origem ficam.')}
        onClick={() =>
          ask({
            title: t('Apagar {n} artefatos do board?', { n: items.length }),
            message: `${t(
              'As cópias do board serão apagadas e a ação não pode ser desfeita; os arquivos de origem ficam. Os cards e os agentes que citam estes artefatos deixam de recebê-los.',
            )}\n\n${items.map((a) => `- ${a.name}`).join('\n')}`,
            confirmLabel: t('Apagar'),
            danger: true,
            onConfirm: () => void run(null),
          })
        }
      >
        {t('Apagar')} ({items.length})
      </ActionButton>
      <ActionButton variant="ghost" size="1" hint={t('Desmarca tudo; nada muda.')} onClick={onDone}>
        {t('Limpar seleção')}
      </ActionButton>
      {write.error && (
        <span className="wizard-warning" role="alert">
          {write.error}
        </span>
      )}
    </>
  );
}
