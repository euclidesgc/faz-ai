import { useState } from 'react';
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
      if (field.name.toLowerCase() === 'skills') return <SkillsPicker options={field.options} current={current} onChange={onChange} />;
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
/** `part` mostra só o seletor de modelo ou só o de esforço, para telas que os colocam em linhas separadas. */
export function ModelEditor({ value, onChange, part = 'both' }: { value: FieldValue; onChange: (v: FieldValue) => void; part?: 'both' | 'model' | 'effort' }) {
  const all = useBoardStore((s) => s.state?.board.modelCatalog ?? []);
  const tool = useBoardStore((s) => s.state?.board.aiTool);
  const current = parseModelValue(value);
  // oferece os modelos da ferramenta em uso; um valor de outra ferramenta continua visível até ser trocado
  const catalog = all.filter((o) => o.tool === tool || o.id === current?.id);
  const option = current ? catalog.find((o) => o.id === current.id) : undefined;
  const modelSelect = (
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
  );
  const effortSelect =
    option && option.efforts.length > 0 ? (
      <select title="Esforço do modelo" value={current?.effort ?? ''} onChange={(e) => onChange(modelValue(option.id, e.target.value || null))}>
        {option.efforts.map((e) => <option key={e} value={e}>{e}</option>)}
      </select>
    ) : null;

  if (part === 'model') return modelSelect;
  if (part === 'effort') return effortSelect ?? <span className="muted small">{option ? 'Este modelo não tem ajuste de esforço.' : 'Escolha um modelo primeiro.'}</span>;
  return (
    <div className="row model-editor">
      {modelSelect}
      {effortSelect}
    </div>
  );
}

type SkillScope = 'all' | 'project' | 'global';

/** Campo "Skills": as do projeto e as globais (pasta do usuário e plugins) da ferramenta em uso, com filtro por origem. */
function SkillsPicker({ options, current, onChange }: { options: string[]; current: string[]; onChange: (v: FieldValue) => void }) {
  const state = useBoardStore((s) => s.state)!;
  const [scope, setScope] = useState<SkillScope>('all');
  const items = (state.harness.inventory.find((t) => t.tool === state.board.aiTool)?.items ?? []).filter((i) => i.kind === 'skill');
  const inProject = new Set([...state.harness.skills.map((k) => k.name), ...items.filter((i) => i.scope === 'project').map((i) => i.name)]);
  const global = new Map(items.filter((i) => i.scope !== 'project').map((i) => [i.name, i]));
  // um valor marcado continua visível mesmo que a skill tenha saído das opções
  const all = [...options, ...current.filter((c) => !options.includes(c))];
  const shown = all.filter((o) => scope === 'all' || (scope === 'project' ? inProject.has(o) : global.has(o)));
  const count = (s: SkillScope) => all.filter((o) => (s === 'all' ? true : s === 'project' ? inProject.has(o) : global.has(o))).length;
  const scopes: { id: SkillScope; label: string }[] = [{ id: 'all', label: 'Todas' }, { id: 'project', label: 'Projeto' }, { id: 'global', label: 'Globais' }];
  return (
    <div className="skills-picker">
      {global.size > 0 && (
        <div className="segmented">
          {scopes.map((s) => (
            <button key={s.id} className={scope === s.id ? 'on' : ''} onClick={() => setScope(s.id)}>{s.label} ({count(s.id)})</button>
          ))}
        </div>
      )}
      <div className="chips-editor">
        {shown.map((o) => {
          const on = current.includes(o);
          const g = global.get(o);
          const where = [inProject.has(o) ? 'projeto' : '', g ? (g.plugin ? `plugin ${g.plugin}` : 'global') : ''].filter(Boolean).join(' e ');
          return (
            <button key={o} className={`chip ${on ? 'on' : ''}`} title={`${where ? `Skill de: ${where}. ` : ''}${g && !inProject.has(o) ? g.description : ''}`.trim()} onClick={() => onChange(on ? current.filter((x) => x !== o) : [...current, o])}>
              {o}{!inProject.has(o) && g && <small className="chip-scope">{g.plugin ? 'plugin' : 'global'}</small>}
            </button>
          );
        })}
        {shown.length === 0 && <span className="muted small">Nenhuma skill {scope === 'project' ? 'no projeto' : scope === 'global' ? 'global' : ''}.</span>}
      </div>
    </div>
  );
}
