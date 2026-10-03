import { useState } from 'react';
import { aiToolInfo } from '../../../shared/harness';
import {
  EFFORT_FIELD,
  TYPE_CONDITION,
  describeRule,
  modelLabel,
  modelValue,
  type ModelRule,
  type RuleCondition,
} from '../../../shared/models';
import type { BoardState } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { ModelEditor } from '../FieldRenderer';
import { Button, EnumSelect, FieldRow } from '../ui';

const OPS: { value: RuleCondition['op']; label: string }[] = [
  { value: 'is', label: 'é' },
  { value: 'isNot', label: 'não é' },
];

const newId = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** O que pode ser usado numa condição: o tipo do card e os campos de opções fixas. */
function sources(state: BoardState): { id: string; name: string; values: string[] }[] {
  return [
    { id: TYPE_CONDITION, name: 'Tipo do card', values: state.cardTypes.map((t) => t.name) },
    ...state.fieldDefs
      .filter((f) => f.kind === 'select' || f.kind === 'multiselect' || f.kind === 'checkbox')
      .map((f) => ({ id: f.id, name: f.name, values: f.kind === 'checkbox' ? ['true', 'false'] : f.options })),
  ];
}

const valueText = (v: string): string => (v === 'true' ? 'Sim' : v === 'false' ? 'Não' : v);

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
  return (
    <div className="row condition">
      <select
        value={condition.fieldId}
        onChange={(e) =>
          onChange({ ...condition, fieldId: e.target.value, value: all.find((s) => s.id === e.target.value)?.values[0] ?? '' })
        }
      >
        {!source && <option value={condition.fieldId}>(campo apagado)</option>}
        {all.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <EnumSelect options={OPS} value={condition.op} onChange={(op) => onChange({ ...condition, op })} />
      <select value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })}>
        {source && !source.values.includes(condition.value) && <option value={condition.value}>{valueText(condition.value) || '—'}</option>}
        {source?.values.map((v) => (
          <option key={v} value={v}>
            {valueText(v)}
          </option>
        ))}
      </select>
      <Button variant="icon" title="Remover a condição" onClick={onRemove}>
        ✕
      </Button>
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
    <section className="settings-block rule-builder">
      <FieldRow label="Nome da regra">
        <input value={rule.name} placeholder="Ex.: Backend pesado" onChange={(e) => setRule({ ...rule, name: e.target.value })} />
      </FieldRow>

      <div className="muted small">Quando</div>
      {rule.groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="joiner or">OU</div>}
          <div className="condition-group">
            {group.map((c, ci) => (
              <div key={ci}>
                {ci > 0 && <div className="joiner">E</div>}
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
            <Button variant="ghost" size="small" onClick={() => setGroup(gi, [...group, blank()])}>
              + E (outra condição neste grupo)
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button variant="ghost" size="small" onClick={() => setRule({ ...rule, groups: [...rule.groups, [blank()]] })}>
          + OU (grupo alternativo)
        </Button>
      </div>

      <FieldRow label="Sugerir">
        <ModelEditor value={rule.model} onChange={(v) => setRule({ ...rule, model: typeof v === 'string' ? v : '' })} />
      </FieldRow>
      <div className="muted small">
        {describeRule(state, rule)} → {modelLabel(state.board.modelCatalog, rule.model, true) || '(escolha um modelo)'}
      </div>

      <div className="row">
        <Button variant="primary" disabled={!valid} onClick={() => onSave(rule)}>
          {state.board.modelRules.some((r) => r.id === rule.id) ? 'Salvar regra' : 'Adicionar à lista'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}

/** Lista das regras em uso (a ordem importa) e o montador de regras. */
export function ModelRulesEditor() {
  const state = useBoardStore((s) => s.state)!;
  const { modelRules: rules, modelCatalog: allModels, aiTool } = state.board;
  const catalog = allModels.filter((o) => o.tool === aiTool);
  const [editing, setEditing] = useState<ModelRule | null>(null);

  const setRules = (next: ModelRule[]) => settings.setModelRules(next);
  const move = (i: number, delta: number) => {
    const next = [...rules];
    const [r] = next.splice(i, 1);
    next.splice(i + delta, 0, r!);
    setRules(next);
  };
  const save = (rule: ModelRule) => {
    setRules(rules.some((r) => r.id === rule.id) ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule]);
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
    });
  };
  const tool = aiToolInfo(aiTool);
  const hasEffort = state.fieldDefs.some((f) => f.name.toLowerCase() === EFFORT_FIELD.toLowerCase());

  return (
    <div>
      <h2 className="section-head">Sugestão de modelo</h2>
      <p className="muted">
        Regras que sugerem um modelo a partir dos atributos do card. As regras são avaliadas de cima para baixo e a primeira ligada que casa
        vence. O resultado é sempre uma sugestão: no card, o modelo e o esforço podem ser trocados a qualquer momento.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th></th>
            <th>Regra</th>
            <th>Quando</th>
            <th>Sugere</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={r.id} className={r.enabled ? '' : 'off'}>
              <td className="narrow">
                <input
                  type="checkbox"
                  title={r.enabled ? 'Regra em uso' : 'Regra desligada'}
                  checked={r.enabled}
                  onChange={(e) => setRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))}
                />
              </td>
              <td>{r.name || <span className="muted">(sem nome)</span>}</td>
              <td>{describeRule(state, r)}</td>
              <td>{modelLabel(allModels, r.model, true)}</td>
              <td className="narrow">
                <Button variant="icon" title="Subir (tem prioridade sobre as de baixo)" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </Button>
                <Button variant="icon" title="Descer" disabled={i === rules.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </Button>
                <Button variant="icon" title="Editar" onClick={() => setEditing(r)}>
                  ✎
                </Button>
                {/* sem confirmação de propósito: a regra pode ser remontada em segundos */}
                <Button variant="icon" danger title="Remover da lista" onClick={() => setRules(rules.filter((x) => x.id !== r.id))}>
                  🗑
                </Button>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Nenhuma regra na lista: o board não sugere modelo.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {editing ? (
        <RuleBuilder key={editing.id} initial={editing} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <div className="row">
          <Button variant="primary" disabled={!catalog.length} onClick={startNew}>
            Montar nova regra
          </Button>
          <span className="spacer" />
          <Button
            disabled={!hasEffort}
            title={`Gera Baixo, Médio e Alto com um modelo leve, um intermediário e um forte do ${tool.label}`}
            onClick={() => settings.suggestModelRules(aiTool)}
          >
            Recriar as regras de "{EFFORT_FIELD}"
          </Button>
        </div>
      )}
    </div>
  );
}
