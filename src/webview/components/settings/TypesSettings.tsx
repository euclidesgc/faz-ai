import { useState } from 'react';
import { badgeStyle } from '../../../shared/color';
import { fieldsForType } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { FieldEditor } from '../FieldRenderer';
import { Button, Card, TextField } from '@radix-ui/themes';
import { DeleteButton, FormField, IconPlus, SelectField } from '../ui';
import { isSkillsField } from './fields/fieldKinds';
import { SectionHeader } from './SectionHeader';
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
          <Button disabled={adding} onClick={() => setAdding(true)}>
            <IconPlus /> Novo tipo
          </Button>
        }
      >
        Cada tipo pertence a um workflow. Tipos de um workflow de sub-tarefas são sempre sub-tarefas de uma história.
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
                  <TextField.Root
                    aria-label={`Nome do tipo ${t.name}`}
                    key={t.name}
                    defaultValue={t.name}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value.trim() !== t.name &&
                      settings.updateType(t.id, { name: e.target.value.trim() })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
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

      <SectionHeader title="Padrões por tipo">
        Valores preenchidos automaticamente em cada card novo do tipo — por exemplo, o modelo e as skills que a IA deve ler ao executar
        aquele tipo de trabalho. Escolha as skills aqui e todo card novo do tipo já nasce com elas; cada card ainda pode mudar. Cards já
        criados não mudam.
      </SectionHeader>
      <div className="stack">
        {state.cardTypes.map((t) => {
          const fields = fieldsForType(state, t.id);
          return (
            <Card key={t.id} className="draft-card" aria-label={`Padrões do tipo ${t.name}`}>
              <div className="row">
                <span className="type-badge" style={badgeStyle(t.color)}>
                  {t.name}
                </span>
              </div>
              {fields.length === 0 && <span className="muted small">Nenhum campo se aplica a este tipo.</span>}
              {fields.map((f) => (
                <FormField key={f.id} label={f.name}>
                  {() =>
                    f.kind === 'multiselect' && f.options.length === 0 && !isSkillsField(f.name) ? (
                      <span className="muted small">Sem opções ainda.</span>
                    ) : (
                      <FieldEditor
                        field={f}
                        value={t.defaults[f.id] ?? null}
                        onChange={(v) => settings.updateType(t.id, { defaults: { ...t.defaults, [f.id]: v } })}
                      />
                    )
                  }
                </FormField>
              ))}
            </Card>
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
    <SelectField
      aria-label="Workflow"
      disabled={disabled}
      options={workflows.map((w) => ({ value: w.id, label: w.name }))}
      value={value}
      onChange={onChange}
    />
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
        <TextField.Root
          autoFocus
          aria-label="Nome do tipo novo"
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
        <div className="row-actions">
          <Button variant="soft" color="gray" onClick={onDone}>
            Cancelar
          </Button>
          <Button disabled={!ready} onClick={add}>
            Adicionar
          </Button>
        </div>
      </td>
    </tr>
  );
}
