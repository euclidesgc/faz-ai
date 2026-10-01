import { norm } from './filters';
import { AI_TOOLS, type AiTool } from './harness';
import type { BoardState, Card, FieldDef, FieldValue, Id } from './model';

/** Um modelo de LLM disponível em uma ferramenta, com os níveis de esforço que ele aceita. */
export interface ModelOption {
  /** `<ferramenta>:<modelo>`, único no catálogo */
  id: string;
  tool: AiTool;
  /** identificador usado pela ferramenta (ex.: "opus", "k3", "gpt-6.1-sol") */
  model: string;
  label: string;
  /** níveis de esforço/raciocínio aceitos; vazio = o modelo não tem esse ajuste */
  efforts: string[];
  defaultEffort: string | null;
}

/** Campo especial usado em condições: o tipo do card. */
export const TYPE_CONDITION = '@type';

export interface RuleCondition {
  /** id de um campo, ou TYPE_CONDITION */
  fieldId: Id;
  op: 'is' | 'isNot';
  value: string;
}

/**
 * Regra de sugestão de modelo. `groups` é uma lista de alternativas (OU); cada alternativa é uma
 * lista de condições que precisam valer juntas (E). A primeira regra ligada que casa vence.
 */
export interface ModelRule {
  id: string;
  name: string;
  enabled: boolean;
  groups: RuleCondition[][];
  /** valor de campo do tipo modelo: `<id do modelo>@<esforço>` */
  model: string;
}

/** Lê as regras salvas, convertendo o formato antigo (um campo = um valor) para o atual. */
export function parseModelRules(json: string | null | undefined): ModelRule[] {
  return parseJsonArray<Partial<ModelRule> & { fieldId?: string; value?: string }>(json).flatMap((r) => {
    if (!r || typeof r.id !== 'string' || typeof r.model !== 'string') return [];
    const groups = Array.isArray(r.groups)
      ? r.groups.map((g) => (Array.isArray(g) ? g.filter((c) => c && typeof c.fieldId === 'string') : [])).filter((g) => g.length)
      : r.fieldId ? [[{ fieldId: r.fieldId, op: 'is' as const, value: r.value ?? '' }]] : [];
    return [{ id: r.id, name: r.name ?? '', enabled: r.enabled !== false, groups, model: r.model }];
  });
}

export const EFFORT_FIELD = 'Esforço';
export const EFFORT_LEVELS = ['Baixo', 'Médio', 'Alto'] as const;

export const modelId = (tool: AiTool, model: string): string => `${tool}:${model}`;

/** Valor de um campo do tipo modelo: `<id do modelo>` ou `<id do modelo>@<esforço>`. */
export function parseModelValue(value: FieldValue | undefined): { id: string; effort: string | null } | null {
  if (typeof value !== 'string' || !value) return null;
  const at = value.lastIndexOf('@');
  return at > 0 ? { id: value.slice(0, at), effort: value.slice(at + 1) || null } : { id: value, effort: null };
}

export const modelValue = (id: string, effort: string | null): string => (effort ? `${id}@${effort}` : id);

const toolLabel = (tool: AiTool): string => AI_TOOLS.find((t) => t.id === tool)?.label ?? tool;

/** Texto para exibir um valor de modelo, ex.: "Opus 5.5 · high". */
export function modelLabel(catalog: ModelOption[], value: FieldValue | undefined, withTool = false): string {
  const v = parseModelValue(value);
  if (!v) return '';
  const o = catalog.find((x) => x.id === v.id);
  const name = o ? (withTool ? `${toolLabel(o.tool)} · ${o.label}` : o.label) : v.id;
  return v.effort ? `${name} · ${v.effort}` : name;
}

/**
 * Interpreta um modelo escrito por uma pessoa ou IA: o valor exato (`claude:opus@high`), ou o
 * nome/identificador do modelo seguido opcionalmente do esforço ("Opus 5.5 high", "k3 @ max").
 */
export function resolveModelInput(catalog: ModelOption[], text: string): string {
  const raw = text.trim();
  const exact = parseModelValue(raw);
  const byId = exact && catalog.find((o) => o.id === exact.id);
  const pick = (o: ModelOption, effort: string | null): string => {
    if (effort && !o.efforts.some((e) => norm(e) === norm(effort)))
      throw new Error(`O modelo "${o.label}" não aceita o esforço "${effort}". Aceitos: ${o.efforts.join(', ') || 'nenhum'}.`);
    const e = effort ? o.efforts.find((x) => norm(x) === norm(effort))! : o.defaultEffort;
    return modelValue(o.id, e);
  };
  if (byId) return pick(byId, exact.effort);
  const clean = norm(raw.replace(/[·@]/g, ' ')).split(/\s+/).filter(Boolean);
  for (const o of catalog) {
    for (const name of [o.label, o.model, o.id, `${toolLabel(o.tool)} ${o.label}`, `${o.tool} ${o.label}`, `${o.tool} ${o.model}`]) {
      const words = norm(name).split(/\s+/);
      if (words.every((w, i) => clean[i] === w) && clean.length - words.length <= 1) return pick(o, clean[words.length] ?? null);
    }
  }
  throw new Error(`Modelo "${text}" não está no catálogo. Disponíveis: ${catalog.map((o) => `${o.label} (${o.id})`).join(', ') || 'nenhum'}.`);
}

/** Primeiro campo do tipo modelo que se aplica ao card. */
export function modelFieldOf(state: BoardState, card: Card): FieldDef | undefined {
  return state.fieldDefs.find((f) => f.kind === 'model' && (f.appliesToTypes === null || f.appliesToTypes.includes(card.typeId)));
}

function conditionHolds(state: BoardState, card: Card, c: RuleCondition): boolean {
  let values: string[];
  if (c.fieldId === TYPE_CONDITION) values = [state.cardTypes.find((t) => t.id === card.typeId)?.name ?? ''];
  else {
    const v = state.fieldValues.find((x) => x.cardId === card.id && x.fieldId === c.fieldId)?.value;
    // checkbox desmarcado não tem valor salvo: conta como "false"
    values = v === undefined || v === null ? (state.fieldDefs.find((f) => f.id === c.fieldId)?.kind === 'checkbox' ? ['false'] : []) : Array.isArray(v) ? v : [String(v)];
  }
  const has = values.some((x) => norm(x) === norm(c.value));
  return c.op === 'is' ? has : !has;
}

export const ruleMatches = (state: BoardState, card: Card, rule: ModelRule): boolean =>
  rule.groups.some((group) => group.length > 0 && group.every((c) => conditionHolds(state, card, c)));

/** Modelo sugerido para o card pelas regras do board, ou null se nenhuma casa. */
export function suggestModel(state: BoardState, card: Card): string | null {
  return state.board.modelRules.find((r) => r.enabled && ruleMatches(state, card, r))?.model ?? null;
}

/** Texto de uma regra, ex.: `Esforço = Alto E Tags = backend OU Tipo = Bug`. */
export function describeRule(state: BoardState, rule: ModelRule): string {
  const name = (c: RuleCondition) => (c.fieldId === TYPE_CONDITION ? 'Tipo' : state.fieldDefs.find((f) => f.id === c.fieldId)?.name ?? '(campo apagado)');
  return rule.groups.map((g) => g.map((c) => `${name(c)} ${c.op === 'is' ? '=' : '≠'} ${c.value}`).join(' E ')).join(' OU ') || '(sem condições)';
}

export function parseJsonArray<T>(json: string | null | undefined): T[] {
  try {
    const v: unknown = JSON.parse(json ?? '');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
