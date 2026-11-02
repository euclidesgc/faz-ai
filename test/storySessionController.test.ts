import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { StorySessionRepo } from '../src/extension/repositories/storySessionRepo';
import { StorySessionController, type StorySessionRequest } from '../src/extension/storySessionController';
import type { AiRunEnd } from '../src/extension/ai/gateway';
import type { AiProfile } from '../src/shared/aiProfiles';
import type { AcpSubagentEvent } from '../src/extension/ai/provider';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

describe('continuidade da sessão principal', () => {
  let controller: StorySessionController;
  let request: StorySessionRequest;

  beforeEach(async () => {
    const db = await openInMemory(WASM_DIR);
    const boards = new BoardRepo(db);
    const boardId = boards.getOrCreate('ws', 'Projeto').id;
    const snapshot = boards.snapshot(boardId);
    const storyId = new CardRepo(db).create(boardId, {
      typeId: snapshot.cardTypes.find((type) => type.name === 'História')!.id,
      columnId: snapshot.columns[0]!.id,
      parentId: null,
      title: 'História',
    });
    controller = new StorySessionController(new StorySessionRepo(db));
    request = {
      boardId,
      storyId,
      executor: 'codex-acp',
      transport: 'acp',
      configFingerprint: 'perfil-estável',
      workspace: '/repo',
      target: { profileId: 'codex-acp', model: { name: 'modelo-principal', effort: null }, value: 'codex-acp:modelo-principal' },
    };
  });

  const end = (nativeSessionId: string | null, outcome: AiRunEnd['outcome'] = 'done') =>
    ({ outcome, report: { nativeSessionId, consumption: null } }) as AiRunEnd;

  it('carrega o mesmo ID nativo no segundo turno mesmo sem medição de tokens', () => {
    const first = controller.prepare(request);
    expect(first.nativeSessionId).toBeNull();
    controller.finish(first, end('native-main'));
    const second = controller.prepare(request);
    expect(second.id).toBe(first.id);
    expect(second.generation).toBe(1);
    expect(second.nativeSessionId).toBe('native-main');
    controller.finish(second, end('native-main'));
    expect(controller.prepare(request).nativeSessionId).toBe('native-main');
  });

  it('segura a História se a identidade retornada ou a configuração divergir', () => {
    const first = controller.prepare(request);
    controller.finish(first, end('native-main'));
    expect(() => controller.prepare({ ...request, configFingerprint: 'outro-modelo' })).toThrow(/reconcilie/);
    controller.finish(controller.prepare(request), end('outra-sessão'));
    expect(() => controller.prepare(request)).toThrow(/reconcilie/);
  });

  it('não abre outra principal quando o primeiro pedido termina sem ID nativo', () => {
    const first = controller.prepare(request);
    expect(controller.finish(first, end(null)).status).toBe('reconciling');
    expect(() => controller.prepare(request)).toThrow(/reconcilie/);
  });

  it('persiste o ID antes do turno e usa o handle mesmo quando o relatório não contém medição', () => {
    const first = controller.prepare(request);
    expect(controller.opened(first, 'native-main').nativeSessionId).toBe('native-main');
    expect(controller.finish(first, end(null)).status).toBe('active');
    expect(controller.prepare(request).nativeSessionId).toBe('native-main');
  });

  it('mantém o modelo da principal quando uma fase nova escolhe outro modelo', () => {
    const first = controller.prepare(request);
    controller.opened(first, 'native-main');
    const profile: AiProfile = {
      id: 'codex-acp',
      name: 'Codex ACP',
      enabled: true,
      kind: 'catalog',
      tool: 'codex-acp',
      mode: 'acp',
      base: 'generic',
      config: {},
      position: 0,
    };
    expect(controller.targetForStory(request.storyId, [profile])).toMatchObject({
      cli: { id: 'codex-acp' },
      model: { name: 'modelo-principal' },
    });
  });

  it('persiste a intenção antes do despacho e associa o evento ao único trabalho em curso', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const intent = controller.beginChildIntent(session, {
      workId: 'work-1',
      attempt: 1,
      intentKey: 'work-1:1',
      config: {},
      snapshot: { title: 'Implementar API' },
    });
    expect(intent.status).toBe('pending');
    expect(() =>
      controller.beginChildIntent(session, {
        workId: 'work-2',
        attempt: 1,
        intentKey: 'work-2:1',
        config: {},
        snapshot: {},
      }),
    ).toThrow(/delegação/);
    controller.dispatchChildIntent(intent);
    const event: AcpSubagentEvent = {
      source: 'codex-acp-2.2.2',
      kind: 'spawned',
      parentSessionId: 'native-main',
      sessionId: 'native-child',
      task: 'Implementar API',
    };
    expect(controller.reconcileChildEvent(session, event)).toMatchObject({
      status: 'linked',
      intent: { workId: 'work-1' },
      child: { nativeSessionId: 'native-child' },
    });
    expect(controller.reconcileChildEvent(session, event)).toMatchObject({ status: 'linked' });
    expect(
      controller.reconcileChildEvent(session, {
        source: 'codex-acp-2.2.2',
        kind: 'state',
        parentSessionId: 'native-main',
        sessionId: 'native-child',
        state: 'completed',
      }),
    ).toMatchObject({ status: 'completed', child: { status: 'completed' }, intent: { status: 'completed' } });
  });

  it('marca incerteza para evento incompatível e registra conclusão nativa', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const intent = controller.beginChildIntent(session, {
      workId: 'work-1',
      attempt: 1,
      intentKey: 'work-1:1',
      config: {},
      snapshot: { task: 'Tarefa esperada' },
    });
    controller.dispatchChildIntent(intent);
    expect(
      controller.reconcileChildEvent(session, {
        source: 'codex-acp-2.2.2',
        kind: 'spawned',
        parentSessionId: 'native-main',
        sessionId: 'unexpected',
        task: 'Outra tarefa',
      }),
    ).toMatchObject({ status: 'uncertain' });
    expect(() => controller.prepare(request)).toThrow(/reconcilie/);
  });
});
