import type { ModelLadders } from './modelLadder';
import { parseModelValue, type ModelOption } from './models';

/** Como o revisor se distingue do implementador; `unchanged` e `same_provider_fallback` avisam que não houve independência plena. */
export type Independence = 'other_provider' | 'other_model' | 'configured' | 'same_provider_fallback' | 'unchanged';

export interface ReviewerPick {
  value: string;
  independence: Independence;
  /** texto (pt) do comentário quando não é `other_provider` */
  reason: string | null;
}

/** O perfil de CLI de um valor `tool:model@effort`. */
const profileOf = (value: string): string | null => {
  const id = parseModelValue(value)?.id;
  const at = id ? id.indexOf(':') : -1;
  return id && at > 0 ? id.slice(0, at) : null;
};

const optionOf = (catalog: readonly ModelOption[], value: string): ModelOption | undefined => {
  const id = parseModelValue(value)?.id;
  return id ? catalog.find((o) => o.id === id) : undefined;
};

const valueOfOption = (o: ModelOption): string => (o.defaultEffort ? `${o.id}@${o.defaultEffort}` : o.id);

/** Um valor existe no catálogo (modelo e, se tiver, esforço). */
function inCatalog(catalog: readonly ModelOption[], value: string): boolean {
  const v = parseModelValue(value);
  const o = optionOf(catalog, value);
  return !!v && !!o && (v.effort === null || o.efforts.includes(v.effort));
}

/** Preço de saída (US$/milhão) de cada modelo do perfil que o tem. */
function outputPrices(catalog: readonly ModelOption[], profileId: string): Map<string, number> {
  const prices = new Map<string, number>();
  for (const o of catalog) if (o.tool === profileId && typeof o.pricing?.output === 'number') prices.set(o.id, o.pricing.output);
  return prices;
}

/**
 * Nível barato do perfil: o 1º degrau da escada (quando ela tem 2+ degraus) ou o menor preço de saída (quando 2+
 * modelos têm preço e não são todos iguais). Sem escada nem preço, nada é barato.
 */
export function isCheapTier(catalog: readonly ModelOption[], ladders: ModelLadders, profileId: string, value: string): boolean {
  const ladder = ladders[profileId] ?? [];
  if (ladder.length >= 2 && ladder[0] === value) return true;
  const prices = outputPrices(catalog, profileId);
  if (prices.size < 2) return false;
  const own = prices.get(parseModelValue(value)?.id ?? '');
  const all = [...prices.values()];
  const min = Math.min(...all);
  return own !== undefined && own === min && min < Math.max(...all);
}

/** Valores do perfil na ordem de preferência: a escada (do mais barato ao mais forte) e depois o catálogo. */
function candidates(catalog: readonly ModelOption[], ladders: ModelLadders, profileId: string): string[] {
  const out: string[] = [];
  for (const v of ladders[profileId] ?? []) if (inCatalog(catalog, v) && profileOf(v) === profileId) out.push(v);
  for (const o of catalog) if (o.tool === profileId) out.push(valueOfOption(o));
  return [...new Set(out)];
}

/** Piso do revisor: o primeiro valor do perfil que não é barato (a #1112 usa para nunca baixar a revisão). */
export function reviewerFloor(catalog: readonly ModelOption[], ladders: ModelLadders, profileId: string): string | null {
  return candidates(catalog, ladders, profileId).find((v) => !isCheapTier(catalog, ladders, profileId, v)) ?? null;
}

/**
 * Escolhe o modelo do revisor, nunca o barato: (1) o piso de outro perfil pronto; (2) outro modelo do mesmo perfil;
 * (3) o configurado; (4) o atual, se não barato, ou o piso do perfil dele. null = manter como está.
 */
export function pickReviewerModel(i: {
  catalog: readonly ModelOption[];
  ladders: ModelLadders;
  readyProfileIds: readonly string[];
  implementer: string;
  current: string | null;
  configured: string | null;
}): ReviewerPick | null {
  const { catalog, ladders, implementer, current, configured } = i;
  const implProfile = profileOf(implementer);
  const implModel = parseModelValue(implementer)?.id ?? null;

  const profiles = [...new Set(catalog.map((o) => o.tool as string))].filter((p) => i.readyProfileIds.includes(p));
  for (const profile of profiles) {
    if (profile === implProfile) continue;
    const floor = reviewerFloor(catalog, ladders, profile);
    if (floor) return { value: floor, independence: 'other_provider', reason: null };
  }

  if (implProfile) {
    const other = candidates(catalog, ladders, implProfile).find(
      (v) => !isCheapTier(catalog, ladders, implProfile, v) && parseModelValue(v)?.id !== implModel,
    );
    if (other) {
      return { value: other, independence: 'other_model', reason: 'só há um agente pronto; usei outro modelo dele' };
    }
  }

  const cfgProfile = configured ? profileOf(configured) : null;
  if (configured && cfgProfile && inCatalog(catalog, configured) && !isCheapTier(catalog, ladders, cfgProfile, configured)) {
    if (parseModelValue(configured)?.id !== implModel) {
      return { value: configured, independence: 'configured', reason: 'usei o modelo do revisor configurado nas Configurações' };
    }
  }

  const curProfile = current ? profileOf(current) : implProfile;
  if (current && curProfile && !isCheapTier(catalog, ladders, curProfile, current)) {
    return { value: current, independence: 'unchanged', reason: 'sem revisor independente disponível: o mesmo modelo da implementação' };
  }
  const floor = curProfile ? reviewerFloor(catalog, ladders, curProfile) : null;
  return floor
    ? {
        value: floor,
        independence: 'same_provider_fallback',
        reason: 'sem revisor independente disponível: o mesmo modelo da implementação',
      }
    : null;
}
