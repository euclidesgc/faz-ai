import { FormField, SelectField } from '../../ui';
import type { HarnessTarget } from './useTargetForm';
import { t } from '../../../i18n';

interface Props {
  /** rótulo do campo: "Onde" ou "Arquivo" */
  label: string;
  targets: readonly HarnessTarget[];
  /** `source` do destino escolhido */
  value: number;
  onChange: (source: number) => void;
}

/** Seletor de onde gravar: cada opção diz se o arquivo é do projeto ou global. */
export function TargetPicker({ label, targets, value, onChange }: Props) {
  return (
    <FormField label={label}>
      {(id) => (
        <SelectField
          id={id}
          aria-label={label}
          options={targets.map((x) => ({
            value: String(x.source),
            label: `${x.scope === 'user' ? t('Global') : t('Projeto')}: ${x.label.replace('<nome>', t('<nome>'))}`,
          }))}
          value={String(value)}
          onChange={(source) => onChange(Number(source))}
        />
      )}
    </FormField>
  );
}
