import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory, newDatabase } from '../src/extension/db/database';
import { migrate } from '../src/extension/db/schema';
import { all, run } from '../src/extension/db/query';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { ExecutionPolicyRepo } from '../src/extension/repositories/executionPolicyRepo';
import { exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import { evaluateExecutionPolicy } from '../src/shared/executionPolicies';
import { catalog, evaluation, policy, profiles } from './fixtures/executionPolicy';

let db: Database;
let boardId: string;
let repo: ExecutionPolicyRepo;
const scope = { profiles, models: catalog };
beforeEach(async () => {
  db = await openInMemory(path.resolve('node_modules/sql.js/dist'));
  boardId = new BoardRepo(db).getOrCreate('policy', 'Políticas').id;
  repo = new ExecutionPolicyRepo(db);
});
afterEach(() => db.close());
const store = { pathOf: () => '/arquivo-ausente', backupCards: () => undefined };
/** Board num banco de schema antigo: só a linha da tabela da época, sem o seed atual (que já grava perfis). */
function legacyBoard(database: Database, id = 'board-antigo'): string {
  database.run('INSERT INTO boards(id, workspace_key, name) VALUES (?,?,?)', [id, 'old', 'Antigo']);
  return id;
}
describe('políticas versionadas do board', () => {
  it('migra schema 40 sem reescrever modelo/reserva legados', () => {
    const old = newDatabase();
    migrate(old, 40);
    const id = legacyBoard(old);
    const rules = JSON.stringify([{ id: 'legacy', model: 'claude:opus', fallback: 'claude:haiku' }]);
    run(old, 'UPDATE boards SET model_rules_json = ? WHERE id = ?', [rules, id]);
    migrate(old);
    expect(all(old, 'SELECT model_rules_json FROM boards')[0]!.model_rules_json).toBe(rules);
    expect(new ExecutionPolicyRepo(old).read(id)).toEqual([]);
    old.close();
  });
  it('revisões, histórico e snapshot antigo permanecem fixos após edição e remoção', () => {
    repo.save(boardId, { expectedRevision: 0, policy: policy(), reviewed: true }, scope, 'person');
    const frozen = repo.snapshot(boardId);
    expect(() => frozen.records[0]!.policy.targets.pop()).toThrow();
    repo.save(boardId, { expectedRevision: 1, policy: policy({ name: 'Revisada', enabled: false }), reviewed: true }, scope, 'person');
    expect(evaluateExecutionPolicy(evaluation({ snapshot: frozen })).action).toBe('fallback');
    expect(evaluateExecutionPolicy(evaluation({ snapshot: repo.snapshot(boardId) })).reason).toBe('no-policy');
    expect(repo.history(boardId, 'quota').map((r) => r.revision)).toEqual([1, 2]);
    repo.remove(boardId, 'quota', 2, scope, 'person');
    expect(repo.read(boardId)).toEqual([]);
    expect(repo.history(boardId, 'quota')).toHaveLength(3);
    repo.validateBoard(boardId);
  });
  it('IA, escrita atrasada, destino inválido, ciclo e empate não gravam metade', () => {
    expect(() => repo.save(boardId, { expectedRevision: 0, policy: policy(), reviewed: true }, scope, 'ai')).toThrow('revisão humana');
    repo.save(boardId, { expectedRevision: 0, policy: policy(), reviewed: true }, scope, 'person');
    const before = JSON.stringify(repo.read(boardId));
    expect(() => repo.save(boardId, { expectedRevision: 0, policy: policy(), reviewed: true }, scope, 'person')).toThrow('mudou');
    expect(() =>
      repo.save(
        boardId,
        { expectedRevision: 1, policy: policy({ targets: [{ profileId: 'missing', model: null, effort: null }] }), reviewed: true },
        scope,
        'person',
      ),
    ).toThrow('Destino');
    expect(() => repo.save(boardId, { expectedRevision: 0, policy: policy({ id: 'tie' }), reviewed: true }, scope, 'person')).toThrow(
      'ambiguous-priority',
    );
    expect(JSON.stringify(repo.read(boardId))).toBe(before);
    expect(repo.history(boardId, 'quota')).toHaveLength(1);
  });
  it('importação preserva versões e definições, mas retira revisão executável até confirmação humana', () => {
    repo.save(boardId, { expectedRevision: 0, policy: policy(), reviewed: true }, scope, 'person');
    const file = exportBoard(db, boardId, store, { extensionVersion: 'test' }).file;
    expect(file.tables.execution_policy_versions).toHaveLength(1);
    importBoard({ db, store, boardId, workspaceKey: 'policy' }, parseExportFile(JSON.stringify(file)));
    const imported = repo.snapshot(boardId);
    expect(imported.records[0]).toMatchObject({ revision: 1, review: 'pending', policy: { enabled: true } });
    expect(evaluateExecutionPolicy(evaluation({ snapshot: imported })).reason).toBe('no-policy');
    expect(repo.history(boardId, 'quota')[0]!.policy).toEqual(policy());
    repo.save(boardId, { expectedRevision: 1, policy: policy(), reviewed: true }, scope, 'person');
    expect(evaluateExecutionPolicy(evaluation({ snapshot: repo.snapshot(boardId) })).action).toBe('fallback');
  });
  it('histórico truncado ou adulterado é recusado antes de substituir o board', () => {
    repo.save(boardId, { expectedRevision: 0, policy: policy(), reviewed: true }, scope, 'person');
    const file = exportBoard(db, boardId, store, { extensionVersion: 'test' }).file;
    file.tables.execution_policy_versions = [];
    let backup = false;
    expect(() =>
      importBoard(
        {
          db,
          store,
          boardId,
          workspaceKey: 'policy',
          backup: () => {
            backup = true;
          },
        },
        file,
      ),
    ).toThrow('Histórico');
    expect(backup).toBe(false);
    expect(repo.read(boardId)).toHaveLength(1);
  });
  it('outro board não sobrescreve políticas nem recebe autoridade pelo catálogo compartilhado', () => {
    repo.save(boardId, { expectedRevision: 0, policy: policy(), reviewed: true }, scope, 'person');
    const otherId = new BoardRepo(db).getOrCreate('other', 'Outro').id;
    expect(() => repo.save(otherId, { expectedRevision: 1, policy: policy(), reviewed: true }, scope, 'person')).toThrow('neste board');
    expect(repo.read(otherId)).toEqual([]);
  });
});
