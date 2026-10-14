export const BRANCHES: { develop: string; main: string; hotfix: string; release: string };

export type ReleaseSource = 'develop' | 'hotfix';

export interface FinishFacts {
  prState: string;
  tagOnOrigin: boolean;
  releaseExists: boolean;
  mainInDevelop: boolean;
  headExistsLocal: boolean;
  headExistsRemote: boolean;
}

export interface FinishPlan {
  mergePr: boolean;
  tag: boolean;
  release: boolean;
  backMerge: boolean;
  deleteLocal: boolean;
  deleteRemote: boolean;
}

export function releaseSource(branch: string): ReleaseSource | null;

export function wrongBranchMessage(branch: string): string;

export function finishPlan(facts: FinishFacts): FinishPlan;
