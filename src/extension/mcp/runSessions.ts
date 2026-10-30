import { randomUUID } from 'node:crypto';
import type { BoardState, Card } from '../../shared/model';
import type { BoardArtifact } from '../../shared/artifacts';
import type { HeadlessInput } from '../headless';
import type { FrozenRunArtifacts } from '../runArtifactSnapshot';
import type { MessageRouter, Origin } from '../panel/messageRouter';
import type { WorkRepo, WorkRecord, WorkAttempt } from '../repositories/workRepo';
import { activityKindOf } from '../../shared/activity';
import { findCard } from './format';

export const ENDED_RUN = 'Esta execução foi encerrada pelo board; nada foi alterado.';
export interface RunMcpAccess {
  assert(): void;
  definition(server: string): Record<string, unknown>;
  signal: AbortSignal;
}
interface Registration {
  snapshot: FrozenRunArtifacts;
  servers: Record<string, unknown>;
  mcps: BoardArtifact[];
  tools: Set<string> | null;
  abort: AbortController;
}
interface Options {
  repo(): WorkRepo;
  state(): BoardState;
  definitions(): Record<string, unknown>;
  save(): void;
}
/** Tokens vêm somente de WorkRepo. O registro em memória fixa leituras; não concede autoridade. */
export class RunMcpSessions {
  readonly owner = randomUUID();
  private runs = new Map<string, Registration>();
  private knownTokens = new Set<string>();
  private revokedTokens = new Set<string>();
  private tokenRuns = new Map<string, string>();
  constructor(private options: Options) {}
  assert(token: string): { work: WorkRecord; attempt: WorkAttempt } {
    if (this.revokedTokens.has(token)) throw new Error(ENDED_RUN);
    const binding = this.options.repo().forToken(token);
    if (!binding || binding.work.owner !== this.owner) throw new Error(ENDED_RUN);
    this.knownTokens.add(token);
    if (binding.attempt.runId) this.tokenRuns.set(token, binding.attempt.runId);
    return binding;
  }
  bind(token: string, workId: string, runId: string): void {
    const { work } = this.assert(token);
    if (work.id !== workId) throw new Error('O token não pertence à unidade desta execução.');
    this.options.repo().bindRun(work.id, work.generation, this.owner, runId);
    this.tokenRuns.set(token, runId);
    this.options.save();
  }
  register(runId: string, snapshot: FrozenRunArtifacts, input: HeadlessInput): void {
    if (snapshot.manifest.runId !== runId || snapshot.manifest.boardId !== this.options.repo().boardId || this.runs.has(runId))
      throw new Error('Snapshot incompatível com a sessão MCP.');
    const names = new Set(input.exec?.mcpAllowed ?? []);
    if (
      this.options
        .state()
        .harness.library?.artifacts.some(
          (a) =>
            a.kind === 'mcp' &&
            names.has(a.name) &&
            a.mcpCredential &&
            (a.mcpCredential.review !== 'reviewed' || !a.mcpCredential.available),
        )
    )
      throw new Error('Este MCP exige revisão humana ou configuração local antes de executar.');
    const mcps = structuredClone(
      this.options
        .state()
        .harness.library?.artifacts.filter((a) => a.kind === 'mcp' && names.has(a.name) && !a.missing && a.usage !== 'off') ?? [],
    ).map((a) => ({ ...a, mcpSummary: undefined }));
    const relayNames = new Set(mcps.map((a) => a.name));
    const explicit = input.exec?.mcpConfig ? (JSON.parse(input.exec.mcpConfig) as { mcpServers?: Record<string, unknown> }) : {};
    const library = relayNames.size ? this.options.definitions() : {};
    const servers = Object.fromEntries(
      [...relayNames]
        .filter((name) => name !== 'faz-ai')
        .map((name) => [
          name,
          Object.hasOwn(explicit.mcpServers ?? {}, name)
            ? explicit.mcpServers![name]
            : Object.hasOwn(library, name)
              ? library[name]
              : undefined,
        ])
        .filter(([, value]) => value !== undefined),
    );
    this.runs.set(runId, {
      snapshot,
      servers: structuredClone(servers),
      mcps,
      tools: input.exec?.toolSet === 'explicit' ? new Set(input.exec.mcpTools ?? []) : null,
      abort: new AbortController(),
    });
  }
  forget(runId: string): void {
    this.runs.get(runId)?.abort.abort();
    this.runs.delete(runId);
  }
  revoke(token: string): void {
    this.revokedTokens.add(token);
    const runId = this.tokenRuns.get(token);
    if (runId) this.forget(runId);
    this.tokenRuns.delete(token);
    const binding = this.options.repo().forToken(token);
    if (binding?.work.owner === this.owner) this.options.repo().revoke(binding.work.id, binding.work.generation, this.owner);
    this.options.save();
  }
  redact(text: string): string {
    let clean = text;
    for (const token of this.knownTokens) clean = clean.split(token).join('[token da execução]');
    return clean;
  }
  sanitize<T>(value: T): T {
    return value === undefined ? value : (JSON.parse(this.redact(JSON.stringify(value))) as T);
  }
  private registration(token: string): Registration {
    const { attempt } = this.assert(token);
    const registration = attempt.runId ? this.runs.get(attempt.runId) : undefined;
    if (!registration) throw new Error('Snapshot obrigatório da execução indisponível.');
    return registration;
  }
  injectToken(token: string, input: HeadlessInput): HeadlessInput {
    this.assert(token);
    const result = this.sanitize(input);
    let bound = false;
    if (result.boardServer) {
      result.boardServer.env = { ...result.boardServer.env, FAZAI_RUN_TOKEN: token };
      bound = true;
    }
    if (result.exec?.mcpConfig) {
      const config = JSON.parse(result.exec.mcpConfig) as { mcpServers?: Record<string, { env?: Record<string, string> }> };
      const server = config.mcpServers?.['faz-ai'];
      if (server) {
        server.env = { ...server.env, FAZAI_RUN_TOKEN: token };
        bound = true;
      }
      result.exec.mcpConfig = JSON.stringify(config);
    }
    if (!bound) throw new Error('A execução controlada exige a ponte MCP do board.');
    return result;
  }
  private available(card: Card, token?: string): void {
    const own = token ? this.assert(token).work : undefined;
    if (
      this.options
        .repo()
        .live()
        .some((work) => work.cardId === card.id && work.id !== own?.id)
    )
      throw new Error(`O board está executando #${card.number}; acompanhe pelo get_card.`);
    if (own && (own.kind === 'story' || own.kind === 'closing') && card.parentId === own.storyId) {
      const story = this.options.state().cards.find((c) => c.id === own.storyId);
      if (story && activityKindOf(this.options.state(), story) === 'branch')
        throw new Error('O board executa as sub-tarefas desta fase; a sessão da história apenas as planeja.');
    }
  }
  /** Uma guarda por chamada; cada método que roda depois de await confere novamente a posse. */
  tool(
    router: MessageRouter,
    token: string | undefined,
    name: string,
    args: unknown,
    readOnly: boolean,
    author: string,
  ): { router: MessageRouter; assert(): void } {
    const check = () => {
      if (token !== undefined) this.assert(token);
    };
    check();
    const registration = token === undefined ? undefined : this.registration(token);
    if (registration?.tools && !registration.tools.has(`mcp__faz-ai__${name}`))
      throw new Error('Operação MCP fora do contrato desta execução.');
    const params = args as Record<string, unknown>;
    if (token !== undefined && !readOnly && params.card !== undefined) {
      const card = findCard(this.options.state(), params.card as string | number);
      const { work } = this.assert(token);
      if (work.cardId && card.id !== work.cardId && !((work.kind === 'story' || work.kind === 'closing') && card.parentId === work.storyId))
        throw new Error('Card fora do escopo desta execução.');
    }
    if ((name === 'start_work' || name === 'move_card') && params.card !== undefined)
      this.available(findCard(this.options.state(), params.card as string | number), token);
    if (registration && (name === 'call_board_mcp_tool' || name === 'list_board_mcp_tools')) {
      if (!Object.hasOwn(registration.servers, String(params.server))) throw new Error('Servidor MCP fora do snapshot desta execução.');
      if (
        name === 'call_board_mcp_tool' &&
        registration.tools &&
        !registration.tools.has(`mcp__${String(params.server).replace(/[^A-Za-z0-9_-]/g, '_')}__${String(params.name)}`)
      )
        throw new Error('Operação MCP fora do contrato desta execução.');
    }
    // Conta a operação mutante aceita antes de qualquer await. Falha posterior permanece conservadora.
    if (token !== undefined && !readOnly) {
      this.options.repo().countMutation(token);
      this.options.save();
    }
    const origin: Origin = { source: 'ai', author, ...(token === undefined ? { externalMcp: true } : { runToken: token }) };
    const scopedState = (state: BoardState): BoardState => {
      check();
      if (!registration) return state;
      const artifacts = [...registration.snapshot.catalog(), ...structuredClone(registration.mcps)];
      return {
        ...state,
        harness: { library: { directory: registration.snapshot.directory, artifacts }, inventory: [], rules: [], skills: [], agents: [] },
      };
    };
    const assertCard = (id: string) => {
      if (token === undefined) return;
      const { work } = this.assert(token);
      if (!work.cardId || id === work.cardId) return;
      const card = this.options.state().cards.find((c) => c.id === id);
      if ((work.kind === 'story' || work.kind === 'closing') && card?.parentId === work.storyId) return;
      throw new Error('Card fora do escopo desta execução.');
    };
    const access: RunMcpAccess | null =
      token === undefined
        ? null
        : {
            assert: check,
            signal: registration!.abort.signal,
            definition: (server) => {
              check();
              const value = registration!.servers[server];
              if (!Object.hasOwn(registration!.servers, server) || !value || typeof value !== 'object')
                throw new Error('Servidor MCP fora do snapshot desta execução.');
              return structuredClone(value) as Record<string, unknown>;
            },
          };
    const methods = new Set([
      'snapshot',
      'handle',
      'createCard',
      // só leitura: o id do portão que o move_card/request_review devolve à IA
      'runningGate',
      'addAttachmentFiles',
      'getAttachment',
      'readHarnessFile',
      'projectArtifacts',
      'projectProfile',
      // só leitura das políticas salvas; simular, salvar e ativar não entram na sessão MCP
      'executionPolicyLibrary',
      'readLibraryArtifact',
      'libraryMcpDefinitions',
      // o detect_models de um perfil ACP abre a sessão do agente antes de juntar ao catálogo
      'readAcpModels',
      'metrics',
      'panelMetrics',
      'mcpAccess',
    ]);
    const proxy = new Proxy(router, {
      get: (target, key) => {
        if (key === 'then') return undefined;
        if (key === 'boardId') {
          check();
          return target.boardId;
        }
        if (key === 'store')
          return {
            pathOf: (...values: Parameters<typeof target.store.pathOf>) => {
              check();
              return target.store.pathOf(...values);
            },
          };
        if (typeof key !== 'string' || !methods.has(key)) throw new Error('Método fora da sessão MCP.');
        return (...values: unknown[]) => {
          check();
          if (key === 'mcpAccess') return access;
          if (key === 'snapshot') return scopedState(target.snapshot());
          if (key === 'readHarnessFile' && registration) return registration.snapshot.readFile(String(values[0]));
          if (key === 'readLibraryArtifact' && registration) return registration.snapshot.artifact(String(values[0]));
          if (key === 'libraryMcpDefinitions' && registration) return structuredClone(registration.servers);
          if (key === 'projectArtifacts' && registration) throw new Error('Artefatos externos não pertencem ao snapshot desta execução.');
          if (key === 'handle') {
            const msg = values[0] as Parameters<MessageRouter['handle']>[0];
            const fields = msg as unknown as Record<string, unknown>;
            for (const field of ['cardId', 'fromId', 'toId', 'parentId']) if (typeof fields[field] === 'string') assertCard(fields[field]);
            if (Array.isArray(fields.cardIds)) for (const id of fields.cardIds) assertCard(String(id));
            const state = this.options.state();
            const references = [
              ...(typeof fields.commentId === 'string' ? state.comments.filter((c) => c.id === fields.commentId).map((c) => c.cardId) : []),
              ...(typeof fields.itemId === 'string' ? state.checklistItems.filter((i) => i.id === fields.itemId).map((i) => i.cardId) : []),
              ...(typeof fields.attachmentId === 'string'
                ? state.attachments.filter((a) => a.id === fields.attachmentId).map((a) => a.cardId)
                : []),
              ...(typeof fields.linkId === 'string'
                ? state.links.filter((l) => l.id === fields.linkId).flatMap((l) => [l.fromId, l.toId])
                : []),
            ];
            for (const id of references) assertCard(id);
            if (
              token !== undefined &&
              this.assert(token).work.cardId &&
              !references.length &&
              !['cardId', 'fromId', 'toId', 'parentId', 'commentId', 'itemId', 'attachmentId', 'linkId', 'cardIds'].some(
                (field) => fields[field] !== undefined,
              )
            )
              throw new Error('Configuração global fora do escopo desta execução.');
            if ('cardId' in msg && (msg.type === 'card.move' || (msg.type === 'card.status.set' && msg.status === 'running'))) {
              const card = state.cards.find((c) => c.id === msg.cardId);
              if (card) this.available(card, token);
            }
            if (msg.type === 'card.moveMany')
              for (const id of msg.cardIds) {
                const card = state.cards.find((c) => c.id === id);
                if (card) this.available(card, token);
              }
            return scopedState(target.handle(msg, origin));
          }
          if (key === 'createCard') {
            const input = values[0] as Parameters<MessageRouter['createCard']>[0];
            if (token !== undefined) {
              const { work } = this.assert(token);
              if (work.cardId && (work.kind === 'subtask' || input.parentId !== work.cardId))
                throw new Error('Card fora do escopo desta execução.');
            }
            return target.createCard(input, origin);
          }
          if (key === 'addAttachmentFiles') {
            assertCard(String(values[0]));
            return scopedState(target.addAttachmentFiles(values[0] as string, values[1] as string[], values[2] as boolean, origin));
          }
          const method = Reflect.get(target, key, target) as (...args: unknown[]) => unknown;
          return Reflect.apply(method, target, values);
        };
      },
    });
    return { router: proxy, assert: check };
  }
}
