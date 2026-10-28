import { describe, expect, it } from 'vitest';
import { RULE_NAME_PATTERN, createUsage, importUsage } from '../src/shared/artifactImport';

describe('artifactImport: usage defaults', () => {
  it('imports rules disabled and all other kinds contextual', () => {
    expect(importUsage('rule')).toBe('off');
    for (const kind of ['skill', 'agent', 'mcp'] as const) expect(importUsage(kind)).toBe('contextual');
  });

  it('creates every rule disabled (even manual), and other kinds contextual', () => {
    expect(createUsage('rule', 'manual')).toBe('off');
    expect(createUsage('rule', 'wizard')).toBe('off');
    expect(createUsage('rule', 'ai')).toBe('off');
    for (const kind of ['skill', 'agent', 'mcp'] as const)
      for (const via of ['manual', 'wizard', 'ai'] as const) expect(createUsage(kind, via)).toBe('contextual');
  });
});

describe('artifactImport: rule name', () => {
  it('accepts a skill-like name with optional .md extension', () => {
    for (const name of ['a', 'review', 'review-spec', 'review-spec.md', 'a'.repeat(64)]) expect(RULE_NAME_PATTERN.test(name)).toBe(true);
  });

  it('rejects paths, uppercase, other extensions and oversized names', () => {
    for (const name of ['', 'Review.md', '.md', 'review.txt', '../review.md', 'a/b.md', '-review', 'a'.repeat(65)])
      expect(RULE_NAME_PATTERN.test(name)).toBe(false);
  });
});
