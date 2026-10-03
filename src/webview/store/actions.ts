import type { Card, Id } from '../../shared/model';
import { cards } from '../commands';
import { isLive, useBoardStore } from './boardStore';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Sub-tarefas ativas do card e total de anexos (do card e delas). */
function dependents(card: Card) {
  const { state } = useBoardStore.getState();
  const children = state!.cards.filter((c) => c.parentId === card.id && isLive(c));
  const ids = new Set([card.id, ...children.map((c) => c.id)]);
  const attachments = state!.attachments.filter((a) => ids.has(a.cardId)).length;
  return { children, attachments };
}

/** Frase "Junto vão: 3 sub-tarefas e 2 anexos." ou '' se não houver nada. */
function alongWith(children: number, attachments: number): string {
  const parts = [
    children ? plural(children, 'sub-tarefa', 'sub-tarefas') : '',
    attachments ? plural(attachments, 'anexo', 'anexos') : '',
  ].filter(Boolean);
  return parts.join(' e ');
}

/**
 * Move um card. Levar uma história com sub-tarefas em aberto para uma coluna de cancelamento
 * pergunta antes se as sub-tarefas devem ser canceladas junto.
 * (Levar para uma coluna de conclusão com sub-tarefas em aberto é recusado pelo host.)
 */
export function requestMove(cardId: Id, columnId: Id, position: number): void {
  const { state, ask } = useBoardStore.getState();
  const card = state!.cards.find((c) => c.id === cardId);
  const target = state!.columns.find((c) => c.id === columnId);
  if (!card || !target) return;

  if (target.category === 'cancelled' && !card.parentId && card.columnId !== columnId) {
    const open = dependents(card).children.filter((c) => state!.columns.find((k) => k.id === c.columnId)?.category === 'open');
    const mode = state!.board.rules.onCancelParent;
    if (open.length && mode === 'cascade') return cards.move(cardId, columnId, position, true);
    if (open.length && mode === 'ask') {
      ask({
        title: `Cancelar "${card.title}"?`,
        message: `Esta história tem ${plural(open.length, 'sub-tarefa em aberto', 'sub-tarefas em aberto')}. Quer cancelar as sub-tarefas também? Elas vão para a coluna de cancelamento das sub-tarefas.`,
        cancelLabel: 'Voltar',
        secondary: { label: 'Cancelar só a história', onClick: () => cards.move(cardId, columnId, position) },
        confirmLabel: `Cancelar história e ${plural(open.length, 'sub-tarefa', 'sub-tarefas')}`,
        danger: true,
        onConfirm: () => cards.move(cardId, columnId, position, true),
      });
      return;
    }
  }
  cards.move(cardId, columnId, position);
  if (target.category === 'done' && card.parentId && card.columnId !== columnId) offerToCompleteParent(card);
}

/**
 * Chamado depois de concluir uma sub-tarefa: se era a última em aberto e a história ainda não está
 * encerrada, pergunta (ou move direto, conforme a regra) se a história vai para a coluna de conclusão.
 */
function offerToCompleteParent(child: Card): void {
  const { state, ask } = useBoardStore.getState();
  const mode = state!.board.rules.onAllChildrenDone;
  const parent = state!.cards.find((c) => c.id === child.parentId);
  if (mode === 'off' || !parent || !isLive(parent)) return;
  const category = (c: Card) => state!.columns.find((k) => k.id === c.columnId)?.category;
  if (category(parent) !== 'open') return;
  const siblings = state!.cards.filter((c) => c.parentId === parent.id && c.id !== child.id && isLive(c));
  if (siblings.some((c) => category(c) === 'open')) return;
  const done = state!.columns
    .filter((k) => k.workflowId === parent.workflowId && k.category === 'done')
    .sort((a, b) => a.position - b.position)[0];
  if (!done) return;

  const complete = () => cards.move(parent.id, done.id, state!.cards.filter((c) => c.columnId === done.id && isLive(c)).length);
  if (mode === 'auto') return complete();
  ask({
    title: 'Todas as sub-tarefas foram concluídas',
    message: `"${parent.title}" não tem mais sub-tarefas em aberto. Quer mover a história para "${done.name}" também?`,
    cancelLabel: 'Agora não',
    confirmLabel: `Mover para "${done.name}"`,
    onConfirm: complete,
  });
}

/** O que muda entre excluir e arquivar: a regra que decide se pergunta, os textos do diálogo e o comando. */
const REMOVALS = {
  trash: {
    rule: 'confirmTrash',
    verb: 'Excluir',
    message: (along: string) =>
      (along ? `Vão para a lixeira junto com o card: ${along}. ` : 'O card vai para a lixeira. ') + 'Dá para restaurar pela aba Lixeira.',
    danger: true,
    command: cards.trash,
  },
  archive: {
    rule: 'confirmArchive',
    verb: 'Arquivar',
    message: (along: string) =>
      (along ? `Serão arquivados junto com o card: ${along}. ` : 'O card sai do board. ') +
      'Nada é apagado, e desarquivar traz tudo de volta.',
    danger: false,
    command: cards.archive,
  },
} as const;

/** Tira o card do board; conforme a regra, avisa antes quando ele leva sub-tarefas ou anexos junto. */
function requestRemoval(kind: keyof typeof REMOVALS, cardId: Id, after?: () => void): void {
  const { state, ask } = useBoardStore.getState();
  const card = state!.cards.find((c) => c.id === cardId);
  if (!card) return;
  const cfg = REMOVALS[kind];
  const go = () => {
    cfg.command(cardId);
    after?.();
  };
  const { children, attachments } = dependents(card);
  const along = alongWith(children.length, attachments);
  const mode = state!.board.rules[cfg.rule];
  if (mode === 'never' || (mode === 'whenDependents' && !along)) return go();
  ask({
    title: `${cfg.verb} "${card.title}"?`,
    message: cfg.message(along),
    cancelLabel: 'Voltar',
    confirmLabel: children.length ? `${cfg.verb} história e ${plural(children.length, 'sub-tarefa', 'sub-tarefas')}` : cfg.verb,
    danger: cfg.danger,
    onConfirm: go,
  });
}

/** Manda para a lixeira; avisa antes quando o card leva sub-tarefas ou anexos junto. */
export const requestTrash = (cardId: Id, after?: () => void): void => requestRemoval('trash', cardId, after);

/** Arquiva; avisa antes quando o card leva sub-tarefas ou anexos junto. */
export const requestArchive = (cardId: Id, after?: () => void): void => requestRemoval('archive', cardId, after);
