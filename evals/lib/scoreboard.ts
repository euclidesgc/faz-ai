import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AcceptanceResult, ReferenceStory } from './stories';
import type { EvalConfig, EvalEnd, EvalLog, StoryRun } from './types';

export interface TokenTotals {
  input: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  output: number | null;
}

export interface StoryScore {
  id: string;
  accepted: boolean;
  end: EvalEnd;
  endNote: string | null;
  durationMs: number;
  runs: number;
  tokens: TokenTotals;
  costUsd: number | null;
  costRuns: number;
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
  tokens: TokenTotals & { total: number | null };
  tokensPerAccepted: number | null;
  costUsd: number | null;
  costRuns: number;
  runs: number;
  durationMs: number;
}

export interface Scoreboard {
  version: 1;
  date: string;
  fazAi: { version: string; commit: string; dirty: boolean };
  config: EvalConfig;
  summary: RoundSummary;
  stories: StoryScore[];
}

/** Soma os valores não nulos; `null` quando nenhum foi medido (não medido não é zero). */
function sumOrNull(values: Array<number | null>): number | null {
  const measured = values.filter((v): v is number => v !== null);
  return measured.length === 0 ? null : measured.reduce((a, b) => a + b, 0);
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
    costUsd: sumOrNull(log.runs.map((r) => r.costUsd)),
    costRuns: log.runs.filter((r) => r.costUsd !== null).length,
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
  return {
    stories: stories.length,
    accepted,
    acceptanceRate: stories.length === 0 ? 0 : accepted / stories.length,
    tokens: { ...tokens, total },
    tokensPerAccepted: accepted === 0 || total === null ? null : total / accepted,
    costUsd: sumOrNull(stories.map((s) => s.costUsd)),
    costRuns: stories.reduce((n, s) => n + s.costRuns, 0),
    runs: stories.reduce((n, s) => n + s.runs, 0),
    durationMs: stories.reduce((n, s) => n + s.durationMs, 0),
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** '2026-10-29T183000Z-claude-opus-medium.json' */
export function scoreboardFile(config: EvalConfig, date: Date): string {
  const stamp =
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  const slug = config.model
    .replace(/[:@]/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${stamp}-${slug}.json`;
}

function tokenKeys(t: TokenTotals): TokenTotals {
  return { input: t.input, cacheRead: t.cacheRead, cacheWrite: t.cacheWrite, output: t.output };
}

/** JSON com a ordem de chaves dos tipos, 2 espaços e '\n' no fim. */
export function serialize(board: Scoreboard): string {
  const s = board.summary;
  const ordered = {
    version: board.version,
    date: board.date,
    fazAi: { version: board.fazAi.version, commit: board.fazAi.commit, dirty: board.fazAi.dirty },
    config: { model: board.config.model, profile: board.config.profile },
    summary: {
      stories: s.stories,
      accepted: s.accepted,
      acceptanceRate: s.acceptanceRate,
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
  const base = scoreboardFile(board.config, date).replace(/\.json$/, '');
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
