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
 * Custo estimado em dólar dos tokens consumidos, por modelo, a partir do preço do catálogo.
 * `null` quando não há de onde estimar: nenhum modelo informado, ou **algum** dos modelos que
 * apareceram sem preço completo.
 */
export function costOf(catalog: ModelOption[], byModel: Map<string, AiRunTokens>): number | null {
  if (byModel.size === 0) return null;
  let totalUsd = 0;
  for (const [name, tokens] of byModel) {
    const model = matchModel(catalog, name);
    const price = model ? modelPrice(model) : null;
    // um modelo sem preço completo anula a estimativa inteira: soma parcial parece um custo medido
    // e na verdade é menor que o real, então não há estimativa parcial — só "não medido" (null).
    if (!price) return null;
    totalUsd +=
      tokens.inputTokens * price.input +
      tokens.outputTokens * price.output +
      tokens.cacheReadTokens * price.cacheRead +
      tokens.cacheWriteTokens * price.cacheWrite;
  }
  return totalUsd / 1e6;
}
