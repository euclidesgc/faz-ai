import * as fs from 'node:fs';
import { cardRef, type BoardState } from '../shared/model';
import type { AiRunOrigin } from '../shared/log';
import {
  admit,
  blockNote,
  effectiveLimits,
  isDirectTrackStory,
  LIVE_WORK_STATES,
  pendingSubtasks,
  reconcileOutcome,
  storyPlan,
  type PolicyLimits,
  type Reconciled,
  type WorkRuntime,
  type WorkUnit,
} from '../shared/orchestration';
import { activityKindOf } from '../shared/activity';
import { columnOf, isLive } from '../shared/selectors';
import { isWithHuman } from '../shared/story';
import { briefFailures, briefReason, isBriefKey } from '../shared/subtaskBrief';
import { retryDelay } from '../shared/failureClass';
import { Autopilot } from './autopilot';
import type { AiRunEnd } from './ai/gateway';
import { MeasureEndedError, MeasureRefusedError } from './aiOutput/errors';
import type { RunOptions } from './runner';
import type { WorkClaim, WorkRecord, WorkRepo } from './repositories/workRepo';
import type { RunMcpSessions } from './mcp/runSessions';
import { acquireWorkspace, adoptWorkspace, type WorkspaceLease } from './workspaceLock';
import { briefAdvice, closingAdvice, DIRECT_TRACK_ADVICE, STORY_SESSION_ADVICE, subtaskAdvice } from './unitAdvice';
import { processGroupState, type ProcessIdentity } from './processIdentity';

/** O mesmo runner das portas existentes; a fundação também pode ser exercitada com processos Node. */
export interface UnitStarter {
  start(cardId: string, options: RunOptions): void;
  stop(cardId: string): void;
}
export interface OrchestratorOptions {
  repo(): WorkRepo;
  state(): BoardState;
  sessions: RunMcpSessions;
  starter: UnitStarter;
  /** Motivo da pausa por limite de uso do perfil da unidade, ou null: o início automático vira espera, não falha. */
  usageHold?(cardId: string): string | null;
  ownsBoard(): boolean;
  flush(): Promise<void>;
  workspace(unit: WorkUnit): Promise<string>;
  /** null significa desconhecido: não autoriza uma retentativa sem efeitos. */
  fingerprint(workspace: string): Promise<string | null>;
  /** Deve verificar a identidade antes de sinalizar e confirmar o fim do grupo, por SO. */
  terminate(identity: ProcessIdentity): Promise<boolean>;
  /** Grava na mesma transação de finish; não pode publicar efeitos assíncronos. */
  comment(work: WorkRecord, outcome: Reconciled['kind'] | 'cancelled', body: string): string;
  publish(): void;
  /** Bloqueia a história com o motivo (a parada do plano); sem ela, a parada só volta no resultado do `drive`. */
  /** `quiet`: a nota já está na conversa; só o motivo do bloqueio é gravado */
  block?(storyId: string, reason: string, quiet?: boolean): void;
  /** Grava uma nota do board na conversa da história (a recusa da conferência das sub-tarefas). */
  note?(storyId: string, body: string): void;
  log(message: string): void;
  gitMode(): string;
  policy?(): PolicyLimits;
  /** Processos fora destas unidades também consomem os tetos. */
  otherProcesses(): readonly WorkRuntime[];
  coordinationDir?: string;
}
interface Baseline {
  version: 1;
  files: string | null;
  children: string[];
  profile: string;
}
interface Active {
  claim: WorkClaim;
  lease: WorkspaceLease;
  origin: AiRunOrigin;
}
export const missingWorkspaceNote = (folder: string): string =>
  `A pasta de trabalho da história não existe mais: ${folder}. Ela pode ter sido apagada na limpeza depois do merge. Se a história já foi entregue, mova-a para Concluído; se ainda falta trabalho, prepare a pasta de novo (prepare_workspace) e libere a história.`;
export type DriveResult = { kind: 'started'; work: WorkRecord } | { kind: 'idle' | 'wait' | 'paused'; reason?: string };

export function workResultMessage(state: BoardState, work: WorkRecord, outcome: Reconciled | { kind: 'cancelled' }): string {
  const card = state.cards.find((c) => c.id === work.cardId);
  const ref = card ? `#${card.number}` : 'unidade indisponível';
  const labels = {
    done: 'concluída',
    'with-person': 'passou para a pessoa',
    'needs-decision': 'precisa de revisão',
    cancelled: 'cancelada',
    'retry-safe': 'aguardando nova tentativa',
    unconfirmed: 'aguardando confirmação do processo',
  };
  const last = state.comments
    .filter((c) => c.cardId === work.cardId && c.source === 'ai' && c.author !== 'Faz AI')
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .at(-1);
  return [
    `Resultado de ${ref}: ${labels[outcome.kind]}.`,
    ...('reason' in outcome ? [outcome.reason] : []),
    ...(last ? [`Última mensagem da IA:\n${last.body.slice(0, 600)}`] : []),
  ].join('\n\n');
}

/** Única fila de controle; a espera pela CLI acontece fora dela, preservando cancelamento e outras histórias. */
export class Orchestrator {
  private tail: Promise<unknown> = Promise.resolve();
  private ready = false;
  private active = new Map<string, Active>();
  private leases = new Map<string, WorkspaceLease>();
  private origins = new Map<string, AiRunOrigin>();
  private cancelled = new Set<string>();
  private pendingEnds = new Map<string, AiRunEnd>();
  private startFailures = new Map<string, string>();
  private terminations = new Map<string, Promise<boolean>>();
  /** Espera da retentativa transitória por chave de unidade (só em memória; perdida ao recarregar, o que é benigno). */
  private notBefore = new Map<string, number>();
  constructor(private options: OrchestratorOptions) {}
  private get owner() {
    return this.options.sessions.owner;
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn);
    this.tail = next.catch(() => {});
    return next;
  }
  private primary(): void {
    if (!this.options.ownsBoard()) throw new Error(Autopilot.NOT_OWNER_NOTE);
  }
  private allowed(): void {
    this.primary();
    if (!this.ready) throw new Error('A reconciliação da abertura precisa terminar antes de executar.');
  }
  liveTokens(): ReadonlySet<string> {
    return new Set(
      [...this.active.values()]
        .filter(({ claim }) => {
          try {
            this.options.sessions.assert(claim.token);
            return true;
          } catch {
            return false;
          }
        })
        .map(({ claim }) => claim.token),
    );
  }
  drive(storyId: string, origin: AiRunOrigin): Promise<DriveResult> {
    return this.exclusive(async () => {
      this.allowed();
      const repo = this.options.repo();
      const state = this.options.state();
      const story = state.cards.find((c) => c.id === storyId);
      if (!story) return { kind: 'idle' };
      const records = repo.records();
      const relevant = records.filter((w) => w.state === 'failed').concat(records.filter((w) => LIVE_WORK_STATES.includes(w.state)));
      const live = { byCard: new Map(relevant.filter((w) => w.cardId).map((w) => [w.cardId!, w])) };
      const done = new Set(records.filter((w) => w.state === 'done' || w.state === 'cancelled').map((w) => w.key));
      const plan = storyPlan(state, story, live, done);
      if (plan.kind === 'paused') {
        // o fechamento sem avanço (ou uma sub-tarefa que precisa de revisão) para a história e a entrega à pessoa
        // a mesma nota não se repete na conversa; quem já tentou destravar recebe a versão que explica
        if (!isWithHuman(story)) {
          const { note, quiet } = blockNote(state, story, plan.reason);
          this.options.block?.(storyId, note, quiet);
        }
        this.origins.delete(storyId);
        return plan;
      }
      if (plan.kind !== 'units') return plan;
      this.origins.set(storyId, origin);
      const hold = origin === 'manual' ? null : (this.options.usageHold?.(plan.units[0]!.cardId!) ?? null);
      if (hold) return { kind: 'wait', reason: hold };
      const unitKey = plan.units[0]!.key;
      const until = this.notBefore.get(unitKey);
      if (until !== undefined) {
        if (until > Date.now()) {
          const at = new Date(until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return { kind: 'wait', reason: `Aguardando nova tentativa às ${at} (falha transitória).` };
        }
        this.notBefore.delete(unitKey);
      }
      return this.start(plan.units[0]!, origin);
    });
  }
  continue(storyId: string): Promise<DriveResult> {
    return this.drive(storyId, this.origins.get(storyId) ?? 'manual');
  }
  /** Barreira explícita para os gatilhos e para quem precisa observar a reconciliação concluída. */
  async settled(): Promise<void> {
    let observed;
    do {
      observed = this.tail;
      await observed;
    } while (observed !== this.tail);
  }
  /** #12 do card, para a recusa da admissão dizer quem ocupa a vaga */
  private ref(id: string | null): string | undefined {
    const card = id ? this.options.state().cards.find((c) => c.id === id) : undefined;
    return card ? cardRef(card) : undefined;
  }
  private baseline(work: WorkRecord): Baseline | null {
    try {
      const parsed = JSON.parse(this.options.repo().latest(work.id)?.workspaceBefore ?? 'null') as Baseline | null;
      return parsed?.version === 1 &&
        (parsed.files === null || typeof parsed.files === 'string') &&
        typeof parsed.profile === 'string' &&
        Array.isArray(parsed.children) &&
        parsed.children.every((id) => typeof id === 'string')
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  private current(claim: WorkClaim): WorkRecord {
    const binding = this.options.sessions.assert(claim.token);
    if (binding.work.id !== claim.work.id || binding.work.generation !== claim.work.generation || this.cancelled.has(claim.work.id))
      throw new Error('A unidade foi cancelada antes de liberar a execução.');
    this.allowed();
    const state = this.options.state();
    const story = state.cards.find((c) => c.id === binding.work.storyId);
    const card = state.cards.find((c) => c.id === binding.work.cardId);
    if (
      !story ||
      !isLive(story) ||
      isWithHuman(story) ||
      !card ||
      !isLive(card) ||
      isWithHuman(card) ||
      columnOf(state, card)?.category !== 'open' ||
      columnOf(state, story)?.category !== 'open' ||
      story.columnId !== binding.work.columnId
    )
      throw new Error('A história mudou de fase ou foi encerrada antes de liberar a execução.');
    return binding.work;
  }
  private async start(unit: WorkUnit, origin: AiRunOrigin): Promise<DriveResult> {
    const folder = await this.options.workspace(unit);
    this.allowed();
    // a worktree apagada (limpeza depois do merge, remoção à mão) fazia o realpath falhar com ENOENT, e o
    // autopiloto tentava de novo na hora, sem fim: a história para com a nota e fica com a pessoa
    if (!fs.existsSync(folder)) {
      const reason = missingWorkspaceNote(folder);
      const story = this.options.state().cards.find((c) => c.id === unit.storyId);
      if (story && !isWithHuman(story)) this.options.block?.(story.id, reason);
      if (story) this.origins.delete(story.id);
      return { kind: 'paused', reason };
    }
    const workspace = fs.realpathSync(folder);
    const runtime: WorkRuntime = { activity: 'branch', profile: this.options.state().board.aiTool, workspace, writer: true };
    const occupied: WorkRuntime[] = this.options
      .repo()
      .live()
      .map((w) => ({
        activity: 'branch',
        profile: this.baseline(w)?.profile ?? runtime.profile,
        workspace: w.workspace,
        writer: true,
        label: this.ref(w.cardId ?? w.storyId),
      }));
    occupied.push(...this.options.otherProcesses());
    const admission = admit(
      runtime,
      occupied,
      effectiveLimits(this.options.state().board.runner, this.options.gitMode(), this.options.policy?.()),
    );
    if (!admission.ok) return { kind: 'wait', reason: admission.reason };
    const claim = this.options.repo().claim(unit, this.owner, workspace);
    if (!claim) return { kind: 'wait', reason: 'A unidade ou a pasta já está reservada.' };
    // o claim é único por chave: a nota da recusa não se repete num drive repetido
    if (isBriefKey(unit.key)) this.noteBrief(unit);
    let lease: WorkspaceLease | null = null;
    try {
      lease = acquireWorkspace(workspace, claim.work.id, claim.work.generation, this.owner, this.options.coordinationDir);
      if (!lease) throw new Error('A pasta já tem outro escritor ou aguarda reconciliação.');
      this.leases.set(claim.work.id, lease);
      this.active.set(claim.work.id, { claim, lease, origin });
      const files = await this.options.fingerprint(workspace);
      const baseline: Baseline = {
        version: 1,
        files,
        profile: runtime.profile!,
        children: this.options
          .state()
          .cards.filter((c) => c.parentId === unit.storyId)
          .map((c) => c.id),
      };
      this.options.repo().preparedWorkspace(claim.work.id, claim.work.generation, this.owner, JSON.stringify(baseline));
      await this.options.flush();
      this.current(claim);
      this.options.publish();
      this.options.starter.start(unit.cardId!, {
        origin,
        mode: 'phase',
        advice: this.advice(unit),
        workId: claim.work.id,
        token: claim.token,
        beforeStart: async (identity) => {
          this.current(claim);
          // WAL da pasta vem primeiro: uma queda antes do flush ainda deixa o processo recuperável.
          lease!.recordProcess(identity);
          const runId = this.options.repo().latest(claim.work.id)?.runId;
          if (!runId) throw new Error('A tentativa precisa estar vinculada ao log antes de iniciar.');
          this.options.repo().started(claim.work.id, claim.work.generation, this.owner, runId, identity, JSON.stringify(baseline));
          await this.options.flush();
          this.current(claim);
        },
        onExit: (end) => {
          this.revoke(claim);
          this.pendingEnds.set(claim.work.id, end);
          void this.exclusive(() => this.reconcile(claim.work.id)).catch((e: unknown) => this.log(e));
        },
      });
      return { kind: 'started', work: this.options.repo().get(claim.work.id)! };
    } catch (error) {
      this.revoke(claim);
      const why = this.options.sessions.redact(error instanceof Error ? error.message : String(error)).trim();
      // o motivo real vai para o resultado: "confira o ambiente" não dizia à pessoa o que corrigir
      this.startFailures.set(
        claim.work.id,
        why
          ? `Não foi possível iniciar a execução: ${why}`
          : 'Não foi possível preparar ou iniciar a execução; confira o ambiente antes de tentar de novo.',
      );
      this.options.log(`A unidade não iniciou: ${why}`);
      // Sem uma trava adquirida, nenhum comando pôde ser liberado por este controlador.
      if (!lease) {
        this.options.repo().transition(claim.work.id, claim.work.generation, this.owner, 'reconciling');
        const outcome = {
          kind: 'needs-decision' as const,
          reason: 'Não foi possível reservar a pasta antes de executar.',
        };
        this.options.repo().finish(claim.work.id, claim.work.generation, this.owner, outcome, () => this.result(claim.work, outcome));
        await this.options.flush();
        this.options.repo().workspaceReleased(claim.work.id, claim.work.generation, this.owner);
        await this.options.flush();
      } else await this.reconcile(claim.work.id);
      this.options.publish();
      throw error;
    }
  }
  /** As sub-tarefas reprovadas na conferência, recalculadas do estado atual com o mesmo filtro do plano. */
  private briefFailuresOf(unit: WorkUnit) {
    const state = this.options.state();
    const story = state.cards.find((c) => c.id === unit.storyId);
    if (!story) return null;
    const repo = this.options.repo();
    const records = repo.records();
    const relevant = records.filter((w) => w.state === 'failed').concat(records.filter((w) => LIVE_WORK_STATES.includes(w.state)));
    const live = { byCard: new Map(relevant.filter((w) => w.cardId).map((w) => [w.cardId!, w])) };
    const done = new Set(records.filter((w) => w.state === 'done' || w.state === 'cancelled').map((w) => w.key));
    return { story, failures: briefFailures(pendingSubtasks(state, story, live, done)) };
  }
  private noteBrief(unit: WorkUnit): void {
    const found = this.briefFailuresOf(unit);
    if (found && unit.storyId) this.options.note?.(unit.storyId, briefReason(found.story, found.failures));
  }
  /** O pedido extra de cada unidade: o ciclo da sub-tarefa, a correção da descrição ou o fechamento da fase. */
  private advice(unit: WorkUnit): string[] {
    const state = this.options.state();
    const story = state.cards.find((c) => c.id === unit.storyId);
    const card = state.cards.find((c) => c.id === unit.cardId);
    if (!story) return [];
    if (unit.kind === 'subtask' && card) return [subtaskAdvice(story, card)];
    if (unit.kind === 'closing') return [closingAdvice(story)];
    if (unit.kind === 'story' && isBriefKey(unit.key)) {
      const found = this.briefFailuresOf(unit);
      return found ? [briefAdvice(found.story, found.failures)] : [];
    }
    // a sessão da história numa fase de código (o runner só a acrescenta fora do orquestrador, sem unidade)
    if (unit.kind === 'story' && activityKindOf(state, story, 'phase') === 'branch')
      return [isDirectTrackStory(state, story) ? DIRECT_TRACK_ADVICE : STORY_SESSION_ADVICE];
    return [];
  }
  private revoke(claim: WorkClaim): void {
    try {
      this.options.sessions.revoke(claim.token);
    } catch (e) {
      this.log(e);
    }
  }
  private log(error: unknown): void {
    this.options.log(this.options.sessions.redact(error instanceof Error ? error.message : String(error)));
  }
  private result(work: WorkRecord, outcome: Reconciled | { kind: 'cancelled' }): string {
    return this.options.comment(work, outcome.kind, this.options.sessions.redact(workResultMessage(this.options.state(), work, outcome)));
  }
  private async leaseFor(work: WorkRecord): Promise<WorkspaceLease | null> {
    if (!work.workspace) return null;
    const cached = this.leases.get(work.id);
    if (cached) return cached;
    try {
      const adopted = adoptWorkspace(work.workspace, work.id, work.generation, this.owner, this.options.coordinationDir);
      if (adopted) this.leases.set(work.id, adopted);
      return adopted;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' && !LIVE_WORK_STATES.includes(work.state)) {
        // A conclusão já foi sincronizada e o rename da trava aconteceu antes da queda.
        this.options.repo().workspaceReleased(work.id, work.generation, this.owner);
        await this.options.flush();
        return null;
      }
      throw e;
    }
  }
  private async release(work: WorkRecord, lease: WorkspaceLease | null): Promise<void> {
    if (!work.workspace || !lease) return;
    if (!lease.release()) throw new Error('O encerramento da árvore de processos ainda não foi confirmado.');
    this.leases.delete(work.id);
    this.options.repo().workspaceReleased(work.id, work.generation, this.owner);
    await this.options.flush();
  }
  private async reconcile(id: string): Promise<void> {
    this.primary();
    const repo = this.options.repo();
    let work = repo.get(id);
    if (!work || work.owner !== this.owner) return;
    const lease = await this.leaseFor(work);
    if (!LIVE_WORK_STATES.includes(work.state)) {
      await this.options.flush();
      await this.release(work, lease);
      this.completed(work, repo.latest(id)?.outcome === 'done');
      return;
    }
    if (work.state !== 'reconciling') work = repo.transition(id, work.generation, this.owner, 'reconciling');
    await this.options.flush();
    const attempt = repo.latest(id)!;
    const process = lease?.process ?? attempt.process;
    let gone = process === null && !!lease;
    if (process) {
      gone = processGroupState(process) === 'dead';
      if (!gone) gone = (await (this.terminations.get(id) ?? this.options.terminate(process))) && processGroupState(process) === 'dead';
    }
    const end = this.pendingEnds.get(id);
    const state = this.options.state();
    const card = state.cards.find((c) => c.id === work!.cardId);
    const story = state.cards.find((c) => c.id === work!.storyId);
    const before = this.baseline(work);
    const after = work.workspace ? await this.options.fingerprint(work.workspace) : null;
    const changed = before?.files !== null && before?.files !== undefined && after !== null ? before.files !== after : null;
    const newChildren = !!before && state.cards.some((c) => c.parentId === work!.storyId && isLive(c) && !before.children.includes(c.id));
    const advanced = work.kind !== 'subtask' && !!story && story.columnId !== work.columnId;
    const closed = !!card && (!isLive(card) || columnOf(state, card)?.category !== 'open' || advanced);
    const observedCalls =
      end?.report.inventory.filter((i) => i.kind === 'tool' || i.kind === 'mcp_tool').reduce((sum, i) => sum + i.calls, 0) ?? 0;
    // Medição completa de tokens não prova completude do inventário de ferramentas.
    const calls = process === null && !!lease ? 0 : observedCalls > 0 ? observedCalls : null;
    let outcome: Reconciled | { kind: 'cancelled' } = reconcileOutcome({
      kind: work.kind,
      processGone: gone,
      outcome: end?.outcome ?? (process === null && lease ? 'unsupported' : 'unknown'),
      usageLimit: end?.report.usageLimitReached ?? false,
      measureError:
        end?.measureError instanceof MeasureEndedError
          ? 'ended'
          : end?.measureError instanceof MeasureRefusedError
            ? 'refused'
            : end?.measureError
              ? 'broken'
              : null,
      cardClosed: closed,
      cardWithPerson: !!card && isWithHuman(card),
      mutations: attempt.mutations,
      toolCalls: calls,
      workspaceChanged: changed,
      failureClass: end?.failureClass ?? null,
      transientRetries: repo.transientRetries(id),
    });
    const wasCancelled =
      this.cancelled.has(id) ||
      (!!story && columnOf(state, story)?.category === 'cancelled') ||
      (!!card && columnOf(state, card)?.category === 'cancelled');
    if (gone && wasCancelled) outcome = { kind: 'cancelled' };
    else if (gone && this.startFailures.has(id)) outcome = { kind: 'needs-decision', reason: this.startFailures.get(id)! };
    else if (gone && newChildren && work.kind !== 'subtask' && end?.outcome === 'done' && !isWithHuman(card ?? { status: null }))
      outcome = { kind: 'done' };
    // a correção que terminou normalmente é done, tenha corrigido ou não: o storyPlan decide no continue
    else if (gone && work.kind === 'story' && isBriefKey(work.key) && end?.outcome === 'done' && story && !isWithHuman(story))
      outcome = { kind: 'done' };
    if (outcome.kind === 'retry-safe' && end?.failureClass === 'transient') {
      // esta tentativa ainda não consta como retry-safe: a retentativa de número (anteriores + 1) espera esse tempo
      const wait = retryDelay(repo.transientRetries(id) + 1);
      this.notBefore.set(work.key, Date.now() + wait);
      const storyId = work.storyId;
      if (storyId && this.origins.has(storyId)) {
        const timer = setTimeout(() => void this.continue(storyId).catch((e: unknown) => this.log(e)), wait + 50);
        timer.unref?.();
      }
    }
    const finished = repo.finish(id, work.generation, this.owner, outcome, () => this.result(work!, outcome));
    // O comentário e o desfecho chegam ao disco antes de liberar o escritor físico.
    await this.options.flush();
    this.options.publish();
    if (outcome.kind === 'unconfirmed') return;
    await this.release(finished, lease);
    this.completed(work, outcome.kind === 'done');
  }
  private completed(work: WorkRecord, advance: boolean): void {
    const id = work.id;
    this.active.delete(id);
    this.pendingEnds.delete(id);
    this.startFailures.delete(id);
    this.terminations.delete(id);
    this.cancelled.delete(id);
    this.options.publish();
    if (advance && work.storyId && this.origins.has(work.storyId)) {
      const storyId = work.storyId;
      queueMicrotask(() => {
        void this.continue(storyId).catch((e: unknown) => this.log(e));
      });
    }
  }
  onCardsCancelled(ids: readonly string[]): Promise<void> {
    this.primary();
    const selected = this.options
      .repo()
      .live()
      .filter((w) => ids.includes(w.cardId ?? '') || ids.includes(w.storyId ?? ''));
    for (const work of selected) {
      this.cancelled.add(work.id);
      const active = this.active.get(work.id);
      if (active) this.revoke(active.claim);
      else this.options.repo().revoke(work.id, work.generation, this.owner);
    }
    for (const work of selected) {
      const identity = this.leases.get(work.id)?.process ?? this.options.repo().latest(work.id)?.process;
      // Começa a confirmação enquanto o líder ainda pode provar a identidade; Parar vem depois da revogação.
      if (identity)
        this.terminations.set(
          work.id,
          this.options.terminate(identity).catch((e: unknown) => {
            this.log(e);
            return false;
          }),
        );
      if (work.cardId) this.options.starter.stop(work.cardId);
    }
    return this.exclusive(async () => {
      for (const work of selected) await this.reconcile(work.id);
    });
  }
  reconcileOnOpen(): Promise<void> {
    return this.exclusive(async () => {
      this.primary();
      this.options.repo().recoverOwner(this.owner);
      await this.options.flush();
      for (const work of this.options
        .repo()
        .records()
        .filter((w) => LIVE_WORK_STATES.includes(w.state) || w.workspace)) {
        try {
          await this.reconcile(work.id);
        } catch (e) {
          this.log(e);
        }
      }
      this.ready = true;
      this.options.publish();
    });
  }
  sweep(): Promise<void> {
    return this.exclusive(async () => {
      this.allowed();
      for (const work of this.options
        .repo()
        .records()
        .filter((w) => w.state === 'reconciling' || (!LIVE_WORK_STATES.includes(w.state) && w.workspace))) {
        try {
          await this.reconcile(work.id);
        } catch (e) {
          this.log(e);
        }
      }
    });
  }
}
