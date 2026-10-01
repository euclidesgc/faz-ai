import type { Database } from 'sql.js';
import { newId } from './ids';

/** Cria o board padrão para um workspace e devolve seu id. */
export function seedBoard(db: Database, workspaceKey: string, name: string): string {
  const boardId = newId();
  db.exec('BEGIN;');
  try {
    db.run('INSERT INTO boards(id, workspace_key, name) VALUES (?,?,?)', [boardId, workspaceKey, name]);

    const parentWf = newId();
    const childWf = newId();
    db.run('INSERT INTO workflows(id, board_id, name, position, kind) VALUES (?,?,?,?,?)', [parentWf, boardId, 'Histórias', 0, 'parent']);
    db.run('INSERT INTO workflows(id, board_id, name, position, kind) VALUES (?,?,?,?,?)', [childWf, boardId, 'Sub-tarefas', 1, 'child']);

    const cols = (wf: string, names: [string, boolean][]) =>
      names.forEach(([n, terminal], i) =>
        db.run('INSERT INTO columns(id, workflow_id, name, position, is_terminal) VALUES (?,?,?,?,?)', [newId(), wf, n, i, terminal ? 1 : 0]),
      );
    cols(parentWf, [['Backlog', false], ['Em andamento', false], ['Concluído', true], ['Cancelado', true]]);
    cols(childWf, [['A fazer', false], ['Em andamento', false], ['Concluído', true]]);

    const subtaskType = newId();
    const types: [string, string, string, string][] = [
      [newId(), 'História', '#4c8dff', parentWf],
      [newId(), 'Retrabalho', '#f5a623', parentWf],
      [newId(), 'Bug', '#e5484d', parentWf],
      [newId(), 'Débito técnico', '#9b59b6', parentWf],
      [subtaskType, 'Sub-tarefa', '#2ecc71', childWf],
    ];
    types.forEach(([id, n, c, wf]) =>
      db.run('INSERT INTO card_types(id, board_id, name, color, default_workflow_id) VALUES (?,?,?,?,?)', [id, boardId, n, c, wf]),
    );

    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, 'Fase', 'select', JSON.stringify(['PRD', 'Spec', 'Plan', 'Implementação']), JSON.stringify([subtaskType]), 'badge', 0],
    );
    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, 'Tags', 'multiselect', JSON.stringify(['frontend', 'backend', 'infra', 'docs']), null, 'chip', 1],
    );
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
  return boardId;
}
