export interface ShowcaseBlock {
  name: string;
  marker: string;
}

export interface ShowcaseEntry {
  file: string;
  blocks: ShowcaseBlock[];
}

export const SHOWCASE: ShowcaseEntry[];

export function readmeProblems(file: string, text: string, blocks: ShowcaseBlock[]): string[];

export function packageProblems(contents: Record<string, string>): string[];
