import { EMPTY_CHAT } from '../../shared/chat';
import type { Database } from 'sql.js';
import type {
  Attachment,
  Board,
  BoardState,
  Card,
  CardType,
  CardLink,
  ChecklistItem,
  Column,
  Comment,
  FieldDef,
  FieldValueRow,
  Workflow,
  WorkflowKind,
} from '../../shared/model';
import { all, bool, num, one, run, str, transaction } from '../db/query';
import { newId } from '../db/ids';
import { parseRules, type BoardRules } from '../../shared/rules';
import { seedBoard } from '../db/seed';
import { BOARD_TEMPLATE, insertColumn, pendingUpgrade } from '../db/boardTemplate';
import { isCardStatus } from '../../shared/status';
import { parseRunner, type RunnerConfig } from '../../shared/runner';
import { parseProfiles, type LegacyExecProfile } from '../../shared/execution';
import type { HarnessSelection, HarnessUsage, SelectableKind } from '../../shared/harnessSelection';
import { parseGit, type GitConfig } from '../../shared/git';
import { parseAppearance, type Appearance } from '../../shared/appearance';
import { parseJsonArray, parseModelRules, type ModelOption, type ModelRule } from '../../shared/models';
import { ALL_AI_TOOLS, EMPTY_HARNESS, parseAiTool, type AiTool } from '../../shared/harness';

export class BoardRepo {
  constructor(private db: Database) {}

  /** Devolve o board do workspace, criando com seed se não existir. */
  getOrCreate(workspaceKey: string, name: string): Board {
    let row = one(this.db, 'SELECT * FROM boards WHERE workspace_key = ?', [workspaceKey]);
    if (!row) {
      seedBoard(this.db, workspaceKey, name);
      row = one(this.db, 'SELECT * FROM boards WHERE workspace_key = ?', [workspaceKey])!;
      // a série do log começa quando o board nasce: nada é inventado para trás (RF-24)
      run(this.db, 'UPDATE boards SET log_since = ? WHERE id = ?', [Date.now(), str(row.id)]);
    }
    return {
      id: str(row.id),
      workspaceKey: str(row.workspace_key),
      name: str(row.name),
      rules: parseRules(str(row.rules_json)),
      aiTool: parseAiTool(str(row.ai_tools_json)),
      modelCatalog: parseJsonArray<ModelOption>(str(row.model_catalog_json)),
      modelRules: parseModelRules(str(row.model_rules_json)),
      appearance: parseAppearance(str(row.appearance_json)),
      templateVersion: num(row.template_version),
      runner: parseRunner(str(row.runner_json)),
      git: parseGit(str(row.git_json)),
      // os agentes vêm dos arquivos marcados no harness; o roteador os deriva a cada snapshot
      execProfiles: [],
    };
  }

  /**
   * Abertura do board, para o log: garante o início da série (`log_since`) de um board que já existia
   * antes do log e informa o dia da última consolidação, para quem decide se ela roda hoje.
   * Quem grava o dia é a própria consolidação (`consolidate`), não esta função.
   */
  openedNow(boardId: string, now: number): { logSince: number; rollupDay: string } {
    const row = one(this.db, 'SELECT log_since, log_rollup_day FROM boards WHERE id = ?', [boardId]);
    if (!row) throw new Error('Board não encontrado');
    const logSince = num(row.log_since);
    // zero é "board anterior ao log": a série começa agora, e não na data de criação do board, para
    // o painel não mostrar meses vazios que nunca foram medidos
    if (!logSince) run(this.db, 'UPDATE boards SET log_since = ? WHERE id = ?', [now, boardId]);
    return { logSince: logSince || now, rollupDay: str(row.log_rollup_day) };
  }

  /**
   * A janela de retenção do detalhe do log (meses completos além do corrente). A abertura do board só
   * precisa deste número para consolidar, então lê `rules_json` sem montar o `Board` inteiro.
   */
  retentionMonths(boardId: string): number {
    const row = one(this.db, 'SELECT rules_json FROM boards WHERE id = ?', [boardId]);
    if (!row) throw new Error('Board não encontrado');
    return parseRules(str(row.rules_json)).logRetentionMonths;
  }

  updateRules(boardId: string, patch: Partial<BoardRules>): void {
    const row = one(this.db, 'SELECT rules_json FROM boards WHERE id = ?', [boardId]);
    if (!row) throw new Error('Board não encontrado');
    // parseRules valida o resultado: valores desconhecidos voltam ao padrão
    const next = parseRules(JSON.stringify({ ...parseRules(str(row.rules_json)), ...patch }));
    run(this.db, 'UPDATE boards SET rules_json = ? WHERE id = ?', [JSON.stringify(next), boardId]);
  }

  setModelCatalog(boardId: string, catalog: ModelOption[]): void {
    run(this.db, 'UPDATE boards SET model_catalog_json = ? WHERE id = ?', [JSON.stringify(catalog), boardId]);
  }

  setModelRules(boardId: string, rules: ModelRule[]): void {
    run(this.db, 'UPDATE boards SET model_rules_json = ? WHERE id = ?', [JSON.stringify(rules), boardId]);
  }

  /** Apaga o board com tudo o que há nele. Devolve os ids dos cards (para limpar anexos). */
  deleteBoard(boardId: string): string[] {
    const ids = all(this.db, 'SELECT id FROM cards WHERE board_id = ?', [boardId]).map((r) => str(r.id));
    run(this.db, 'DELETE FROM boards WHERE id = ?', [boardId]);
    return ids;
  }

  updateBoard(
    boardId: string,
    patch: { name?: string; aiTool?: AiTool; appearance?: Partial<Appearance>; runner?: Partial<RunnerConfig>; git?: Partial<GitConfig> },
  ): void {
    if (patch.git !== undefined) {
      const current = parseGit(str(one(this.db, 'SELECT git_json FROM boards WHERE id = ?', [boardId])?.git_json));
      run(this.db, 'UPDATE boards SET git_json = ? WHERE id = ?', [
        JSON.stringify(parseGit(JSON.stringify({ ...current, ...patch.git }))),
        boardId,
      ]);
    }
    if (patch.runner !== undefined) {
      const current = parseRunner(str(one(this.db, 'SELECT runner_json FROM boards WHERE id = ?', [boardId])?.runner_json));
      run(this.db, 'UPDATE boards SET runner_json = ? WHERE id = ?', [
        JSON.stringify(parseRunner(JSON.stringify({ ...current, ...patch.runner }))),
        boardId,
      ]);
    }
    if (patch.name !== undefined) run(this.db, 'UPDATE boards SET name = ? WHERE id = ?', [patch.name, boardId]);
    if (patch.appearance !== undefined) {
      const current = parseAppearance(str(one(this.db, 'SELECT appearance_json FROM boards WHERE id = ?', [boardId])?.appearance_json));
      // parseAppearance valida o resultado: valores fora do permitido voltam ao padrão
      run(this.db, 'UPDATE boards SET appearance_json = ? WHERE id = ?', [
        JSON.stringify(parseAppearance(JSON.stringify({ ...current, ...patch.appearance }))),
        boardId,
      ]);
    }
    if (patch.aiTool !== undefined && ALL_AI_TOOLS.includes(patch.aiTool))
      run(this.db, 'UPDATE boards SET ai_tools_json = ? WHERE id = ?', [JSON.stringify(patch.aiTool), boardId]);
  }

  /** Os agentes que versões anteriores guardavam no banco, à espera da migração para arquivos; vazio depois dela. */
  legacyExecProfiles(boardId: string): LegacyExecProfile[] {
    return parseProfiles(str(one(this.db, 'SELECT exec_profiles_json FROM boards WHERE id = ?', [boardId])?.exec_profiles_json));
  }

  /** Marca a migração dos agentes do banco como feita e troca, em colunas e cards, o id antigo pelo nome do arquivo. */
  finishExecProfilesMigration(boardId: string, names: Record<string, string>): void {
    transaction(this.db, () => {
      for (const [id, name] of Object.entries(names)) {
        run(
          this.db,
          'UPDATE columns SET exec_profile = ? WHERE exec_profile = ? AND workflow_id IN (SELECT id FROM workflows WHERE board_id = ?)',
          [name, id, boardId],
        );
        run(this.db, 'UPDATE cards SET exec_profile = ? WHERE exec_profile = ? AND board_id = ?', [name, id, boardId]);
      }
      run(this.db, "UPDATE boards SET exec_profiles_json = '[]' WHERE id = ?", [boardId]);
    });
  }

  /** Solta as colunas e os cards que apontam para um agente que deixou de existir ou de estar marcado. */
  releaseAgent(boardId: string, name: string): void {
    run(
      this.db,
      'UPDATE columns SET exec_profile = NULL WHERE exec_profile = ? AND workflow_id IN (SELECT id FROM workflows WHERE board_id = ?)',
      [name, boardId],
    );
    run(this.db, 'UPDATE cards SET exec_profile = NULL WHERE exec_profile = ? AND board_id = ?', [name, boardId]);
  }

  /** A marcação do harness deste board: o que as execuções podem usar. */
  selection(boardId: string): HarnessSelection[] {
    return all(this.db, 'SELECT kind, location, usage FROM harness_selection WHERE board_id = ? ORDER BY kind, location', [boardId]).map(
      (r) => ({
        kind: str(r.kind) as SelectableKind,
        location: str(r.location),
        usage: str(r.usage) as HarnessUsage,
      }),
    );
  }

  /** Marca itens de um jeito, ou desmarca (`usage` null). */
  setSelection(boardId: string, items: readonly { kind: SelectableKind; location: string }[], usage: HarnessUsage | null): void {
    transaction(this.db, () => {
      for (const i of items) {
        run(this.db, 'DELETE FROM harness_selection WHERE board_id = ? AND kind = ? AND location = ?', [boardId, i.kind, i.location]);
        if (usage)
          run(this.db, 'INSERT INTO harness_selection(board_id, kind, location, usage) VALUES (?,?,?,?)', [
            boardId,
            i.kind,
            i.location,
            usage,
          ]);
      }
    });
  }

  /** Nomes dos agentes de fábrica já criados para este board (o que a pessoa apagar não volta sozinho). */
  seededAgents(boardId: string): string[] {
    return parseJsonArray<string>(
      str(one(this.db, 'SELECT seeded_agents_json FROM boards WHERE id = ?', [boardId])?.seeded_agents_json),
    ).filter((n): n is string => typeof n === 'string');
  }

  addSeededAgents(boardId: string, names: string[]): void {
    const next = [...new Set([...this.seededAgents(boardId), ...names])];
    run(this.db, 'UPDATE boards SET seeded_agents_json = ? WHERE id = ?', [JSON.stringify(next), boardId]);
  }

  /** Cria um workflow no fim do board, com as colunas padrão do papel (para sub-tarefas: A fazer, Em andamento e Concluído). */
  createWorkflow(boardId: string, name: string, kind: WorkflowKind): string {
    const db = this.db;
    const id = newId();
    transaction(db, () => {
      const position = num(one(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM workflows WHERE board_id = ?', [boardId])?.p);
      run(db, 'INSERT INTO workflows(id, board_id, name, position, kind) VALUES (?,?,?,?,?)', [id, boardId, name, position, kind]);
      BOARD_TEMPLATE.child.forEach((c, i) => insertColumn(db, id, c, i));
    });
    return id;
  }

  updateWorkflow(workflowId: string, patch: { name?: string; position?: number }): void {
    const db = this.db;
    transaction(db, () => {
      if (patch.name !== undefined) run(db, 'UPDATE workflows SET name = ? WHERE id = ?', [patch.name, workflowId]);
      if (patch.position === undefined) return;
      const board = one(db, 'SELECT board_id FROM workflows WHERE id = ?', [workflowId]);
      if (!board) throw new Error('Workflow não encontrado');
      // renumera o board inteiro: as posições gravadas podem ter buracos
      const ids = all(db, 'SELECT id FROM workflows WHERE board_id = ? ORDER BY position', [str(board.board_id)]).map((r) => str(r.id));
      ids.splice(ids.indexOf(workflowId), 1);
      ids.splice(Math.max(0, Math.min(patch.position, ids.length)), 0, workflowId);
      ids.forEach((id, i) => run(db, 'UPDATE workflows SET position = ? WHERE id = ?', [i, id]));
    });
  }

  /** Apaga o workflow e as colunas dele. A regra de quando isso é permitido está em `workflowDeleteBlocker` (src/shared/selectors.ts). */
  deleteWorkflow(workflowId: string): void {
    transaction(this.db, () => {
      run(this.db, 'DELETE FROM columns WHERE workflow_id = ?', [workflowId]);
      run(this.db, 'DELETE FROM workflows WHERE id = ?', [workflowId]);
    });
  }

  snapshot(boardId: string, currentUser = ''): BoardState {
    const db = this.db;
    const b = one(db, 'SELECT * FROM boards WHERE id = ?', [boardId]);
    if (!b) throw new Error('Board não encontrado');
    const board: Board = {
      id: str(b.id),
      workspaceKey: str(b.workspace_key),
      name: str(b.name),
      rules: parseRules(str(b.rules_json)),
      aiTool: parseAiTool(str(b.ai_tools_json)),
      modelCatalog: parseJsonArray<ModelOption>(str(b.model_catalog_json)),
      modelRules: parseModelRules(str(b.model_rules_json)),
      appearance: parseAppearance(str(b.appearance_json)),
      templateVersion: num(b.template_version),
      runner: parseRunner(str(b.runner_json)),
      git: parseGit(str(b.git_json)),
      execProfiles: [],
    };

    const workflows: Workflow[] = all(db, 'SELECT * FROM workflows WHERE board_id = ? ORDER BY position', [boardId]).map((r) => ({
      id: str(r.id),
      boardId,
      name: str(r.name),
      position: num(r.position),
      kind: str(r.kind) as Workflow['kind'],
      collapsed: bool(r.collapsed),
      archiveCollapsed: bool(r.archive_collapsed),
    }));

    const columns: Column[] = all(
      db,
      'SELECT c.* FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE w.board_id = ? ORDER BY c.position',
      [boardId],
    ).map((r) => ({
      id: str(r.id),
      workflowId: str(r.workflow_id),
      name: str(r.name),
      position: num(r.position),
      category: str(r.category) as Column['category'],
      isTerminal: str(r.category) !== 'open',
      collapsed: bool(r.collapsed),
      aiActive: bool(r.ai_active),
      requiresApproval: bool(r.requires_approval),
      aiInstruction: str(r.ai_instruction),
      artifactName: str(r.artifact_name),
      artifactTemplate: str(r.artifact_template),
      execProfile: r.exec_profile == null ? null : str(r.exec_profile),
    }));

    const cardTypes: CardType[] = all(db, 'SELECT * FROM card_types WHERE board_id = ? ORDER BY rowid', [boardId]).map((r) => ({
      id: str(r.id),
      boardId,
      name: str(r.name),
      color: str(r.color),
      defaultWorkflowId: str(r.default_workflow_id),
      defaults: JSON.parse(str(r.defaults_json) || '{}') as CardType['defaults'],
    }));

    const cards: Card[] = all(db, 'SELECT * FROM cards WHERE board_id = ? ORDER BY position', [boardId]).map((r) => ({
      id: str(r.id),
      number: num(r.number),
      boardId,
      workflowId: str(r.workflow_id),
      columnId: str(r.column_id),
      typeId: str(r.type_id),
      parentId: r.parent_id == null ? null : str(r.parent_id),
      title: str(r.title),
      description: str(r.description),
      position: num(r.position),
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
      deletedAt: r.deleted_at == null ? null : num(r.deleted_at),
      archivedAt: r.archived_at == null ? null : num(r.archived_at),
      status: isCardStatus(r.status) ? r.status : null,
      statusReason: str(r.status_reason),
      statusAt: r.status_at == null ? null : num(r.status_at),
      statusBy: str(r.status_by),
      branch: str(r.branch),
      worktreePath: str(r.worktree_path),
      baseBranch: str(r.base_branch),
      branchCreatedAt: str(r.branch_created_at),
      prUrl: str(r.pr_url),
      mergeCommit: str(r.merge_commit),
      execProfile: r.exec_profile == null ? null : str(r.exec_profile),
      yolo: num(r.yolo) === 1,
    }));

    const fieldDefs: FieldDef[] = all(db, 'SELECT * FROM field_defs WHERE board_id = ? ORDER BY position', [boardId]).map((r) => ({
      id: str(r.id),
      boardId,
      name: str(r.name),
      kind: str(r.kind) as FieldDef['kind'],
      options: JSON.parse(str(r.options_json) || '[]'),
      appliesToTypes: r.applies_to_types_json == null ? null : JSON.parse(str(r.applies_to_types_json)),
      display: str(r.display) as FieldDef['display'],
      position: num(r.position),
    }));

    const fieldValues: FieldValueRow[] = all(
      db,
      'SELECT fv.* FROM field_values fv JOIN cards c ON c.id = fv.card_id WHERE c.board_id = ?',
      [boardId],
    ).map((r) => ({ cardId: str(r.card_id), fieldId: str(r.field_id), value: JSON.parse(str(r.value_json)) }));

    const checklistItems: ChecklistItem[] = all(
      db,
      'SELECT ci.* FROM checklist_items ci JOIN cards c ON c.id = ci.card_id WHERE c.board_id = ? ORDER BY ci.position',
      [boardId],
    ).map((r) => ({ id: str(r.id), cardId: str(r.card_id), text: str(r.text), done: bool(r.done), position: num(r.position) }));

    const links: CardLink[] = all(
      db,
      'SELECT l.* FROM card_links l JOIN cards c ON c.id = l.from_id WHERE c.board_id = ? ORDER BY l.rowid',
      [boardId],
    ).map((r) => ({
      id: str(r.id),
      fromId: str(r.from_id),
      toId: str(r.to_id),
      kind: r.kind === 'related' || r.kind === 'precedes' ? r.kind : 'child',
    }));

    const comments: Comment[] = all(
      db,
      'SELECT cm.* FROM comments cm JOIN cards c ON c.id = cm.card_id WHERE c.board_id = ? ORDER BY cm.created_at, cm.rowid',
      [boardId],
    ).map((r) => ({
      id: str(r.id),
      cardId: str(r.card_id),
      author: str(r.author),
      source: r.source === 'human' || r.source === 'ai' ? r.source : null,
      body: str(r.body),
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
      kind: r.kind === 'summary' ? 'summary' : undefined,
    }));

    const attachments: Attachment[] = all(
      db,
      'SELECT a.* FROM attachments a JOIN cards c ON c.id = a.card_id WHERE c.board_id = ? ORDER BY a.created_at',
      [boardId],
    ).map((r) => ({
      id: str(r.id),
      cardId: str(r.card_id),
      filename: str(r.filename),
      storedName: str(r.stored_name),
      mime: str(r.mime),
      size: num(r.size),
      createdAt: num(r.created_at),
      artifact: bool(r.artifact),
    }));

    return {
      board,
      workflows,
      columns,
      cardTypes,
      cards,
      fieldDefs,
      fieldValues,
      checklistItems,
      links,
      comments,
      attachments,
      currentUser,
      harness: EMPTY_HARNESS,
      harnessSelection: this.selection(boardId),
      pendingUpgrade: pendingUpgrade(db, boardId),
      chat: EMPTY_CHAT,
      aiRuns: [],
      autopilot: { active: false, note: null },
      aiRunUnsupported: null,
      requirements: [],
      requirementsCheckedAt: 0,
      environment: null,
      environmentFirstRun: false,
      environmentInstall: null,
      environmentInstallResult: null,
      harnessInstall: null,
    };
  }
}
