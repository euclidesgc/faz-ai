import { useState } from 'react';
import { badgeStyle } from '../../../shared/color';
import { fieldsForType, useBoardStore } from '../../store/boardStore';
import { FieldEditor } from '../FieldRenderer';

export function TypesSettings() {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const ask = useBoardStore((s) => s.ask);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4c8dff');
  const [wf, setWf] = useState(state.workflows[0]?.id ?? '');

  const add = () => {
    if (!name.trim() || !wf) return;
    send({ type: 'settings.type.create', name: name.trim(), color, defaultWorkflowId: wf });
    setName('');
  };

  return (
    <div>
      <h2>Tipos de card</h2>
      <p className="muted">Cada tipo pertence a um workflow (linha). Tipos da linha de baixo são sempre sub-tarefas de uma história.</p>
      <table className="table">
        <thead><tr><th>Cor</th><th>Nome</th><th>Workflow</th><th>Em uso</th><th></th></tr></thead>
        <tbody>
          {state.cardTypes.map((t) => {
            const used = state.cards.filter((c) => c.typeId === t.id).length;
            return (
              <tr key={t.id}>
                <td><input type="color" value={t.color} onChange={(e) => send({ type: 'settings.type.update', typeId: t.id, patch: { color: e.target.value } })} /></td>
                <td><input defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && send({ type: 'settings.type.update', typeId: t.id, patch: { name: e.target.value.trim() } })} /></td>
                <td>
                  <select value={t.defaultWorkflowId} disabled={used > 0} onChange={(e) => send({ type: 'settings.type.update', typeId: t.id, patch: { defaultWorkflowId: e.target.value } })}>
                    {state.workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </td>
                <td>{used}</td>
                <td><button className="icon danger" disabled={used > 0} title={used ? 'Tipo em uso' : 'Apagar'} onClick={() => ask({ title: `Apagar o tipo "${t.name}"?`, confirmLabel: 'Apagar', danger: true, onConfirm: () => send({ type: 'settings.type.delete', typeId: t.id }) })}>🗑</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input placeholder="Novo tipo" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <select value={wf} onChange={(e) => setWf(e.target.value)}>
          {state.workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="primary" disabled={!name.trim()} onClick={add}>Adicionar</button>
      </div>

      <h2 className="section-head">Padrões por tipo</h2>
      <p className="muted">Valores preenchidos automaticamente em cada card novo do tipo — por exemplo, o modelo e as skills que devem executar aquele tipo de trabalho. Cards já criados não mudam.</p>
      <div className="stack">
        {state.cardTypes.map((t) => {
          const fields = fieldsForType(state, t.id);
          return (
            <section key={t.id} className="settings-block">
              <div className="row"><span className="type-badge" style={badgeStyle(t.color)}>{t.name}</span></div>
              {fields.length === 0 && <span className="muted small">Nenhum campo se aplica a este tipo.</span>}
              {fields.map((f) => (
                <label key={f.id} className="field-row">
                  <span>{f.name}</span>
                  {f.kind === 'multiselect' && f.options.length === 0
                    ? <span className="muted small">Sem opções ainda.</span>
                    : <FieldEditor field={f} value={t.defaults[f.id] ?? null} onChange={(v) => send({ type: 'settings.type.update', typeId: t.id, patch: { defaults: { ...t.defaults, [f.id]: v } } })} />}
                </label>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
