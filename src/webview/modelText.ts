import type { BoardState, Card, FieldValue } from '../shared/model';
import { modelDisplay as display, type ModelOption } from '../shared/models';
import { modelPrecedence, precedenceSentence } from '../shared/runTarget';
import { dt, t } from './i18n';

/** Texto de um valor de modelo na interface, com o esforço no idioma atual (ex.: "Haiku 4.5 - low"). */
export const modelDisplay = (catalog: ModelOption[], value: FieldValue | undefined, withTool = false): string =>
  display(catalog, value, withTool, t);

/**
 * O aviso do card quando duas fontes do modelo se contradizem (card > agente > regra), no idioma da interface, ex.:
 * "O modelo do agente revisor-de-codigo (Claude Code · Opus 5.5 - alto) vence a regra Esforço Baixo (…)". Vazio sem contradição.
 */
export const modelPrecedenceWarning = (state: BoardState, card: Card): string =>
  precedenceSentence(modelPrecedence(state, card), (value) => modelDisplay(state.board.modelCatalog, value, true) || value, dt, t);
