import { norm } from '../../shared/filters';
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
  const f = s.fieldDefs.find((x) => x.id === name || same(x.name, name));
  if (!f) throw new Error(`Campo "${name}" não encontrado. Existentes: ${list(s.fieldDefs.map((x) => x.name))}.`);
  return f;
}

/** Valida e normaliza o valor de um campo conforme o seu tipo. */
export function coerceFieldValue(f: FieldDef, value: unknown): FieldValue {
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
    if (def) out[def.name] = v.value;
  }
  return out;
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
    ...(parent ? { parent: `${cardRef(parent)} ${parent.title}` } : {}),
    ...(Object.keys(fieldsOf(s, c)).length ? { fields: fieldsOf(s, c) } : {}),
    ...(kids.length ? { subtasks: `${kids.filter((k) => cardStatus(s, k) !== 'open').length}/${kids.length} fora de aberto` } : {}),
    ...(checklist.length ? { checklist: `${checklist.filter((i) => i.done).length}/${checklist.length}` } : {}),
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

export function cardDetail(s: BoardState, c: Card, attachmentPath: (a: BoardState['attachments'][number]) => string) {
  const skills = requiredSkills(s, c);
  const model = fieldsOf(s, c)['Modelo'];
  return {
    ...cardSummary(s, c),
    ...(model ? { model: `${String(model)} (modelo que deve executar este card)` } : {}),
    ...(skills.length ? { requiredSkills: skills, requiredSkillsNote: 'Carregue cada skill (leia o SKILL.md em `path`) antes de executar este card.' } : {}),
    description: c.description,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
    subtaskList: activeChildren(s, c)
      .sort((a, b) => a.number - b.number)
      .map((k) => ({ id: cardRef(k), title: k.title, column: s.columns.find((col) => col.id === k.columnId)?.name, status: cardStatus(s, k), fields: fieldsOf(s, k) })),
    checklistItems: s.checklistItems.filter((i) => i.cardId === c.id).map((i) => ({ itemId: i.id, text: i.text, done: i.done })),
    comments: s.comments.filter((m) => m.cardId === c.id).map((m) => ({ commentId: m.id, author: m.author, at: iso(m.createdAt), body: m.body })),
    attachments: s.attachments
      .filter((a) => a.cardId === c.id)
      .map((a) => ({ attachmentId: a.id, filename: a.filename, mime: a.mime, size: a.size, path: attachmentPath(a) })),
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
        .map((c) => ({ name: c.name, category: c.category, cards: active.filter((k) => k.columnId === c.id).length })),
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
    harness: harnessOverview(s),
    archivedCards: s.cards.filter((c) => c.deletedAt === null && c.archivedAt !== null).length,
    trashedCards: s.cards.filter((c) => c.deletedAt !== null).length,
  };
}

/** Arquivos de regras e skills do projeto, sem o conteúdo. */
export function harnessOverview(s: BoardState) {
  return {
    ruleFiles: s.harness.rules.map((r) => ({ name: r.name, exists: r.exists, ...(r.exists ? { bytes: r.content.length } : {}) })),
    skills: s.harness.skills.map((k) => ({ name: k.name, enabled: k.enabled, description: k.description, path: k.path })),
  };
}
