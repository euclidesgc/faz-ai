import type { FieldDef, FieldValue } from '../../shared/model';

/** Exibição compacta no card. */
export function FieldBadge({ field, value }: { field: FieldDef; value: FieldValue }) {
  if (value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0)) return null;
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
