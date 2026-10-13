import type { Card, Column, Id } from '../../shared/model';
import { childrenToCancel, dependents, parentToComplete } from '../../shared/cascade';
import { linkedParentsToComplete } from '../../shared/links';
import { cards } from '../commands';
import { dt, t, tn } from '../i18n';
import { useBoardStore } from './boardStore';

/** Frase "Junto vão: 3 sub-tarefas e 2 anexos." ou '' se não houver nada. */
function alongWith(children: number, attachments: number): string {
  const parts = [
    children ? tn(children, '{n} sub-tarefa', '{n} sub-tarefas') : '',
    attachments ? tn(attachments, '{n} anexo', '{n} anexos') : '',
  ].filter(Boolean);
  return parts.length === 2 ? t('{a} e {b}', { a: parts[0]!, b: parts[1]! }) : (parts[0] ?? '');
}

/** Mesma frase de `alongWith`, somando os dependentes (sub-tarefas e anexos) de todo o lote. */
function alongWithMany(histories: Card[]): string {
  const { state } = useBoardStore.getState();
  const totals = histories.reduce(
    (acc, card) => {
      const d = dependents(state!, card);
      return { children: acc.children + d.children.length, attachments: acc.attachments + d.attachments };
    },
    { children: 0, attachments: 0 },
  );
  return alongWith(totals.children, totals.attachments);
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

/** Arquiva o lote inteiro; diferente de `requestArchive`, sempre confirma, sem olhar a regra `confirmArchive`. */
export function requestArchiveMany(histories: Card[], after?: () => void): void {
  const { ask } = useBoardStore.getState();
  const along = alongWithMany(histories);
  ask({
    title: t('Arquivar {n} história(s)?', { n: histories.length }),
    message: (along ? t('Serão arquivados junto: {along}.', { along }) + ' ' : '') + t('Nada é apagado, e desarquivar traz tudo de volta.'),
    confirmLabel: t('Arquivar'),
    onConfirm: () => {
      cards.archiveMany(histories.map((c) => c.id));
      after?.();
    },
  });
}

/** Manda o lote inteiro para a lixeira; diferente de `requestTrash`, sempre confirma, sem olhar a regra `confirmTrash`. */
export function requestTrashMany(histories: Card[], after?: () => void): void {
  const { ask } = useBoardStore.getState();
  const along = alongWithMany(histories);
  ask({
    title: t('Excluir {n} história(s)?', { n: histories.length }),
    message: (along ? t('Vão para a lixeira junto: {along}.', { along }) + ' ' : '') + t('Dá para restaurar pela aba Lixeira.'),
    confirmLabel: t('Excluir'),
    danger: true,
    onConfirm: () => {
      cards.trashMany(histories.map((c) => c.id));
      after?.();
    },
  });
}

/** Move o lote inteiro para a coluna escolhida no diálogo. */
export function requestMoveMany(histories: Card[], destinations: Column[], after?: () => void): void {
  const { ask } = useBoardStore.getState();
  ask({
    title: t('Mover {n} história(s) para outra coluna?', { n: histories.length }),
    choices: { label: t('Coluna'), options: destinations.map((c) => ({ value: c.id, label: dt(c.name) })) },
    confirmLabel: t('Mover'),
    onConfirm: (columnId) => {
      cards.moveMany(
        histories.map((c) => c.id),
        columnId!,
      );
      after?.();
    },
  });
}

/**
 * Conclui o lote inteiro, sempre na mesma coluna de conclusão (sem escolha no diálogo). Quem ainda
 * tiver sub-tarefa em aberto fica de fora, sem aviso individual (o host recusa e o lote segue).
 */
export function requestConcludeMany(histories: Card[], doneColumn: Column, after?: () => void): void {
  const { ask } = useBoardStore.getState();
  ask({
    title: t('Concluir {n} história(s)?', { n: histories.length }),
    message: t('Vão para "{column}". Quem ainda tiver sub-tarefa em aberto fica de fora.', { column: dt(doneColumn.name) }),
    confirmLabel: t('Concluir'),
    onConfirm: () => {
      cards.moveMany(
        histories.map((c) => c.id),
        doneColumn.id,
      );
      after?.();
    },
  });
}
