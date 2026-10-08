import type { AiTool } from '../../../shared/harness';
import type { FieldDef } from '../../../shared/model';
import { EFFORT_FIELD, modelFieldOf, suggestModel, type ModelOption, type ModelRule } from '../../../shared/models';
import { valueOf } from '../../../shared/selectors';
import { newId } from '../../db/ids';
import { detectTools, effortTiers, fastBaseId, isFastVariant, modelsFor } from '../../models';
import type { BoardContext, HandlerMap } from './context';

/**
 * Board sem catálogo (novo ou vindo de versão anterior): escolhe a ferramenta instalada nesta
 * máquina e preenche os modelos e as regras de esforço dela. Com catálogo, só tira dele o que sobrou
 * de quando o board guardava preços (ver `withoutPrices`).
 */
export function initModels(ctx: BoardContext): void {
  const { board } = ctx.state();
  if (board.modelCatalog.length) return dropSavedPrices(ctx);
  const installed = detectTools(ctx.home);
  const tool = installed.includes(board.aiTool) ? board.aiTool : (installed[0] ?? board.aiTool);
  if (tool !== board.aiTool) ctx.boards.updateBoard(ctx.boardId, { aiTool: tool });
  useTool(ctx, tool);
}

/**
 * O board já guardou preço, origem do preço e "preço variável" em cada modelo do catálogo. Nada disso
 * é usado mais — o custo é o que a ferramenta informa —, então sai do catálogo gravado. Roda a cada
 * abertura do board e só grava quando algo mudou.
 */
export function dropSavedPrices(ctx: BoardContext): void {
  const { board } = ctx.state();
  const next = board.modelCatalog.map(withoutPrices);
  if (JSON.stringify(next) !== JSON.stringify(board.modelCatalog)) ctx.boards.setModelCatalog(ctx.boardId, next);
}

/** O modelo sem os campos de preço que catálogos gravados em versões anteriores ainda podem trazer. */
function withoutPrices(o: ModelOption): ModelOption {
  const {
    price: _price,
    variablePrice: _variable,
    priceSource: _source,
    priceCheckedAt: _checked,
    priceUrl: _url,
    ...rest
  } = o as ModelOption & Record<string, unknown>;
  return rest;
}

/** Passa a trabalhar com a ferramenta: pasta de skills, modelos e regras de esforço dela. */
export function useTool(ctx: BoardContext, tool: AiTool): void {
  ctx.harness.setTool(tool);
  detectModels(ctx, tool);
  suggestRules(ctx, tool);
}

/** Junta ao catálogo os modelos atuais da ferramenta, atualizando os que já existem. */
function detectModels(ctx: BoardContext, tool: AiTool): void {
  const { board } = ctx.state();
  const all = modelsFor(tool);
  // as variantes rápidas do Cursor só entram com a regra ligada
  const found = all.filter((o) => board.rules.includeFastModels || !isFastVariant(o, all));
  const ids = new Set(found.map((o) => o.id));
  const rest = board.modelCatalog.filter((o) => !ids.has(o.id));
  const at = rest.findIndex((o) => o.tool === tool);
  rest.splice(at < 0 ? rest.length : at, 0, ...found);
  ctx.boards.setModelCatalog(ctx.boardId, rest);
}

/**
 * A regra das variantes rápidas mudou: ligada, elas entram no catálogo pela última lista lida do
 * Cursor; desligada, saem do catálogo (as que são versão rápida de outro modelo dele).
 */
export function applyFastModels(ctx: BoardContext): void {
  const { board } = ctx.state();
  if (board.rules.includeFastModels) return addFastModels(ctx);
  ctx.boards.setModelCatalog(
    ctx.boardId,
    board.modelCatalog.filter((o) => o.tool !== 'cursor' || !isFastVariant(o, board.modelCatalog)),
  );
}

/**
 * Junta as versões rápidas dos modelos do Cursor que estão no catálogo, cada uma logo depois do
 * modelo dela. Não traz de volta o que a pessoa tirou: sem o modelo, a versão rápida também não entra.
 */
function addFastModels(ctx: BoardContext): void {
  const catalog = [...ctx.state().board.modelCatalog];
  const all = modelsFor('cursor');
  for (const o of all) {
    if (!isFastVariant(o, all) || catalog.some((x) => x.id === o.id)) continue;
    const at = catalog.findIndex((x) => x.id === fastBaseId(o));
    if (at >= 0) catalog.splice(at + 1, 0, o);
  }
  ctx.boards.setModelCatalog(ctx.boardId, catalog);
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
    if (msg.fastOnly) addFastModels(ctx);
    else detectModels(ctx, msg.tool);
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
