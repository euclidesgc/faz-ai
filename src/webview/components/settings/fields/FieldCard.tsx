import { useState } from 'react';
import { Badge, Button, Card, Select, Text, TextField } from '@radix-ui/themes';
import type { FieldDef, FieldDisplay, FieldKind, Id } from '../../../../shared/model';
import { settings } from '../../../commands';
import { DeleteButton, FormField } from '../../ui';
import { AppliesTo, DisplayPicker, OptionsEditor } from './FieldParts';
import { FIELD_KINDS, hasOptions, isSkillsField, kindInfo } from './fieldKinds';

/** Um campo existente: nome, tipo (fixo depois de criado), como aparece no board, opções e tipos de card. */
export function FieldCard({ field }: { field: FieldDef }) {
  const info = kindInfo(field.kind);
  const update = (patch: Parameters<typeof settings.updateField>[1]) => settings.updateField(field.id, patch);
  return (
    <Card className="field-card" aria-label={`Campo ${field.name}`}>
      <div className="field-card-head">
        <FormField label="Nome">
          {(id) => (
            <TextField.Root
              id={id}
              key={field.name}
              defaultValue={field.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== field.name) update({ name });
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          )}
        </FormField>
        <div className="field-kind">
          <Text size="1" weight="medium">
            Tipo
          </Text>
          <Badge size="2" color="indigo" variant="soft">
            {info.label}
          </Badge>
          <Text size="1" color="gray">
            {info.hint}
          </Text>
        </div>
        <DeleteButton
          title="Apagar o campo"
          question={`Apagar o campo "${field.name}"?`}
          message="Os valores deste campo em todos os cards serão apagados."
          onConfirm={() => settings.deleteField(field.id)}
        />
      </div>
      <div className="field-card-body">
        <DisplayPicker field={field} onChange={(display) => update({ display })} />
        {hasOptions(field.kind) &&
          (isSkillsField(field.name) ? (
            <FormField label="Opções" hint="As opções acompanham as skills do projeto e as instaladas (Configurações > Harness de IA).">
              {() => <Text size="2">{field.options.length} skills disponíveis</Text>}
            </FormField>
          ) : (
            <OptionsEditor options={field.options} onChange={(options) => update({ options })} />
          ))}
        <AppliesTo value={field.appliesToTypes} onChange={(appliesToTypes) => update({ appliesToTypes })} />
      </div>
    </Card>
  );
}

/** Rascunho do campo novo: o tipo é escolhido aqui (depois não muda), com a explicação de cada um. */
export function NewFieldCard({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [display, setDisplay] = useState<FieldDisplay>('badge');
  const [options, setOptions] = useState<string[]>([]);
  const [appliesToTypes, setAppliesToTypes] = useState<Id[] | null>(null);
  const ready = name.trim() !== '' && (!hasOptions(kind) || options.length > 0);

  const create = () => {
    if (!ready) return;
    settings.createField({ name: name.trim(), kind, display, options: hasOptions(kind) ? options : [], appliesToTypes });
    onDone();
  };

  return (
    <Card className="field-card draft" aria-label="Campo novo">
      <div className="field-card-head">
        <FormField label="Nome">
          {(id) => (
            <TextField.Root
              id={id}
              autoFocus
              placeholder="Ex.: Prazo, Pontos, Cliente"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create();
                if (e.key === 'Escape') onDone();
              }}
            />
          )}
        </FormField>
        <FormField label="Tipo" hint={`${kindInfo(kind).hint} O tipo não muda depois de criado.`}>
          {(id) => (
            <Select.Root value={kind} onValueChange={(v) => setKind(v as FieldKind)}>
              <Select.Trigger id={id} className="kind-select" />
              <Select.Content position="popper">
                {FIELD_KINDS.map((k) => (
                  <Select.Item key={k.value} value={k.value}>
                    {k.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          )}
        </FormField>
      </div>
      <div className="field-card-body">
        <DisplayPicker field={{ name: name.trim(), kind, options, display }} onChange={setDisplay} />
        {hasOptions(kind) && <OptionsEditor options={options} onChange={setOptions} />}
        <AppliesTo value={appliesToTypes} onChange={setAppliesToTypes} />
      </div>
      <div className="field-card-actions">
        <Button variant="soft" color="gray" onClick={onDone}>
          Cancelar
        </Button>
        <Button disabled={!ready} onClick={create}>
          Criar campo
        </Button>
      </div>
    </Card>
  );
}
