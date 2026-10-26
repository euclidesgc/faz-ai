import { artifactLocation, selectableOfKind, type BoardArtifact } from '../../../../shared/artifacts';
import { HARNESS_USAGES, usageOptions, type HarnessUsage } from '../../../../shared/harnessSelection';
import { harness } from '../../../commands';
import { SelectField } from '../../ui';
import { t } from '../../../i18n';

/**
 * O modo de um artefato do board: Sempre, Pelo card ou Desligado (as opções de cada tipo vêm de `usageOptions`; o
 * agente só fica disponível ou desligado).
 */
export function UsageSelect({ artifact }: { artifact: BoardArtifact }) {
  const kind = selectableOfKind(artifact.kind);
  const options = usageOptions(kind).map((id) => HARNESS_USAGES.find((u) => u.id === id)!);
  return (
    <SelectField<HarnessUsage>
      size="1"
      steady
      aria-label={t('Modo no board: {name}', { name: artifact.name })}
      title={t('Só o que está no board entra nas execuções, no modo de cada um.')}
      options={options.map((u) => ({ value: u.id, label: t(u.label) }))}
      value={artifact.usage}
      onChange={(usage) => harness.setSelection([{ kind, location: artifactLocation(artifact) }], usage)}
    />
  );
}
