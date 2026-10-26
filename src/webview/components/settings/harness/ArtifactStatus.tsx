import { Badge } from '@radix-ui/themes';
import { isDefaultArtifact, type BoardArtifact } from '../../../../shared/artifacts';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton } from '../../ui';
import { t } from '../../../i18n';

/**
 * Os selos da linha de um artefato: o de fábrica (vem com o board e não sai da biblioteca) e a conferência com a
 * origem (a origem mudou, sumiu, ou a cópia foi editada no board). Discretos: só o que pede atenção é âmbar.
 */
export function ArtifactBadges({ artifact: a }: { artifact: BoardArtifact }) {
  return (
    <>
      {isDefaultArtifact(a) && (
        <Badge
          color="gray"
          variant="outline"
          title={
            a.kind === 'agent'
              ? t('Vem com o board: pode ser editado, restaurado ou desligado, mas não apagado.')
              : t('Vem com o board e acompanha a versão da extensão: só de leitura.')
          }
        >
          {t('de fábrica')}
        </Badge>
      )}
      {a.originState === 'changed' && (
        <Badge
          color="amber"
          variant="soft"
          title={t('A origem mudou desde a cópia. A cópia do board continua valendo até você atualizar.')}
        >
          {t('origem alterada')}
        </Badge>
      )}
      {a.originState === 'missing' && (
        <Badge color="gray" variant="soft" title={t('A origem não foi encontrada. A cópia do board continua valendo.')}>
          {t('origem não encontrada')}
        </Badge>
      )}
      {a.editedInBoard && (
        <Badge color="gray" variant="soft" title={t('A cópia foi editada no board depois de copiada da origem.')}>
          {t('editado no board')}
        </Badge>
      )}
    </>
  );
}

/** "Atualizar da origem", só quando a origem mudou; com a cópia editada no board, confirma antes de desfazer a edição. */
export function UpdateFromOriginButton({ artifact: a }: { artifact: BoardArtifact }) {
  const ask = useBoardStore((s) => s.ask);
  const update = useAction(() => harness.updateFromOrigin(a.id));
  if (a.originState !== 'changed') return null;
  const run = () =>
    a.editedInBoard
      ? ask({
          title: t('Atualizar "{name}" da origem?', { name: a.name }),
          message: t('A cópia foi editada no board. Atualizar troca o conteúdo pelo da origem, e a edição do board se perde.'),
          confirmLabel: t('Atualizar da origem'),
          onConfirm: () => void update.run(),
        })
      : void update.run();
  return (
    <ActionButton
      variant="ghost"
      size="1"
      loading={update.busy}
      aria-label={t('Atualizar da origem: {name}', { name: a.name })}
      hint={t('Copia de novo o conteúdo atual da origem para o board.')}
      onClick={run}
    >
      {t('Atualizar da origem')}
    </ActionButton>
  );
}

/** "Restaurar o padrão" do agente de fábrica: volta ao texto, às ferramentas e às skills que vêm com o board. */
export function RestoreAgentButton({ artifact: a }: { artifact: BoardArtifact }) {
  const ask = useBoardStore((s) => s.ask);
  const restore = useAction(() => harness.restoreAgent(a.name));
  if (a.kind !== 'agent' || !a.agent?.seed) return null;
  return (
    <ActionButton
      variant="ghost"
      size="1"
      loading={restore.busy}
      aria-label={t('Restaurar o padrão: {name}', { name: a.name })}
      hint={t('Volta o agente ao que vem com o board; o modo e o nome ficam.')}
      onClick={() =>
        ask({
          title: t('Restaurar "{name}" ao padrão?', { name: a.name }),
          message: t('As instruções, as ferramentas e as skills voltam às de fábrica, e as edições feitas no board se perdem.'),
          confirmLabel: t('Restaurar o padrão'),
          onConfirm: () => void restore.run(),
        })
      }
    >
      {t('Restaurar o padrão')}
    </ActionButton>
  );
}
