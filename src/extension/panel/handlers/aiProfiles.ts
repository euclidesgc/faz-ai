import { isReadyCli } from '../../../shared/aiProfiles';
import type { AiProfile } from '../../../shared/aiProfiles';
import type { HostToWebview } from '../../../shared/messages';
import type { StrictExecutionRequest } from '../../../shared/executionAdmission';
import { admissionRegimeOf, DEFAULT_RUNNER, type RunnerConfig } from '../../../shared/runner';
import type { AiGateway, ContextRuntime } from '../../ai/gateway';
import { NO_CARD } from '../../ai/gateway';
import { closedV1 } from '../../ai/v1Prepare';
import { profileCanProbe, profileSignedIn, profileVersion } from '../../cliProbe';
import { resolveProfileCommand } from '../../cliResolve';
import { redactCredentialValues } from '../../credentials';
import { profileInstallUrl } from '../../requirements';
import { AiProfileRepo } from '../../repositories/aiProfileRepo';
import type { HandlerMap } from './context';
import { runContextScope } from '../../ai/contextScope';
import { CONTEXT_KINDS, normalizeLocationPath, type ContextLocation, type ContextScopeReport } from '../../../shared/contextScope';

/** A chave dos locais da pessoa na `meta` (a mesma do router, que a publica no estado). */
const CONTEXT_EXTRA_KEY = 'ai_context_extra';

/** Gravações de perfil são atos da pessoa; o repositório recusa a IA e mantém segredos fora do snapshot. */
export const aiProfileHandlers = {
  'settings.aiProfiles.save': (msg, ctx, actor) => {
    new AiProfileRepo(ctx.dbHandle.db).save(ctx.boardId, msg.profile, actor.byAi ? 'ai' : 'person');
    return true;
  },
  'settings.aiProfiles.setEnabled': (msg, ctx, actor) => {
    new AiProfileRepo(ctx.dbHandle.db).setEnabled(ctx.boardId, msg.id, msg.enabled, actor.byAi ? 'ai' : 'person');
    return true;
  },
  'settings.aiProfiles.duplicate': (msg, ctx, actor) => {
    new AiProfileRepo(ctx.dbHandle.db).duplicate(ctx.boardId, msg.id, actor.byAi ? 'ai' : 'person');
    return true;
  },
  'settings.aiProfiles.remove': (msg, ctx, actor) => {
    new AiProfileRepo(ctx.dbHandle.db).remove(ctx.boardId, msg.id, actor.byAi ? 'ai' : 'person');
    return true;
  },
  /**
   * A ciência do regime compatível de um perfil, dada ou revogada pela pessoa (história 7). É o caminho dos
   * perfis sem Conectar (cópias, personalizados) e a revogação de qualquer um. O router já recusa a IA e o MCP
   * em `settings.aiProfiles.*`; aqui a regra é a mesma do repositório de perfis.
   */
  'settings.aiProfiles.review': (msg, ctx, actor) => {
    if (actor.byAi) throw new Error('A ciência do regime compatível é um ato da pessoa.');
    if (!new AiProfileRepo(ctx.dbHandle.db).list(ctx.boardId).some((p) => p.id === msg.id))
      throw new Error(`Perfil indisponível neste board: ${msg.id}.`);
    if (msg.accept) ctx.boards.recordCompatibilityReview(ctx.boardId, msg.id);
    else return ctx.boards.revokeCompatibilityReview(ctx.boardId, msg.id);
    return true;
  },
  /** Um local do teste do contexto, acrescentado ou tirado pela pessoa (o router já recusa a IA e o MCP aqui). */
  'settings.aiProfiles.contextLocation': (msg, ctx) => {
    if (!new AiProfileRepo(ctx.dbHandle.db).list(ctx.boardId).some((p) => p.id === msg.id))
      throw new Error(`Perfil indisponível neste board: ${msg.id}.`);
    const path = normalizeLocationPath(msg.location.path);
    if (!path) throw new Error('Informe o caminho do arquivo ou da pasta.');
    if (!CONTEXT_KINDS.includes(msg.location.kind)) throw new Error('Tipo de local desconhecido.');
    let all: Record<string, ContextLocation[]> = {};
    try {
      all = JSON.parse(ctx.boards.getMeta(CONTEXT_EXTRA_KEY) ?? '{}') as Record<string, ContextLocation[]>;
    } catch {
      // um valor estragado recomeça vazio
    }
    const scope = path.startsWith('~') || path.startsWith('/') ? 'user' : 'project';
    const rest = (all[msg.id] ?? []).filter((l) => !(l.path === path && l.scope === scope));
    const next: ContextLocation[] =
      msg.op === 'add' ? [...rest, { path, scope, kind: msg.location.kind, loads: null, source: 'person' }] : rest;
    ctx.boards.setMeta(CONTEXT_EXTRA_KEY, JSON.stringify({ ...all, [msg.id]: next }));
    return true;
  },
} satisfies Partial<HandlerMap>;

export interface AiProfileRuntime {
  probe(): Promise<Extract<HostToWebview, { type: 'aiProfiles.status' }>>;
  test(id: string): Promise<Extract<HostToWebview, { type: 'aiProfiles.testResult' }>>;
  /** O teste do contexto do card (descoberta pelo agente e citação); gasta pedidos da conta da ferramenta. */
  contextScope(id: string): Promise<ContextScopeReport>;
}

export interface AiProfileRuntimeDeps {
  repo: AiProfileRepo;
  gateway: Pick<AiGateway, 'run'> & { runtime?: ContextRuntime };
  boardId: () => string;
  cwd: string;
  homeDir: string;
  pathEnv: () => string | undefined;
  /** a configuração do runner do board: o regime de admissão do teste é o escolhido pela pessoa (#1091) */
  runner?: () => RunnerConfig;
  resolve?: typeof resolveProfileCommand;
  version?: typeof profileVersion;
  signedIn?: typeof profileSignedIn;
  /** a chave da ferramenta está no cofre: é o login de quem entra por chave de API (o Gemini) */
  hasApiKey?: (tool: string) => boolean;
  /** a versão do agente no último Conectar, para o teste do contexto vencer quando ela mudar */
  contextVersion?: (id: string) => string | null;
  /** os locais que a pessoa acrescentou ao teste do contexto */
  contextExtra?: (id: string) => ContextLocation[];
  log?: (line: string) => void;
}

/** Sondas e teste são assíncronos, portanto a HostBridge publica suas respostas; o router fica síncrono. */
export function createAiProfileRuntime(deps: AiProfileRuntimeDeps): AiProfileRuntime {
  const running = new Set<string>();
  const profiles = () => deps.repo.list(deps.boardId());
  return {
    contextScope(id) {
      return runContextScope(
        {
          repo: deps.repo,
          gateway: deps.gateway,
          boardId: deps.boardId,
          cwd: deps.cwd,
          homeDir: deps.homeDir,
          ...(deps.runner ? { runner: deps.runner } : {}),
          version: deps.contextVersion ?? (() => null),
          extra: deps.contextExtra ?? (() => []),
          ...(deps.log ? { log: deps.log } : {}),
        },
        id,
      );
    },
    async probe() {
      const results = await Promise.all(
        profiles().map(async (meta) => {
          let found = false;
          let version: string | null = null;
          let signedIn: boolean | null = null;
          let installUrl: string | null = null;
          // desligado ou pendente não é sondado: dizer "não encontrada" fazia parecer que a CLI não estava instalada
          const skipped = profileCanProbe(meta) ? undefined : meta.enabled ? ('pending' as const) : ('off' as const);
          if (!skipped) {
            try {
              const profile = deps.repo.resolveProfile(deps.boardId(), meta.id);
              installUrl = profileInstallUrl(profile);
              const exe = (deps.resolve ?? resolveProfileCommand)(profile, deps.pathEnv(), deps.homeDir);
              if (exe) {
                found = true;
                [version, signedIn] = await Promise.all([
                  (deps.version ?? profileVersion)(profile, exe, { pathEnv: deps.pathEnv(), cwd: deps.cwd }),
                  (deps.signedIn ?? profileSignedIn)(profile, exe, deps.homeDir, {
                    pathEnv: deps.pathEnv(),
                    cwd: deps.cwd,
                    ...(deps.hasApiKey ? { hasApiKey: deps.hasApiKey } : {}),
                  }),
                ]);
              }
            } catch {
              // Uma configuração pendente ou indisponível nunca é apresentada como CLI validada.
            }
          }
          return [meta.id, { found, version, signedIn, installUrl, ...(skipped ? { skipped } : {}) }] as const;
        }),
      );
      return { type: 'aiProfiles.status', profiles: Object.fromEntries(results) };
    },
    async test(id) {
      const fail = (error: string): Extract<HostToWebview, { type: 'aiProfiles.testResult' }> => ({
        type: 'aiProfiles.testResult',
        id,
        ok: false,
        output: '',
        error,
      });
      const meta = profiles().find((p) => p.id === id);
      if (!meta) return fail('Perfil indisponível neste board.');
      if (!meta.enabled || !profileCanProbe(meta)) return fail('Perfil desativado ou pendente de revisão.');
      if (running.has(id)) return fail('Já existe um teste em curso para este perfil.');
      running.add(id);
      let profile: AiProfile | undefined;
      const tail: string[] = [];
      try {
        profile = deps.repo.resolveProfile(deps.boardId(), id);
        const runner = deps.runner?.() ?? DEFAULT_RUNNER;
        const strict: StrictExecutionRequest = {
          version: 1,
          ...admissionRegimeOf(runner),
          agentTools: { categories: [], native: { tool: '', allow: [], deny: [] } },
          boardTools: { mode: 'explicit', value: [] },
          activeMcpIds: [],
          allowedMcpIds: [],
          boardMcpIds: [],
          mcpServers: [],
          mcpTools: [],
          boardMcpTools: [],
          mcpLevel: { permission: 'board', tools: [] },
        };
        const execution = deps.gateway.run({
          origin: 'test',
          tool: id,
          profile,
          context: NO_CARD,
          cwd: deps.cwd,
          timeoutMinutes: 2,
          prepare: () => ({
            ...(isReadyCli(profile!) ? {} : { strict: { profileId: id, request: strict } }),
            // runtime v1: o teste do perfil também passa pelo contrato (fechado, sem MCP)
            ...(deps.gateway.runtime === 'v1' ? closedV1(id, 'chat', runner) : {}),
            config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: true, skills: [], mcp: [] },
            input: { prompt: 'Responda apenas com a palavra OK.', permission: 'board', structured: true },
          }),
          log: (line) => {
            for (const part of redactCredentialValues(line, profile?.config).split(/\r?\n/)) {
              if (!part) continue;
              tail.push(part);
              if (tail.length > 60) tail.shift();
            }
          },
        });
        return await new Promise<Extract<HostToWebview, { type: 'aiProfiles.testResult' }>>((resolve) => {
          execution.onExit((end) =>
            resolve({
              type: 'aiProfiles.testResult',
              id,
              ok: end.outcome === 'done',
              output: tail.join('\n'),
              ...(end.outcome === 'done'
                ? {}
                : {
                    error: redactCredentialValues(
                      end.error?.message ?? (end.timedOut ? 'Teste excedeu dois minutos.' : 'O teste não terminou com sucesso.'),
                      profile?.config,
                    ),
                  }),
            }),
          );
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return fail(redactCredentialValues(message, profile?.config));
      } finally {
        running.delete(id);
      }
    },
  };
}
