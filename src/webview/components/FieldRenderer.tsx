import { Checkbox, Select, TextField as RxTextField } from '@radix-ui/themes';
import type { FieldDef, FieldValue } from '../../shared/model';
import { AI_TOOLS } from '../../shared/harness';
import { effortLabel, modelDisplay, modelValue, parseModelValue } from '../../shared/models';
import { useBoardStore } from '../store/boardStore';
import { ChipsEditor, IconExternal, SelectField, TextField } from './ui';
import { isSkillsField } from './settings/fields/fieldKinds';
import { SkillPicker } from './skills/SkillPicker';

/** O campo tem algo para mostrar no card (checkbox desmarcado e lista vazia não contam). */
export const hasValue = (value: FieldValue): value is NonNullable<FieldValue> =>
  !(value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0));

/** Exibição compacta no card. */
export function FieldBadge({ field, value }: { field: FieldDef; value: FieldValue }) {
  const catalog = useBoardStore((s) => s.state?.board.modelCatalog ?? []);
  if (!hasValue(value)) return null;
  if (field.kind === 'model') {
    return (
      <span
        className={field.display === 'chip' ? 'chip' : field.display === 'inline' ? 'inline-field' : 'badge'}
        title={`${field.name}: ${modelDisplay(catalog, value, true)}`}
      >
        {field.display === 'inline' && <em>{field.name}: </em>}
        {modelDisplay(catalog, value)}
      </span>
    );
  }
  const items = Array.isArray(value) ? value : [value];
  const cls = field.display === 'badge' ? 'badge' : field.display === 'chip' ? 'chip' : 'inline-field';
  return (
    <>
      {items.map((v, i) => (
        <span key={i} className={cls} title={field.name}>
          {field.display === 'inline' && <em>{field.name}: </em>}
          {format(field, v)}
        </span>
      ))}
    </>
  );
}

function format(field: FieldDef, v: string | number | boolean): string {
  if (field.kind === 'checkbox') return v ? field.name : '';
  if (field.kind === 'date' && typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString();
  }
  return String(v);
}

/** Valor do item "sem valor" de um seletor: o Select do Radix não aceita `value` vazio. */
const NO_VALUE = '__none';

/** Editor do valor no drawer. */
export function FieldEditor({ field, value, onChange }: { field: FieldDef; value: FieldValue; onChange: (v: FieldValue) => void }) {
  switch (field.kind) {
    // texto, link e número gravam ao terminar a edição (TextField): gravar a cada tecla perdia letras
    case 'text':
      return <TextField value={(value as string) ?? ''} onCommit={(v) => onChange(v || null)} />;
    case 'url':
      return (
        <div className="row">
          <TextField value={(value as string) ?? ''} onCommit={(v) => onChange(v.trim() || null)} placeholder="https://" />
          {value && (
            <a href={String(value)} target="_blank" rel="noreferrer" title="Abrir o link" aria-label="Abrir o link">
              <IconExternal />
            </a>
          )}
        </div>
      );
    case 'number':
      return (
        <TextField
          type="number"
          value={value === null ? '' : String(value)}
          onCommit={(v) => onChange(v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v))}
        />
      );
    case 'date':
      return <RxTextField.Root type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'checkbox':
      return <Checkbox aria-label={field.name} checked={!!value} onCheckedChange={(on) => onChange(on === true)} />;
    case 'select':
      return (
        <SelectField
          aria-label={field.name}
          options={[{ value: NO_VALUE, label: '—' }, ...field.options.map((o) => ({ value: o, label: o }))]}
          value={(value as string) || NO_VALUE}
          onChange={(v) => onChange(v === NO_VALUE ? null : v)}
        />
      );
    case 'model':
      return <ModelEditor value={value} onChange={onChange} />;
    case 'multiselect': {
      const current = Array.isArray(value) ? value : [];
      if (isSkillsField(field.name)) return <SkillPicker value={current} onChange={onChange} />;
      return <ChipsEditor options={field.options} values={current} onChange={onChange} />;
    }
  }
}

/** Valor do item "sem modelo": o Select do Radix não aceita `value` vazio. */
const NO_MODEL = '__none';

/**
 * Modelo + nível de esforço, escolhidos no catálogo do board. `part` mostra só o seletor de modelo ou só o de
 * esforço, para telas que os colocam em linhas separadas.
 */
export function ModelEditor({
  value,
  onChange,
  part = 'both',
}: {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  part?: 'both' | 'model' | 'effort';
}) {
  const all = useBoardStore((s) => s.state?.board.modelCatalog ?? []);
  const tool = useBoardStore((s) => s.state?.board.aiTool);
  const current = parseModelValue(value);
  // oferece os modelos da ferramenta em uso; um valor de outra ferramenta continua visível até ser trocado
  const catalog = all.filter((o) => o.tool === tool || o.id === current?.id);
  const option = current ? catalog.find((o) => o.id === current.id) : undefined;
  const modelSelect = (
    <Select.Root
      value={current?.id ?? NO_MODEL}
      onValueChange={(id) => {
        const o = catalog.find((x) => x.id === id);
        onChange(o ? modelValue(o.id, o.defaultEffort) : null);
      }}
    >
      <Select.Trigger aria-label="Modelo" />
      <Select.Content position="popper">
        <Select.Item value={NO_MODEL}>—</Select.Item>
        {current && !option && <Select.Item value={current.id}>{current.id} (fora do catálogo)</Select.Item>}
        {AI_TOOLS.filter((t) => catalog.some((o) => o.tool === t.id)).map((t) => (
          <Select.Group key={t.id}>
            <Select.Label>{t.label}</Select.Label>
            {catalog
              .filter((o) => o.tool === t.id)
              .map((o) => (
                <Select.Item key={o.id} value={o.id}>
                  {o.label}
                </Select.Item>
              ))}
          </Select.Group>
        ))}
      </Select.Content>
    </Select.Root>
  );
  const effortSelect =
    option && option.efforts.length > 0 ? (
      <Select.Root value={current?.effort ?? option.efforts[0]!} onValueChange={(effort) => onChange(modelValue(option.id, effort))}>
        <Select.Trigger aria-label="Esforço do modelo" title="Esforço do modelo" />
        <Select.Content position="popper">
          {option.efforts.map((e) => (
            <Select.Item key={e} value={e}>
              {effortLabel(e)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    ) : null;

  if (part === 'model') return modelSelect;
  if (part === 'effort')
    return (
      effortSelect ?? (
        <span className="muted small">{option ? 'Este modelo não tem ajuste de esforço.' : 'Escolha um modelo primeiro.'}</span>
      )
    );
  return (
    <div className="row model-editor">
      {modelSelect}
      {effortSelect}
    </div>
  );
}
