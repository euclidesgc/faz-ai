import type { BoardState, Card } from './model';

// Ordem de execução da fila: compara cards para decidir quem a IA toca primeiro.

/** Nome do tipo de card que fura a fila. O nome guardado é sempre este; só a exibição muda com o idioma. */
export const BUG_TYPE = 'Bug';

/** O card é do tipo que fura a fila. Sem tipo, ou com tipo que não existe mais no board, não é bug. */
export const isBug = (s: Pick<BoardState, 'cardTypes'>, c: Card): boolean => s.cardTypes.find((t) => t.id === c.typeId)?.name === BUG_TYPE;

/**
 * Comparador da ordem de execução da fila: bug sempre antes do resto; depois a coluna mais à direita
 * (a história mais adiantada termina antes de uma nova começar: coluna sumida vai para o fim); depois
 * a linha da coluna (posição do card, de cima para baixo); por fim o número do card, só para a ordem
 * ser determinística entre empates. A sub-tarefa vale a posição da história dela e vem logo depois
 * dela, na ordem da própria coluna: o workflow filho não concorre com o pai pela posição das colunas.
 * Os índices de tipo, coluna e card são montados uma vez, na chamada que devolve o comparador.
 */
export function byExecutionOrder(s: BoardState): (a: Card, b: Card) => number {
  const typesById = new Map(s.cardTypes.map((t) => [t.id, t]));
  const columnsById = new Map(s.columns.map((c) => [c.id, c]));
  const cardsById = new Map(s.cards.map((c) => [c.id, c]));
  const storyOf = (c: Card): Card => (c.parentId ? (cardsById.get(c.parentId) ?? c) : c);
  const isBugCard = (c: Card): boolean => typesById.get(c.typeId)?.name === BUG_TYPE;
  const columnPosition = (c: Card): number => columnsById.get(c.columnId)?.position ?? -1;

  return (a, b) => {
    const sa = storyOf(a);
    const sb = storyOf(b);
    return (
      Number(isBugCard(sb)) - Number(isBugCard(sa)) ||
      columnPosition(sb) - columnPosition(sa) ||
      sa.position - sb.position ||
      sa.number - sb.number ||
      Number(!!a.parentId) - Number(!!b.parentId) ||
      a.position - b.position ||
      a.number - b.number
    );
  };
}
