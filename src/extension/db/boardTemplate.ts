import type { Database } from 'sql.js';
import { norm } from '../../shared/filters';
import type { ColumnCategory, WorkflowKind } from '../../shared/model';
import { newId } from './ids';
import { IMPLEMENTATION_INSTRUCTION_V2, PHASE_DEFAULTS } from '../../shared/phaseDefaults';
import { all, bool, num, one, run, str, transaction } from './query';

/**
 * Board padrão. Cada mudança no padrão sobe a versão; boards criados antes são atualizados no
 * lugar (com confirmação), sem recriar nada: os cards continuam na coluna em que estavam.
 */
export const BOARD_TEMPLATE_VERSION = 3;

export interface TemplateColumn {
  name: string;
  category: ColumnCategory;
  /** a IA trabalha nos cards desta coluna */
  aiActive?: boolean;
  /** a IA só avança o card depois que uma pessoa aprova */
  requiresApproval?: boolean;
}

export const BOARD_TEMPLATE: Record<WorkflowKind, TemplateColumn[]> = {
  parent: [
    { name: 'Backlog', category: 'open' },
    { name: 'Discovery', category: 'open', aiActive: true, requiresApproval: true },
    { name: 'PRD', category: 'open', aiActive: true, requiresApproval: true },
    { name: 'Spec', category: 'open', aiActive: true, requiresApproval: true },
    { name: 'Plan', category: 'open', aiActive: true, requiresApproval: true },
    { name: 'Implementação', category: 'open', aiActive: true },
    { name: 'Homologação', category: 'open', aiActive: true, requiresApproval: true },
    { name: 'Concluído', category: 'done' },
    { name: 'Cancelado', category: 'cancelled' },
  ],
  child: [
    { name: 'A fazer', category: 'open', aiActive: true },
    { name: 'Em andamento', category: 'open', aiActive: true },
    { name: 'Concluído', category: 'done' },
  ],
};

/** Fases das histórias: as opções do campo "Fase" das sub-tarefas. */
export const STORY_PHASES: string[] = BOARD_TEMPLATE.parent.filter((c) => c.aiActive).map((c) => c.name);

/** Insere uma coluna na posição dada, empurrando as seguintes. Os cards não são tocados. */
export function insertColumn(db: Database, workflowId: string, c: TemplateColumn, position: number): void {
  const phase = PHASE_DEFAULTS[c.name];
  run(db, 'UPDATE columns SET position = position + 1 WHERE workflow_id = ? AND position >= ?', [workflowId, position]);
  run(
    db,
    `INSERT INTO columns(id, workflow_id, name, position, is_terminal, category, ai_active, requires_approval, ai_instruction, artifact_name, artifact_template)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [newId(), workflowId, c.name, position, c.category === 'open' ? 0 : 1, c.category, c.aiActive ? 1 : 0, c.requiresApproval ? 1 : 0, phase?.instruction ?? '', phase?.artifactName ?? '', phase?.artifactTemplate ?? ''],
  );
}

interface Step {
  description: string;
  apply: () => void;
}

/** O que falta para o board chegar ao padrão atual. Nunca move cards nem mexe no que a pessoa personalizou. */
function steps(db: Database, boardId: string): Step[] {
  const version = num(one(db, 'SELECT template_version AS v FROM boards WHERE id = ?', [boardId])?.v);
  const out: Step[] = [];
  if (version < 1) {
    for (const wf of all(db, 'SELECT id, kind FROM workflows WHERE board_id = ?', [boardId])) {
      const cols = all(db, 'SELECT id, name, ai_active, requires_approval FROM columns WHERE workflow_id = ?', [str(wf.id)]);
      for (const t of BOARD_TEMPLATE[str(wf.kind) as WorkflowKind]) {
        if (!t.aiActive) continue;
        const col = cols.find((c) => norm(str(c.name)) === norm(t.name));
        // só preenche o que ainda está no valor inicial
        if (!col || bool(col.ai_active) || bool(col.requires_approval)) continue;
        out.push({
          description: `Coluna "${str(col.name)}": a IA atua${t.requiresApproval ? ' e só avança o card com a sua aprovação' : ''}.`,
          apply: () => run(db, 'UPDATE columns SET ai_active = 1, requires_approval = ? WHERE id = ?', [t.requiresApproval ? 1 : 0, str(col.id)]),
        });
      }
    }
  }
  if (version < 2) {
    const parent = one(db, "SELECT id FROM workflows WHERE board_id = ? AND kind = 'parent' ORDER BY position LIMIT 1", [boardId]);
    const wf = parent ? str(parent.id) : null;
    const cols = wf ? all(db, 'SELECT id, name, ai_instruction, artifact_name, artifact_template FROM columns WHERE workflow_id = ?', [wf]) : [];
    const named = (name: string) => cols.find((c) => norm(str(c.name)) === norm(name));
    const template = (name: string) => BOARD_TEMPLATE.parent.find((c) => c.name === name)!;
    if (wf && !named('Discovery')) {
      out.push({
        description: 'Nova coluna "Discovery" depois do Backlog: a IA analisa o problema e conversa com você antes do PRD.',
        // a posição é lida na hora de aplicar, porque um passo anterior pode ter mexido nas colunas
        apply: () => {
          const backlog = one(db, "SELECT position FROM columns WHERE workflow_id = ? AND lower(name) = 'backlog'", [wf]);
          insertColumn(db, wf, template('Discovery'), backlog ? num(backlog.position) + 1 : 0);
        },
      });
    }
    if (wf && !named('Homologação')) {
      out.push({
        description: 'Nova coluna "Homologação" antes da conclusão: a história só é concluída com a sua aprovação.',
        apply: () => {
          const firstTerminal = one(db, "SELECT MIN(position) AS p FROM columns WHERE workflow_id = ? AND category != 'open'", [wf])?.p;
          const end = num(one(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM columns WHERE workflow_id = ?', [wf])?.p);
          insertColumn(db, wf, template('Homologação'), firstTerminal == null ? end : num(firstTerminal));
        },
      });
    }
    for (const col of cols) {
      const phase = Object.entries(PHASE_DEFAULTS).find(([name]) => norm(name) === norm(str(col.name)))?.[1];
      // só preenche as fases que a pessoa ainda não configurou
      if (!phase || str(col.ai_instruction) || str(col.artifact_name) || str(col.artifact_template)) continue;
      out.push({
        description: `Coluna "${str(col.name)}": instrução para a IA${phase.artifactName ? ` e modelo do documento ${phase.artifactName}` : ''}.`,
        apply: () => run(db, 'UPDATE columns SET ai_instruction = ?, artifact_name = ?, artifact_template = ? WHERE id = ?', [phase.instruction, phase.artifactName, phase.artifactTemplate, str(col.id)]),
      });
    }
    const fase = one(db, "SELECT id, options_json FROM field_defs WHERE board_id = ? AND lower(name) = 'fase' AND kind = 'select'", [boardId]);
    if (fase) {
      const options = JSON.parse(str(fase.options_json) || '[]') as string[];
      const has = (name: string) => options.some((o) => norm(o) === norm(name));
      const next = [...(has('Discovery') ? [] : ['Discovery']), ...options, ...(has('Homologação') ? [] : ['Homologação'])];
      if (next.length !== options.length) {
        out.push({
          description: 'Campo "Fase" das sub-tarefas: novas opções Discovery e Homologação.',
          apply: () => run(db, 'UPDATE field_defs SET options_json = ? WHERE id = ?', [JSON.stringify(next), str(fase.id)]),
        });
      }
    }
  }
  if (version < 3) {
    // quem já estava na versão 2 tem a instrução antiga; nas anteriores o passo acima já grava a nova
    const cols = all(db, 'SELECT c.id, c.name FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE w.board_id = ? AND c.ai_instruction = ?', [boardId, IMPLEMENTATION_INSTRUCTION_V2]);
    for (const col of cols) {
      out.push({
        description: `Coluna "${str(col.name)}": a instrução passa a pedir a branch e a pasta de trabalho da história antes de alterar código.`,
        apply: () => run(db, 'UPDATE columns SET ai_instruction = ? WHERE id = ?', [PHASE_DEFAULTS['Implementação']!.instruction, str(col.id)]),
      });
    }
  }
  return out;
}

/** Descrição das mudanças pendentes; vazio quando o board já está no padrão atual. */
export function pendingUpgrade(db: Database, boardId: string): string[] {
  return steps(db, boardId).map((s) => s.description);
}

/** Aplica as mudanças pendentes e marca o board com a versão atual do padrão. */
export function upgradeBoard(db: Database, boardId: string): void {
  transaction(db, () => {
    steps(db, boardId).forEach((s) => s.apply());
    run(db, 'UPDATE boards SET template_version = ? WHERE id = ?', [BOARD_TEMPLATE_VERSION, boardId]);
  });
}
