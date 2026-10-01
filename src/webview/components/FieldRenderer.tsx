import type { FieldDef, FieldValue } from '../../shared/model';
import { AI_TOOLS } from '../../shared/harness';
import { modelLabel, modelValue, parseModelValue } from '../../shared/models';
import { useBoardStore } from '../store/boardStore';

/** Exibição compacta no card. */
export function FieldBadge({ field, value }: { field: FieldDef; value: FieldValue }) {
  const catalog = useBoardStore((s) => s.state?.board.modelCatalog ?? []);
  if (value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0)) return null;
  if (field.kind === 'model') {
    return (
      <span className={field.display === 'chip' ? 'chip' : field.display === 'inline' ? 'inline-field' : 'badge'} title={`${field.name}: ${modelLabel(catalog, value, true)}`}>
        {field.display === 'inline' && <em>{field.name}: </em>}
        {modelLabel(catalog, value)}
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

/** Editor do valor no drawer. */
export function FieldEditor({ field, value, onChange }: { field: FieldDef; value: FieldValue; onChange: (v: FieldValue) => void }) {
  switch (field.kind) {
    case 'text':
      return <input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return (
        <div className="row">
          <input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="https://" />
          {value && <a href={String(value)} target="_blank" rel="noreferrer">↗</a>}
        </div>
      );
    case 'number':
      return <input type="number" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'date':
      return <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'checkbox':
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case 'select':
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'model':
      return <ModelEditor value={value} onChange={onChange} />;
    case 'multiselect': {
      const current = Array.isArray(value) ? value : [];
      return (
        <div className="chips-editor">
          {field.options.map((o) => {
            const on = current.includes(o);
            return (
              <button key={o} className={`chip ${on ? 'on' : ''}`} onClick={() => onChange(on ? current.filter((x) => x !== o) : [...current, o])}>
                {o}
              </button>
            );
          })}
        </div>
      );
    }
  }
}

/** Modelo + nível de esforço, escolhidos no catálogo do board. */
export function ModelEditor({ value, onChange }: { value: FieldValue; onChange: (v: FieldValue) => void }) {
  const catalog = useBoardStore((s) => s.state?.board.modelCatalog ?? []);
  const current = parseModelValue(value);
  const option = current ? catalog.find((o) => o.id === current.id) : undefined;
  return (
    <div className="row model-editor">
      <select
        value={current?.id ?? ''}
        onChange={(e) => {
          const o = catalog.find((x) => x.id === e.target.value);
          onChange(o ? modelValue(o.id, o.defaultEffort) : null);
        }}
      >
        <option value="">—</option>
        {current && !option && <option value={current.id}>{current.id} (fora do catálogo)</option>}
        {AI_TOOLS.filter((t) => catalog.some((o) => o.tool === t.id)).map((t) => (
          <optgroup key={t.id} label={t.label}>
            {catalog.filter((o) => o.tool === t.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
      {option && option.efforts.length > 0 && (
        <select title="Nível de esforço" value={current?.effort ?? ''} onChange={(e) => onChange(modelValue(option.id, e.target.value || null))}>
          {option.efforts.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      )}
    </div>
  );
}
