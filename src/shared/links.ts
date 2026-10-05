import type { BoardState, Card, CardLink, Id, LinkKind } from './model';
import { columnOf, columnsOf, isLive } from './selectors';
import { statusInfo } from './status';

// Consultas e regras puras sobre os vínculos entre cards.

/** Os cards vinculados a um card, sem os que estão na lixeira. */
export interface Linked {
  parents: Card[];
  children: Card[];
  related: Card[];
  /** de quem o card depende: precisam terminar antes de ele começar */
  predecessors: Card[];
  /** quem depende do card: só começam depois que ele terminar */
  successors: Card[];
}

const alive = (state: BoardState, id: Id): Card | undefined => {
  const c = state.cards.find((k) => k.id === id);
  return c && c.deletedAt === null ? c : undefined;
};

export function linkedCards(state: BoardState, cardId: Id): Linked {
  const out: Linked = { parents: [], children: [], related: [], predecessors: [], successors: [] };
  for (const l of state.links) {
    if (l.fromId !== cardId && l.toId !== cardId) continue;
    const other = alive(state, l.fromId === cardId ? l.toId : l.fromId);
    if (!other) continue;
    if (l.kind === 'related') out.related.push(other);
    else if (l.kind === 'precedes') (l.fromId === cardId ? out.successors : out.predecessors).push(other);
    else (l.fromId === cardId ? out.children : out.parents).push(other);
  }
  return out;
}

/** O vínculo entre os dois cards, em qualquer sentido e de qualquer tipo. */
export const linkBetween = (state: BoardState, a: Id, b: Id): CardLink | undefined =>
  state.links.find((l) => (l.fromId === a && l.toId === b) || (l.fromId === b && l.toId === a));

/** O card está encerrado (concluído ou cancelado): não segura mais o pai. */
const closed = (state: BoardState, c: Card): boolean => columnOf(state, c)?.category !== 'open';

/** Quantos dos filhos vinculados já terminaram. */
export function childProgress(state: BoardState, cardId: Id): { done: number; total: number } {
  const kids = linkedCards(state, cardId).children;
  return { done: kids.filter((k) => closed(state, k)).length, total: kids.length };
}

/** Todos os descendentes de um card pelos vínculos de filho (e pelas sub-tarefas), para barrar ciclos. */
function descendants(state: BoardState, id: Id): Set<Id> {
  const seen = new Set<Id>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    const next = [
      ...state.links.filter((l) => l.kind === 'child' && l.fromId === cur).map((l) => l.toId),
      ...state.cards.filter((c) => c.parentId === cur).map((c) => c.id),
    ];
    for (const n of next) {
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return seen;
}

/** Dependências do card que ainda não terminaram (em coluna aberta, fora do arquivo e da lixeira): enquanto houver, ele não começa. */
export const openPredecessors = (state: BoardState, cardId: Id): Card[] =>
  linkedCards(state, cardId).predecessors.filter((p) => isLive(p) && !closed(state, p));

/** Todos os cards que só começam depois de `id`, direta ou indiretamente, para barrar ciclos de dependência. */
function successorsOf(state: BoardState, id: Id): Set<Id> {
  const seen = new Set<Id>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const l of state.links) {
      if (l.kind !== 'precedes' || l.fromId !== cur || seen.has(l.toId)) continue;
      seen.add(l.toId);
      stack.push(l.toId);
    }
  }
  return seen;
}

/** As sub-tarefas em aberto de uma história, separadas pelo que a IA pode tocar agora. */
export interface SubtaskWaves {
  /** sem dependência pendente, nem com a pessoa nem rodando: podem começar agora, ao mesmo tempo */
  ready: Card[];
  /** esperam outra sub-tarefa (ou outro card) terminar */
  waiting: Card[];
  /** a pendência está com a pessoa (pergunta, revisão, bloqueio): a IA não mexe */
  withPerson: Card[];
  /** já há uma execução da IA trabalhando nelas */
  running: Card[];
}

/**
 * Sub-tarefas em aberto da história separadas pelo que pode começar agora: `ready` não tem dependência
 * pendente e está com a IA (sem status, pronta ou aprovada), `waiting` espera alguma outra terminar,
 * `withPerson` está com a pessoa e `running` já está em execução.
 */
export function subtaskWaves(state: BoardState, storyId: Id): SubtaskWaves {
  const open = state.cards.filter((c) => c.parentId === storyId && isLive(c) && !closed(state, c)).sort((a, b) => a.number - b.number);
  const out: SubtaskWaves = { ready: [], waiting: [], withPerson: [], running: [] };
  for (const c of open) {
    if (c.status === 'running') out.running.push(c);
    else if (c.status && statusInfo(c.status).owner === 'human') out.withPerson.push(c);
    else if (openPredecessors(state, c.id).length) out.waiting.push(c);
    else out.ready.push(c);
  }
  return out;
}

/** Todos os ancestrais de um card (pais vinculados e a história da sub-tarefa), direta ou indiretamente. */
function ancestors(state: BoardState, id: Id): Set<Id> {
  const seen = new Set<Id>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    const parentId = state.cards.find((c) => c.id === cur)?.parentId;
    const next = [...state.links.filter((l) => l.kind === 'child' && l.toId === cur).map((l) => l.fromId), ...(parentId ? [parentId] : [])];
    for (const n of next) {
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return seen;
}

/** Por que o vínculo não pode ser criado, ou null se pode. */
export function linkProblem(state: BoardState, fromId: Id, toId: Id, kind: LinkKind): string | null {
  if (fromId === toId) return 'Um card não pode se vincular a ele mesmo.';
  if (!alive(state, fromId) || !alive(state, toId)) return 'Card não encontrado.';
  if (linkBetween(state, fromId, toId)) return 'Estes cards já estão vinculados. Remova o vínculo antes de criar outro.';
  if (kind === 'child' && descendants(state, toId).has(fromId)) return 'O vínculo criaria um ciclo: o pai já é filho deste card.';
  if (kind === 'precedes' && successorsOf(state, toId).has(fromId)) return 'O vínculo criaria um ciclo: um card dependeria dele mesmo.';
  // a história só conclui com as sub-tarefas fechadas: depender dela (ou ela depender de uma) trava as duas
  if (kind === 'precedes' && (ancestors(state, toId).has(fromId) || ancestors(state, fromId).has(toId)))
    return 'Uma sub-tarefa não pode depender da própria história (ou de um ancestral), nem a história depender dela: uma esperaria a outra para sempre.';
  return null;
}

/**
 * Pais vinculados a concluir quando `child` entra em `target`: a coluna de conclusão, a categoria
 * `done`, com o pai ainda em aberto e nenhum outro filho vinculado em aberto. Cada item traz a
 * coluna de conclusão do workflow do pai e a posição no fim dela. Vazio com a regra desligada.
 */
export function linkedParentsToComplete(
  state: BoardState,
  child: Card,
  target: { id: Id; category: string },
): { parent: Card; column: { id: Id; name: string }; position: number }[] {
  if (target.category !== 'done' || child.columnId === target.id) return [];
  if (state.board.rules.onAllChildrenDone === 'off') return [];
  const out: { parent: Card; column: { id: Id; name: string }; position: number }[] = [];
  for (const parent of linkedCards(state, child.id).parents) {
    if (!isLive(parent) || columnOf(state, parent)?.category !== 'open') continue;
    if (linkedCards(state, parent.id).children.some((k) => k.id !== child.id && !closed(state, k))) continue;
    const column = columnsOf(state, parent.workflowId).find((k) => k.category === 'done');
    if (!column) continue;
    const position = state.cards.filter((c) => c.columnId === column.id && isLive(c)).length;
    out.push({ parent, column: { id: column.id, name: column.name }, position });
  }
  return out;
}
