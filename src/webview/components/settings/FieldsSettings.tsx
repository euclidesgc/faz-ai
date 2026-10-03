import { useState } from 'react';
import type { FieldDef, FieldDisplay, FieldKind } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { Button, Chip, ChipsEditor, DeleteButton, EnumSelect, FieldRow as Row } from '../ui';
import { PageHeader } from './PageHeader';

const KINDS: { value: FieldKind; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção' },
  { value: 'multiselect', label: 'Múltipla seleção' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'model', label: 'Modelo de IA' },
];
const DISPLAYS: { value: FieldDisplay; label: string }[] = [
  { value: 'badge', label: 'Badge' },
  { value: 'chip', label: 'Chip' },
  { value: 'inline', label: 'Nome: valor' },
  { value: 'hidden', label: 'Só no detalhe' },
];
const hasOptions = (k: FieldKind) => k === 'select' || k === 'multiselect';

export function FieldsSettings() {
  const state = useBoardStore((s) => s.state)!;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [display, setDisplay] = useState<FieldDisplay>('inline');
  const [options, setOptions] = useState('');

  const add = () => {
    if (!name.trim()) return;
    settings.createField({ name: name.trim(), kind, display, options: hasOptions(kind) ? splitOpts(options) : [], appliesToTypes: null });
    setName('');
    setOptions('');
  };

  return (
    <div>
      <PageHeader title="Campos personalizados">
        Campos aparecem no detalhe do card e, conforme a exibição escolhida, também na face do card no board.
      </PageHeader>
      {state.fieldDefs.map((f) => (
        <FieldRow key={f.id} field={f} />
      ))}
      <section className="settings-block">
        <h3>Novo campo</h3>
        <div className="row wrap">
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <EnumSelect options={KINDS} value={kind} onChange={setKind} />
          <EnumSelect options={DISPLAYS} value={display} onChange={setDisplay} />
          {hasOptions(kind) && (
            <input placeholder="Opções separadas por vírgula" value={options} onChange={(e) => setOptions(e.target.value)} />
          )}
          <Button variant="primary" disabled={!name.trim()} onClick={add}>
            Adicionar
          </Button>
        </div>
      </section>
    </div>
  );
}

function FieldRow({ field }: { field: FieldDef }) {
  const state = useBoardStore((s) => s.state)!;
  const all = field.appliesToTypes === null;
  const allIds = state.cardTypes.map((t) => t.id);

  return (
    <section className="settings-block">
      <div className="row wrap">
        <input
          className="h3-input"
          defaultValue={field.name}
          onBlur={(e) =>
            e.target.value.trim() && e.target.value !== field.name && settings.updateField(field.id, { name: e.target.value.trim() })
          }
        />
        <span className="muted">{KINDS.find((k) => k.value === field.kind)?.label}</span>
        <EnumSelect options={DISPLAYS} value={field.display} onChange={(display) => settings.updateField(field.id, { display })} />
        <span className="spacer" />
        <DeleteButton
          question={`Apagar o campo "${field.name}"?`}
          message="Os valores deste campo em todos os cards serão apagados."
          onConfirm={() => settings.deleteField(field.id)}
        />
      </div>
      {hasOptions(field.kind) && (
        <Row label="Opções">
          <input
            defaultValue={field.options.join(', ')}
            onBlur={(e) => settings.updateField(field.id, { options: splitOpts(e.target.value) })}
          />
        </Row>
      )}
      <Row as="div" label="Aplica-se a">
        <ChipsEditor
          options={state.cardTypes.map((t) => ({ value: t.id, label: t.name }))}
          values={field.appliesToTypes ?? allIds}
          // marcar todos os tipos equivale a "Todos" (null)
          onChange={(next) => settings.updateField(field.id, { appliesToTypes: next.length === allIds.length ? null : next })}
          before={
            <Chip on={all} onClick={() => settings.updateField(field.id, { appliesToTypes: all ? [] : null })}>
              Todos
            </Chip>
          }
        />
      </Row>
    </section>
  );
}

const splitOpts = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
