import type { AiTool } from '../../../shared/harness';
import type { FieldDef } from '../../../shared/model';
import { EFFORT_FIELD, modelFieldOf, suggestModel, type ModelRule } from '../../../shared/models';
import { valueOf } from '../../../shared/selectors';
import { newId } from '../../db/ids';
import { detectTools, effortTiers, modelsFor } from '../../models';
import type { BoardContext, HandlerMap } from './context';

/**
 * Board sem catálogo (novo ou vindo de versão anterior): escolhe a ferramenta instalada nesta
 * máquina e preenche os modelos e as regras de esforço dela.
 */
export function initModels(ctx: BoardContext): void {
  const { board } = ctx.state();
  if (board.modelCatalog.length) return;
  const installed = detectTools(ctx.home);
  const tool = installed.includes(board.aiTool) ? board.aiTool : (installed[0] ?? board.aiTool);
  if (tool !== board.aiTool) ctx.boards.updateBoard(ctx.boardId, { aiTool: tool });
  useTool(ctx, tool);
}

/** Passa a trabalhar com a ferramenta: pasta de skills, modelos e regras de esforço dela. */
export function useTool(ctx: BoardContext, tool: AiTool): void {
  ctx.harness.setTool(tool);
  detectModels(ctx, tool);
  suggestRules(ctx, tool);
}

/**
 * Junta ao catálogo os modelos atuais da ferramenta, atualizando os que já existem. O preço que a
 * pessoa cadastrou é do catálogo, não da ferramenta: um modelo reencontrado mantém o preço que tinha
 * (senão cada "Detectar modelos" zeraria a estimativa de custo das execuções seguintes, sem aviso).
 */
function detectModels(ctx: BoardContext, tool: AiTool): void {
  const { board } = ctx.state();
  const priced = new Map(board.modelCatalog.flatMap((o) => (o.price ? [[o.id, o.price] as const] : [])));
  const found = modelsFor(tool, ctx.home).map((o) => (priced.has(o.id) ? { ...o, price: priced.get(o.id) } : o));
  const ids = new Set(found.map((o) => o.id));
  const rest = board.modelCatalog.filter((o) => !ids.has(o.id));
  const at = rest.findIndex((o) => o.tool === tool);
  rest.splice(at < 0 ? rest.length : at, 0, ...found);
  ctx.boards.setModelCatalog(ctx.boardId, rest);
}

/** Troca as regras do campo "Esforço" por um modelo leve, um intermediário e um forte da ferramenta. */
function suggestRules(ctx: BoardContext, tool: AiTool): void {
  let s = ctx.state();
  if (!s.board.modelCatalog.some((o) => o.tool === tool)) {
    detectModels(ctx, tool);
    s = ctx.state();
  }
  const field = s.fieldDefs.find((f) => f.name.toLowerCase() === EFFORT_FIELD.toLowerCase());
  if (!field) throw new Error(`O board não tem o campo "${EFFORT_FIELD}".`);
  const tiers = effortTiers(tool, s.board.modelCatalog).map(([value, model]): ModelRule => ({
    id: newId(),
    name: `${EFFORT_FIELD} ${value.toLowerCase()}`,
    enabled: true,
    groups: [[{ fieldId: field.id, op: 'is', value }]],
    model,
  }));
  // sai o que era só "Esforço = X"; regras montadas pela pessoa ficam, e na frente (a primeira que casa vence)
  const onlyEffort = (r: ModelRule) =>
    r.groups.length === 1 && r.groups[0]!.length === 1 && r.groups[0]![0]!.fieldId === field.id && r.groups[0]![0]!.op === 'is';
  ctx.boards.setModelRules(ctx.boardId, [...s.board.modelRules.filter((r) => !onlyEffort(r)), ...tiers]);
}

/** Campo de modelo do card e o que as regras sugerem para ele agora. */
export function suggestionFor(ctx: BoardContext, cardId: string): { field: FieldDef | undefined; suggestion: string | null } {
  const s = ctx.state();
  const card = s.cards.find((c) => c.id === cardId);
  return card ? { field: modelFieldOf(s, card), suggestion: suggestModel(s, card) } : { field: undefined, suggestion: null };
}

/**
 * Preenche o campo de modelo com a sugestão das regras quando ele está vazio ou ainda tem a
 * sugestão anterior (`previous`). Um modelo escolhido à mão nunca é trocado.
 */
export function applySuggestion(ctx: BoardContext, cardId: string, previous: string | null): void {
  const s = ctx.state();
  const card = s.cards.find((c) => c.id === cardId);
  const field = card && modelFieldOf(s, card);
  if (!card || !field || !s.board.rules.autoApplyModelSuggestion) return;
  const current = valueOf(s, cardId, field.id);
  const next = suggestModel(s, card);
  if ((current === null || current === previous) && next !== current) ctx.cards.setFieldValue(cardId, field.id, next);
}

/** Catálogo de modelos e regras de sugestão. */
export const modelHandlers = {
  'settings.models.set': (msg, ctx) => {
    ctx.boards.setModelCatalog(ctx.boardId, msg.catalog);
    return true;
  },
  'settings.models.detect': (msg, ctx) => {
    detectModels(ctx, msg.tool);
    return true;
  },
  'settings.modelRules.set': (msg, ctx) => {
    ctx.boards.setModelRules(ctx.boardId, msg.rules);
    return true;
  },
  'settings.modelRules.suggest': (msg, ctx) => {
    suggestRules(ctx, msg.tool);
    return true;
  },
} satisfies Partial<HandlerMap>;
