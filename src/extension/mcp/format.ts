import { norm } from '../../shared/filters';
import { describeRule, modelFieldOf, modelLabel, parseModelValue, resolveModelInput, suggestModel, type ModelOption } from '../../shared/models';
import { aiQueue, humanQueue, pendingWork } from '../../shared/pending';
import { statusInfo } from '../../shared/status';
import { cardRef, type BoardState, type Card, type CardType, type Column, type FieldDef, type FieldValue, type Workflow } from '../../shared/model';

/** Converte o snapshot em respostas enxutas para o modelo: nomes e números no lugar de UUIDs. */

const same = (a: string, b: string): boolean => norm(a.trim()) === norm(b.trim());
const list = (names: string[]): string => names.map((n) => `"${n}"`).join(', ');

export function findCard(s: BoardState, ref: string | number): Card {
  const n = Number(String(ref).trim().replace(/^#/, ''));
  const card = Number.isInteger(n) ? s.cards.find((c) => c.number === n) : undefined;
  if (!card) throw new Error(`Card ${String(ref)} não encontrado.`);
  return card;
}

export function findWorkflow(s: BoardState, name: string): Workflow {
  const wf = s.workflows.find((w) => w.id === name || same(w.name, name) || w.kind === name);
  if (!wf) throw new Error(`Workflow "${name}" não encontrado. Existentes: ${list(s.workflows.map((w) => w.name))}.`);
  return wf;
}

/** Coluna pelo nome; `workflowId` desfaz a ambiguidade quando os dois workflows têm colunas de mesmo nome. */
export function findColumn(s: BoardState, name: string, workflowId?: string): Column {
  const pool = s.columns.filter((c) => !workflowId || c.workflowId === workflowId);
  const found = pool.filter((c) => c.id === name || same(c.name, name));
  if (found.length === 1) return found[0]!;
  if (found.length > 1) throw new Error(`Há mais de uma coluna "${name}"; informe também o workflow.`);
  throw new Error(`Coluna "${name}" não encontrada. Existentes: ${list(pool.map((c) => c.name))}.`);
}

export function findType(s: BoardState, name: string): CardType {
  const t = s.cardTypes.find((x) => x.id === name || same(x.name, name));
  if (!t) throw new Error(`Tipo de card "${name}" não encontrado. Existentes: ${list(s.cardTypes.map((x) => x.name))}.`);
  return t;
}

export function findField(s: BoardState, name: string): FieldDef {
  // aceita o nome exato ou um começo de nome que só um campo tenha (ex.: "Esforço" → "Esforço da atividade")
  const starts = s.fieldDefs.filter((x) => norm(x.name).startsWith(norm(name.trim())));
  const f = s.fieldDefs.find((x) => x.id === name || same(x.name, name)) ?? (name.trim() && starts.length === 1 ? starts[0] : undefined);
  if (!f) throw new Error(`Campo "${name}" não encontrado. Existentes: ${list(s.fieldDefs.map((x) => x.name))}.`);
  return f;
}

/** Valida e normaliza o valor de um campo conforme o seu tipo. */
export function coerceFieldValue(f: FieldDef, value: unknown, catalog: ModelOption[]): FieldValue {
  if (value === null || value === undefined || value === '') return null;
  const option = (v: unknown): string => {
    const o = f.options.find((x) => same(x, String(v)));
    if (!o) throw new Error(`Valor "${String(v)}" inválido para o campo "${f.name}". Opções: ${list(f.options)}.`);
    return o;
  };
  switch (f.kind) {
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) throw new Error(`O campo "${f.name}" espera um número.`);
      return n;
    }
    case 'checkbox':
      return value === true || value === 'true';
    case 'select':
      return option(value);
    case 'multiselect':
      return (Array.isArray(value) ? value : [value]).map(option);
    case 'model':
      return resolveModelInput(catalog, String(value));
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`O campo "${f.name}" espera uma data no formato AAAA-MM-DD.`);
      return String(value);
    default:
      return String(value);
  }
}

const iso = (t: number): string => new Date(t).toISOString();

export function cardStatus(s: BoardState, c: Card): string {
  if (c.deletedAt !== null) return 'trashed';
  if (c.archivedAt !== null) return 'archived';
  return s.columns.find((col) => col.id === c.columnId)?.category ?? 'open';
}

function fieldsOf(s: BoardState, c: Card): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const v of s.fieldValues) {
    if (v.cardId !== c.id) continue;
    const def = s.fieldDefs.find((f) => f.id === v.fieldId);
    if (def) out[def.name] = def.kind === 'model' ? modelLabel(s.board.modelCatalog, v.value, true) : v.value;
  }
  return out;
}

/** Status de trabalho do card e com quem está a pendência. */
export function workStatus(s: BoardState, c: Card) {
  if (!c.status) return undefined;
  return {
    status: c.status,
    label: s.board.appearance.statuses[c.status].label,
    with: statusInfo(c.status).owner,
    ...(c.statusReason ? { reason: c.statusReason } : {}),
  };
}

const activeChildren = (s: BoardState, c: Card): Card[] => s.cards.filter((k) => k.parentId === c.id && k.deletedAt === null);

/** Linha de listagem: o suficiente para decidir qual card abrir. */
export function cardSummary(s: BoardState, c: Card) {
  const parent = c.parentId ? s.cards.find((p) => p.id === c.parentId) : undefined;
  const kids = activeChildren(s, c);
  const checklist = s.checklistItems.filter((i) => i.cardId === c.id);
  return {
    id: cardRef(c),
    title: c.title,
    type: s.cardTypes.find((t) => t.id === c.typeId)?.name,
    workflow: s.workflows.find((w) => w.id === c.workflowId)?.name,
    column: s.columns.find((col) => col.id === c.columnId)?.name,
    status: cardStatus(s, c),
    ...(workStatus(s, c) ? { work: workStatus(s, c) } : {}),
    ...(parent ? { parent: `${cardRef(parent)} ${parent.title}` } : {}),
    ...(Object.keys(fieldsOf(s, c)).length ? { fields: fieldsOf(s, c) } : {}),
    ...(kids.length ? { subtasks: `${kids.filter((k) => cardStatus(s, k) !== 'open').length}/${kids.length} fora de aberto` } : {}),
    ...(checklist.length ? { checklist: `${checklist.filter((i) => i.done).length}/${checklist.length}` } : {}),
  };
}

/** Um valor de modelo aberto em partes que a IA consegue usar para escolher o subagente. */
export function describeModel(s: BoardState, value: FieldValue) {
  const v = parseModelValue(value);
  const o = v && s.board.modelCatalog.find((x) => x.id === v.id);
  if (!v || !o) return { value };
  return { tool: o.tool, model: o.model, effort: v.effort, label: modelLabel(s.board.modelCatalog, value, true), value };
}

/** Catálogo de modelos e regras de sugestão do board. */
export function modelsOverview(s: BoardState) {
  return {
    catalog: s.board.modelCatalog.map((o) => ({ value: o.id, tool: o.tool, model: o.model, label: o.label, efforts: o.efforts, defaultEffort: o.defaultEffort })),
    rules: s.board.modelRules.map((r) => ({ ...(r.name ? { name: r.name } : {}), when: describeRule(s, r), suggest: modelLabel(s.board.modelCatalog, r.model, true), value: r.model, enabled: r.enabled })),
    note: 'Num card, o campo de modelo aceita `<value>@<esforço>` (ex.: "claude:opus@high") ou o nome do modelo seguido do esforço.',
  };
}

/** Skills marcadas no campo "Skills" do card: obrigatórias na execução. */
function requiredSkills(s: BoardState, c: Card) {
  const value = fieldsOf(s, c)['Skills'];
  return (Array.isArray(value) ? value : []).map((name) => {
    const skill = s.harness.skills.find((k) => k.name === name);
    return skill ? { name, path: skill.path, ...(skill.enabled ? {} : { note: 'skill desligada no projeto' }) } : { name, note: 'skill não encontrada no projeto' };
  });
}

/**
 * A fase em que o card está: o que a IA deve fazer e o documento que a fase produz. Numa
 * sub-tarefa, é a fase da história, porque o artefato é construído na sub-tarefa mas pertence à história.
 */
function phaseOf(s: BoardState, c: Card) {
  const story = c.parentId ? s.cards.find((p) => p.id === c.parentId) ?? c : c;
  const col = s.columns.find((x) => x.id === story.columnId);
  if (!col || !col.aiActive || (!col.aiInstruction && !col.artifactName)) return undefined;
  return {
    name: col.name,
    ...(col.aiInstruction ? { instruction: col.aiInstruction } : {}),
    ...(col.artifactName
      ? {
          artifact: { filename: col.artifactName, ...(col.artifactTemplate ? { template: col.artifactTemplate } : {}) },
          artifactNote: `Construa o documento numa sub-tarefa da história com Fase = "${col.name}" e grave-o com add_attachment (artifact: true, filename: "${col.artifactName}"): ele fica anexado à história e substitui a versão anterior.`,
        }
      : {}),
    requiresApproval: col.requiresApproval,
    ...(col.requiresApproval ? { reviewNote: `Ao terminar, chame request_review na história ${cardRef(story)} e pare.` } : {}),
  };
}

/** Onde o código da história deve ser alterado (sub-tarefas usam a branch e a pasta da história). */
function workspaceOf(s: BoardState, c: Card) {
  const story = c.parentId ? s.cards.find((p) => p.id === c.parentId) ?? c : c;
  if (story.branch) {
    return {
      workspace: {
        branch: story.branch,
        path: story.worktreePath,
        note:
          s.board.git.mode === 'worktree'
            ? `Altere o código só dentro de ${story.worktreePath} (worktree da história, já na branch ${story.branch}) e faça os commits lá. Não mexa na pasta principal do projeto.`
            : `Trabalhe na branch ${story.branch}: troque para ela (git switch) antes de alterar o código.`,
      },
    };
  }
  return s.board.git.mode === 'off' ? {} : { workspaceNote: 'Esta história ainda não tem branch. Antes de alterar código do projeto, chame prepare_workspace: o board cria a branch e a pasta de trabalho.' };
}

export function cardDetail(s: BoardState, c: Card, attachmentPath: (a: BoardState['attachments'][number]) => string) {
  const skills = requiredSkills(s, c);
  const phase = c.deletedAt === null && c.archivedAt === null ? phaseOf(s, c) : undefined;
  const attachment = (a: BoardState['attachments'][number]) => ({ attachmentId: a.id, filename: a.filename, mime: a.mime, size: a.size, path: attachmentPath(a), ...(a.artifact ? { artifact: true } : {}) });
  const field = modelFieldOf(s, c);
  const chosen = field ? s.fieldValues.find((v) => v.cardId === c.id && v.fieldId === field.id)?.value : undefined;
  const suggested = suggestModel(s, c);
  return {
    ...cardSummary(s, c),
    ...(chosen ? { model: { ...describeModel(s, chosen), note: 'Modelo e esforço que devem executar este card.' } } : {}),
    ...(suggested && suggested !== chosen ? { suggestedModel: describeModel(s, suggested) } : {}),
    ...(skills.length ? { requiredSkills: skills, requiredSkillsNote: 'Carregue cada skill (leia o SKILL.md em `path`) antes de executar este card.' } : {}),
    ...(phase ? { phase } : {}),
    ...workspaceOf(s, c),
    description: c.description,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
    subtaskList: activeChildren(s, c)
      .sort((a, b) => a.number - b.number)
      .map((k) => ({ id: cardRef(k), title: k.title, column: s.columns.find((col) => col.id === k.columnId)?.name, status: cardStatus(s, k), fields: fieldsOf(s, k) })),
    checklistItems: s.checklistItems.filter((i) => i.cardId === c.id).map((i) => ({ itemId: i.id, text: i.text, done: i.done })),
    comments: s.comments.filter((m) => m.cardId === c.id).map((m) => ({ commentId: m.id, author: m.author, ...(m.source ? { from: m.source } : {}), at: iso(m.createdAt), body: m.body })),
    attachments: s.attachments.filter((a) => a.cardId === c.id).map(attachment),
    // os artefatos das fases ficam na história; a sub-tarefa os enxerga por aqui
    ...(c.parentId ? { storyArtifacts: s.attachments.filter((a) => a.cardId === c.parentId && a.artifact).map(attachment) } : {}),
  };
}

/** A fila da IA (o que fazer agora) e, para contexto, o que está esperando a pessoa. */
export function pendingOverview(s: BoardState) {
  const p = pendingWork(s);
  const lastHuman = (c: Card) => {
    const m = s.comments.filter((x) => x.cardId === c.id).at(-1);
    return m ? { lastMessage: { author: m.author, at: iso(m.createdAt), body: m.body } } : {};
  };
  const total = aiQueue(p).length;
  return {
    forYou: {
      approved: p.ai.approved.map((c) => cardSummary(s, c)),
      unanswered: p.ai.unanswered.map((c) => ({ ...cardSummary(s, c), ...lastHuman(c) })),
      ready: p.ai.ready.map((c) => cardSummary(s, c)),
    },
    withPerson: humanQueue(p).map((c) => cardSummary(s, c)),
    next: total
      ? 'Trate nesta ordem: approved (mova para a próxima coluna e siga o trabalho), unanswered (responda na conversa do card), ready (trabalhe no card). Não mexa no que está em withPerson.'
      : 'Nada pendente com você. Encerre sem alterar o board.',
  };
}

export function boardOverview(s: BoardState) {
  const active = s.cards.filter((c) => c.deletedAt === null && c.archivedAt === null);
  return {
    board: s.board.name,
    workflows: s.workflows.map((w) => ({
      name: w.name,
      kind: w.kind === 'parent' ? 'parent (histórias)' : 'child (sub-tarefas, sempre ligadas a uma história)',
      columns: s.columns
        .filter((c) => c.workflowId === w.id)
        .map((c) => ({ name: c.name, category: c.category, cards: active.filter((k) => k.columnId === c.id).length, ...(c.aiActive ? { aiActive: true } : {}), ...(c.requiresApproval ? { requiresApproval: true } : {}), ...(c.artifactName ? { artifact: c.artifactName } : {}), ...(c.collapsed ? { collapsed: true } : {}) })),
      ...(w.collapsed ? { collapsed: true } : {}),
      archivedColumnCollapsed: w.archiveCollapsed,
    })),
    cardTypes: s.cardTypes.map((t) => {
      const defaults = Object.fromEntries(
        Object.entries(t.defaults).flatMap(([id, v]) => {
          const f = s.fieldDefs.find((x) => x.id === id);
          return f ? [[f.name, v]] : [];
        }),
      );
      return { name: t.name, color: t.color, workflow: s.workflows.find((w) => w.id === t.defaultWorkflowId)?.name, ...(Object.keys(defaults).length ? { defaultFields: defaults } : {}) };
    }),
    fields: s.fieldDefs.map((f) => ({
      name: f.name,
      kind: f.kind,
      ...(f.options.length ? { options: f.options } : {}),
      appliesTo: f.appliesToTypes === null ? 'todos os tipos' : f.appliesToTypes.map((id) => s.cardTypes.find((t) => t.id === id)?.name),
      display: f.display,
    })),
    rules: s.board.rules,
    appearance: s.board.appearance,
    harness: harnessOverview(s),
    archivedCards: s.cards.filter((c) => c.deletedAt === null && c.archivedAt !== null).length,
    trashedCards: s.cards.filter((c) => c.deletedAt !== null).length,
  };
}

/** Arquivos de regras e skills do projeto, sem o conteúdo. */
export function harnessOverview(s: BoardState) {
  return {
    aiTool: s.board.aiTool,
    ruleFiles: s.harness.rules.map((r) => ({ name: r.name, exists: r.exists, ...(r.exists ? { bytes: r.content.length } : {}) })),
    skills: s.harness.skills.map((k) => ({ name: k.name, enabled: k.enabled, description: k.description, path: k.path })),
  };
}
