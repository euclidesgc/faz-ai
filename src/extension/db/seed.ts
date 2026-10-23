import { BUILTIN_PROFILES, isReadyCli } from '../../shared/aiProfiles';
import type { Database } from 'sql.js';
import type { WorkflowKind } from '../../shared/model';
import { BOARD_TEMPLATE, BOARD_TEMPLATE_VERSION, STORY_PHASES, insertColumn } from './boardTemplate';
import { newId } from './ids';
import { EFFORT_FIELD, EFFORT_LEVELS } from '../../shared/models';
import { MCPS_FIELD, MODEL_FIELD, PHASE_FIELD, RULES_FIELD, SKILLS_FIELD, TAGS_FIELD } from '../../shared/boardFields';
import { DEFAULT_BRANCH_KINDS } from '../../shared/git';

/** Cria o board padrão para um workspace e devolve seu id. */
export function seedBoard(db: Database, workspaceKey: string, name: string): string {
  const boardId = newId();
  db.exec('BEGIN;');
  try {
    db.run('INSERT INTO boards(id, workspace_key, name, template_version) VALUES (?,?,?,?)', [
      boardId,
      workspaceKey,
      name,
      BOARD_TEMPLATE_VERSION,
    ]);

    insertBuiltinProfiles(db, boardId);

    const parentWf = newId();
    const childWf = newId();
    db.run('INSERT INTO workflows(id, board_id, name, position, kind) VALUES (?,?,?,?,?)', [parentWf, boardId, 'Histórias', 0, 'parent']);
    db.run('INSERT INTO workflows(id, board_id, name, position, kind) VALUES (?,?,?,?,?)', [childWf, boardId, 'Sub-tarefas', 1, 'child']);

    const cols = (wf: string, kind: WorkflowKind) => BOARD_TEMPLATE[kind].forEach((c, i) => insertColumn(db, wf, c, i));
    // as colunas das histórias são as fases do SDD; as mesmas fases são as opções do campo "Fase" das sub-tarefas
    cols(parentWf, 'parent');
    cols(childWf, 'child');

    const subtaskType = newId();
    const types: [string, string, string, string][] = [
      [newId(), 'História', '#4c8dff', parentWf],
      [newId(), 'Retrabalho', '#f5a623', parentWf],
      [newId(), 'Bug', '#e5484d', parentWf],
      [newId(), 'Débito técnico', '#9b59b6', parentWf],
      [subtaskType, 'Sub-tarefa', '#2ecc71', childWf],
    ];
    types.forEach(([id, n, c, wf]) =>
      db.run('INSERT INTO card_types(id, board_id, name, color, default_workflow_id, branch_kind) VALUES (?,?,?,?,?,?)', [
        id,
        boardId,
        n,
        c,
        wf,
        DEFAULT_BRANCH_KINDS[n] ?? 'feature',
      ]),
    );

    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, PHASE_FIELD, 'select', JSON.stringify(STORY_PHASES), JSON.stringify([subtaskType]), 'badge', 0],
    );
    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, TAGS_FIELD, 'multiselect', JSON.stringify(['frontend', 'backend', 'infra', 'docs']), null, 'chip', 1],
    );
    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, MODEL_FIELD, 'model', '[]', null, 'badge', 3],
    );
    // as opções vêm das skills do projeto e são sincronizadas pelo roteador
    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, SKILLS_FIELD, 'multiselect', '[]', null, 'chip', 4],
    );
    // as opções vêm das rules marcadas no Harness e são sincronizadas pelo roteador
    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, RULES_FIELD, 'multiselect', '[]', null, 'chip', 5],
    );
    // as opções vêm dos servidores MCP do board em modo "Pelo card" e são sincronizadas pelo roteador
    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, MCPS_FIELD, 'multiselect', '[]', null, 'chip', 6],
    );
    // esforço da tarefa: as regras de modelo sugerem um modelo a partir dele
    db.run(
      'INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position) VALUES (?,?,?,?,?,?,?,?)',
      [newId(), boardId, EFFORT_FIELD, 'select', JSON.stringify(EFFORT_LEVELS), null, 'badge', 2],
    );
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
  return boardId;
}

/**
 * A criação de um board novo usa as mesmas identidades da migração. Só as CLIs prontas ganham linha: o agente
 * ACP pronto (#1095) nasce desligado e a linha dele é gravada quando a pessoa liga, para não encher o backup
 * nem a lista de revisão da importação com perfis que ninguém usa.
 */
export function insertBuiltinProfiles(db: Database, boardId: string): void {
  for (const p of BUILTIN_PROFILES.filter((p) => isReadyCli(p)))
    db.run(
      "INSERT OR IGNORE INTO ai_profiles(board_id,id,name,enabled,kind,tool,mode,base,position,review_state) VALUES (?,?,?,?,?,?,?,?,?,'reviewed')",
      [boardId, p.id, p.name, 1, p.kind, p.tool, p.mode, p.base, p.position],
    );
}
