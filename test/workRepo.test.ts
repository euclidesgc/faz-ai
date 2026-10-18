import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import type { Database } from 'sql.js';
import { openInMemory, newDatabase, openFile } from '../src/extension/db/database';
import { migrate } from '../src/extension/db/schema';
import { all, run } from '../src/extension/db/query';
import { WorkRepo, type WorkClaim } from '../src/extension/repositories/workRepo';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { NO_CARD } from '../src/extension/ai/gateway';
import type { WorkUnit } from '../src/shared/orchestration';
import type { ProcessIdentity } from '../src/extension/processIdentity';
import { exportBoard, parseExportFile, importBoard } from '../src/extension/db/boardExport';

let db: Database;
let router: MessageRouter;
let repo: WorkRepo;
let unit: WorkUnit;
const identity: ProcessIdentity = { pid: 12345, birth: 'instante', groupId: 12345, platform: 'darwin', generation: 'process-generation' };
const owner = 'host-a';
beforeEach(async () => {
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'test',
    folderName: 'Teste',
    author: 'Pessoa',
    attachmentsDir: '/tmp/no-attachments',
  });
  const s = router.snapshot();
  const type = s.cardTypes[0]!;
  const columnId = s.columns.find((c) => c.workflowId === type.defaultWorkflowId)!.id;
  const storyId = router.createCard({ typeId: type.id, columnId, parentId: null, title: 'História' });
  unit = { kind: 'story', key: 'story:one', storyId, cardId: storyId, columnId };
  repo = new WorkRepo(db, router.boardId, () => 100);
});
afterEach(() => db.close());
function claim() {
  return repo.claim(unit, owner, '/real/workspace')!;
}
function started(c: WorkClaim) {
  const id = new AiRunRepo(db).start({
    ...NO_CARD,
    cardId: c.work.cardId,
    boardId: router.boardId,
    tool: 'claude',
    origin: 'manual',
    startedAt: 100,
  });
  repo.started(c.work.id, c.work.generation, owner, id, identity, 'HEAD:status');
}
function reconciling(c: WorkClaim) {
  repo.transition(c.work.id, c.work.generation, owner, 'reconciling');
}

describe('posse persistida de unidades', () => {
  it('reabrir o arquivo conserva a tentativa e a nova instância revoga sem soltar a reserva', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-work-restart-'));
    const file = path.join(dir, 'board.db');
    fs.writeFileSync(file, db.export());
    db.run('PRAGMA foreign_keys = ON');
    const first = await openFile(file, path.resolve(__dirname, '../node_modules/sql.js/dist'));
    const before = new WorkRepo(first.db, router.boardId);
    const c = before.claim(unit, owner, '/real/workspace')!;
    await first.flush();
    // Simula a perda da memória sem uma gravação de encerramento que mascararia o teste.
    first.db.close();
    const second = await openFile(file, path.resolve(__dirname, '../node_modules/sql.js/dist'));
    try {
      const after = new WorkRepo(second.db, router.boardId);
      expect(after.latest(c.work.id)).toMatchObject({ id: c.attempt.id, generation: 1 });
      after.recoverOwner('new-host');
      expect(after.tokenAlive(c.token)).toBe(false);
      expect(after.get(c.work.id)).toMatchObject({ state: 'reconciling', workspace: '/real/workspace' });
      await second.flush();
    } finally {
      await second.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('migra schema 38 sem criar trabalho e sem alterar cards ou execuções', () => {
    const old = newDatabase();
    migrate(old, 38);
    const before = old.export();
    migrate(old);
    expect(all(old, 'SELECT * FROM ai_work')).toEqual([]);
    expect(all(old, 'SELECT * FROM ai_work_attempts')).toEqual([]);
    expect(all(old, 'SELECT * FROM cards')).toEqual([]);
    expect(old.export().length).toBeGreaterThan(before.length);
    old.close();
  });
  it('duas instâncias do repositório disputam uma só posse; chaves diferentes também não duplicam card ou pasta', () => {
    const c = claim();
    const other = new WorkRepo(db, router.boardId);
    expect(other.claim(unit, 'host-b', '/real/workspace')).toBeNull();
    expect(other.claim({ ...unit, key: 'other-key' }, 'host-b', null)).toBeNull();
    expect(
      other.claim({ kind: 'activity', key: 'chat', cardId: null, storyId: null, columnId: '' }, 'host-b', '/real/workspace'),
    ).toBeNull();
    expect(repo.live()).toHaveLength(1);
    expect(repo.tokenAlive(c.token)).toBe(true);
    expect(JSON.stringify(all(db, 'SELECT * FROM ai_work_attempts'))).not.toContain(c.token);
  });
  it('não aceita fase atrasada nem unidade que atribui um card à história errada', () => {
    expect(() => repo.claim({ ...unit, columnId: 'old-phase' }, owner, null)).toThrow('fase');
    const other = router.createCard({
      typeId: router.snapshot().cardTypes[0]!.id,
      columnId: unit.columnId,
      parentId: null,
      title: 'Outra história',
    });
    expect(() => repo.claim({ ...unit, cardId: other }, owner, null)).toThrow('história indicada');
    expect(repo.live()).toEqual([]);
  });
  it('guarda identidade do processo e run do mesmo board, sem permitir transição que pule o protocolo', () => {
    const c = claim();
    expect(() => repo.transition(c.work.id, 1, owner, 'started')).toThrow('operação');
    expect(() => repo.started(c.work.id, 1, owner, 'missing-run', identity, null)).toThrow('não pertence');
    started(c);
    expect(repo.latest(c.work.id)).toMatchObject({ process: identity, workspaceBefore: 'HEAD:status' });
    expect(repo.get(c.work.id)!.state).toBe('started');
    expect(() => repo.transition(c.work.id, 1, owner, 'done')).toThrow('operação');
  });
  it('uma nova geração invalida tokens antigos, inclusive se o hash antigo reaparecer numa tentativa', () => {
    const c = claim();
    started(c);
    repo.countMutation(c.token);
    reconciling(c);
    expect(repo.tokenAlive(c.token)).toBe(false);
    repo.finish(c.work.id, 1, owner, { kind: 'retry-safe', reason: 'Sem efeito comprovado' });
    const next = repo.claim(unit, 'host-b', '/real/workspace')!;
    expect(next.work.generation).toBe(2);
    expect(next.attempt.mutations).toBe(0);
    expect(next.token).not.toBe(c.token);
    run(db, 'UPDATE ai_work_attempts SET token_hash = ? WHERE id = ?', [createHash('sha256').update(c.token).digest('hex'), c.attempt.id]);
    expect(repo.tokenAlive(c.token)).toBe(false);
    expect(() => repo.countMutation(c.token)).toThrow('encerrada');
    expect(() => repo.revoke(c.work.id, 1, owner)).toThrow('expirada');
  });
  it('trocar a instância revoga tokens e conserva a pasta presa em reconciliação', () => {
    const c = claim();
    started(c);
    const recovered = repo.recoverOwner('host-b');
    expect(recovered[0]).toMatchObject({ state: 'reconciling', owner: 'host-b', workspace: '/real/workspace' });
    expect(repo.tokenAlive(c.token)).toBe(false);
    expect(() => repo.transition(c.work.id, 1, owner, 'reconciling')).toThrow('expirada');
    expect(repo.claim(unit, 'host-b', '/real/workspace')).toBeNull();
    repo.finish(c.work.id, 1, 'host-b', { kind: 'unconfirmed', reason: 'Neto ainda vivo' });
    expect(repo.live()[0]!.workspace).toBe('/real/workspace');
  });
  it('revogar durante a preparação impede registrar um início tardio', () => {
    const c = claim();
    repo.revoke(c.work.id, 1, owner);
    expect(() => started(c)).toThrow('revogada');
    expect(repo.latest(c.work.id)!.process).toBeNull();
    expect(repo.live()[0]!.workspace).toBe('/real/workspace');
  });
  it('falha exige decisão explícita para nova tentativa e encerramento é terminal', () => {
    const c = claim();
    reconciling(c);
    repo.finish(c.work.id, 1, owner, { kind: 'needs-decision', reason: 'Efeito parcial' });
    expect(repo.claim(unit, owner, null)).toBeNull();
    const second = repo.claim(unit, owner, null, true)!;
    expect(second.work.generation).toBe(2);
    reconciling(second);
    repo.finish(second.work.id, 2, owner, { kind: 'cancelled' });
    expect(repo.claim(unit, owner, null, true)).toBeNull();
    expect(repo.latest(c.work.id)).toMatchObject({ outcome: 'cancelled', endedAt: 100 });
  });
  it('comentário e conclusão são idempotentes e uma falha antes do commit reverte ambos', () => {
    const c = claim();
    reconciling(c);
    const comment = () => {
      run(db, "INSERT INTO comments (id,card_id,author,body,created_at,updated_at) VALUES ('result',?,'Board','Resultado',100,100)", [
        unit.cardId,
      ]);
      return 'result';
    };
    expect(() =>
      repo.finish(c.work.id, 1, owner, { kind: 'done' }, () => {
        comment();
        throw new Error('Queda antes do commit');
      }),
    ).toThrow('Queda');
    expect(all(db, "SELECT * FROM comments WHERE id = 'result'")).toEqual([]);
    expect(repo.get(c.work.id)!.state).toBe('reconciling');
    repo.finish(c.work.id, 1, owner, { kind: 'done' }, comment);
    repo.finish(c.work.id, 1, owner, { kind: 'done' }, comment);
    expect(all(db, "SELECT * FROM comments WHERE id = 'result'")).toHaveLength(1);
    expect(repo.latest(c.work.id)!.resultCommentId).toBe('result');
    expect(repo.tokenAlive(c.token)).toBe(false);
    expect(repo.live()).toEqual([]);
  });
  it('estado de execução não sai no export e uma importação não cria posses', () => {
    const c = claim();
    repo.countMutation(c.token);
    const file = exportBoard(db, router.boardId, router.store, { extensionVersion: 'test' }).file;
    expect(file.tables).not.toHaveProperty('ai_work');
    expect(file.tables).not.toHaveProperty('ai_work_attempts');
    expect(JSON.stringify(file)).not.toContain(c.token);
    file.tables.ai_work = all(db, 'SELECT * FROM ai_work');
    file.tables.ai_work_attempts = all(db, 'SELECT * FROM ai_work_attempts');
    const parsed = parseExportFile(JSON.stringify(file));
    expect(parsed.tables).not.toHaveProperty('ai_work');
    expect(parsed.tables).not.toHaveProperty('ai_work_attempts');
    expect(() => importBoard({ db, store: router.store, workspaceKey: 'test', boardId: router.boardId }, parsed)).toThrow('reconciliação');
    expect(repo.tokenAlive(c.token)).toBe(true);
    reconciling(c);
    repo.finish(c.work.id, 1, owner, { kind: 'done' });
    importBoard({ db, store: router.store, workspaceKey: 'test', boardId: router.boardId }, parsed);
    expect(repo.live()).toEqual([]);
    expect(repo.tokenAlive(c.token)).toBe(false);
  });
});
