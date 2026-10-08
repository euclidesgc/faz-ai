import { useState } from 'react';
import { modelDisplay } from '../../modelText';
import { aiToolInfo } from '../../../shared/harness';
import { EFFORT_FIELD, TYPE_CONDITION, describeRule, modelValue, type ModelRule, type RuleCondition } from '../../../shared/models';
import type { BoardState } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { t, dt } from '../../i18n';
import { ModelEditor } from '../FieldRenderer';
import { Button, Card, IconButton, Switch, TextField } from '@radix-ui/themes';
import { FormField, IconArrowDown, IconArrowUp, IconClose, IconEdit, IconPlus, IconTrash, SelectField } from '../ui';
import { useSentList } from './useSentList';
import { SectionHeader } from './SectionHeader';

const OPS: { value: RuleCondition['op']; label: string }[] = [
  { value: 'is', label: 'é' },
  { value: 'isNot', label: 'não é' },
];

/** O Select do Radix não aceita `value` vazio. */
const EMPTY = '__empty';

const newId = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** O que pode ser usado numa condição: o tipo do card e os campos de opções fixas. */
function sources(state: BoardState): { id: string; name: string; values: string[] }[] {
  return [
    { id: TYPE_CONDITION, name: t('Tipo do card'), values: state.cardTypes.map((ct) => ct.name) },
    ...state.fieldDefs
      .filter((f) => f.kind === 'select' || f.kind === 'multiselect' || f.kind === 'checkbox')
      .map((f) => ({ id: f.id, name: f.name, values: f.kind === 'checkbox' ? ['true', 'false'] : f.options })),
  ];
}

const valueText = (v: string): string => (v === 'true' ? t('Sim') : v === 'false' ? t('Não') : dt(v));

function ConditionRow({
  state,
  condition,
  onChange,
  onRemove,
}: {
  state: BoardState;
  condition: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
}) {
  const all = sources(state);
  const source = all.find((s) => s.id === condition.fieldId);
  const unknown = source && !source.values.includes(condition.value);
  return (
    <div className="row condition">
      <SelectField
        aria-label={t('Campo da condição')}
        options={[
          ...(source ? [] : [{ value: condition.fieldId, label: t('(campo apagado)') }]),
          ...all.map((s) => ({ value: s.id, label: dt(s.name) })),
        ]}
        value={condition.fieldId}
        onChange={(fieldId) => onChange({ ...condition, fieldId, value: all.find((s) => s.id === fieldId)?.values[0] ?? '' })}
      />
      <SelectField
        aria-label={t('Operador')}
        options={OPS.map((o) => ({ ...o, label: t(o.label) }))}
        value={condition.op}
        onChange={(op) => onChange({ ...condition, op })}
      />
      <SelectField
        aria-label={t('Valor da condição')}
        options={[
          ...(unknown ? [{ value: condition.value || EMPTY, label: valueText(condition.value) || '—' }] : []),
          ...(source?.values.map((v) => ({ value: v, label: valueText(v) })) ?? []),
        ]}
        value={condition.value || EMPTY}
        onChange={(value) => onChange({ ...condition, value: value === EMPTY ? '' : value })}
      />
      <IconButton variant="ghost" color="gray" title={t('Remover a condição')} aria-label={t('Remover a condição')} onClick={onRemove}>
        <IconClose />
      </IconButton>
    </div>
  );
}

/** Monta uma regra: grupos de condições ligadas por E, com OU entre os grupos. */
export function RuleBuilder({ initial, onSave, onCancel }: { initial: ModelRule; onSave: (r: ModelRule) => void; onCancel: () => void }) {
  const state = useBoardStore((s) => s.state)!;
  const [rule, setRule] = useState(initial);
  const first = sources(state).find((s) => s.name.toLowerCase() === EFFORT_FIELD.toLowerCase()) ?? sources(state)[0]!;
  const blank = (): RuleCondition => ({ fieldId: first.id, op: 'is', value: first.values[0] ?? '' });
  const setGroup = (gi: number, group: RuleCondition[]) =>
    setRule({ ...rule, groups: rule.groups.map((g, i) => (i === gi ? group : g)).filter((g) => g.length) });
  const valid = rule.groups.length > 0 && rule.groups.every((g) => g.length > 0 && g.every((c) => c.value !== '')) && rule.model !== '';

  return (
    <Card className="draft-card rule-builder" aria-label={t('Regra de sugestão')}>
      <FormField label={t('Nome da regra')}>
        {(id) => (
          <TextField.Root
            id={id}
            autoFocus
            value={rule.name}
            placeholder={t('Ex.: Backend pesado')}
            onChange={(e) => setRule({ ...rule, name: e.target.value })}
          />
        )}
      </FormField>

      <div className="muted small">{t('Quando')}</div>
      {rule.groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="joiner or">{t('OU')}</div>}
          <div className="condition-group">
            {group.map((c, ci) => (
              <div key={ci}>
                {ci > 0 && <div className="joiner">{t('E')}</div>}
                <ConditionRow
                  state={state}
                  condition={c}
                  onChange={(next) =>
                    setGroup(
                      gi,
                      group.map((x, i) => (i === ci ? next : x)),
                    )
                  }
                  onRemove={() =>
                    setGroup(
                      gi,
                      group.filter((_, i) => i !== ci),
                    )
                  }
                />
              </div>
            ))}
            <Button variant="ghost" size="1" onClick={() => setGroup(gi, [...group, blank()])}>
              {t('+ E (outra condição neste grupo)')}
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button variant="ghost" size="1" onClick={() => setRule({ ...rule, groups: [...rule.groups, [blank()]] })}>
          {t('+ OU (grupo alternativo)')}
        </Button>
      </div>

      <FormField
        label={t('Sugerir')}
        hint={`${describeRule(state, rule, { word: t, name: dt })} → ${modelDisplay(state.board.modelCatalog, rule.model, true) || t('(escolha um modelo)')}`}
      >
        {() => <ModelEditor value={rule.model} onChange={(v) => setRule({ ...rule, model: typeof v === 'string' ? v : '' })} />}
      </FormField>

      <FormField
        label={t('Reserva (opcional)')}
        hint={
          rule.fallback
            ? modelDisplay(state.board.modelCatalog, rule.fallback, true)
            : t('Sem reserva: se o modelo principal esgotar o limite, a execução não é repetida.')
        }
      >
        {() => (
          <ModelEditor
            value={rule.fallback ?? null}
            onChange={(v) => setRule({ ...rule, fallback: typeof v === 'string' && v ? v : null })}
          />
        )}
      </FormField>

      <div className="form-actions">
        <Button variant="soft" color="gray" onClick={onCancel}>
          {t('Cancelar')}
        </Button>
        <Button disabled={!valid} onClick={() => onSave(rule)}>
          {state.board.modelRules.some((r) => r.id === rule.id) ? t('Salvar regra') : t('Adicionar à lista')}
        </Button>
      </div>
    </Card>
  );
}

/** Lista das regras em uso (a ordem importa) e o montador de regras. */
export function ModelRulesEditor() {
  const state = useBoardStore((s) => s.state)!;
  const { modelRules: rules, modelCatalog: allModels, aiTool } = state.board;
  const catalog = allModels.filter((o) => o.tool === aiTool);
  const [editing, setEditing] = useState<ModelRule | null>(null);

  // as mudanças partem da última lista enviada (ver useSentList)
  const sent = useSentList(rules, settings.setModelRules);
  const setRules = sent.save;
  const move = (i: number, delta: number) => {
    const next = [...sent.current()];
    const [r] = next.splice(i, 1);
    next.splice(i + delta, 0, r!);
    setRules(next);
  };
  const save = (rule: ModelRule) => {
    const current = sent.current();
    setRules(current.some((r) => r.id === rule.id) ? current.map((r) => (r.id === rule.id ? rule : r)) : [...current, rule]);
    setEditing(null);
  };
  const startNew = () => {
    const src = sources(state);
    const first = src.find((s) => s.name.toLowerCase() === EFFORT_FIELD.toLowerCase()) ?? src[0]!;
    const o = catalog[0];
    setEditing({
      id: newId(),
      name: '',
      enabled: true,
      groups: [[{ fieldId: first.id, op: 'is', value: first.values[0] ?? '' }]],
      model: o ? modelValue(o.id, o.defaultEffort) : '',
      fallback: null,
    });
  };
  const tool = aiToolInfo(aiTool);
  const hasEffort = state.fieldDefs.some((f) => f.name.toLowerCase() === EFFORT_FIELD.toLowerCase());

  return (
    <div>
      <SectionHeader
        title={t('Sugestão de modelo')}
        actions={
          <>
            <Button
              variant="soft"
              color="gray"
              disabled={!hasEffort}
              title={t('Gera Baixo, Médio e Alto com um modelo leve, um intermediário e um forte do {tool}', { tool: tool.label })}
              onClick={() => settings.suggestModelRules(aiTool)}
            >
              {t('Recriar as regras de "{field}"', { field: dt(EFFORT_FIELD) })}
            </Button>
            <Button disabled={!catalog.length || editing !== null} onClick={startNew}>
              <IconPlus /> {t('Montar nova regra')}
            </Button>
          </>
        }
      >
        {t(
          'Regras que sugerem um modelo a partir dos atributos do card. As regras são avaliadas de cima para baixo e a primeira ligada que casa vence. O resultado é sempre uma sugestão: no card, o modelo e o esforço podem ser trocados a qualquer momento.',
        )}
      </SectionHeader>

      {editing && <RuleBuilder key={editing.id} initial={editing} onSave={save} onCancel={() => setEditing(null)} />}

      <table className="table">
        <thead>
          <tr>
            <th></th>
            <th>{t('Regra')}</th>
            <th>{t('Quando')}</th>
            <th>{t('Sugere')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={r.id} className={r.enabled ? '' : 'off'}>
              <td className="narrow">
                <Switch
                  size="1"
                  title={r.enabled ? t('Regra em uso') : t('Regra desligada')}
                  aria-label={t('Regra {name} em uso', { name: r.name || i + 1 })}
                  checked={r.enabled}
                  onCheckedChange={(enabled) => setRules(sent.current().map((x) => (x.id === r.id ? { ...x, enabled } : x)))}
                />
              </td>
              <td>{r.name ? dt(r.name) : <span className="muted">{t('(sem nome)')}</span>}</td>
              <td>{describeRule(state, r, { word: t, name: dt })}</td>
              <td>
                {modelDisplay(allModels, r.model, true)}
                {r.fallback && (
                  <div className="muted small">{t('reserva: {model}', { model: modelDisplay(allModels, r.fallback, true) })}</div>
                )}
              </td>
              <td className="narrow">
                <IconButton
                  variant="ghost"
                  color="gray"
                  title={t('Subir (tem prioridade sobre as de baixo)')}
                  aria-label={t('Subir')}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <IconArrowUp />
                </IconButton>
                <IconButton
                  variant="ghost"
                  color="gray"
                  title={t('Descer')}
                  aria-label={t('Descer')}
                  disabled={i === rules.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <IconArrowDown />
                </IconButton>
                <IconButton variant="ghost" color="gray" title={t('Editar')} aria-label={t('Editar')} onClick={() => setEditing(r)}>
                  <IconEdit />
                </IconButton>
                {/* sem confirmação de propósito: a regra pode ser remontada em segundos */}
                <IconButton
                  variant="ghost"
                  color="red"
                  title={t('Remover da lista')}
                  aria-label={t('Remover da lista')}
                  onClick={() => setRules(sent.current().filter((x) => x.id !== r.id))}
                >
                  <IconTrash />
                </IconButton>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                {t('Nenhuma regra na lista: o board não sugere modelo.')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
