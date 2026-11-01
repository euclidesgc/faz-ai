import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiRun } from '../../src/extension/log/aiRunRepo';
import type { Arm } from './harnessArm';
import type { AcceptanceResult, ReferenceStory } from './stories';
import type { EvalConfig, EvalEnd, EvalLog, StoryRun } from './types';

export interface TokenTotals {
  input: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  output: number | null;
}

/**
 * O custo de uma história ou da rodada (#C2a): o indicador principal do piloto. `usd` soma o custo gravado em
 * cada execução, o informado pela CLI ou, sem ele, o estimado pelo preço do catálogo; `estimatedUsd` é a
 * parte estimada (já dentro de `usd`) e `informedUsd`, a informada. Os buckets separam a leitura e a criação
 * de cache, porque é a troca entre os dois que explica custo subindo com tokens caindo. `unpricedRuns` conta
 * as execuções com tokens e sem custo (modelo sem preço no catálogo): nelas os tokens são o único indicador,
 * e `complete` diz se nenhuma ficou de fora. Não medido é `null`, nunca 0.
 */
export interface CostTotals {
  usd: number | null;
  informedUsd: number | null;
  estimatedUsd: number | null;
  buckets: TokenTotals;
  /** execuções com custo */
  runs: number;
  unpricedRuns: number;
  /** toda execução com tokens tem custo (e há ao menos uma com custo) */
  complete: boolean;
}

export interface StoryScore {
  id: string;
  accepted: boolean;
  end: EvalEnd;
  endNote: string | null;
  durationMs: number;
  runs: number;
  tokens: TokenTotals;
  /** o total de `cost.usd`, repetido pelo nome antigo do placar (versão 1) */
  costUsd: number | null;
  /** `cost.runs`, pelo nome antigo */
  costRuns: number;
  cost: CostTotals;
  modelMismatches: number;
  signals: EvalLog['signals'];
  acceptance: { exitCode: number | null; durationMs: number } | null;
  /** anexos exigidos pela história que não apareceram (a história só é aceita sem nenhum faltando) */
  missingArtifacts: string[];
}

export interface RoundSummary {
  stories: number;
  accepted: number;
  acceptanceRate: number;
  /** o indicador principal: custo das histórias aceitas dividido por elas; null sem aceita ou sem custo */
  costPerAccepted: number | null;
  /** custo só das histórias aceitas (o numerador de `costPerAccepted`) */
  acceptedCost: CostTotals;
  /** custo da rodada toda, aceitas ou não */
  cost: CostTotals;
  /** indicador de apoio: todos os tokens da rodada */
  tokens: TokenTotals & { total: number | null };
  tokensPerAccepted: number | null;
  costUsd: number | null;
  costRuns: number;
  runs: number;
  durationMs: number;
}

export interface Scoreboard {
  /** 2: custo por tarefa aceita como indicador principal, com os buckets e o estimado (#C2a); 1: só tokens e custo informado */
  version: 1 | 2;
  date: string;
  fazAi: { version: string; commit: string; dirty: boolean };
  config: EvalConfig;
  /** o braço do piloto de contexto mínimo; `null` sem `--arm` (e em placar antigo, sem o campo) */
  arm: Arm | null;
  /** o hash do fixture e o que o braço não mede; `null` sem `--arm` */
  harness: { hash: string; notMeasured: string[] } | null;
  summary: RoundSummary;
  stories: StoryScore[];
}

/** Soma os valores não nulos; `null` quando nenhum foi medido (não medido não é zero). */
function sumOrNull(values: Array<number | null | undefined>): number | null {
  const measured = values.filter((v): v is number => v != null);
  return measured.length === 0 ? null : measured.reduce((a, b) => a + b, 0);
}

const tokensOfRun = (r: AiRun): number =>
  (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0);

/** O custo das execuções de uma história. `costEstimated` nulo com custo gravado conta como estimado, como o board. */
export function costOfRuns(runs: AiRun[]): CostTotals {
  const priced = runs.filter((r) => r.costUsd !== null);
  const unpriced = runs.filter((r) => r.costUsd === null && tokensOfRun(r) > 0);
  return {
    usd: sumOrNull(priced.map((r) => r.costUsd)),
    informedUsd: sumOrNull(priced.filter((r) => r.costEstimated === false).map((r) => r.costUsd)),
    estimatedUsd: sumOrNull(priced.filter((r) => r.costEstimated !== false).map((r) => r.costUsd)),
    buckets: {
      input: sumOrNull(runs.map((r) => r.costBuckets?.input)),
      cacheRead: sumOrNull(runs.map((r) => r.costBuckets?.cacheRead)),
      cacheWrite: sumOrNull(runs.map((r) => r.costBuckets?.cacheWrite)),
      output: sumOrNull(runs.map((r) => r.costBuckets?.output)),
    },
    runs: priced.length,
    unpricedRuns: unpriced.length,
    complete: priced.length > 0 && unpriced.length === 0,
  };
}

/** Soma custos já apurados (histórias → rodada). */
export function sumCosts(costs: CostTotals[]): CostTotals {
  return {
    usd: sumOrNull(costs.map((c) => c.usd)),
    informedUsd: sumOrNull(costs.map((c) => c.informedUsd)),
    estimatedUsd: sumOrNull(costs.map((c) => c.estimatedUsd)),
    buckets: {
      input: sumOrNull(costs.map((c) => c.buckets.input)),
      cacheRead: sumOrNull(costs.map((c) => c.buckets.cacheRead)),
      cacheWrite: sumOrNull(costs.map((c) => c.buckets.cacheWrite)),
      output: sumOrNull(costs.map((c) => c.buckets.output)),
    },
    runs: costs.reduce((n, c) => n + c.runs, 0),
    unpricedRuns: costs.reduce((n, c) => n + c.unpricedRuns, 0),
    complete: costs.some((c) => c.runs > 0) && costs.every((c) => c.unpricedRuns === 0),
  };
}

export function scoreStory(
  _story: ReferenceStory,
  run: StoryRun,
  log: EvalLog,
  acceptance: AcceptanceResult | null,
  config: EvalConfig,
  missingArtifacts: string[] = [],
): StoryScore {
  const delivered = run.end === 'delivered';
  const accept = delivered ? acceptance : null;
  const cost = costOfRuns(log.runs);
  return {
    id: run.storyId,
    accepted: delivered && accept !== null && accept.exitCode === 0 && missingArtifacts.length === 0,
    end: run.end,
    endNote: run.endNote,
    durationMs: run.endedAt - run.startedAt,
    runs: log.runs.length,
    tokens: {
      input: sumOrNull(log.runs.map((r) => r.inputTokens)),
      cacheRead: sumOrNull(log.runs.map((r) => r.cacheReadTokens)),
      cacheWrite: sumOrNull(log.runs.map((r) => r.cacheWriteTokens)),
      output: sumOrNull(log.runs.map((r) => r.outputTokens)),
    },
    costUsd: cost.usd,
    costRuns: cost.runs,
    cost,
    modelMismatches: log.runs.filter((r) => r.model !== modelOf(config)).length,
    signals: { ...log.signals },
    acceptance: accept ? { exitCode: accept.exitCode, durationMs: accept.durationMs } : null,
    missingArtifacts: [...missingArtifacts],
  };
}

/** O nome do modelo que o log grava: o trecho entre ':' e '@' de '<perfil>:<modelo>@<esforço>'. */
function modelOf(config: EvalConfig): string {
  const rest = config.model.includes(':') ? config.model.slice(config.model.indexOf(':') + 1) : config.model;
  const at = rest.indexOf('@');
  return at === -1 ? rest : rest.slice(0, at);
}

export function summarize(stories: StoryScore[]): RoundSummary {
  const tokens = {
    input: sumOrNull(stories.map((s) => s.tokens.input)),
    cacheRead: sumOrNull(stories.map((s) => s.tokens.cacheRead)),
    cacheWrite: sumOrNull(stories.map((s) => s.tokens.cacheWrite)),
    output: sumOrNull(stories.map((s) => s.tokens.output)),
  };
  const total = sumOrNull([tokens.input, tokens.cacheRead, tokens.cacheWrite, tokens.output]);
  const accepted = stories.filter((s) => s.accepted).length;
  const cost = sumCosts(stories.map((s) => s.cost));
  const acceptedCost = sumCosts(stories.filter((s) => s.accepted).map((s) => s.cost));
  return {
    stories: stories.length,
    accepted,
    acceptanceRate: stories.length === 0 ? 0 : accepted / stories.length,
    costPerAccepted: accepted === 0 || acceptedCost.usd === null ? null : acceptedCost.usd / accepted,
    acceptedCost,
    cost,
    tokens: { ...tokens, total },
    tokensPerAccepted: accepted === 0 || total === null ? null : total / accepted,
    costUsd: cost.usd,
    costRuns: cost.runs,
    runs: stories.reduce((n, s) => n + s.runs, 0),
    durationMs: stories.reduce((n, s) => n + s.durationMs, 0),
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** '2026-10-29T183000Z-claude-opus-medium.json' (com braço: '...-medium-A.json') */
export function scoreboardFile(config: EvalConfig, date: Date, arm: Arm | null = null): string {
  const stamp =
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  const slug = config.model
    .replace(/[:@]/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${stamp}-${slug}${arm ? `-${arm}` : ''}.json`;
}

function tokenKeys(t: TokenTotals): TokenTotals {
  return { input: t.input, cacheRead: t.cacheRead, cacheWrite: t.cacheWrite, output: t.output };
}

const EMPTY_COST: CostTotals = {
  usd: null,
  informedUsd: null,
  estimatedUsd: null,
  buckets: { input: null, cacheRead: null, cacheWrite: null, output: null },
  runs: 0,
  unpricedRuns: 0,
  complete: false,
};

/** Placar da versão 1 (sem `cost`) sai com o custo vazio, nunca inventado. */
function costKeys(c: CostTotals | undefined): CostTotals {
  const v = c ?? EMPTY_COST;
  return {
    usd: v.usd,
    informedUsd: v.informedUsd,
    estimatedUsd: v.estimatedUsd,
    buckets: tokenKeys(v.buckets),
    runs: v.runs,
    unpricedRuns: v.unpricedRuns,
    complete: v.complete,
  };
}

/** JSON com a ordem de chaves dos tipos, 2 espaços e '\n' no fim. */
export function serialize(board: Scoreboard): string {
  const s = board.summary;
  const ordered = {
    version: board.version,
    date: board.date,
    fazAi: { version: board.fazAi.version, commit: board.fazAi.commit, dirty: board.fazAi.dirty },
    config: { model: board.config.model, profile: board.config.profile },
    arm: board.arm ?? null,
    harness: board.harness ? { hash: board.harness.hash, notMeasured: [...board.harness.notMeasured] } : null,
    summary: {
      stories: s.stories,
      accepted: s.accepted,
      acceptanceRate: s.acceptanceRate,
      costPerAccepted: s.costPerAccepted ?? null,
      acceptedCost: costKeys(s.acceptedCost),
      cost: costKeys(s.cost),
      tokens: { ...tokenKeys(s.tokens), total: s.tokens.total },
      tokensPerAccepted: s.tokensPerAccepted,
      costUsd: s.costUsd,
      costRuns: s.costRuns,
      runs: s.runs,
      durationMs: s.durationMs,
    },
    stories: board.stories.map((st) => ({
      id: st.id,
      accepted: st.accepted,
      end: st.end,
      endNote: st.endNote,
      durationMs: st.durationMs,
      runs: st.runs,
      tokens: tokenKeys(st.tokens),
      costUsd: st.costUsd,
      costRuns: st.costRuns,
      cost: costKeys(st.cost),
      modelMismatches: st.modelMismatches,
      signals: {
        reviewFixes: st.signals.reviewFixes,
        testFailures: st.signals.testFailures,
        commitsAfterPr: st.signals.commitsAfterPr,
      },
      acceptance: st.acceptance ? { exitCode: st.acceptance.exitCode, durationMs: st.acceptance.durationMs } : null,
      missingArtifacts: [...st.missingArtifacts],
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Grava o placar em `dir` sem sobrescrever: em colisão acrescenta -2, -3... Devolve o caminho gravado. */
export function writeScoreboard(dir: string, board: Scoreboard, date: Date): string {
  fs.mkdirSync(dir, { recursive: true });
  const base = scoreboardFile(board.config, date, board.arm).replace(/\.json$/, '');
  for (let n = 1; ; n++) {
    const file = path.join(dir, `${base}${n === 1 ? '' : `-${n}`}.json`);
    try {
      fs.writeFileSync(file, serialize(board), { flag: 'wx' });
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}
