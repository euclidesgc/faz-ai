// A escolha da pessoa quando o card esgota o limite de uso do modelo dele: esperar o limite voltar ou seguir com
// outro modelo que responde agora. A troca automática (a regra de fallback) valia só para a execução em curso, e a
// fase seguinte voltava ao modelo esgotado: a pessoa decide, e a escolha fica no campo Modelo do card.
import { catalogTool, profileLabel } from './aiProfiles';
import type { BoardState, Card } from './model';
import { isTextModel, modelFieldOf, modelValue } from './models';
import { profileAvailable } from './profileAvailability';
import type { RunTarget } from './runTarget';
import { limitClock, limitHolds } from './usageLimit';

/** Uma opção da pergunta: o texto que a pessoa vê e o valor do campo Modelo (null = esperar). */
export interface LimitOption {
  label: string;
  value: string | null;
}

export interface LimitChoice {
  question: string;
  options: LimitOption[];
  recommended: string;
  /** o perfil que esgotou: na resposta, as sub-tarefas abertas que rodariam nele seguem a mesma escolha */
  profileId: string;
}

/** A chave da escolha pendente de um card no `meta` do board. */
export const limitChoiceKey = (cardId: string): string => `limit_choice:${cardId}`;

/** No máximo três modelos na pergunta, além de esperar: um por agente, para a escolha caber numa olhada. */
const MAX_MODELS = 3;

/**
 * A pergunta para o card cujo modelo esgotou. Os destinos, nesta ordem e um por agente: os da regra de fallback que
 * casou, o modelo que a sugestão do board daria ao card, e um modelo de texto de cada outro agente que responde
 * agora (o mesmo modelo, se o agente o tiver). Fora: o agente que esgotou e os que também estão no limite. Sem
 * campo Modelo no card não há onde gravar a escolha: null.
 */
export function limitChoice(
  state: BoardState,
  card: Card,
  exhausted: RunTarget,
  preferred: readonly RunTarget[],
  resumeAt: number,
  now: number,
  suggested?: string | null,
): LimitChoice | null {
  if (!modelFieldOf(state, card)) return null;
  const used = new Set([exhausted.cli.id]);
  const options: LimitOption[] = [];
  const add = (profileId: string, optionId: string, effort: string | null) => {
    if (used.has(profileId) || options.length >= MAX_MODELS) return;
    if (!profileAvailable(state, profileId) || limitHolds(state, profileId, now)) return;
    const option = state.board.modelCatalog.find((o) => o.id === optionId);
    if (!option) return;
    used.add(profileId);
    options.push({ label: `Seguir com ${option.label} (${profileLabel(state.board, profileId)})`, value: modelValue(option.id, effort) });
  };
  for (const t of preferred) {
    if (!t.model) continue;
    const option = state.board.modelCatalog.find((o) => o.tool === catalogTool(t.cli) && o.model === t.model!.name);
    if (option) add(t.cli.id, option.id, t.model.effort);
  }
  if (suggested) {
    const profile = state.board.aiProfiles.find((p) => suggested.startsWith(`${catalogTool(p)}:`) && p.enabled);
    const [id, effort] = suggested.split('@');
    if (profile) add(profile.id, id!, effort ?? null);
  }
  for (const p of state.board.aiProfiles) {
    const own = state.board.modelCatalog.filter((o) => o.tool === catalogTool(p) && isTextModel(o.model));
    const same = exhausted.model ? own.find((o) => o.model === exhausted.model!.name) : undefined;
    const pick = same ?? own[0];
    if (pick) add(p.id, pick.id, pick.defaultEffort);
  }
  const wait = `Esperar o limite voltar (às ${limitClock(resumeAt, now)})`;
  const all = [{ label: wait, value: null }, ...options];
  if (all.length < 2) return null;
  const model = exhausted.model?.name ?? profileLabel(state.board, exhausted.cli.id);
  return {
    question: `O ${model} do ${profileLabel(state.board, exhausted.cli.id)} esgotou o limite de uso. Como seguir com este card?`,
    options: all,
    // a regra de fallback que casou é a escolha que a pessoa já tinha feito antes; sem ela, esperar não gasta nada
    recommended: preferred.length && options[0] ? options[0].label : wait,
    profileId: exhausted.cli.id,
  };
}
