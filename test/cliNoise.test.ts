import { describe, expect, it } from 'vitest';
import { isCliNoise } from '../src/extension/cliNoise';

describe('cliNoise', () => {
  it('reconhece os avisos de regra de permissão do Claude Code, com ou sem marca na frente', () => {
    for (const line of [
      'Permission allow rule (Bash(npm run *)) in userSettings is shadowed by a broader rule',
      'Permission deny rule (Read(./.env)) will be ignored',
      'Permission ask rule (WebFetch) …',
      '  permission allow rules (Bash) are invalid',
      'Warning: Permission allow rule (Edit) is unreachable',
      '[warn] Permission deny rule (Bash(rm:*)) ignored',
      '\u26a0 Permission allow rule (mcp__x) unknown',
    ])
      expect(isCliNoise(line), line).toBe(true);
  });

  it('o motivo real do erro e as linhas comuns continuam', () => {
    for (const line of [
      'Invalid API key · Please run /login',
      'Your session has expired. Please run /login.',
      'Subagente Explore concluído',
      'A Permission allow rule could not be read', // só no começo da linha
      'Permission denied (publickey).',
    ])
      expect(isCliNoise(line), line).toBe(false);
  });
});
