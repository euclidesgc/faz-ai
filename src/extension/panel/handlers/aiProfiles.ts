import type { AiProfile } from '../../../shared/aiProfiles';
import type { HostToWebview } from '../../../shared/messages';
import type { StrictExecutionRequest } from '../../../shared/executionAdmission';
import type { AiGateway, ContextRuntime } from '../../ai/gateway';
import { NO_CARD } from '../../ai/gateway';
import { closedV1 } from '../../ai/v1Prepare';
import { profileCanProbe, profileSignedIn, profileVersion } from '../../cliProbe';
import { resolveProfileCommand } from '../../cliResolve';
import { redactCredentialValues } from '../../credentials';
import { profileInstallUrl } from '../../requirements';
import { AiProfileRepo } from '../../repositories/aiProfileRepo';
import type { HandlerMap } from './context';

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
} satisfies Partial<HandlerMap>;

export interface AiProfileRuntime {
  probe(): Promise<Extract<HostToWebview, { type: 'aiProfiles.status' }>>;
  test(id: string): Promise<Extract<HostToWebview, { type: 'aiProfiles.testResult' }>>;
}

export interface AiProfileRuntimeDeps {
  repo: AiProfileRepo;
  gateway: Pick<AiGateway, 'run'> & { runtime?: ContextRuntime };
  boardId: () => string;
  cwd: string;
  homeDir: string;
  pathEnv: () => string | undefined;
  resolve?: typeof resolveProfileCommand;
  version?: typeof profileVersion;
  signedIn?: typeof profileSignedIn;
}

/** Sondas e teste são assíncronos, portanto a HostBridge publica suas respostas; o router fica síncrono. */
export function createAiProfileRuntime(deps: AiProfileRuntimeDeps): AiProfileRuntime {
  const running = new Set<string>();
  const profiles = () => deps.repo.list(deps.boardId());
  return {
    async probe() {
      const results = await Promise.all(
        profiles().map(async (meta) => {
          let found = false;
          let version: string | null = null;
          let signedIn: boolean | null = null;
          let installUrl: string | null = null;
          if (profileCanProbe(meta)) {
            try {
              const profile = deps.repo.resolveProfile(deps.boardId(), meta.id);
              installUrl = profileInstallUrl(profile);
              const exe = (deps.resolve ?? resolveProfileCommand)(profile, deps.pathEnv(), deps.homeDir);
              if (exe) {
                found = true;
                [version, signedIn] = await Promise.all([
                  (deps.version ?? profileVersion)(profile, exe, { pathEnv: deps.pathEnv(), cwd: deps.cwd }),
                  (deps.signedIn ?? profileSignedIn)(profile, exe, deps.homeDir, { pathEnv: deps.pathEnv(), cwd: deps.cwd }),
                ]);
              }
            } catch {
              // Uma configuração pendente ou indisponível nunca é apresentada como CLI validada.
            }
          }
          return [meta.id, { found, version, signedIn, installUrl }] as const;
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
        const strict: StrictExecutionRequest = {
          version: 1,
          regime: 'exclusive',
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
            ...(profile!.kind === 'builtin' ? {} : { strict: { profileId: id, request: strict } }),
            // runtime v1: o teste do perfil também passa pelo contrato (fechado, sem MCP)
            ...(deps.gateway.runtime === 'v1' ? closedV1(id, 'chat') : {}),
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
