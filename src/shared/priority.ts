import type { BoardState, Card } from './model';

// Ordem de execução da fila: compara cards para decidir quem a IA toca primeiro.

/** Nome do tipo de card que fura a fila. O nome guardado é sempre este; só a exibição muda com o idioma. */
export const BUG_TYPE = 'Bug';

/** O card é do tipo que fura a fila. Sem tipo, ou com tipo que não existe mais no board, não é bug. */
export const isBug = (s: Pick<BoardState, 'cardTypes'>, c: Card): boolean => s.cardTypes.find((t) => t.id === c.typeId)?.name === BUG_TYPE;

/**
 * Comparador da ordem de execução da fila: bug sempre antes do resto, depois a linha da coluna
 * (posição do card), depois a posição da coluna (coluna sumida vai para o fim) e por fim o número
 * do card, só para a ordem ser determinística entre empates.
 * Os índices de tipo e de coluna são montados uma vez, na chamada que devolve o comparador.
 */
export function byExecutionOrder(s: BoardState): (a: Card, b: Card) => number {
  const typesById = new Map(s.cardTypes.map((t) => [t.id, t]));
  const columnsById = new Map(s.columns.map((c) => [c.id, c]));
  const isBugCard = (c: Card): boolean => typesById.get(c.typeId)?.name === BUG_TYPE;
  const columnPosition = (c: Card): number => columnsById.get(c.columnId)?.position ?? Number.MAX_SAFE_INTEGER;

  return (a, b) =>
    Number(isBugCard(b)) - Number(isBugCard(a)) || a.position - b.position || columnPosition(a) - columnPosition(b) || a.number - b.number;
}
