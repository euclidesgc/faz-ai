import { describe, expect, it } from 'vitest';
import { groupCommitsByPhase, type StoryCommit } from '../src/shared/commits';

const c = (hash: string, phase: string, card = '#1', run = 'r'): StoryCommit => ({
  hash,
  subject: hash,
  date: '2026-01-01T00:00:00Z',
  card,
  phase,
  run,
});

describe('groupCommitsByPhase', () => {
  it('agrupa por fase na ordem da primeira aparição mais antiga', () => {
    const g = groupCommitsByPhase([c('d', 'Plan'), c('c', 'Implementação'), c('b', 'Plan'), c('a', 'Plan')]);
    expect(g.map((x) => x.phase)).toEqual(['Plan', 'Implementação']);
    expect(g[0]!.commits.map((x) => x.hash)).toEqual(['d', 'b', 'a']);
    expect(g[1]!.commits[0]!.card).toBe('#1');
  });
  it('commits sem fase ficam no grupo vazio, por último', () => {
    const g = groupCommitsByPhase([c('c', 'Plan'), c('b', ''), c('a', '')]);
    expect(g.map((x) => x.phase)).toEqual(['Plan', '']);
  });
  it('lista vazia devolve []', () => expect(groupCommitsByPhase([])).toEqual([]));
});
