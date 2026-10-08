import { norm } from './filters';
import { AI_TOOLS, type AiTool } from './harness';
import type { BoardState, Card, FieldDef, FieldValue, Id } from './model';
import { valueOf } from './selectors';

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
  /**
   * veio da lista da própria ferramenta (`cursor-agent models`), e não da lista embutida: um catálogo
   * com ele já recebeu a lista real, mesmo que a pessoa o tenha reduzido aos mesmos ids da embutida
   */
  fromTool?: true;
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
      : r.fieldId
        ? [[{ fieldId: r.fieldId, op: 'is' as const, value: r.value ?? '' }]]
        : [];
    return [{ id: r.id, name: r.name ?? '', enabled: r.enabled !== false, groups, model: r.model }];
  });
}

/** Tamanho da tarefa; não confundir com o esforço (nível de raciocínio) do modelo. */
export const EFFORT_FIELD = 'Esforço da atividade';
export const MODEL_EFFORT_LABEL = 'Esforço do modelo';
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

function formatModel(catalog: ModelOption[], value: FieldValue | undefined, withTool: boolean, effort: (e: string) => string): string {
  const v = parseModelValue(value);
  if (!v) return '';
  const o = catalog.find((x) => x.id === v.id);
  const name = o ? (withTool ? `${toolLabel(o.tool)} · ${o.label}` : o.label) : v.id;
  return v.effort ? `${name}${effort(v.effort)}` : name;
}

/** Texto de um valor de modelo para a IA e o MCP, ex.: "Opus 5.5 · high" (o `resolveModelInput` lê de volta). */
export const modelLabel = (catalog: ModelOption[], value: FieldValue | undefined, withTool = false): string =>
  formatModel(catalog, value, withTool, (e) => ` · ${e}`);

/** Nível de esforço como as ferramentas escrevem, em português para a interface. */
export const EFFORT_LABELS: Record<string, string> = {
  low: 'baixo',
  light: 'leve',
  medium: 'médio',
  high: 'alto',
  xhigh: 'muito alto',
  max: 'máximo',
  ultra: 'ultra',
};

/** Rótulo do esforço na interface; um nível desconhecido aparece como a ferramenta escreve. */
export const effortLabel = (effort: string): string => EFFORT_LABELS[effort.toLowerCase()] ?? effort;

/** Texto de um valor de modelo na interface, ex.: "Haiku 4.5 - baixo". */
export const modelDisplay = (
  catalog: ModelOption[],
  value: FieldValue | undefined,
  withTool = false,
  /** traduz o nome do esforço (a interface em inglês passa `t`) */
  translate: (text: string) => string = (s) => s,
): string => formatModel(catalog, value, withTool, (e) => ` - ${translate(effortLabel(e))}`);

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
  throw new Error(
    `Modelo "${text}" não está no catálogo. Disponíveis: ${catalog.map((o) => `${o.label} (${o.id})`).join(', ') || 'nenhum'}.`,
  );
}

/** Primeiro campo do tipo modelo que se aplica ao card. */
export function modelFieldOf(state: BoardState, card: Card): FieldDef | undefined {
  return state.fieldDefs.find((f) => f.kind === 'model' && (f.appliesToTypes === null || f.appliesToTypes.includes(card.typeId)));
}

function conditionHolds(state: BoardState, card: Card, c: RuleCondition): boolean {
  let values: string[];
  if (c.fieldId === TYPE_CONDITION) values = [state.cardTypes.find((t) => t.id === card.typeId)?.name ?? ''];
  else {
    const v = valueOf(state, card.id, c.fieldId);
    // checkbox desmarcado não tem valor salvo: conta como "false"
    values =
      v === undefined || v === null
        ? state.fieldDefs.find((f) => f.id === c.fieldId)?.kind === 'checkbox'
          ? ['false']
          : []
        : Array.isArray(v)
          ? v
          : [String(v)];
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
export function describeRule(
  state: BoardState,
  rule: ModelRule,
  /** na interface: `word` traduz as palavras da frase, `name` os nomes do board padrão (campos e opções) */
  tr: { word: (s: string) => string; name: (s: string) => string } = { word: (s) => s, name: (s) => s },
): string {
  const name = (c: RuleCondition) =>
    c.fieldId === TYPE_CONDITION
      ? tr.word('Tipo')
      : tr.name(state.fieldDefs.find((f) => f.id === c.fieldId)?.name ?? tr.word('(campo apagado)'));
  return (
    rule.groups
      .map((g) => g.map((c) => `${name(c)} ${c.op === 'is' ? '=' : '≠'} ${tr.name(c.value)}`).join(` ${tr.word('E')} `))
      .join(` ${tr.word('OU')} `) || tr.word('(sem condições)')
  );
}

export function parseJsonArray<T>(json: string | null | undefined): T[] {
  try {
    const v: unknown = JSON.parse(json ?? '');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
