import { Checkbox, Select, TextField as RxTextField } from '@radix-ui/themes';
import { useState } from 'react';
import { activeProfile } from '../../shared/aiProfiles';
import { modelGroups } from '../../shared/runTarget';
import { modelDisplay } from '../modelText';
import type { FieldDef, FieldValue } from '../../shared/model';
import { effortLabel, modelValue, parseModelValue } from '../../shared/models';
import { useBoardStore } from '../store/boardStore';
import { ChipsEditor, IconExternal, OptionLabel, optionChip, SelectField, TextField } from './ui';
import { isSkillsField } from './settings/fields/fieldKinds';
import { SkillPicker } from './skills/SkillPicker';
import { dt, getLocale, t } from '../i18n';

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
        title={`${dt(field.name)}: ${modelDisplay(catalog, value, true)}`}
      >
        {field.display === 'inline' && <em>{dt(field.name)}: </em>}
        {modelDisplay(catalog, value)}
      </span>
    );
  }
  const items = Array.isArray(value) ? value : [value];
  const cls = field.display === 'badge' ? 'badge' : field.display === 'chip' ? 'chip' : 'inline-field';
  return (
    <>
      {items.map((v, i) => (
        <span key={i} className={cls} title={dt(field.name)}>
          {field.display === 'inline' && <em>{dt(field.name)}: </em>}
          {field.kind === 'select' || field.kind === 'multiselect' ? <OptionLabel text={format(field, v)} /> : format(field, v)}
        </span>
      ))}
    </>
  );
}

function format(field: FieldDef, v: string | number | boolean): string {
  if (field.kind === 'checkbox') return v ? dt(field.name) : '';
  if (field.kind === 'date' && typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString(getLocale() === 'en' ? 'en-US' : undefined);
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
            <a href={String(value)} target="_blank" rel="noreferrer" title={t('Abrir o link')} aria-label={t('Abrir o link')}>
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
      return <Checkbox aria-label={dt(field.name)} checked={!!value} onCheckedChange={(on) => onChange(on === true)} />;
    case 'select':
      return (
        <SelectField
          aria-label={dt(field.name)}
          options={[{ value: NO_VALUE, label: '—' }, ...field.options.map((o) => ({ value: o, label: <OptionLabel text={o} /> }))]}
          value={(value as string) || NO_VALUE}
          onChange={(v) => onChange(v === NO_VALUE ? null : v)}
        />
      );
    case 'model':
      return <ModelEditor value={value} onChange={onChange} />;
    case 'multiselect': {
      const current = Array.isArray(value) ? value : [];
      // o card só indica o que o Harness marcou como "usar quando fizer sentido"
      if (isSkillsField(field.name)) return <SkillPicker value={current} onChange={onChange} usage="contextual" />;
      return <ChipsEditor options={field.options.map(optionChip)} values={current} onChange={onChange} />;
    }
  }
}

/** Valor do item "sem modelo": o Select do Radix não aceita `value` vazio. */
const NO_MODEL = '__none';
const OTHER_MODEL = '__other';

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
  const board = useBoardStore((s) => s.state?.board);
  const active = board ? activeProfile(board) : null;
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');
  const current = parseModelValue(value);
  // um grupo por perfil ligado; o valor fora deles (perfil desligado, modelo apagado) continua visível
  const groups = board ? modelGroups(board).filter((g) => g.options.length > 0) : [];
  const option = current ? groups.flatMap((g) => g.options).find((o) => o.id === current.id) : undefined;
  const submitOther = () => {
    const name = otherName.trim();
    if (!active || active.kind !== 'custom' || !name || /[\s\0:@]/.test(name)) return;
    onChange(modelValue(`${active.id}:${name}`, null));
    setOtherOpen(false);
    setOtherName('');
  };
  const modelSelect = otherOpen ? (
    <RxTextField.Root
      autoFocus
      aria-label={t('Outro modelo')}
      placeholder={t('Identificador do modelo')}
      value={otherName}
      onChange={(e) => setOtherName(e.target.value)}
      onBlur={submitOther}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submitOther();
        if (e.key === 'Escape') {
          setOtherName('');
          setOtherOpen(false);
        }
      }}
    />
  ) : (
    <Select.Root
      value={current?.id ?? NO_MODEL}
      onValueChange={(id) => {
        if (id === OTHER_MODEL) {
          setOtherOpen(true);
          return;
        }
        const o = groups.flatMap((g) => g.options).find((x) => x.id === id);
        onChange(o ? modelValue(o.id, o.defaultEffort) : null);
      }}
    >
      <Select.Trigger aria-label={t('Modelo')} />
      <Select.Content position="popper">
        <Select.Item value={NO_MODEL}>—</Select.Item>
        {current && !option && <Select.Item value={current.id}>{t('{id} (fora do catálogo)', { id: current.id })}</Select.Item>}
        {groups.map((g) => (
          <Select.Group key={g.cli}>
            <Select.Label>{g.label}</Select.Label>
            {g.options.map((o) => (
              <Select.Item key={o.id} value={o.id}>
                {o.label}
              </Select.Item>
            ))}
          </Select.Group>
        ))}
        {active?.kind === 'custom' && <Select.Item value={OTHER_MODEL}>{t('Outro modelo…')}</Select.Item>}
      </Select.Content>
    </Select.Root>
  );
  const effortSelect =
    option && option.efforts.length > 0 ? (
      <Select.Root value={current?.effort ?? option.efforts[0]!} onValueChange={(effort) => onChange(modelValue(option.id, effort))}>
        <Select.Trigger aria-label={t('Esforço do modelo')} title={t('Esforço do modelo')} />
        <Select.Content position="popper">
          {option.efforts.map((e) => (
            <Select.Item key={e} value={e}>
              {t(effortLabel(e))}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    ) : null;

  if (part === 'model') return modelSelect;
  if (part === 'effort')
    return (
      effortSelect ?? (
        <span className="muted small">{option ? t('Este modelo não tem ajuste de esforço.') : t('Escolha um modelo primeiro.')}</span>
      )
    );
  return (
    <div className="row model-editor">
      {modelSelect}
      {effortSelect}
    </div>
  );
}
