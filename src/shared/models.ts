import { baseValue } from './harness';
import type { AiBase, AiProfile } from './aiProfiles';
import { norm } from './filters';
import { AI_BASES, type AiTool } from './harness';
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
  /**
   * Quando a lista da ferramenta foi lida (epoch ms), no modelo que veio dela (história 12): a tela de Modelos diz
   * de quando é o catálogo, e um catálogo velho (a conta mudou de plano, o Google tirou um modelo) fica visível.
   */
  readAt?: number;
  /**
   * a versão mínima da CLI para o modelo, quando a documentação da ferramenta diz (o Claude Code); a tela de Modelos
   * avisa quando a CLI instalada é mais velha, porque aí o apelido roda um modelo anterior
   */
  requires?: string;
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
    return [
      {
        id: r.id,
        name: r.name ?? '',
        enabled: r.enabled !== false,
        groups,
        model: r.model,
      },
    ];
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

const toolLabel = (tool: AiTool): string => AI_BASES.find((t) => t.id === tool)?.label ?? tool;

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

/**
 * Janela de contexto, em tokens, dos modelos que o board conhece, pelo nome que a ferramenta aceita.
 * Claude: a tabela de modelos da Anthropic (cache de 2026-10-06): Fable 5.1, Opus 5.5, Sonnet 5.5 e
 * Haiku 5.5 com 1M; Haiku 4.5 com 200 mil. O apelido `haiku` é o Haiku 5.5 desde o Claude Code v2.1.293 (a página
 * de modelos da documentação, lida no Conectar); numa CLI mais velha ele roda o 4.5. Um modelo fora
 * daqui, como os do Cursor, fica sem janela: a tela não inventa o tamanho.
 */
const CONTEXT_WINDOWS: Partial<Record<AiBase, Record<string, number>>> = {
  claude: {
    fable: 1_000_000,
    opus: 1_000_000,
    sonnet: 1_000_000,
    haiku: 1_000_000,
    'claude-fable-5-1': 1_000_000,
    'claude-opus-5-5': 1_000_000,
    'claude-sonnet-5-5': 1_000_000,
    'claude-haiku-5-5': 1_000_000,
    'claude-haiku-4-5': 200_000,
  },
  // Kimi Code: o `maxContextSize` de `kimi provider list --json` (CLI 2.1.1, 2026-10-13)
  kimi: {
    'kimi-code/kimi-for-coding': 1_048_576,
    'kimi-code/kimi-for-coding-highspeed': 262_144,
    'kimi-code/k3': 1_048_576,
    'kimi-code/k3-256k': 262_144,
  },
};

/** A janela de contexto do modelo, ou null quando o board não a conhece. */
export const contextWindowOf = (tool: AiTool, model: string): number | null =>
  (baseValue(CONTEXT_WINDOWS, tool) ?? undefined)?.[model] ?? null;

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
export function resolveModelInput(catalog: ModelOption[], text: string, profiles: readonly AiProfile[] = []): string {
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
  // o modelo livre vale em qualquer personalizado ligado, não só no padrão: o prefixo diz qual
  const profile = exact && profiles.find((p) => p.enabled && p.kind === 'custom' && exact.id.startsWith(`${p.id}:`));
  if (profile) {
    const name = exact.id.slice(profile.id.length + 1);
    if (name && !/[\s\0:@]/.test(name) && (!exact.effort || !/[\s\0:@]/.test(exact.effort))) return raw;
  }
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

/** Regra que casa com o card, a primeira habilitada que casa, ou null se nenhuma casa. */
export function suggestModelRule(state: BoardState, card: Card): ModelRule | null {
  return state.board.modelRules.find((r) => r.enabled && ruleMatches(state, card, r)) ?? null;
}

/** Modelo sugerido para o card pelas regras do board, ou null se nenhuma casa. */
export function suggestModel(state: BoardState, card: Card): string | null {
  return suggestModelRule(state, card)?.model ?? null;
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

/** Nomes de modelo que geram mídia, voz ou vetores, não texto: um "Responda OK" neles falha ou não diz nada. */
const NON_TEXT_MODEL = /(tts|image|imagen|veo|embedding|aqa|audio|native-audio|live|banana|robotics|computer-use)/i;

/** Os modelos de uma ferramenta no catálogo para o teste rápido: os de texto primeiro, na ordem do catálogo. */
export function testModels(catalog: readonly ModelOption[], tool: string): ModelOption[] {
  const own = catalog.filter((m) => m.tool === tool);
  return [...own.filter((m) => !NON_TEXT_MODEL.test(m.model)), ...own.filter((m) => NON_TEXT_MODEL.test(m.model))];
}
