// Commits da branch de uma história, agrupados por fase (trailers gravados pelo board nos commits).

/** Chaves dos trailers lidos dos commits; ponto único caso o formato mude. */
export const COMMIT_TRAILERS = { card: 'Faz-AI-Card', phase: 'Faz-AI-Phase', run: 'Faz-AI-Run' } as const;

/** Máximo de commits lidos por história (os mais recentes). */
export const MAX_STORY_COMMITS = 200;

export interface StoryCommit {
  hash: string;
  subject: string;
  /** ISO 8601 */
  date: string;
  card: string;
  phase: string;
  run: string;
}

export interface CommitGroup {
  /** '' = commits sem fase */
  phase: string;
  commits: StoryCommit[];
}

/** Agrupa por fase na ordem da primeira aparição mais antiga (a lista chega do mais novo ao mais antigo); o grupo sem fase fica por último. */
export function groupCommitsByPhase(commits: StoryCommit[]): CommitGroup[] {
  const groups = new Map<string, StoryCommit[]>();
  for (const c of [...commits].reverse()) if (!groups.has(c.phase)) groups.set(c.phase, []);
  for (const c of commits) groups.get(c.phase)!.push(c);
  const list = [...groups].map(([phase, cs]) => ({ phase, commits: cs }));
  return [...list.filter((g) => g.phase !== ''), ...list.filter((g) => g.phase === '')];
}
