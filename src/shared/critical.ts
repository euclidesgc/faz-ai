import { norm } from './filters';
import type { BoardState, Card } from './model';
import { valueOf } from './selectors';
import { storyOf } from './story';

// Criticidade da história: o núcleo do projeto (as áreas críticas em Configurações → Regras) pede a
// aprovação da pessoa em cada fase que exige aprovação, mesmo no modo autônomo. A periferia segue como
// o modo mandar.

/** O campo da história que diz se ela mexe no núcleo. */
export const CRITICALITY_FIELD = 'Criticidade';
export const CORE = 'Núcleo';
export const PERIPHERY = 'Periferia';
export const CRITICALITY_LEVELS = [CORE, PERIPHERY];

/** A história do card (ou ele mesmo) está marcada como do núcleo no campo Criticidade. */
export function isCoreStory(state: BoardState, card: Card): boolean {
  const story = storyOf(state, card) ?? card;
  const field = state.fieldDefs.find((f) => norm(f.name) === norm(CRITICALITY_FIELD));
  const value = field ? valueOf(state, story.id, field.id) : null;
  return typeof value === 'string' && norm(value) === norm(CORE);
}
