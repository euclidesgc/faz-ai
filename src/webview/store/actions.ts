import type { Card, Column, Id } from '../../shared/model';
import { childrenToCancel, dependents, parentToComplete } from '../../shared/cascade';
import { linkedParentsToComplete } from '../../shared/links';
import { cards } from '../commands';
import { useBoardStore } from './boardStore';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

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

  const open = childrenToCancel(state!, card, target);
  if (open.length && state!.board.rules.onCancelParent === 'cascade') return cards.move(cardId, columnId, position, true);
  if (open.length) {
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
  cards.move(cardId, columnId, position);
  offerToCompleteParent(card, target);
}

/**
 * Chamado depois de mover um card: se era o último filho em aberto (sub-tarefa ou filho vinculado)
 * indo para a conclusão, pergunta (ou move direto, conforme a regra) se o pai vai também.
 */
function offerToCompleteParent(child: Card, target: Column): void {
  const { state, ask } = useBoardStore.getState();
  const structural = parentToComplete(state!, child, target);
  const candidates = [...(structural ? [structural] : []), ...linkedParentsToComplete(state!, child, target)];
  if (!candidates.length) return;
  const complete = () => candidates.forEach(({ parent, column, position }) => cards.move(parent.id, column.id, position));
  if (state!.board.rules.onAllChildrenDone === 'auto') return complete();
  const [{ parent, column }] = candidates as [(typeof candidates)[number]];
  const names = candidates.map((c) => `"${c.parent.title}"`).join(', ');
  ask({
    title: structural ? 'Todas as sub-tarefas foram concluídas' : 'Todos os filhos vinculados foram concluídos',
    message:
      candidates.length === 1
        ? `"${parent.title}" não tem mais ${structural ? 'sub-tarefas' : 'filhos'} em aberto. Quer mover ${structural ? 'a história' : 'o card'} para "${column.name}" também?`
        : `Não restam filhos em aberto em ${names}. Quer mover esses cards para a coluna de conclusão também?`,
    cancelLabel: 'Agora não',
    confirmLabel: candidates.length === 1 ? `Mover para "${column.name}"` : `Mover ${candidates.length} cards`,
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
  const { children, attachments } = dependents(state!, card);
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
