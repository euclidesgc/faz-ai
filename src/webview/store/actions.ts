import { cardRef, type Card, type Column, type Id } from '../../shared/model';
import { childrenToCancel, dependents, parentToComplete } from '../../shared/cascade';
import { linkedParentsToComplete } from '../../shared/links';
import { cards } from '../commands';
import { t, tn } from '../i18n';
import { useBoardStore } from './boardStore';

/** Frase "Junto vão: 3 sub-tarefas e 2 anexos." ou '' se não houver nada. */
function alongWith(children: number, attachments: number): string {
  const parts = [
    children ? tn(children, '{n} sub-tarefa', '{n} sub-tarefas') : '',
    attachments ? tn(attachments, '{n} anexo', '{n} anexos') : '',
  ].filter(Boolean);
  return parts.length === 2 ? t('{a} e {b}', { a: parts[0]!, b: parts[1]! }) : (parts[0] ?? '');
}

/**
 * Move um card. Levar uma história com sub-tarefas em aberto para uma coluna de cancelamento
 * pergunta antes se as sub-tarefas devem ser canceladas junto.
 * (Levar para uma coluna de conclusão com sub-tarefas em aberto é recusado pelo host.)
 * Devolve 'sent' quando o `card.move` foi enviado e 'asked' quando só abriu o diálogo (nada enviado ainda).
 */
export function requestMove(cardId: Id, columnId: Id, position: number): 'sent' | 'asked' {
  const { state, ask } = useBoardStore.getState();
  const card = state!.cards.find((c) => c.id === cardId);
  const target = state!.columns.find((c) => c.id === columnId);
  if (!card || !target) return 'asked';

  const open = childrenToCancel(state!, card, target);
  if (open.length && state!.board.rules.onCancelParent === 'cascade') {
    cards.move(cardId, columnId, position, true);
    return 'sent';
  }
  if (open.length) {
    ask({
      title: t('Cancelar "{title}"?', { title: card.title }),
      message: t('Esta história tem {open}. Quer cancelar as sub-tarefas também? Elas vão para a coluna de cancelamento das sub-tarefas.', {
        open: tn(open.length, '{n} sub-tarefa em aberto', '{n} sub-tarefas em aberto'),
      }),
      cancelLabel: t('Voltar'),
      secondary: { label: t('Cancelar só a história'), onClick: () => cards.move(cardId, columnId, position) },
      confirmLabel: t('Cancelar história e {tasks}', { tasks: tn(open.length, '{n} sub-tarefa', '{n} sub-tarefas') }),
      danger: true,
      onConfirm: () => cards.move(cardId, columnId, position, true),
    });
    return 'asked';
  }
  cards.move(cardId, columnId, position);
  offerToCompleteParent(card, target);
  return 'sent';
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
    title: structural ? t('Todas as sub-tarefas foram concluídas') : t('Todos os filhos vinculados foram concluídos'),
    message:
      candidates.length === 1
        ? structural
          ? t('"{parent}" não tem mais sub-tarefas em aberto. Quer mover a história para "{column}" também?', {
              parent: parent.title,
              column: column.name,
            })
          : t('"{parent}" não tem mais filhos em aberto. Quer mover o card para "{column}" também?', {
              parent: parent.title,
              column: column.name,
            })
        : t('Não restam filhos em aberto em {names}. Quer mover esses cards para a coluna de conclusão também?', { names }),
    cancelLabel: t('Agora não'),
    confirmLabel:
      candidates.length === 1 ? t('Mover para "{column}"', { column: column.name }) : t('Mover {n} cards', { n: candidates.length }),
    onConfirm: complete,
  });
}

/** O que muda entre excluir e arquivar: a regra que decide se pergunta, os textos do diálogo e o comando. */
const REMOVALS = {
  trash: {
    rule: 'confirmTrash',
    title: (name: string) => t('Excluir "{title}"?', { title: name }),
    confirm: () => t('Excluir'),
    confirmWithChildren: (tasks: string) => t('Excluir história e {tasks}', { tasks }),
    message: (along: string) =>
      (along ? t('Vão para a lixeira junto com o card: {along}.', { along }) : t('O card vai para a lixeira.')) +
      ' ' +
      t('Dá para restaurar pela aba Lixeira.'),
    danger: true,
    command: cards.trash,
  },
  archive: {
    rule: 'confirmArchive',
    title: (name: string) => t('Arquivar "{title}"?', { title: name }),
    confirm: () => t('Arquivar'),
    confirmWithChildren: (tasks: string) => t('Arquivar história e {tasks}', { tasks }),
    message: (along: string) =>
      (along ? t('Serão arquivados junto com o card: {along}.', { along }) : t('O card sai do board.')) +
      ' ' +
      t('Nada é apagado, e desarquivar traz tudo de volta.'),
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
    title: cfg.title(card.title),
    message: cfg.message(along),
    cancelLabel: t('Voltar'),
    confirmLabel: children.length ? cfg.confirmWithChildren(tn(children.length, '{n} sub-tarefa', '{n} sub-tarefas')) : cfg.confirm(),
    danger: cfg.danger,
    onConfirm: go,
  });
}

/** Manda para a lixeira; avisa antes quando o card leva sub-tarefas ou anexos junto. */
export const requestTrash = (cardId: Id, after?: () => void): void => requestRemoval('trash', cardId, after);

/** Arquiva; avisa antes quando o card leva sub-tarefas ou anexos junto. */
export const requestArchive = (cardId: Id, after?: () => void): void => requestRemoval('archive', cardId, after);

/**
 * Restaura um card arquivado para a primeira coluna do workflow dele. Uma sub-tarefa cuja história também está
 * arquivada não volta sozinha: pede confirmação para restaurar a história (com todas as sub-tarefas arquivadas).
 */
export function requestRestoreArchived(cardId: Id, after?: () => void): void {
  const { state, ask } = useBoardStore.getState();
  const card = state!.cards.find((c) => c.id === cardId);
  if (!card || card.archivedAt === null) return;
  const parent = card.parentId ? state!.cards.find((c) => c.id === card.parentId) : undefined;
  const go = () => {
    cards.restoreArchived(cardId);
    after?.();
  };
  if (!parent || parent.archivedAt === null || parent.deletedAt !== null) return go();
  ask({
    title: t('Restaurar a história junto?'),
    message: t(
      'A sub-tarefa {sub} pertence à história {story}, que está arquivada. Restaurar traz a história e todas as sub-tarefas arquivadas dela para o Backlog.',
      { sub: cardRef(card), story: cardRef(parent) },
    ),
    cancelLabel: t('Voltar'),
    confirmLabel: t('Restaurar história'),
    danger: false,
    onConfirm: go,
  });
}
