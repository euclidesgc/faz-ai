import { useState } from 'react';
import { Badge, CheckboxGroup, IconButton, SegmentedControl, Switch, Text, TextField } from '@radix-ui/themes';
import type { FieldDef, FieldDisplay, Id } from '../../../../shared/model';
import { modelValue } from '../../../../shared/models';
import { useBoardStore } from '../../../store/boardStore';
import { t } from '../../../i18n';
import { FieldBadge } from '../../FieldRenderer';
import { FormField, IconClose } from '../../ui';
import { FIELD_DISPLAYS, kindInfo } from './fieldKinds';

/** Como o campo aparece no board: as quatro opções e, abaixo, o campo de exemplo do jeito escolhido. */
export function DisplayPicker({
  field,
  onChange,
}: {
  field: Pick<FieldDef, 'name' | 'kind' | 'options' | 'display'>;
  onChange: (d: FieldDisplay) => void;
}) {
  const catalog = useBoardStore((s) => s.state!.board.modelCatalog);
  const info = FIELD_DISPLAYS.find((d) => d.value === field.display)!;
  const model = catalog[0];
  const sample =
    field.kind === 'model' ? (model ? modelValue(model.id, model.defaultEffort) : null) : kindInfo(field.kind).sample(field.options);
  const preview = { ...field, id: 'preview', boardId: '', appliesToTypes: null, position: 0, name: field.name || t('Campo') } as FieldDef;
  return (
    <FormField label={t('No board')} hint={t(info.hint)}>
      {(id) => (
        <div className="display-picker">
          <SegmentedControl.Root id={id} size="1" value={field.display} onValueChange={(v) => onChange(v as FieldDisplay)}>
            {FIELD_DISPLAYS.map((d) => (
              <SegmentedControl.Item key={d.value} value={d.value}>
                {t(d.label)}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
          <div className="field-preview" aria-label={t('Prévia no card')}>
            <Text size="1" color="gray">
              {t('Prévia:')}
            </Text>
            {field.display === 'hidden' ? (
              <Text size="1" color="gray">
                {t('(não aparece)')}
              </Text>
            ) : (
              <FieldBadge field={preview} value={sample} />
            )}
          </div>
        </div>
      )}
    </FormField>
  );
}

/** Opções de um campo de seleção: selos com X para tirar e um campo para incluir (Enter). */
export function OptionsEditor({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !options.includes(v)) onChange([...options, v]);
    setDraft('');
  };
  return (
    <FormField label={t('Opções')} hint={t('Digite uma opção e aperte Enter. As opções aparecem na ordem da lista.')}>
      {(id) => (
        <div className="options-editor">
          {options.map((o) => (
            <Badge key={o} size="2" variant="surface" color="gray" className="option-chip">
              {o}
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                aria-label={t('Tirar a opção {option}', { option: o })}
                onClick={() => onChange(options.filter((x) => x !== o))}
              >
                <IconClose />
              </IconButton>
            </Badge>
          ))}
          <TextField.Root
            id={id}
            size="1"
            placeholder={t('Nova opção')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
            onBlur={add}
          />
        </div>
      )}
    </FormField>
  );
}

/** Em quais tipos de card o campo existe: todos (null) ou uma lista. */
export function AppliesTo({ value, onChange }: { value: Id[] | null; onChange: (value: Id[] | null) => void }) {
  const types = useBoardStore((s) => s.state!.cardTypes);
  const all = value === null;
  return (
    <FormField
      label={t('Tipos de card')}
      hint={all ? t('O campo existe em todos os tipos, inclusive nos que forem criados depois.') : t('Só os tipos marcados têm o campo.')}
    >
      {(id) => (
        <div className="applies-to">
          <Text as="label" size="2" className="switch-row">
            <Switch id={id} size="1" checked={all} onCheckedChange={(on) => onChange(on ? null : types.map((ty) => ty.id))} />
            {t('Todos os tipos')}
          </Text>
          {!all && (
            <CheckboxGroup.Root size="1" value={value} onValueChange={(next) => onChange(next.length === types.length ? null : next)}>
              {types.map((ty) => (
                <CheckboxGroup.Item key={ty.id} value={ty.id}>
                  {ty.name}
                </CheckboxGroup.Item>
              ))}
            </CheckboxGroup.Root>
          )}
        </div>
      )}
    </FormField>
  );
}
