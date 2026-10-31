/** Teto de consumo por história: regra pura (sem banco nem `vscode`), usada pelo host e pela webview. */

export type BudgetPolicy = 'finish' | 'downgrade' | 'stop';
export type BudgetEffort = 'Baixo' | 'Médio' | 'Alto';

export interface BudgetConfig {
  enabled: boolean;
  /** Teto em tokens por nível de "Esforço da atividade". */
  byEffort: Record<BudgetEffort, number>;
  /** Percentual (50..95) em que o aviso e a política são aplicados. */
  warnAt: number;
  policy: BudgetPolicy;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  enabled: false,
  byEffort: { Baixo: 5_000_000, Médio: 20_000_000, Alto: 60_000_000 },
  warnAt: 80,
  policy: 'finish',
};

export const BUDGET_META_KEY = 'budget_config';
export const budgetCardKey = (cardId: string): string => `budget_card:${cardId}`;
export const budgetStateKey = (storyId: string): string => `budget_state:${storyId}`;

export const WARN_MIN = 50;
export const WARN_MAX = 95;
const EFFORTS: BudgetEffort[] = ['Baixo', 'Médio', 'Alto'];
const POLICIES: BudgetPolicy[] = ['finish', 'downgrade', 'stop'];

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Lê a configuração salva; ausente ou inválida vira o padrão (desligado), campo a campo. */
export function parseBudget(json: string | null | undefined): BudgetConfig {
  if (!json) return DEFAULT_BUDGET;
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return DEFAULT_BUDGET;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return DEFAULT_BUDGET;
  const o = v as Record<string, unknown>;
  const by = o.byEffort && typeof o.byEffort === 'object' ? (o.byEffort as Record<string, unknown>) : {};
  const byEffort = { ...DEFAULT_BUDGET.byEffort };
  for (const e of EFFORTS) {
    const n = by[e];
    if (positive(n)) byEffort[e] = Math.floor(n);
  }
  const warn = o.warnAt;
  const warnAt = typeof warn === 'number' && Number.isInteger(warn) && warn >= WARN_MIN && warn <= WARN_MAX ? warn : DEFAULT_BUDGET.warnAt;
  return {
    enabled: o.enabled === true,
    byEffort,
    warnAt,
    policy: POLICIES.includes(o.policy as BudgetPolicy) ? (o.policy as BudgetPolicy) : DEFAULT_BUDGET.policy,
  };
}

/** Teto do card: número = próprio; 'off' = sem teto nesta história; ausente = padrão do esforço. */
export type CardCeiling = number | 'off' | null;

/** Teto <= 0 ou ilegível é ignorado (usa o padrão), para um valor ruim não travar nem liberar a história. */
export function parseCardCeiling(raw: string | null | undefined): CardCeiling {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === 'off') return 'off';
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** O teto efetivo em tokens, ou null (desligado ou 'off'). Esforço desconhecido usa Médio. */
export function ceilingOf(cfg: BudgetConfig, card: CardCeiling, effort: string | null): number | null {
  if (!cfg.enabled || card === 'off') return null;
  if (typeof card === 'number') return card;
  return cfg.byEffort[EFFORTS.find((e) => e === effort) ?? 'Médio'];
}

export type BudgetLevel = 'ok' | 'warn' | 'exceeded';

/** Os limites são inclusivos: 80% exatos já avisam e 100% exatos já recusam. */
export function budgetLevel(used: number, ceiling: number, warnAt: number): BudgetLevel {
  if (used >= ceiling) return 'exceeded';
  if (used >= (ceiling * warnAt) / 100) return 'warn';
  return 'ok';
}

/** Estado gravado por história: o teto para o qual o aviso e a parada já foram dados. */
export interface BudgetState {
  ceiling: number;
  warned: boolean;
  stopped: boolean;
}

export function parseBudgetState(raw: string | null | undefined): BudgetState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<BudgetState> | null;
    if (!v || typeof v !== 'object' || !positive(v.ceiling)) return null;
    return { ceiling: v.ceiling, warned: v.warned === true, stopped: v.stopped === true };
  } catch {
    return null;
  }
}

export interface DowngradeInput {
  id: string;
  model: string | null;
  handPicked: boolean;
  escalated: boolean;
  review: boolean;
  started: boolean;
}
export interface DowngradePlan {
  change: { id: string; from: string; to: string }[];
  kept: { id: string; reason: string }[];
}

/**
 * Quem pode descer um nível. Nunca: modelo escolhido à mão, subido por checagem (a subida prevalece),
 * Revisão (nunca é barateada), card já executado, sem modelo ou já no primeiro degrau.
 * As exclusões chegam calculadas e `previous` dá o nível abaixo: a função não lê o banco.
 */
export function planDowngrade(cards: readonly DowngradeInput[], previous: (model: string) => string | null): DowngradePlan {
  const plan: DowngradePlan = { change: [], kept: [] };
  for (const c of cards) {
    const reason = c.handPicked
      ? 'modelo escolhido à mão'
      : c.escalated
        ? 'modelo subido por checagem'
        : c.review
          ? 'Revisão'
          : c.started
            ? 'já executado'
            : !c.model
              ? 'sem modelo'
              : null;
    if (reason || !c.model) {
      plan.kept.push({ id: c.id, reason: reason ?? 'sem modelo' });
      continue;
    }
    const to = previous(c.model);
    if (to === null || to === c.model) plan.kept.push({ id: c.id, reason: 'já no nível mais baixo' });
    else plan.change.push({ id: c.id, from: c.model, to });
  }
  return plan;
}

const fmt = (n: number): string => n.toLocaleString('pt-BR');
const ids = (xs: readonly string[]): string => xs.join(', ');

/** Textos das notas postadas na conversa (assinadas "Faz AI" pelo host). */
export const budgetNote = {
  /** Aviso ao cruzar `warnAt`; `action` é uma das frases abaixo. */
  warn(used: number, ceiling: number, action: string, unmeasured = 0): string {
    const pct = Math.floor((used / ceiling) * 100);
    return `**Teto de consumo**: a história gastou ${pct}% do teto (${fmt(used)} de ${fmt(ceiling)} tokens). ${action}${unmeasured ? ` ${budgetNote.unmeasured(unmeasured)}` : ''}`;
  },
  actionFinish: 'A execução em curso termina e a história passou para você.',
  actionStop: 'A história foi bloqueada.',
  actionDowngrade(changed: readonly string[], kept: readonly { id: string; reason: string }[]): string {
    const k = kept.length ? ` Ficaram: ${kept.map((x) => `${x.id} (${x.reason})`).join(', ')}.` : '';
    return `Desci o modelo de: ${ids(changed)}.${k}`;
  },
  /** Em 100%: o board para de iniciar execuções sozinho. */
  stopped(used: number, ceiling: number, unmeasured = 0): string {
    return `**Teto de consumo**: ${fmt(used)} de ${fmt(ceiling)} tokens. O board não inicia mais execuções sozinho; suba o teto na aba Consumo ou continue à mão.${unmeasured ? ` ${budgetNote.unmeasured(unmeasured)}` : ''}`;
  },
  manualAbove: 'Você iniciou à mão com a história acima do teto.',
  unmeasured(n: number): string {
    return `${n} execução(ões) sem consumo medido não entram na conta.`;
  },
};
