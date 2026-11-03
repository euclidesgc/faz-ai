import { processGroupState, type ProcessIdentity } from './processIdentity';
import type { WorkRepo } from './repositories/workRepo';
import type { StorySessionRecoveryProof } from './storySessionController';

type RecoveryWork = Pick<WorkRepo, 'records' | 'attemptsForStory'>;

/** Uma reconstrução só é possível após o orquestrador encerrar e conferir todas as tentativas. */
export function storySessionRecoveryProof(
  work: RecoveryWork,
  storyId: string,
  groupState: (identity: ProcessIdentity) => 'alive' | 'dead' | 'unknown' = processGroupState,
): StorySessionRecoveryProof | null {
  const records = work.records().filter((record) => record.storyId === storyId);
  if (records.some((record) => !['done', 'failed', 'cancelled'].includes(record.state))) return null;
  const attempts = work.attemptsForStory(storyId);
  if (attempts.some((attempt) => attempt.endedAt === null || attempt.outcome === null)) return null;
  if (attempts.some((attempt) => attempt.process && groupState(attempt.process) !== 'dead')) return null;
  return {
    allAttemptsTerminal: true,
    processGroupsDead: true,
    evidence: `Trabalhos terminais: ${records.map((record) => record.id).join(', ') || 'nenhum'}; tentativas encerradas: ${attempts.map((attempt) => attempt.id).join(', ') || 'nenhuma'}; grupos de processo: ${attempts.filter((attempt) => attempt.process).length} encerrados.`,
  };
}
