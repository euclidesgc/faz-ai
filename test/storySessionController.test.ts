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
  let repo: StorySessionRepo;
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
    repo = new StorySessionRepo(db);
    controller = new StorySessionController(repo);
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

  it('entrega mensagens humanas por ID e confirma o cursor somente após o turno', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const messages = [
      { id: 'a', cardId: request.storyId, source: 'human', author: 'Pessoa', body: 'Primeira', createdAt: 100, updatedAt: 100 },
      { id: 'b', cardId: request.storyId, source: 'human', author: 'Pessoa', body: 'Segunda', createdAt: 100, updatedAt: 100 },
      { id: 'ai', cardId: request.storyId, source: 'ai', author: 'Agente', body: 'Resposta', createdAt: 101, updatedAt: 101 },
    ] as Parameters<typeof controller.humanDelivery>[1];
    const first = controller.humanDelivery(session, messages, new Set([request.storyId]));
    expect(first.comments.map((comment) => comment.id)).toEqual(['a', 'b']);
    controller.acknowledgeHumanDelivery(session, first);
    const current = repo.getSession(session.id)!;
    expect(controller.humanDelivery(current, messages, new Set([request.storyId])).comments).toEqual([]);
    const next = controller.humanDelivery(
      current,
      [
        ...messages,
        { id: 'c', cardId: request.storyId, source: 'human', author: 'Pessoa', body: 'Terceira', createdAt: 100, updatedAt: 100 },
      ],
      new Set([request.storyId]),
    );
    expect(next.comments.map((comment) => comment.id)).toEqual(['c']);
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

  it('reconcilia uma filha interrompida sem repetí-la depois de reabrir o board', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const intent = controller.beginChildIntent(session, {
      workId: 'work-crash',
      attempt: 1,
      intentKey: 'work-crash:1',
      config: {},
      snapshot: { title: 'Trabalho interrompido' },
    });
    controller.dispatchChildIntent(intent);
    expect(controller.reconcileOnOpen(request.boardId)).toEqual([request.storyId]);
    expect(repo.getIntent(intent.id)?.status).toBe('reconciling');
    expect(repo.latestForStory(request.storyId)?.status).toBe('reconciling');
    expect(() => controller.prepare(request)).toThrow(/reconcilie/);
    expect(controller.reconcileOnOpen(request.boardId)).toEqual([request.storyId]);
  });

  it('resolve o despacho incerto por evento nativo após reabrir, sem repetir o filho', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const intent = controller.beginChildIntent(session, {
      workId: 'work-recover',
      attempt: 1,
      intentKey: 'work-recover:1',
      config: {},
      snapshot: { title: 'Retomar tarefa' },
    });
    controller.dispatchChildIntent(intent);
    expect(controller.reconcileOnOpen(request.boardId)).toEqual([request.storyId]);

    const reconciled = controller.reconcileChildEvent(session, {
      source: 'codex-acp-2.2.2',
      kind: 'spawned',
      parentSessionId: 'native-main',
      sessionId: 'native-child-recovered',
      task: 'Retomar tarefa',
    });
    expect(reconciled).toMatchObject({ status: 'linked', intent: { id: intent.id, status: 'linked' } });
    expect(repo.listChildren(session.id)).toHaveLength(1);
    expect(repo.listChildren(session.id)[0]?.child?.nativeSessionId).toBe('native-child-recovered');
    expect(
      controller.reconcileChildEvent(session, {
        source: 'codex-acp-2.2.2',
        kind: 'state',
        parentSessionId: 'native-main',
        sessionId: 'native-child-recovered',
        state: 'completed',
      }),
    ).toMatchObject({ status: 'completed' });
    expect(controller.reconcileOnOpen(request.boardId)).toEqual([]);
    expect(controller.prepare(request).nativeSessionId).toBe('native-main');
  });

  it('descarta intenção não despachada e conserva a principal retomável', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const intent = controller.beginChildIntent(session, {
      workId: 'work-pending',
      attempt: 1,
      intentKey: 'work-pending:1',
      config: {},
      snapshot: {},
    });
    expect(controller.reconcileOnOpen(request.boardId)).toEqual([]);
    expect(repo.getIntent(intent.id)?.status).toBe('cancelled');
    expect(controller.prepare(request).nativeSessionId).toBe('native-main');
  });

  it('retoma a principal após reabertura quando a filha anterior foi concluída', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const intent = controller.beginChildIntent(session, {
      workId: 'work-complete',
      attempt: 1,
      intentKey: 'work-complete:1',
      config: {},
      snapshot: { title: 'Filha concluída' },
    });
    controller.dispatchChildIntent(intent);
    controller.reconcileChildEvent(session, {
      source: 'codex-acp-2.2.2',
      kind: 'spawned',
      parentSessionId: 'native-main',
      sessionId: 'native-child-complete',
      task: 'Filha concluída',
    });
    controller.reconcileChildEvent(session, {
      source: 'codex-acp-2.2.2',
      kind: 'state',
      parentSessionId: 'native-main',
      sessionId: 'native-child-complete',
      state: 'completed',
    });
    expect(controller.reconcileOnOpen(request.boardId)).toEqual([]);
    expect(controller.prepare(request).nativeSessionId).toBe('native-main');
  });

  it('recupera prova de modelo ausente após queda sem aceitar outra filha', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const intent = controller.beginChildIntent(session, {
      workId: 'work-model-proof',
      attempt: 1,
      intentKey: 'work-model-proof:1',
      config: { requiresNativeModelProof: true },
      snapshot: { title: 'Filha com modelo conferido' },
    });
    controller.dispatchChildIntent(intent);
    controller.reconcileChildEvent(session, {
      source: 'codex-acp-2.2.2',
      kind: 'spawned',
      parentSessionId: 'native-main',
      sessionId: 'native-child-proof',
      task: 'Filha com modelo conferido',
    });
    controller.reconcileChildEvent(session, {
      source: 'codex-acp-2.2.2',
      kind: 'state',
      parentSessionId: 'native-main',
      sessionId: 'native-child-proof',
      state: 'completed',
    });

    expect(controller.reconcileOnOpen(request.boardId)).toEqual([request.storyId]);
    expect(repo.latestForStory(request.storyId)?.status).toBe('reconciling');
    expect(repo.getIntent(intent.id)).toMatchObject({ status: 'reconciling' });
    expect(() => controller.recordChildConfiguration(session, 'another-child', 'modelo-especialista', null)).toThrow(
      /não terminou antes da conferência/,
    );
    expect(() => controller.prepare(request)).toThrow(/reconcilie/);

    controller.recordChildConfiguration(session, 'native-child-proof', 'modelo-especialista', 'high');
    expect(repo.getIntent(intent.id)).toMatchObject({ status: 'completed' });
    expect(repo.getChild(intent.id)).toMatchObject({
      status: 'completed',
      result: {
        modelVerified: true,
        effectiveModel: 'modelo-especialista',
        effectiveEffort: 'high',
      },
    });
    expect(repo.latestForStory(request.storyId)?.status).toBe('active');
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

  it('cancela uma intenção pendente no fim pré-despacho sem alterar uma já despachada', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const pending = controller.beginChildIntent(session, {
      workId: 'work-pending',
      attempt: 1,
      intentKey: 'work-pending:1',
      config: {},
      snapshot: { title: 'Não despachada' },
    });

    expect(controller.cancelPendingChildIntent(pending, 'Execução encerrada antes do despacho.')).toMatchObject({
      status: 'cancelled',
      result: { reason: 'Execução encerrada antes do despacho.' },
    });

    const dispatched = controller.beginChildIntent(session, {
      workId: 'work-dispatched',
      attempt: 1,
      intentKey: 'work-dispatched:1',
      config: {},
      snapshot: { title: 'Despachada' },
    });
    controller.dispatchChildIntent(dispatched);
    expect(controller.cancelPendingChildIntent(dispatched, 'Não deve reclassificar.')).toMatchObject({ status: 'dispatching' });
    expect(repo.getIntent(dispatched.id)).toMatchObject({ status: 'dispatching', result: null });
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

  it('reconstrói principal somente com prova explícita e registra a geração anterior', () => {
    const first = controller.prepare(request);
    controller.opened(first, 'native-main');
    controller.abort(first);
    const proof = {
      allAttemptsTerminal: true as const,
      processGroupsDead: true as const,
      evidence: 'work-1 terminal; pid group 123 exited',
    };

    expect(() => controller.rebuildParent(request, { ...proof, processGroupsDead: false } as never)).toThrow(/prova/);
    const rebuilt = controller.rebuildParent(request, proof);
    expect(repo.getSession(first.id)).toMatchObject({ status: 'lost', checkpoint: { recoveryEvidence: proof.evidence } });
    expect(rebuilt).toMatchObject({
      generation: 2,
      status: 'opening',
      nativeSessionId: null,
      checkpoint: { rebuiltFrom: first.id, recoveryEvidence: proof.evidence },
    });
    expect(controller.prepare(request).id).toBe(rebuilt.id);
  });

  it('não reconstrói enquanto uma filha tiver desfecho incerto', () => {
    const session = controller.prepare(request);
    controller.opened(session, 'native-main');
    const intent = controller.beginChildIntent(session, {
      workId: 'work-active',
      attempt: 1,
      intentKey: 'work-active:1',
      config: {},
      snapshot: { title: 'Tarefa ativa' },
    });
    controller.dispatchChildIntent(intent);
    controller.abort(session);
    expect(() =>
      controller.rebuildParent(request, {
        allAttemptsTerminal: true,
        processGroupsDead: true,
        evidence: 'claimed dead',
      }),
    ).toThrow(/intenções sem desfecho/);
    expect(repo.latestForStory(request.storyId)).toMatchObject({ id: session.id, status: 'reconciling' });
  });
});
