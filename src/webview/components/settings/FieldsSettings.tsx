import { useState } from 'react';
import type { FieldDef, FieldDisplay, FieldKind } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';

const KINDS: { value: FieldKind; label: string }[] = [
  { value: 'text', label: 'Texto' }, { value: 'number', label: 'Número' }, { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção' }, { value: 'multiselect', label: 'Múltipla seleção' },
  { value: 'checkbox', label: 'Checkbox' }, { value: 'url', label: 'URL' }, { value: 'model', label: 'Modelo de IA' },
];
const DISPLAYS: { value: FieldDisplay; label: string }[] = [
  { value: 'badge', label: 'Badge' }, { value: 'chip', label: 'Chip' }, { value: 'inline', label: 'Nome: valor' }, { value: 'hidden', label: 'Só no detalhe' },
];
const hasOptions = (k: FieldKind) => k === 'select' || k === 'multiselect';

export function FieldsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [display, setDisplay] = useState<FieldDisplay>('inline');
  const [options, setOptions] = useState('');

  const add = () => {
    if (!name.trim()) return;
    send({ type: 'settings.field.create', name: name.trim(), kind, display, options: hasOptions(kind) ? splitOpts(options) : [], appliesToTypes: null });
    setName(''); setOptions('');
  };

  return (
    <div>
      <h2>Campos personalizados</h2>
      <p className="muted">Campos aparecem no detalhe do card e, conforme a exibição escolhida, também na face do card no board.</p>
      {state.fieldDefs.map((f) => <FieldRow key={f.id} field={f} />)}
      <section className="settings-block">
        <h3>Novo campo</h3>
        <div className="row wrap">
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={kind} onChange={(e) => setKind(e.target.value as FieldKind)}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
          <select value={display} onChange={(e) => setDisplay(e.target.value as FieldDisplay)}>{DISPLAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
          {hasOptions(kind) && <input placeholder="Opções separadas por vírgula" value={options} onChange={(e) => setOptions(e.target.value)} />}
          <button className="primary" disabled={!name.trim()} onClick={add}>Adicionar</button>
        </div>
      </section>
    </div>
  );
}

function FieldRow({ field }: { field: FieldDef }) {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const all = field.appliesToTypes === null;

  const toggleType = (typeId: string) => {
    const cur = field.appliesToTypes ?? state.cardTypes.map((t) => t.id);
    const next = cur.includes(typeId) ? cur.filter((x) => x !== typeId) : [...cur, typeId];
    send({ type: 'settings.field.update', fieldId: field.id, patch: { appliesToTypes: next.length === state.cardTypes.length ? null : next } });
  };

  return (
    <section className="settings-block">
      <div className="row wrap">
        <input className="h3-input" defaultValue={field.name} onBlur={(e) => e.target.value.trim() && e.target.value !== field.name && send({ type: 'settings.field.update', fieldId: field.id, patch: { name: e.target.value.trim() } })} />
        <span className="muted">{KINDS.find((k) => k.value === field.kind)?.label}</span>
        <select value={field.display} onChange={(e) => send({ type: 'settings.field.update', fieldId: field.id, patch: { display: e.target.value as FieldDisplay } })}>
          {DISPLAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <span className="spacer" />
        <button className="icon danger" onClick={() => ask({ title: `Apagar o campo "${field.name}"?`, message: 'Os valores deste campo em todos os cards serão apagados.', confirmLabel: 'Apagar', danger: true, onConfirm: () => send({ type: 'settings.field.delete', fieldId: field.id }) })}>🗑</button>
      </div>
      {hasOptions(field.kind) && (
        <label className="field-row">
          <span>Opções</span>
          <input defaultValue={field.options.join(', ')} onBlur={(e) => send({ type: 'settings.field.update', fieldId: field.id, patch: { options: splitOpts(e.target.value) } })} />
        </label>
      )}
      <div className="field-row">
        <span>Aplica-se a</span>
        <div className="chips-editor">
          <button className={`chip ${all ? 'on' : ''}`} onClick={() => send({ type: 'settings.field.update', fieldId: field.id, patch: { appliesToTypes: all ? [] : null } })}>Todos</button>
          {state.cardTypes.map((t) => (
            <button key={t.id} className={`chip ${all || field.appliesToTypes?.includes(t.id) ? 'on' : ''}`} onClick={() => toggleType(t.id)}>{t.name}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

const splitOpts = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
