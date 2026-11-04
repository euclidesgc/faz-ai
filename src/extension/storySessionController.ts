import type { AiRunEnd } from './ai/gateway';
import type { AiProfile } from '../shared/aiProfiles';
import type { Comment } from '../shared/model';
import type { RunTarget } from '../shared/runTarget';
import { StorySessionRepo, type StorySession } from './repositories/storySessionRepo';
import type { AcpSubagentEvent } from './ai/provider';
import type { SessionIntent, ChildSession } from './repositories/storySessionRepo';

export interface ChildIntentRequest {
  workId: string;
  attempt: number;
  intentKey: string;
  config: Record<string, unknown>;
  snapshot: Record<string, unknown>;
}

export type ChildEventReconciliation =
  | { status: 'linked' | 'completed' | 'failed' | 'cancelled'; intent: SessionIntent; child: ChildSession }
  | { status: 'ignored'; reason: 'parent-session' }
  | { status: 'uncertain'; reason: string };

export type StorySessionTransport = 'acp' | 'cli';

export interface StorySessionRequest {
  boardId: string;
  storyId: string;
  executor: string;
  /** o transporte que sustenta a principal: o ACP (sessão nativa carregada) ou a CLI que retoma a sessão por id */
  transport: StorySessionTransport;
  configFingerprint: string;
  workspace: string;
  target: { profileId: string; model: RunTarget['model']; value: string };
}

/** Explicit operator/reconciler attestation; never inferred from a timeout or host restart. */
export interface StorySessionRecoveryProof {
  allAttemptsTerminal: true;
  processGroupsDead: true;
  evidence: string;
}

interface HumanCursor {
  at: number;
  ids: string[];
}

export interface HumanDelivery {
  comments: Comment[];
  cursor: HumanCursor | null;
}

/** Mantém a identidade nativa entre turnos; não interpreta uma tentativa como uma sessão nova. */
export class StorySessionController {
  constructor(private readonly repo: StorySessionRepo) {}

  /** Constrói a entrada incremental da principal a partir do cursor confirmado no banco. */
  humanDelivery(session: StorySession, comments: readonly Comment[], cardIds: ReadonlySet<string>): HumanDelivery {
    const saved = session.checkpoint.humanCursor as Partial<HumanCursor> | undefined;
    const at = typeof saved?.at === 'number' && Number.isSafeInteger(saved.at) ? saved.at : -1;
    const ids = new Set(Array.isArray(saved?.ids) ? saved.ids.filter((id): id is string => typeof id === 'string') : []);
    const pending = comments
      .filter((comment) => cardIds.has(comment.cardId) && comment.source === 'human')
      .filter((comment) => comment.createdAt > at || (comment.createdAt === at && !ids.has(comment.id)))
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    if (!pending.length) return { comments: [], cursor: null };
    const latestAt = pending.at(-1)!.createdAt;
    const latestIds = pending.filter((comment) => comment.createdAt === latestAt).map((comment) => comment.id);
    return { comments: pending, cursor: { at: latestAt, ids: latestAt === at ? [...new Set([...ids, ...latestIds])] : latestIds } };
  }

  /** O cursor avança somente após um turno concluído e, para filhas, verificado. */
  acknowledgeHumanDelivery(session: StorySession, delivery: HumanDelivery): void {
    if (!delivery.cursor) return;
    const current = this.repo.getSession(session.id);
    if (!current || current.status === 'reconciling' || current.status === 'lost')
      throw new Error('A sessão principal não está confirmada para avançar o cursor de mensagens.');
    this.repo.updateSession(session.id, { checkpoint: { ...current.checkpoint, humanCursor: delivery.cursor } });
  }

  /** A queda entre o despacho e o ACK não autoriza repetir uma filha ou liberar a reserva. */
  reconcileOnOpen(boardId: string): string[] {
    const uncertain: string[] = [];
    for (const session of this.repo.listLatestForBoard(boardId)) {
      const intents = this.repo.listIntents(session.id);
      for (const intent of intents) {
        if (intent.status === 'pending')
          this.repo.updateIntent(intent.id, 'cancelled', { reason: 'O processo terminou antes do despacho nativo.' });
      }
      if (
        (session.status === 'opening' && !session.nativeSessionId) ||
        intents.some(
          (intent) =>
            ['dispatching', 'linked', 'reconciling'].includes(intent.status) ||
            (intent.status === 'completed' &&
              intent.config.requiresNativeModelProof === true &&
              this.repo.getChild(intent.id)?.result?.modelVerified !== true),
        )
      ) {
        this.repo.updateSession(session.id, { status: 'reconciling' });
        for (const intent of intents.filter(
          (item) =>
            item.status === 'dispatching' ||
            item.status === 'linked' ||
            (item.status === 'completed' &&
              item.config.requiresNativeModelProof === true &&
              this.repo.getChild(item.id)?.result?.modelVerified !== true),
        )) {
          const missingProof =
            intent.status === 'completed' &&
            intent.config.requiresNativeModelProof === true &&
            this.repo.getChild(intent.id)?.result?.modelVerified !== true;
          this.repo.updateIntent(intent.id, 'reconciling', {
            reason: missingProof
              ? 'A filha concluiu, mas o modelo efetivo não foi comprovado antes da queda; confira a configuração nativa antes de liberar nova escrita.'
              : 'O processo terminou sem confirmação da filha.',
          });
        }
        uncertain.push(session.storyId);
      }
    }
    return uncertain;
  }

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
      if (!previous.nativeSessionId && previous.status !== 'opening')
        throw new Error('A sessão principal anterior não tem ID nativo; reconcilie antes de abrir outra.');
      return previous;
    }
    return this.repo.createSession({
      ...request,
      generation: (previous?.generation ?? 0) + 1,
      nativeSessionId: null,
      checkpoint: { target: request.target },
    });
  }

  /**
   * Retire an unrecoverable parent and open a new logical generation. Caller must have
   * independently reconciled every attempt and proved all writer process groups dead.
   */
  rebuildParent(request: StorySessionRequest, proof: StorySessionRecoveryProof): StorySession {
    if (proof.allAttemptsTerminal !== true || proof.processGroupsDead !== true || !proof.evidence.trim())
      throw new Error('Reconstrução exige prova de tentativas terminais, grupos de processo encerrados e evidência.');
    const previous = this.repo.latestForStory(request.storyId);
    if (!previous || previous.status !== 'reconciling') throw new Error('Só é possível reconstruir uma sessão principal em reconciliação.');
    if (previous.boardId !== request.boardId) throw new Error('A sessão principal pertence a outro board.');
    if (this.repo.listIntents(previous.id).some((intent) => ['pending', 'dispatching', 'reconciling', 'linked'].includes(intent.status)))
      throw new Error('Ainda há intenções sem desfecho; reconcilie antes de reconstruir.');
    this.repo.updateSession(previous.id, {
      status: 'lost',
      checkpoint: {
        ...previous.checkpoint,
        lostReason: 'Principal reconstruída após reconciliação explícita.',
        recoveryEvidence: proof.evidence.trim(),
      },
    });
    return this.repo.createSession({
      ...request,
      generation: previous.generation + 1,
      nativeSessionId: null,
      checkpoint: { target: request.target, rebuiltFrom: previous.id, recoveryEvidence: proof.evidence.trim() },
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
      // o acumulado que a sessão informou até aqui: a próxima retomada desconta-o do que a ferramenta somar
      ...(end.report.sessionCumulative ? { checkpoint: { ...current.checkpoint, sessionCumulative: end.report.sessionCumulative } } : {}),
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

  /** Persiste a prova do modelo efetivo da filha antes de aceitar o trabalho como concluído. */
  recordChildConfiguration(session: StorySession, childSessionId: string, model: string, effort: string | null): void {
    const entry = this.repo.listChildren(session.id).find(({ child }) => child?.nativeSessionId === childSessionId);
    if (!entry?.child || entry.child.status !== 'completed') throw new Error('A filha não terminou antes da conferência do modelo.');
    if (entry.intent.status !== 'completed' && entry.intent.status !== 'reconciling')
      throw new Error('A intenção da filha não está concluída nem aguardando conferência.');
    this.repo.updateChild(entry.intent.id, 'completed', {
      ...entry.child.result,
      modelVerified: true,
      effectiveModel: model,
      effectiveEffort: effort,
      source: 'acp-session-load',
    });
    if (entry.intent.status === 'reconciling') this.repo.updateIntent(entry.intent.id, 'completed');
    const unresolved = this.repo
      .listIntents(session.id)
      .some((intent) => ['pending', 'dispatching', 'reconciling', 'linked'].includes(intent.status));
    const current = this.repo.getSession(session.id);
    if (entry.intent.status === 'reconciling' && !unresolved && current?.status === 'reconciling' && current.nativeSessionId)
      this.repo.updateSession(session.id, { status: 'active' });
  }

  /** A tentativa não produziu um handle confiável; uma nova abertura exige reconciliação. */
  abort(session: StorySession): StorySession {
    return this.repo.updateSession(session.id, { status: 'reconciling' });
  }

  /** Persists the intended work before dispatch. Only one unresolved child writer may exist per parent. */
  beginChildIntent(session: StorySession, request: ChildIntentRequest): SessionIntent {
    const current = this.repo.getSession(session.id);
    if (!current || !current.nativeSessionId || current.status !== 'active')
      throw new Error('A sessão principal não está ativa para delegação.');
    if (this.repo.listIntents(session.id).some((intent) => ['pending', 'dispatching', 'reconciling', 'linked'].includes(intent.status)))
      throw new Error('Já existe uma delegação sem conclusão; reconcilie antes de iniciar outra.');
    return this.repo.createIntent({ sessionId: current.id, ...request });
  }

  /** Call immediately before the native spawn/prompt dispatch. */
  dispatchChildIntent(intent: SessionIntent): SessionIntent {
    const current = this.repo.getIntent(intent.id);
    if (!current || current.status !== 'pending') throw new Error('A intenção da delegação não está pendente.');
    return this.repo.updateIntent(intent.id, 'dispatching');
  }

  /** Cancels only an intent proven not to have reached native dispatch. */
  cancelPendingChildIntent(intent: SessionIntent, reason: string): SessionIntent | null {
    const current = this.repo.getIntent(intent.id);
    if (!current || current.status !== 'pending') return current;
    return this.repo.updateIntent(intent.id, 'cancelled', { reason });
  }

  /** Reconciles native events against the single durable dispatch intent. Events carry no intent ID. */
  reconcileChildEvent(session: StorySession, event: AcpSubagentEvent): ChildEventReconciliation {
    const current = this.repo.getSession(session.id);
    if (!current || !current.nativeSessionId || event.parentSessionId !== current.nativeSessionId)
      return { status: 'ignored', reason: 'parent-session' };
    const entries = this.repo.listChildren(session.id);
    const observedChild = entries.find(({ child }) => child?.nativeSessionId === event.sessionId);
    if (observedChild?.child) {
      if (event.kind === 'state') return this.applyChildState(observedChild.intent, observedChild.child, event.state);
      return {
        status:
          observedChild.child.status === 'completed' ||
          observedChild.child.status === 'failed' ||
          observedChild.child.status === 'cancelled'
            ? observedChild.child.status
            : 'linked',
        intent: observedChild.intent,
        child: observedChild.child,
      };
    }
    const matching = entries.filter(
      ({ intent }) =>
        intent.status === 'dispatching' ||
        intent.status === 'reconciling' ||
        intent.status === 'linked' ||
        intent.status === 'completed' ||
        intent.status === 'failed' ||
        intent.status === 'cancelled',
    );
    // `reconciling` representa justamente a janela em que o spawn pode ter ocorrido sem ACK.
    // Eventos nativos observados após reabrir o host podem resolver essa intenção; não criam uma nova.
    const active = matching.filter(({ intent }) => intent.status === 'dispatching' || intent.status === 'reconciling');
    if (active.length !== 1) return this.childUncertain(session.id, 'Evento de filha inesperado ou ambíguo.');
    const { intent } = active[0]!;
    if (!this.eventMatchesIntent(event, intent))
      return this.childUncertain(session.id, 'Os metadados do evento não correspondem ao trabalho pretendido.');
    const child = this.repo.getChild(intent.id)
      ? this.repo.getChild(intent.id)!
      : this.repo.linkChild({
          intentId: intent.id,
          nativeSessionId: event.sessionId,
          executor: current.executor,
          transport: current.transport,
        });
    const updatedIntent = this.repo.getIntent(intent.id)!;
    if (event.kind === 'state') return this.applyChildState(updatedIntent, child, event.state);
    return { status: 'linked', intent: updatedIntent, child };
  }

  private eventMatchesIntent(event: AcpSubagentEvent, intent: SessionIntent): boolean {
    if (event.kind === 'state') return false;
    // a filha definida pelo board tem nome próprio (a CLI o devolve em `subagent_type`): só ela serve, e o título
    // parecido de outro subagente não a substitui
    const childAgent = intent.config.childAgent;
    if (typeof childAgent === 'string' && childAgent) return event.kind === 'spawned' && event.name === childAgent;
    const expected = [intent.snapshot.title, intent.snapshot.task]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) =>
        value
          .normalize('NFKC')
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim(),
      )
      .filter(Boolean);
    if (!expected.length) return false;
    const observed = event.kind === 'spawned' ? [event.task, event.name] : [event.title, event.description];
    const normalizedObserved = observed
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
      .map((candidate) =>
        candidate
          .normalize('NFKC')
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim(),
      );
    return expected.some((phrase) => normalizedObserved.some((candidate) => candidate.includes(phrase)));
  }

  private applyChildState(intent: SessionIntent, child: ChildSession, state: string): ChildEventReconciliation {
    const normalized = state.toLowerCase();
    const status = /complete|done|succeed|finished/.test(normalized)
      ? 'completed'
      : /fail|error/.test(normalized)
        ? 'failed'
        : /cancel/.test(normalized)
          ? 'cancelled'
          : /running|active|working/.test(normalized)
            ? 'active'
            : 'unknown';
    if (status === 'unknown') {
      this.repo.updateChild(intent.id, 'unknown', { state });
      return this.childUncertain(intent.sessionId, `Estado nativo de filha não reconhecido: ${state}`);
    }
    const updated = this.repo.updateChild(intent.id, status, { state });
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      const unresolved = this.repo
        .listIntents(intent.sessionId)
        .some((item) => ['pending', 'dispatching', 'reconciling', 'linked'].includes(item.status));
      const session = this.repo.getSession(intent.sessionId);
      const needsModelProof =
        intent.config.requiresNativeModelProof === true && this.repo.getChild(intent.id)?.result?.modelVerified !== true;
      if (!unresolved && !needsModelProof && session?.status === 'reconciling' && session.nativeSessionId)
        this.repo.updateSession(intent.sessionId, { status: 'active' });
    }
    return { status: status === 'active' ? 'linked' : status, intent: this.repo.getIntent(intent.id)!, child: updated };
  }

  private childUncertain(sessionId: string, reason: string): ChildEventReconciliation {
    this.repo.updateSession(sessionId, { status: 'reconciling' });
    const intents = this.repo.listIntents(sessionId).filter((intent) => intent.status === 'dispatching');
    for (const intent of intents) this.repo.updateIntent(intent.id, 'reconciling', { reason });
    return { status: 'uncertain', reason };
  }
}
