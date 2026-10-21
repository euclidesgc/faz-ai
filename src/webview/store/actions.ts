import { cardRef, type Card, type Column, type Id } from '../../shared/model';
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
      secondary: { label: t('Cancelar só a história'), onClick: () => void cards.move(cardId, columnId, position) },
      confirmLabel: t('Cancelar história e {tasks}', { tasks: tn(open.length, '{n} sub-tarefa', '{n} sub-tarefas') }),
      danger: true,
      onConfirm: () => void cards.move(cardId, columnId, position, true),
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

/** Arquiva o lote inteiro; diferente de `requestArchive`, sempre confirma, sem olhar a regra `confirmArchive`. */
export function requestArchiveMany(histories: Card[], after?: () => void): void {
  const { ask } = useBoardStore.getState();
  const along = alongWithMany(histories);
  ask({
    title: t('Arquivar {n} história(s)?', { n: histories.length }),
    message: (along ? t('Serão arquivados junto: {along}.', { along }) + ' ' : '') + t('Nada é apagado, e desarquivar traz tudo de volta.'),
    confirmLabel: t('Arquivar'),
    onConfirm: () =>
      void withBulkStatus(
        t('Arquivando {n} história(s)…', { n: histories.length }),
        () => cards.archiveMany(histories.map((c) => c.id)),
        after,
      ),
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
    onConfirm: () =>
      void withBulkStatus(
        t('Excluindo {n} história(s)…', { n: histories.length }),
        () => cards.trashMany(histories.map((c) => c.id)),
        after,
      ),
  });
}

/** Restaura o lote da lixeira, sem confirmação (nada se perde). */
export function requestRestoreMany(roots: Card[], after?: () => void): void {
  void withBulkStatus(t('Restaurando {n} card(s)…', { n: roots.length }), () => cards.restoreMany(roots.map((c) => c.id)), after);
}

/** Apaga o lote da lixeira de vez; a confirmação é daqui (o host não pergunta). */
export function requestDeletePermanentMany(roots: Card[], after?: () => void): void {
  const { ask } = useBoardStore.getState();
  ask({
    title: t('Apagar {n} card(s) definitivamente?', { n: roots.length }),
    message: t('Comentários, anexos e sub-tarefas destes cards também serão apagados. Não dá para desfazer.'),
    confirmLabel: t('Apagar de vez'),
    danger: true,
    onConfirm: () =>
      void withBulkStatus(t('Apagando {n} card(s)…', { n: roots.length }), () => cards.deletePermanentMany(roots.map((c) => c.id)), after),
  });
}

/** Frase "N card(s)" dos que acompanham o lote arquivado, ou '' se ninguém vai junto. */
function archivedAlong(selected: Card[], reach: (card: Card, all: Card[]) => Card[]): string {
  const { state } = useBoardStore.getState();
  const all = state!.cards.filter((c) => c.archivedAt !== null && c.deletedAt === null);
  const ids = new Set(selected.map((c) => c.id));
  const along = new Set<Id>();
  for (const card of selected) for (const other of reach(card, all)) if (!ids.has(other.id)) along.add(other.id);
  return along.size ? tn(along.size, '{n} card', '{n} cards') : '';
}

/** Restaurar traz a história inteira (com as sub-tarefas arquivadas) quando o card é uma delas ou tem uma. */
const restoreReach = (card: Card, all: Card[]): Card[] => {
  const story = card.parentId ? all.find((c) => c.id === card.parentId) : card;
  return story ? [story, ...all.filter((c) => c.parentId === story.id)] : [];
};

/** Restaura o lote arquivado; sempre confirma, dizendo quantos cards voltam e o que vem junto. */
export function requestUnarchiveMany(selected: Card[], after?: () => void): void {
  const { ask } = useBoardStore.getState();
  const along = archivedAlong(selected, restoreReach);
  ask({
    title: t('Restaurar {n} card(s)?', { n: selected.length }),
    message:
      (along ? t('Voltam junto: {along} (sub-tarefas arquivadas das histórias e histórias das sub-tarefas).', { along }) + ' ' : '') +
      t('Os cards voltam para a primeira coluna do workflow e saem do modo autônomo.'),
    cancelLabel: t('Voltar'),
    confirmLabel: t('Restaurar'),
    onConfirm: () =>
      void withBulkStatus(
        t('Restaurando {n} card(s)…', { n: selected.length }),
        () => cards.unarchiveMany(selected.map((c) => c.id)),
        after,
      ),
  });
}

/** Manda o lote arquivado para a lixeira; sempre confirma. A história leva junto as sub-tarefas arquivadas. */
export function requestTrashArchivedMany(selected: Card[], after?: () => void): void {
  const { ask } = useBoardStore.getState();
  const along = archivedAlong(selected, (card, all) => all.filter((c) => c.parentId === card.id));
  ask({
    title: t('Excluir {n} card(s)?', { n: selected.length }),
    message: (along ? t('Vão para a lixeira junto: {along}.', { along }) + ' ' : '') + t('Dá para restaurar pela aba Lixeira.'),
    cancelLabel: t('Voltar'),
    confirmLabel: t('Excluir'),
    danger: true,
    onConfirm: () =>
      void withBulkStatus(
        t('Excluindo {n} card(s)…', { n: selected.length }),
        () => cards.trashArchivedMany(selected.map((c) => c.id)),
        after,
      ),
  });
}

/** Um lote de cards vai ao host: a barra de seleção mostra o status até ele confirmar, e só então `after` roda. */
export async function withBulkStatus(label: string, send: () => Promise<void>, after?: () => void): Promise<void> {
  const { setBulkBusy } = useBoardStore.getState();
  setBulkBusy(label);
  try {
    await send();
    after?.();
  } catch {
    /* o erro já virou toast; a seleção fica para a pessoa tentar de novo */
  } finally {
    setBulkBusy(null);
  }
}

const moveManyWithStatus = (ids: Id[], columnId: Id, label: string, after?: () => void): Promise<void> =>
  withBulkStatus(label, () => cards.moveMany(ids, columnId), after);

/** Move o lote inteiro para a coluna escolhida no diálogo. */
export function requestMoveMany(histories: Card[], destinations: Column[], after?: () => void): void {
  const { ask } = useBoardStore.getState();
  ask({
    title: t('Mover {n} história(s) para outra coluna?', { n: histories.length }),
    message: t('Quem as regras do board impedirem de mudar de coluna (sub-tarefa em aberto) fica de fora.'),
    choices: { label: t('Coluna'), options: destinations.map((c) => ({ value: c.id, label: dt(c.name) })) },
    confirmLabel: t('Mover'),
    onConfirm: (columnId) =>
      void moveManyWithStatus(
        histories.map((c) => c.id),
        columnId!,
        t('Movendo {n} história(s)…', { n: histories.length }),
        after,
      ),
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
    onConfirm: () =>
      void moveManyWithStatus(
        histories.map((c) => c.id),
        doneColumn.id,
        t('Concluindo {n} história(s)…', { n: histories.length }),
        after,
      ),
  });
}
