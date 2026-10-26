import { Checkbox, Select, TextField as RxTextField } from '@radix-ui/themes';
import { useState } from 'react';
import { modelGroups } from '../../shared/runTarget';
import { modelDisplay } from '../modelText';
import type { FieldDef, FieldValue } from '../../shared/model';
import { effortLabel, modelValue, parseModelValue } from '../../shared/models';
import { useBoardStore } from '../store/boardStore';
import { ChipsEditor, IconExternal, OptionLabel, optionChip, SelectField, TextField } from './ui';
import { isSkillsField } from './settings/fields/fieldKinds';
import { MCPS_FIELD, RULES_FIELD } from '../../shared/boardFields';
import { SkillPicker } from './skills/SkillPicker';
import { GroupedPicker } from './GroupedPicker';
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
      // sem opção, o campo diz por quê: Rules e MCPs vêm do Harness, os outros do próprio campo
      const harnessField = [RULES_FIELD, MCPS_FIELD].some((n) => n.toLowerCase() === field.name.toLowerCase());
      return (
        <ChipsEditor
          options={field.options.map(optionChip)}
          values={current}
          onChange={onChange}
          empty={harnessField ? t('Nenhuma no board em "Pelo card" (Configurações › Harness).') : undefined}
        />
      );
    }
  }
}

/** Valor do item "sem modelo": o Select do Radix não aceita `value` vazio. */
const NO_MODEL = '__none';
/** prefixo do item "Outro modelo…" de cada perfil personalizado: `__other:<perfil>` */
const OTHER_MODEL = '__other:';

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
  // o perfil personalizado que recebe o identificador livre; null com o campo fechado
  const [other, setOther] = useState<string | null>(null);
  const [otherName, setOtherName] = useState('');
  const current = parseModelValue(value);
  // um grupo por perfil ligado; o personalizado aparece mesmo sem modelo cadastrado, porque aceita um
  // identificador livre; o valor fora deles (perfil desligado, modelo apagado) continua visível
  const groups = board ? modelGroups(board).filter((g) => g.options.length > 0 || g.custom) : [];
  const option = current ? groups.flatMap((g) => g.options).find((o) => o.id === current.id) : undefined;
  const submitOther = () => {
    const name = otherName.trim();
    if (other && name && !/[\s\0:@]/.test(name)) onChange(modelValue(`${other}:${name}`, null));
    setOther(null);
    setOtherName('');
  };
  const modelSelect = other ? (
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
          setOther(null);
        }
      }}
    />
  ) : (
    <GroupedPicker
      ariaLabel={t('Modelo')}
      value={current?.id ?? NO_MODEL}
      head={[
        { value: NO_MODEL, label: '—' },
        ...(current && !option ? [{ value: current.id, label: t('{id} (fora do catálogo)', { id: current.id }) }] : []),
      ]}
      groups={groups.map((g) => ({
        key: g.cli,
        label: g.label,
        options: [
          ...g.options.map((o) => ({ value: o.id, label: o.label })),
          ...(g.custom ? [{ value: `${OTHER_MODEL}${g.cli}`, label: t('Outro modelo…') }] : []),
        ],
      }))}
      onChange={(id) => {
        if (id.startsWith(OTHER_MODEL)) {
          setOther(id.slice(OTHER_MODEL.length));
          return;
        }
        const o = groups.flatMap((g) => g.options).find((x) => x.id === id);
        onChange(o ? modelValue(o.id, o.defaultEffort) : null);
      }}
    />
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
