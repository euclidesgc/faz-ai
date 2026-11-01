import { parseModelValue, type ModelOption } from './models';

/** Escada por perfil de CLI: valores de modelo (`tool:model@effort`) do mais barato ao mais forte. */
export type ModelLadders = Record<string, string[]>;

/** A chave, na tabela meta, da escada de modelos do board. */
export const MODEL_LADDERS_KEY = 'model_ladders';

/** Lê a escada salva; JSON inválido ou fora do formato vira escada vazia (a subida cai no esforço). */
export function parseLadders(json: string | null | undefined): ModelLadders {
  if (!json) return {};
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return {};
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: ModelLadders = {};
  for (const [profile, list] of Object.entries(v)) {
    if (!Array.isArray(list)) continue;
    const items = list.filter((x): x is string => typeof x === 'string' && x !== '');
    if (items.length) out[profile] = items;
  }
  return out;
}

/** O esforço do valor, com o padrão do modelo quando o valor não traz um. */
function effortOf(catalog: readonly ModelOption[], value: string): { option: ModelOption; index: number } | null {
  const v = parseModelValue(value);
  const option = v && catalog.find((o) => o.id === v.id);
  if (!v || !option) return null;
  const effort = v.effort ?? option.defaultEffort;
  const index = effort ? option.efforts.indexOf(effort) : -1;
  return index < 0 ? null : { option, index };
}

/** Um valor existe no catálogo (modelo e, se tiver, esforço). */
function inCatalog(catalog: readonly ModelOption[], value: string): boolean {
  const v = parseModelValue(value);
  const option = v && catalog.find((o) => o.id === v.id);
  if (!v || !option) return false;
  return v.effort === null || option.efforts.includes(v.effort);
}

/**
 * Próximo nível acima de `current`, ou null se está no topo.
 * 1) escada do perfil, se `current` está nela: o item seguinte (se estiver no catálogo);
 * 2) senão, o mesmo modelo com o próximo esforço de `ModelOption.efforts` (do menor ao maior);
 * 3) senão, null.
 */
export function nextTier(catalog: readonly ModelOption[], ladders: ModelLadders, profileId: string, current: string): string | null {
  const ladder = ladders[profileId] ?? [];
  const at = ladder.indexOf(current);
  if (at >= 0) {
    const next = ladder[at + 1];
    return next !== undefined && inCatalog(catalog, next) ? next : null;
  }
  const e = effortOf(catalog, current);
  if (!e) return null;
  const effort = e.option.efforts[e.index + 1];
  return effort === undefined ? null : `${e.option.id}@${effort}`;
}

/** Posição de `value` no que `nextTier` considera a escada (para "nunca baixa"); -1 se fora. */
export function tierRank(catalog: readonly ModelOption[], ladders: ModelLadders, profileId: string, value: string): number {
  const at = (ladders[profileId] ?? []).indexOf(value);
  if (at >= 0) return at;
  return effortOf(catalog, value)?.index ?? -1;
}

/**
 * Nível abaixo de `current`, simétrica de `nextTier`: o item anterior da escada do perfil
 * (se estiver no catálogo), senão o esforço anterior do mesmo modelo, senão null (já no primeiro degrau).
 */
export function previousTier(catalog: readonly ModelOption[], ladders: ModelLadders, profileId: string, current: string): string | null {
  const ladder = ladders[profileId] ?? [];
  const at = ladder.indexOf(current);
  if (at >= 0) {
    const prev = ladder[at - 1];
    return prev !== undefined && inCatalog(catalog, prev) ? prev : null;
  }
  const e = effortOf(catalog, current);
  if (!e || e.index <= 0) return null;
  return `${e.option.id}@${e.option.efforts[e.index - 1]}`;
}
