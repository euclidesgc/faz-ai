import type { Database } from 'sql.js';
import { norm } from '../../shared/filters';
import type { ColumnCategory, WorkflowKind } from '../../shared/model';
import { newId } from './ids';
import {
  HOMOLOGATION_INSTRUCTION_V2,
  HOMOLOGATION_INSTRUCTION_V4,
  IMPLEMENTATION_INSTRUCTION_V2,
  PHASE_DEFAULTS,
  PHASE_HISTORY,
} from '../../shared/phaseDefaults';
import { all, bool, num, one, run, str, transaction } from './query';

/**
 * Board padrão. Cada mudança no padrão sobe a versão; boards criados antes são atualizados no
 * lugar (com confirmação), sem recriar nada: os cards continuam na coluna em que estavam.
 */
export const BOARD_TEMPLATE_VERSION = 13;

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
    { name: 'Revisão', category: 'open', aiActive: true },
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
    [
      newId(),
      workflowId,
      c.name,
      position,
      c.category === 'open' ? 0 : 1,
      c.category,
      c.aiActive ? 1 : 0,
      c.requiresApproval ? 1 : 0,
      phase?.instruction ?? '',
      phase?.artifactName ?? '',
      phase?.artifactTemplate ?? '',
    ],
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
          apply: () =>
            run(db, 'UPDATE columns SET ai_active = 1, requires_approval = ? WHERE id = ?', [t.requiresApproval ? 1 : 0, str(col.id)]),
        });
      }
    }
  }
  if (version < 2) {
    const parent = one(db, "SELECT id FROM workflows WHERE board_id = ? AND kind = 'parent' ORDER BY position LIMIT 1", [boardId]);
    const wf = parent ? str(parent.id) : null;
    const cols = wf
      ? all(db, 'SELECT id, name, ai_instruction, artifact_name, artifact_template FROM columns WHERE workflow_id = ?', [wf])
      : [];
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
        apply: () =>
          run(db, 'UPDATE columns SET ai_instruction = ?, artifact_name = ?, artifact_template = ? WHERE id = ?', [
            phase.instruction,
            phase.artifactName,
            phase.artifactTemplate,
            str(col.id),
          ]),
      });
    }
    const fase = one(db, "SELECT id, options_json FROM field_defs WHERE board_id = ? AND lower(name) = 'fase' AND kind = 'select'", [
      boardId,
    ]);
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
    const cols = all(
      db,
      'SELECT c.id, c.name FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE w.board_id = ? AND c.ai_instruction = ?',
      [boardId, IMPLEMENTATION_INSTRUCTION_V2],
    );
    for (const col of cols) {
      out.push({
        description: `Coluna "${str(col.name)}": a instrução passa a pedir a branch e a pasta de trabalho da história antes de alterar código.`,
        apply: () =>
          run(db, 'UPDATE columns SET ai_instruction = ? WHERE id = ?', [PHASE_DEFAULTS['Implementação']!.instruction, str(col.id)]),
      });
    }
  }
  if (version < 4) {
    const cols = all(
      db,
      'SELECT c.id, c.name FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE w.board_id = ? AND c.ai_instruction = ?',
      [boardId, HOMOLOGATION_INSTRUCTION_V2],
    );
    for (const col of cols) {
      out.push({
        description: `Coluna "${str(col.name)}": a instrução passa a pedir o pull request da história antes da revisão.`,
        apply: () =>
          run(db, 'UPDATE columns SET ai_instruction = ? WHERE id = ?', [PHASE_DEFAULTS['Homologação']!.instruction, str(col.id)]),
      });
    }
  }
  if (version < 5) {
    const cols = all(
      db,
      'SELECT c.id, c.name FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE w.board_id = ? AND c.ai_instruction = ?',
      [boardId, HOMOLOGATION_INSTRUCTION_V4],
    );
    for (const col of cols) {
      out.push({
        description: `Coluna "${str(col.name)}": a instrução passa a pedir o roteiro "Como testar" na descrição do card e no pull request.`,
        apply: () =>
          run(db, 'UPDATE columns SET ai_instruction = ? WHERE id = ?', [PHASE_DEFAULTS['Homologação']!.instruction, str(col.id)]),
      });
    }
  }
  if (version < 7) out.push(...reviewSteps(db, boardId));
  if (version < 11) out.push(...criticalityRemovalSteps(db, boardId));
  if (version < BOARD_TEMPLATE_VERSION) out.push(...phaseTextSteps(db, boardId));
  return out;
}

/**
 * A coluna Revisão entre a Implementação e a Homologação, e a opção dela no campo "Fase". As posições e
 * as opções são lidas na hora de aplicar: um passo anterior da mesma atualização pode ter mexido nelas.
 */
function reviewSteps(db: Database, boardId: string): Step[] {
  const out: Step[] = [];
  const parent = one(db, "SELECT id FROM workflows WHERE board_id = ? AND kind = 'parent' ORDER BY position LIMIT 1", [boardId]);
  const wf = parent ? str(parent.id) : null;
  const named = (name: string) =>
    wf
      ? all(db, 'SELECT id, name, position FROM columns WHERE workflow_id = ?', [wf]).find((c) => norm(str(c.name)) === norm(name))
      : undefined;
  // sem a Implementação nem a Homologação (renomeadas), o board não diz onde a Revisão caberia: não oferece
  const anchored = !!named('Implementação') || !!named('Homologação');
  const insert = !!wf && !named('Revisão') && anchored;
  if (insert) {
    out.push({
      description:
        'Nova coluna "Revisão" entre a Implementação e a Homologação: a IA roda as checagens do projeto e revisa o código antes do pull request, corrige o que tem diretriz e pergunta o que é ambíguo.',
      apply: () => {
        const after = named('Implementação');
        const before = named('Homologação');
        const firstTerminal = one(db, "SELECT MIN(position) AS p FROM columns WHERE workflow_id = ? AND category != 'open'", [wf])?.p;
        const end = num(one(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM columns WHERE workflow_id = ?', [wf])?.p);
        const position = after ? num(after.position) + 1 : before ? num(before.position) : firstTerminal == null ? end : num(firstTerminal);
        insertColumn(
          db,
          wf!,
          BOARD_TEMPLATE.parent.find((c) => c.name === 'Revisão')!,
          position,
        );
      },
    });
  }
  const fase = () =>
    one(db, "SELECT id, options_json FROM field_defs WHERE board_id = ? AND lower(name) = 'fase' AND kind = 'select'", [boardId]);
  const options = (row: ReturnType<typeof fase>) => JSON.parse(str(row?.options_json) || '[]') as string[];
  const field = fase();
  // a opção só faz sentido com a coluna: a que já existe ou a que este passo cria
  if (field && (insert || !!named('Revisão')) && !options(field).some((o) => norm(o) === norm('Revisão'))) {
    out.push({
      description: 'Campo "Fase" das sub-tarefas: nova opção Revisão.',
      apply: () => {
        const now = fase()!;
        const list = options(now);
        if (list.some((o) => norm(o) === norm('Revisão'))) return;
        const impl = list.findIndex((o) => norm(o) === norm('Implementação'));
        const homolog = list.findIndex((o) => norm(o) === norm('Homologação'));
        const at = impl >= 0 ? impl + 1 : homolog >= 0 ? homolog : list.length;
        list.splice(at, 0, 'Revisão');
        run(db, 'UPDATE field_defs SET options_json = ? WHERE id = ?', [JSON.stringify(list), str(now.id)]);
      },
    });
  }
  return out;
}

/**
 * O campo Criticidade (Núcleo/Periferia) saiu do board: desde a #441 ele não segurava mais o fluxo e só
 * servia de sinal para a revisão. A versão 8 o criava; a 11 o apaga, com os valores, onde ele ainda
 * existir com esse nome. O board que o apagou à mão não tem nada a fazer.
 */
function criticalityRemovalSteps(db: Database, boardId: string): Step[] {
  const field = one(db, "SELECT id FROM field_defs WHERE board_id = ? AND lower(name) = 'criticidade'", [boardId]);
  if (!field) return [];
  return [
    {
      description:
        'O campo "Criticidade" das histórias (Núcleo ou Periferia) deixa de existir: ele não mudava o fluxo e sai do card, dos filtros e das regras de modelo.',
      apply: () => {
        run(db, 'DELETE FROM field_values WHERE field_id = ?', [str(field.id)]);
        run(db, 'DELETE FROM field_defs WHERE id = ?', [str(field.id)]);
      },
    },
  ];
}

/**
 * As colunas cuja instrução ou modelo do documento ainda é um texto padrão anterior (PHASE_HISTORY)
 * recebem o atual. O que a pessoa personalizou não casa com nenhum texto antigo e fica como está.
 */
function phaseTextSteps(db: Database, boardId: string): Step[] {
  const cols = all(
    db,
    'SELECT c.id, c.name, c.ai_instruction, c.artifact_template FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE w.board_id = ?',
    [boardId],
  );
  const out: Step[] = [];
  for (const col of cols) {
    const name = Object.keys(PHASE_HISTORY).find((n) => norm(n) === norm(str(col.name)));
    const phase = name ? PHASE_DEFAULTS[name] : undefined;
    if (!name || !phase) continue;
    const history = PHASE_HISTORY[name]!;
    const instruction = history.instructions.includes(str(col.ai_instruction)) && str(col.ai_instruction) !== phase.instruction;
    const template = history.templates.includes(str(col.artifact_template)) && str(col.artifact_template) !== phase.artifactTemplate;
    if (!instruction && !template) continue;
    out.push({
      description: `Coluna "${str(col.name)}": ${history.change}.`,
      apply: () => {
        if (instruction) run(db, 'UPDATE columns SET ai_instruction = ? WHERE id = ?', [phase.instruction, str(col.id)]);
        if (template) run(db, 'UPDATE columns SET artifact_template = ? WHERE id = ?', [phase.artifactTemplate, str(col.id)]);
      },
    });
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
