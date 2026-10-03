import { useState } from 'react';
import { badgeStyle } from '../../../shared/color';
import { fieldsForType } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { FieldEditor } from '../FieldRenderer';
import { Button, DeleteButton, FieldRow, IconPlus } from '../ui';
import { CardPreview, ContrastHint } from './ColorPreview';
import { PageHeader } from './PageHeader';

export function TypesSettings() {
  const state = useBoardStore((s) => s.state)!;
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader
        title="Tipos de card"
        actions={
          <Button variant="primary" disabled={adding} onClick={() => setAdding(true)}>
            <IconPlus /> Novo tipo
          </Button>
        }
      >
        Cada tipo pertence a um workflow (linha). Tipos da linha de baixo são sempre sub-tarefas de uma história.
      </PageHeader>
      <table className="table types-table">
        <thead>
          <tr>
            <th>Cor</th>
            <th>Prévia</th>
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
                  <TypePreview name={t.name} color={t.color} onPick={(c) => settings.updateType(t.id, { color: c })} />
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
                  <WorkflowSelect
                    value={t.defaultWorkflowId}
                    disabled={used > 0}
                    onChange={(id) => settings.updateType(t.id, { defaultWorkflowId: id })}
                  />
                </td>
                <td>{used}</td>
                <td className="narrow">
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
          {adding && <NewTypeRow onDone={() => setAdding(false)} />}
        </tbody>
      </table>

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

/** Prévia do card na cor do tipo, com o aviso de contraste e as sugestões de cor. */
function TypePreview({ name, color, onPick }: { name: string; color: string; onPick: (color: string) => void }) {
  return (
    <div className="preview-cell">
      <CardPreview typeName={name} color={color} />
      <ContrastHint color={color} onPick={onPick} />
    </div>
  );
}

function WorkflowSelect({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (id: string) => void }) {
  const workflows = useBoardStore((s) => s.state!.workflows);
  return (
    <select value={value} disabled={disabled} aria-label="Workflow" onChange={(e) => onChange(e.target.value)}>
      {workflows.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}

/** Linha de rascunho do tipo novo, com as mesmas colunas dos tipos existentes. Enter adiciona, Esc cancela. */
function NewTypeRow({ onDone }: { onDone: () => void }) {
  const firstWorkflow = useBoardStore((s) => s.state!.workflows[0]?.id ?? '');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4c8dff');
  const [wf, setWf] = useState(firstWorkflow);
  const ready = name.trim() !== '' && wf !== '';

  const add = () => {
    if (!ready) return;
    settings.createType(name.trim(), color, wf);
    onDone();
  };

  return (
    <tr className="draft-row">
      <td>
        <input type="color" value={color} aria-label="Cor do tipo novo" onChange={(e) => setColor(e.target.value)} />
      </td>
      <td>
        <TypePreview name={name.trim() || 'Novo tipo'} color={color} onPick={setColor} />
      </td>
      <td>
        <input
          autoFocus
          placeholder="Nome do tipo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') onDone();
          }}
        />
      </td>
      <td>
        <WorkflowSelect value={wf} onChange={setWf} />
      </td>
      <td />
      <td className="narrow">
        <Button variant="primary" disabled={!ready} onClick={add}>
          Adicionar
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </td>
    </tr>
  );
}
