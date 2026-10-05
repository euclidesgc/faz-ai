// Custo em dólar de uma execução de IA, a partir do preço por modelo cadastrado no catálogo.
// Calcula por modelo (e não pelo total de tokens vezes o preço de um modelo só) porque uma execução
// pode atravessar mais de um modelo — o subagente, por exemplo, pode rodar num modelo diferente do
// principal — e cada um custa o que o catálogo diz dele, não o que o modelo principal custaria.

import type { AiRunTokens } from '../../shared/log';
import { modelPrice, type ModelOption } from '../../shared/models';

/**
 * A entrada do catálogo que corresponde ao nome de modelo que a ferramenta usou, ou `null`.
 * A ferramenta devolve o nome completo da API (`claude-haiku-4-5-20251001`) e o catálogo guarda o
 * identificador curto da linha de comando (`haiku`): a correspondência é por conter, e o
 * identificador mais específico vence, para `claude-haiku-4-5` ganhar de `haiku` quando os dois
 * estão no catálogo.
 */
export function matchModel(catalog: ModelOption[], name: string): ModelOption | null {
  const n = name.toLowerCase();
  let best: ModelOption | null = null;
  for (const o of catalog) {
    const m = o.model.toLowerCase();
    // `o.model` vazio casaria com qualquer nome (toda string contém ''); isso não é um identificador.
    if (!m || !n.includes(m)) continue;
    if (!best || o.model.length > best.model.length) best = o;
  }
  return best;
}

/**
 * Tarifa do Cursor (Cursor Token Rate), em US$ por milhão de tokens, cobrada nos planos Teams e
 * Enterprise por cima do preço de lista dos modelos de terceiros, em todos os tipos de token.
 * https://cursor.com/help/models-and-usage/token-rate
 */
export const CURSOR_TOKEN_RATE = 0.25;

/**
 * Se a tarifa do Cursor incide sobre o modelo: só os de terceiros rodados pelo Cursor. Os modelos
 * do próprio Cursor (Composer e Grok) são isentos, e o `auto` não tem modelo conhecido por pedido.
 */
export function cursorTokenRateApplies(model: ModelOption): boolean {
  if (model.tool !== 'cursor') return false;
  const m = model.model.toLowerCase();
  return m !== 'auto' && !m.startsWith('composer') && !m.includes('grok');
}

export interface CostOptions {
  /** a regra do board "Cursor Token Rate": soma `CURSOR_TOKEN_RATE` aos modelos de terceiros do Cursor */
  cursorTokenRate?: boolean;
}

/**
 * Custo estimado em dólar dos tokens consumidos, por modelo, a partir do preço do catálogo.
 * `null` quando não há de onde estimar: nenhum modelo informado, ou **algum** dos modelos que
 * apareceram sem preço completo (ou com preço variável).
 */
export function costOf(catalog: ModelOption[], byModel: Map<string, AiRunTokens>, options: CostOptions = {}): number | null {
  if (byModel.size === 0) return null;
  let totalUsd = 0;
  for (const [name, tokens] of byModel) {
    const model = matchModel(catalog, name);
    const price = model ? modelPrice(model) : null;
    // um modelo sem preço completo anula a estimativa inteira: soma parcial parece um custo medido
    // e na verdade é menor que o real, então não há estimativa parcial — só "não medido" (null).
    if (!model || !price) return null;
    // a tarifa é a mesma para os quatro tipos de token, então entra somada a cada preço
    const rate = options.cursorTokenRate && cursorTokenRateApplies(model) ? CURSOR_TOKEN_RATE : 0;
    totalUsd +=
      tokens.inputTokens * (price.input + rate) +
      tokens.outputTokens * (price.output + rate) +
      tokens.cacheReadTokens * (price.cacheRead + rate) +
      tokens.cacheWriteTokens * (price.cacheWrite + rate);
  }
  return totalUsd / 1e6;
}
