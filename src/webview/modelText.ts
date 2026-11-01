import type { BoardState, Card, FieldValue } from '../shared/model';
import { modelDisplay as display, type ModelFailure, type ModelOption } from '../shared/models';
import { modelPrecedence, precedenceSentence } from '../shared/runTarget';
import { dt, formatDateTime, t, tn } from './i18n';

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
 * O aviso do card quando duas fontes do modelo se contradizem (card > agente > regra), no idioma da interface, ex.:
 * "O modelo do agente revisor-de-codigo (Claude Code · Opus 5.5 - alto) vence a regra Esforço Baixo (…)". Vazio sem contradição.
 */
export const modelPrecedenceWarning = (state: BoardState, card: Card): string =>
  precedenceSentence(modelPrecedence(state, card), (value) => modelDisplay(state.board.modelCatalog, value, true) || value, dt, t);
