// O avanço calculado de uma história: a próxima coluna quando a pessoa aprova ou quando o autopiloto a
// leva adiante. Só aqui a trilha curta (regra `shortTrack`) pula o PRD e a Spec; o movimento explícito
// (arrastar, `move_card` com a coluna) não passa por aqui e continua livre, inclusive para forçar a trilha
// completa.
import { norm } from './filters';
import type { BoardState, Card, Column } from './model';
import { EFFORT_FIELD, EFFORT_LEVELS } from './models';
import { columnOf, columnsOf, valueOf } from './selectors';

/** Documentos das colunas puladas na trilha curta; reconhecidos pelo documento, não pelo nome da coluna, para sobreviver a renomeações. */
export const SHORT_TRACK_SKIPPED_ARTIFACTS = ['PRD.md', 'SPEC.md'] as const;

/** A história está na trilha curta: tipo Bug ou campo "Esforço da atividade" = Baixo, pelos nomes normalizados. */
export function isShortTrackStory(state: BoardState, card: Card): boolean {
  const type = state.cardTypes.find((t) => t.id === card.typeId);
  if (type && norm(type.name) === norm('Bug')) return true;
  const effort = state.fieldDefs.find((f) => norm(f.name) === norm(EFFORT_FIELD));
  const value = effort ? valueOf(state, card.id, effort.id) : null;
  return typeof value === 'string' && norm(value) === norm(EFFORT_LEVELS[0]);
}

/** A coluna é pulada na trilha curta: o documento dela é PRD.md ou SPEC.md. */
export const isSkippedOnShortTrack = (column: Column): boolean =>
  SHORT_TRACK_SKIPPED_ARTIFACTS.some((a) => norm(a) === norm(column.artifactName));

/**
 * A próxima coluna de um avanço calculado: a primeira depois da atual que não é de cancelamento e, com a
 * trilha curta ligada e a história elegível, não é de PRD nem de Spec. Lê as regras e os valores atuais do
 * card a cada chamada, então mudar o esforço ou o tipo no meio do caminho vale no próximo avanço.
 * Sub-tarefa nunca pula: a trilha é da história.
 */
export function nextColumnFor(state: BoardState, card: Card): Column | undefined {
  const column = columnOf(state, card);
  if (!column) return undefined;
  const skip = state.board.rules.shortTrack && !card.parentId && isShortTrackStory(state, card);
  return columnsOf(state, card.workflowId).find(
    (c) => c.position > column.position && c.category !== 'cancelled' && !(skip && isSkippedOnShortTrack(c)),
  );
}
