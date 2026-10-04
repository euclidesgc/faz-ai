export interface ShowcaseBlock {
  name: string;
  marker: string;
}

export interface ShowcaseChangelogEntry {
  file: string;
  kind: 'changelog';
  unreleased: string;
}

export interface ShowcaseReadmeEntry {
  file: string;
  kind: 'readme';
  blocks: ShowcaseBlock[];
}

export type ShowcaseEntry = ShowcaseChangelogEntry | ShowcaseReadmeEntry;

export const SHOWCASE: ShowcaseEntry[];

export function renameUnreleased(text: string, heading: string, version: string): { text: string; renamed: boolean };

export function firstSection(text: string): string | null;

export function changelogProblems(file: string, text: string, version: string): string[];

export function readmeProblems(file: string, text: string, blocks: ShowcaseBlock[]): string[];

export function packageProblems(contents: Record<string, string>, version: string): string[];
