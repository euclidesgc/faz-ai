import { describe, expect, it } from 'vitest';
import { BOARD_MCP_NAME } from '../src/shared/harnessSelection';
import { preflightStoryChildMcp, requiredMcpServersForManifests } from '../src/extension/storySessionMcp';

describe('story session inherited MCP preflight', () => {
  it('unions known child manifest servers without including the board server', () => {
    expect(requiredMcpServersForManifests([{ mcpServers: ['docs', BOARD_MCP_NAME] }, { mcpServers: ['issues', 'docs'] }])).toEqual([
      'docs',
      'issues',
    ]);
  });

  it('allows delegation only when every required server is both configured and ready', () => {
    expect(preflightStoryChildMcp(['docs', 'issues'], ['docs', 'issues'], ['docs', 'issues'])).toMatchObject({
      allowed: true,
      missing: [],
      reason: null,
    });
    expect(preflightStoryChildMcp(['docs', 'issues'], ['docs', 'issues'], ['docs'])).toMatchObject({
      allowed: false,
      missing: ['issues'],
    });
    expect(preflightStoryChildMcp(['docs'], undefined, ['docs']).allowed).toBe(false);
    expect(preflightStoryChildMcp(['docs'], ['docs'], undefined).allowed).toBe(false);
  });

  it('permits an empty requirement set and does not claim per-child isolation', () => {
    const check = preflightStoryChildMcp([], undefined, undefined);
    expect(check.allowed).toBe(true);
    expect(check.required).toEqual([]);
  });
});
