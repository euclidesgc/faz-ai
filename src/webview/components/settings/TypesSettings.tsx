import { useState } from 'react';
import { badgeStyle } from '../../../shared/color';
import { fieldsForType, useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { FieldEditor } from '../FieldRenderer';
import { AddInput, DeleteButton, FieldRow } from '../ui';

export function TypesSettings() {
  const state = useBoardStore((s) => s.state)!;
  const [color, setColor] = useState('#4c8dff');
  const [wf, setWf] = useState(state.workflows[0]?.id ?? '');

  const add = (name: string) => {
    if (!wf) return false;
    settings.createType(name, color, wf);
  };

  return (
    <div>
      <h2>Tipos de card</h2>
      <p className="muted">Cada tipo pertence a um workflow (linha). Tipos da linha de baixo são sempre sub-tarefas de uma história.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Cor</th>
            <th>Nome</th>
            <th>Workflow</th>
            <th>Em uso</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {state.cardTypes.map((t) => {
            const used = state.cards.filter((c) => c.typeId === t.id).length;
            return (
              <tr key={t.id}>
                <td>
                  <input type="color" value={t.color} onChange={(e) => settings.updateType(t.id, { color: e.target.value })} />
                </td>
                <td>
                  <input
                    defaultValue={t.name}
                    onBlur={(e) =>
                      e.target.value.trim() && e.target.value !== t.name && settings.updateType(t.id, { name: e.target.value.trim() })
                    }
                  />
                </td>
                <td>
                  <select
                    value={t.defaultWorkflowId}
                    disabled={used > 0}
                    onChange={(e) => settings.updateType(t.id, { defaultWorkflowId: e.target.value })}
                  >
                    {state.workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{used}</td>
                <td>
                  <DeleteButton
                    disabled={used > 0}
                    title={used ? 'Tipo em uso' : 'Apagar'}
                    question={`Apagar o tipo "${t.name}"?`}
                    onConfirm={() => settings.deleteType(t.id)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <AddInput placeholder="Novo tipo" onAdd={add} buttonLabel="Adicionar">
          <select value={wf} onChange={(e) => setWf(e.target.value)}>
            {state.workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </AddInput>
      </div>

      <h2 className="section-head">Padrões por tipo</h2>
      <p className="muted">
        Valores preenchidos automaticamente em cada card novo do tipo — por exemplo, o modelo e as skills que devem executar aquele tipo de
        trabalho. Cards já criados não mudam.
      </p>
      <div className="stack">
        {state.cardTypes.map((t) => {
          const fields = fieldsForType(state, t.id);
          return (
            <section key={t.id} className="settings-block">
              <div className="row">
                <span className="type-badge" style={badgeStyle(t.color)}>
                  {t.name}
                </span>
              </div>
              {fields.length === 0 && <span className="muted small">Nenhum campo se aplica a este tipo.</span>}
              {fields.map((f) => (
                <FieldRow key={f.id} label={f.name}>
                  {f.kind === 'multiselect' && f.options.length === 0 ? (
                    <span className="muted small">Sem opções ainda.</span>
                  ) : (
                    <FieldEditor
                      field={f}
                      value={t.defaults[f.id] ?? null}
                      onChange={(v) => settings.updateType(t.id, { defaults: { ...t.defaults, [f.id]: v } })}
                    />
                  )}
                </FieldRow>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
