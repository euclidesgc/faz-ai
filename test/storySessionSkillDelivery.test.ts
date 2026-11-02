import { describe, expect, it, vi } from 'vitest';
import { FLOW_SKILL_NAME } from '../src/shared/harnessProject';
import { registerHarnessTools } from '../src/extension/mcp/tools/harness';
import type { MessageRouter } from '../src/extension/panel/messageRouter';
import type { DefineTool } from '../src/extension/mcp/tools/registry';

describe('get_skill Story-session delivery', () => {
  it('uses session instructions only when the authenticated router confirms an active Story session', () => {
    let getSkill: ((args: { skill: string }, router: MessageRouter, token?: string) => unknown) | undefined;
    const define: DefineTool = ((name, _description, _shape, run) => {
      if (name === 'get_skill') getSkill = run as unknown as typeof getSkill;
    }) as DefineTool;
    registerHarnessTools(define);
    const isActiveStorySessionRun = vi.fn((token: string) => token === 'trusted-live-story-run');
    const router = { isActiveStorySessionRun } as unknown as MessageRouter;

    const ordinary = getSkill!({ skill: FLOW_SKILL_NAME }, router, undefined) as string;
    const live = getSkill!({ skill: FLOW_SKILL_NAME }, router, 'trusted-live-story-run') as string;
    const stale = getSkill!({ skill: FLOW_SKILL_NAME }, router, 'untrusted-or-stale') as string;

    expect(ordinary).not.toContain('Todo trabalho especializado é executado por uma filha nativa');
    expect(live).toContain('Todo trabalho especializado é executado por uma filha nativa');
    expect(stale).not.toContain('Todo trabalho especializado é executado por uma filha nativa');
    expect(isActiveStorySessionRun).toHaveBeenCalledWith('trusted-live-story-run');
    expect(isActiveStorySessionRun).toHaveBeenCalledWith('untrusted-or-stale');
  });
});
