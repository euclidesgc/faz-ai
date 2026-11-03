import { describe, expect, it } from 'vitest';
import { storySessionRecoveryProof } from '../src/extension/storySessionRecovery';
import type { ProcessIdentity } from '../src/extension/processIdentity';
import type { WorkRepo, WorkRecord, WorkAttempt } from '../src/extension/repositories/workRepo';

const identity: ProcessIdentity = { pid: 42, birth: 'start', platform: process.platform, groupId: 42, generation: 'generation-1' };
const record = (state: WorkRecord['state']): WorkRecord => ({ id: 'work-1', storyId: 'story-1', state }) as WorkRecord;
const attempt = (endedAt: number | null, process: ProcessIdentity | null = identity): WorkAttempt =>
  ({ id: 'attempt-1', endedAt, outcome: endedAt === null ? null : 'done', process }) as WorkAttempt;
const work = (state: WorkRecord['state'], endedAt: number | null): Pick<WorkRepo, 'records' | 'attemptsForStory'> => ({
  records: () => [record(state)],
  attemptsForStory: () => [attempt(endedAt)],
});

describe('prova para reconstruir uma sessão da História', () => {
  it('exige trabalho e tentativa terminais e morte confirmada do grupo inteiro', () => {
    expect(storySessionRecoveryProof(work('reconciling', null), 'story-1', () => 'dead')).toBeNull();
    expect(storySessionRecoveryProof(work('done', null), 'story-1', () => 'dead')).toBeNull();
    expect(storySessionRecoveryProof(work('done', 1), 'story-1', () => 'unknown')).toBeNull();
    expect(storySessionRecoveryProof(work('done', 1), 'story-1', () => 'alive')).toBeNull();
    expect(storySessionRecoveryProof(work('done', 1), 'story-1', () => 'dead')).toMatchObject({
      allAttemptsTerminal: true,
      processGroupsDead: true,
    });
  });
});
