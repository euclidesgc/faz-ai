import { FieldRow } from '../../ui';
import type { HarnessTarget } from './useTargetForm';

interface Props {
  /** rótulo da linha: "Onde" ou "Arquivo" */
  label: string;
  targets: readonly HarnessTarget[];
  /** `source` do destino escolhido */
  value: number;
  onChange: (source: number) => void;
}

/** Seletor de onde gravar: cada opção diz se o arquivo é do projeto ou global. */
export function TargetPicker({ label, targets, value, onChange }: Props) {
  return (
    <FieldRow label={label}>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {targets.map((t) => (
          <option key={t.source} value={t.source}>
            {t.scope === 'user' ? 'Global' : 'Projeto'}: {t.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}
