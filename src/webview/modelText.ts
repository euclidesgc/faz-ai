import type { BoardState, Card, FieldValue } from '../shared/model';
import { modelDisplay as display, type ModelFailure, type ModelOption } from '../shared/models';
import { suggestedByBoard } from '../shared/runTarget';
import { formatDateTime, t, tn } from './i18n';

/** Texto de um valor de modelo na interface, com o esforço no idioma atual (ex.: "Haiku 4.5 - low"). */
export const modelDisplay = (catalog: ModelOption[], value: FieldValue | undefined, withTool = false): string =>
  display(catalog, value, withTool, t);

/** O motivo da marca "sem execução bem-sucedida" de um modelo, na interface: quantas falharam, como e quando a última. */
export function modelFailureText(f: ModelFailure): string {
  const how = f.outcome === 'timeout' ? t('estourou o tempo limite') : t('falhou');
  const date = formatDateTime(f.at);
  return tn(f.runs, 'a última execução {how} em {date}', 'as últimas {n} execuções terminaram sem resultado; a última {how} em {date}', {
    how,
    date,
  });
}

/**
 * A linha do card quando o modelo do campo difere da indicação do board, no idioma da interface, ex.:
 * "Modelo indicado pelo board: Claude Code · Sonnet 5.5 - médio". Vazia sem diferença.
 */
export const modelPrecedenceLine = (state: BoardState, value: string): string =>
  t('Modelo indicado pelo board: {model}', { model: modelDisplay(state.board.modelCatalog, value, true) || value });

export const modelPrecedenceWarning = (state: BoardState, card: Card): string => {
  const value = suggestedByBoard(state, card);
  return value ? modelPrecedenceLine(state, value) : '';
};
