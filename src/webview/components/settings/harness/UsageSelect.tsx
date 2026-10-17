import type { HarnessItem } from '../../../../shared/harness';
import {
  HARNESS_USAGES,
  isSelectableKind,
  selectionKey,
  usageOf,
  usageOptions,
  type HarnessUsage,
} from '../../../../shared/harnessSelection';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { SelectField } from '../../ui';
import { t } from '../../../i18n';

/**
 * O modo de uma rule, skill ou servidor MCP no board: Sempre, Pelo card ou Desligado (regras). No catálogo
 * há também "Fora do board"; na lista do Board o item já está lá, e o seletor só troca o modo.
 */
export function UsageSelect({ item, allowNone = true }: { item: HarnessItem; allowNone?: boolean }) {
  const selection = useBoardStore((s) => s.state!.harnessSelection);
  if (!isSelectableKind(item.kind) || item.kind === 'agent') return null;
  const kind = item.kind;
  const usage = usageOf(selection, item);
  const modes = usageOptions(kind);
  const available = item.boardArtifactId && !modes.includes('off') ? ['off' as const, ...modes] : modes;
  const options = available.map((id) => HARNESS_USAGES.find((u) => u.id === id)!);
  return (
    <SelectField<HarnessUsage | 'none'>
      size="1"
      steady
      aria-label={t('Modo no board: {name}', { name: item.name })}
      title={t('Só o que está no board entra nas execuções; o resto fica invisível para elas.')}
      options={[
        ...(allowNone ? [{ value: 'none' as const, label: t('Fora do board') }] : []),
        ...options.map((u) => ({ value: u.id, label: t(u.label) })),
      ]}
      value={usage ?? (allowNone ? 'none' : options[0]!.id)}
      onChange={(v) => harness.setSelection([{ kind, location: selectionKey(item) }], v === 'none' ? null : v)}
    />
  );
}
