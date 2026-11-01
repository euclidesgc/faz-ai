import type { AiRun } from '../../src/extension/log/aiRunRepo';

/** A configuração de uma rodada: `model` = '<perfil>:<modelo>@<esforço>'. */
export interface EvalConfig {
  model: string;
  profile: string;
}

export type EvalEnd = 'delivered' | 'blocked' | 'timeout';

export interface StoryRun {
  storyId: string;
  end: EvalEnd;
  endNote: string | null;
  startedAt: number;
  endedAt: number;
}

/** O que ficou no log do board temporário: as execuções da rodada e os sinais de retrabalho. */
export interface EvalLog {
  runs: AiRun[];
  signals: { reviewFixes: number; testFailures: number; commitsAfterPr: number };
}
