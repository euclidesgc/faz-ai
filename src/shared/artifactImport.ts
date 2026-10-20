import type { ArtifactKind } from './artifacts';
import type { AiTool } from './harness';
import type { HarnessUsage } from './harnessSelection';

export type ImportSource =
  { from: 'folder'; path: string; subdir?: string } | { from: 'tool'; tool: AiTool } | { from: 'export'; path: string };

export interface ImportCandidate {
  key: string;
  kind: ArtifactKind;
  name: string;
  description: string;
  origin: string;
  exists: boolean;
  files?: number;
  problem?: string;
}

export interface ImportPreview {
  source: ImportSource;
  label: string;
  candidates: ImportCandidate[];
}

export type OnConflict = 'replace' | 'skip';

/** Imported rules wait for review; other imported artifacts are available per card. */
export const importUsage = (kind: ArtifactKind): HarnessUsage => (kind === 'rule' ? 'off' : 'contextual');

/** Manually created artifacts are contextual; AI/wizard rules wait for review. */
export const createUsage = (kind: ArtifactKind, via: 'manual' | 'wizard' | 'ai'): HarnessUsage =>
  kind === 'rule' && via !== 'manual' ? 'off' : 'contextual';

/** Same base naming as skills, with an optional Markdown extension for rules. */
export const RULE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}(?:\.md)?$/;
