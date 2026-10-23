// E5.3: no runtime `v1`, nenhuma porta de IA executa ignorando o plano. Sem agente com contrato válido e
// sem admissão do host, o processo não abre (um teste por porta: runner, chat, teste do perfil), e o
// gateway recusa qualquer chamada que chegue sem configuração resolvida.
import { DEFAULT_RUNNER } from '../src/shared/runner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { AiGateway, NO_CARD } from '../src/extension/ai/gateway';
import { cardV1, closedV1, contextRuntimeFromEnv } from '../src/extension/ai/v1Prepare';
import type { SpawnFn } from '../src/extension/aiOutput/measured';
import { ChatSession } from '../src/extension/chat';
import { openInMemory } from '../src/extension/db/database';
import { createRunLog } from '../src/extension/log/runLog';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { createAiProfileRuntime } from '../src/extension/panel/handlers/aiProfiles';
import { AiProfileRepo } from '../src/extension/repositories/aiProfileRepo';
import { AiRunner } from '../src/extension/runner';

let dir: string;
let db: Database;
let router: MessageRouter;
let spawn: ReturnType<typeof vi.fn>;
let cardId: string;

const gateway = (runtime: 'legacy' | 'v1') =>
  new AiGateway({ boardId: router.boardId, runLog: createRunLog(db), spawn: spawn as unknown as SpawnFn, runtime });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-v1-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'a'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'h'),
  });
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  cardId = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.name === 'Discovery')!.id,
    parentId: null,
    title: 'Login',
  });
  spawn = vi.fn();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('runtime v1 (E5.3)', () => {
  it('o ambiente escolhe o runtime; qualquer outro valor mantém o legado', () => {
    expect(contextRuntimeFromEnv({ FAZ_AI_CONTEXT_RUNTIME: 'v1' })).toBe('v1');
    expect(contextRuntimeFromEnv({ FAZ_AI_CONTEXT_RUNTIME: 'legacy' })).toBe('legacy');
    expect(contextRuntimeFromEnv({})).toBe('legacy');
  });

  it('gateway: recusa a chamada sem configuração resolvida e sem admissão, e não abre o processo', () => {
    const run = () =>
      gateway('v1').run({
        origin: 'chat',
        tool: 'claude',
        context: NO_CARD,
        cwd: dir,
        timeoutMinutes: 1,
        prepare: () => ({
          config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: true, skills: [], mcp: [] },
          input: { prompt: 'oi', permission: 'board', structured: true },
        }),
        log: () => {},
      });
    expect(run).toThrow('Runtime v1');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('runner: card sem agente com contrato não executa', () => {
    const runner = new AiRunner(router, { cwd: dir, log: () => {}, gateway: gateway('v1') });
    expect(() => runner.start(cardId)).toThrow(/Runtime v1/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('chat: o contexto fechado ainda precisa da admissão do host', () => {
    new ChatSession(router, { cwd: dir, log: () => {}, file: path.join(dir, 'chat.json'), gateway: gateway('v1') });
    expect(() => router.chatCommand({ type: 'chat.send', text: 'oi', model: null })).toThrow(/v1|admissão|Snapshot/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('teste do perfil: passa pelo contrato fechado e é recusado sem admissão', async () => {
    const result = await createAiProfileRuntime({
      repo: new AiProfileRepo(db),
      gateway: gateway('v1'),
      boardId: () => router.boardId,
      cwd: dir,
      homeDir: dir,
      pathEnv: () => '/fake',
    }).test('claude');
    expect(result.ok).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('preparadores: o contexto fechado não traz agente nem MCP; o do card exige agente', () => {
    const closed = closedV1('claude', 'chat', DEFAULT_RUNNER, true);
    expect(closed.context.items).toEqual([]);
    expect(closed.strict.request).toMatchObject({ activeMcpIds: [], agentTools: { categories: ['read'] } });
    expect(closedV1('claude', 'chat', DEFAULT_RUNNER).strict.request.agentTools.categories).toEqual([]);
    const s = router.snapshot();
    const phaseId = s.columns.find((c) => c.name === 'Discovery')!.id;
    expect(() => cardV1(s, 'claude', { cardId, workflowId: null, phaseId, action: 'work' })).toThrow(/Runtime v1/);
  });
});
