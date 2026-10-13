import { norm } from './filters';
import type { BoardState, Card } from './model';
import { valueOf } from './selectors';
import { storyOf } from './story';

// Criticidade da história: o núcleo do projeto (as áreas críticas em Configurações → Regras) é revisado
// com mais rigor na Revisão e listado à parte no pull request. Fora do modo autônomo, a aprovação da
// pessoa vale em cada fase que a exige, como em qualquer história; no modo autônomo (#441) nada segura a
// história até a coluna que a pessoa escolheu ao ligar o modo.

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
