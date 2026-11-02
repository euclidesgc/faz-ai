import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { StorySessionRepo } from '../src/extension/repositories/storySessionRepo';
import { StorySessionController, type StorySessionRequest } from '../src/extension/storySessionController';
import type { AiRunEnd } from '../src/extension/ai/gateway';
import type { AiProfile } from '../src/shared/aiProfiles';

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
});
