import type { AiRunEnd } from './ai/gateway';
import type { AiProfile } from '../shared/aiProfiles';
import type { RunTarget } from '../shared/runTarget';
import { StorySessionRepo, type StorySession } from './repositories/storySessionRepo';

export interface StorySessionRequest {
  boardId: string;
  storyId: string;
  executor: string;
  transport: 'acp';
  configFingerprint: string;
  workspace: string;
  target: { profileId: string; model: RunTarget['model']; value: string };
}

/** Mantém a identidade nativa entre turnos; não interpreta uma tentativa como uma sessão nova. */
export class StorySessionController {
  constructor(private readonly repo: StorySessionRepo) {}

  targetForStory(storyId: string, profiles: readonly AiProfile[]): RunTarget | null {
    const session = this.repo.latestForStory(storyId);
    if (!session || ['closed', 'lost'].includes(session.status)) return null;
    const saved = session.checkpoint.target as StorySessionRequest['target'] | undefined;
    if (!saved || typeof saved.profileId !== 'string')
      throw new Error('A sessão principal não tem alvo salvo; reconcilie antes de continuar.');
    const cli = profiles.find((profile) => profile.id === saved.profileId && profile.enabled);
    if (!cli) throw new Error('O perfil da sessão principal está indisponível; reconcilie antes de continuar.');
    return { cli, model: saved.model, value: saved.value, source: 'card' };
  }

  prepare(request: StorySessionRequest): StorySession {
    const previous = this.repo.latestForStory(request.storyId);
    if (previous && !['closed', 'lost'].includes(previous.status)) {
      if (previous.status === 'reconciling') throw new Error('A sessão principal está em reconciliação; reconcilie antes de continuar.');
      if (previous.boardId !== request.boardId || previous.executor !== request.executor || previous.transport !== request.transport)
        throw new Error('A configuração da sessão principal mudou; reconcilie a História antes de continuar.');
      if (previous.configFingerprint !== request.configFingerprint || previous.workspace !== request.workspace)
        throw new Error('O contexto da sessão principal mudou; reconcilie a História antes de continuar.');
      if (!previous.nativeSessionId) throw new Error('A sessão principal anterior não tem ID nativo; reconcilie antes de abrir outra.');
      return previous;
    }
    return this.repo.createSession({
      ...request,
      generation: (previous?.generation ?? 0) + 1,
      nativeSessionId: null,
      checkpoint: { target: request.target },
    });
  }

  finish(session: StorySession, end: AiRunEnd): StorySession {
    const current = this.repo.getSession(session.id);
    if (!current) throw new Error('A sessão principal desapareceu antes do fim do turno.');
    const observed = end.report.nativeSessionId ?? end.report.consumption?.sessionId ?? null;
    if (current.nativeSessionId && observed && observed !== current.nativeSessionId)
      return this.repo.updateSession(session.id, { status: 'reconciling' });
    if (!observed && !current.nativeSessionId) return this.repo.updateSession(session.id, { status: 'reconciling' });
    return this.repo.updateSession(session.id, {
      nativeSessionId: observed ?? current.nativeSessionId,
      status: end.outcome === 'done' ? 'active' : 'checkpointed',
    });
  }

  /** Grava o handle nativo antes de permitir que o turno faça trabalho. */
  opened(session: StorySession, nativeSessionId: string): StorySession {
    const current = this.repo.getSession(session.id);
    if (!current) throw new Error('A sessão principal desapareceu antes da abertura nativa.');
    if (current.nativeSessionId && current.nativeSessionId !== nativeSessionId) {
      this.repo.updateSession(session.id, { status: 'reconciling' });
      throw new Error('O agente ACP abriu uma sessão principal diferente da registrada.');
    }
    return this.repo.updateSession(session.id, { nativeSessionId, status: 'active' });
  }

  /** A tentativa não produziu um handle confiável; uma nova abertura exige reconciliação. */
  abort(session: StorySession): StorySession {
    return this.repo.updateSession(session.id, { status: 'reconciling' });
  }
}
