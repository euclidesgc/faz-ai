// Alvo da execução: o perfil de CLI e o modelo que valem para um card. Regra pura (sem banco nem `vscode`).
// O valor do campo Modelo (`<perfil>:<modelo>@<esforço>`) carrega a CLI: o prefixo identifica o perfil.
import { activeProfile, catalogTool, profileLabel, type AiProfile, isCatalogCopy } from './aiProfiles';
import type { BoardState, Card } from './model';
import { defaultModelOf, describeRule, modelFieldOf, parseModelValue, suggestModelRule, type ModelOption } from './models';
import { profileOf } from './execution';
import { aiQueue, pendingWork } from './pending';
import { columnOf, valueOf } from './selectors';

export type RunTargetSource = 'card' | 'agent' | 'column' | 'rule' | 'default' | 'chat' | 'fallback';

export interface RunTarget {
  /** o perfil de CLI que executa (não confundir com `profileOf`, o agente) */
  cli: AiProfile;
  model: { name: string; effort: string | null } | null;
  /** valor `<perfil>:<modelo>@<esforço>`; vazio no padrão sem modelo padrão */
  value: string;
  source: RunTargetSource;
}

type TargetBoard = Pick<BoardState['board'], 'aiTool' | 'aiProfiles' | 'modelCatalog'>;

/** Por que uma escolha explícita não pôde virar alvo. */
export type RunTargetBlockReason = 'profile-unavailable' | 'model-unknown' | 'effort-invalid';

/** Escolha explícita inválida: bloqueio tipado, sem queda para o próximo nível. */
export interface RunTargetBlock {
  blocked: true;
  source: RunTargetSource;
  value: string;
  reason: RunTargetBlockReason;
  message: string;
}

export type RunTargetResult = { blocked?: false; target: RunTarget } | { blocked: true; block: RunTargetBlock };

/**
 * O perfil ligado que executa o valor, pelo prefixo. Se o perfil padrão é uma cópia cujo catálogo é o do
 * prefixo, a cópia executa; senão o primeiro ligado com esse catálogo, preferindo o original à cópia.
 */
export function cliOfValue(board: Pick<TargetBoard, 'aiTool' | 'aiProfiles'>, value: string | null | undefined): AiProfile | null {
  const parsed = parseModelValue(value ?? undefined);
  if (!parsed) return null;
  const prefix = parsed.id.slice(0, Math.max(parsed.id.indexOf(':'), 0));
  if (!prefix) return null;
  const matching = board.aiProfiles.filter((p) => p.enabled && catalogTool(p) === prefix);
  const standard = activeProfile(board);
  if (standard.enabled && catalogTool(standard) === prefix) return standard;
  return matching.find((p) => !isCatalogCopy(p)) ?? matching[0] ?? null;
}

function blockOf(board: TargetBoard, value: string, source: RunTargetSource): RunTargetBlock | null {
  const parsed = parseModelValue(value);
  const cli = cliOfValue(board, value);
  const base = { blocked: true as const, source, value };
  if (!parsed || !cli) return { ...base, reason: 'profile-unavailable', message: `O perfil de "${value}" não está ligado.` };
  const tool = catalogTool(cli);
  const option = board.modelCatalog.find((m) => m.id === parsed.id && m.tool === tool);
  if (option)
    return parsed.effort && !option.efforts.includes(parsed.effort)
      ? { ...base, reason: 'effort-invalid', message: `O esforço "${parsed.effort}" não existe para ${option.label}.` }
      : null;
  return cli.kind === 'custom' && customName(cli, parsed.id)
    ? null
    : { ...base, reason: 'model-unknown', message: `O modelo "${parsed.id}" não está no catálogo de ${cli.name}.` };
}

const customName = (cli: AiProfile, id: string): string | null => {
  const name = id.startsWith(`${cli.id}:`) ? id.slice(cli.id.length + 1) : '';
  return name && !/[\s\0:@]/.test(name) ? name : null;
};

/** O alvo de um valor: só vale com o perfil ligado e o modelo no catálogo dele (o personalizado aceita modelo livre). */
export function targetOfValue(board: TargetBoard, value: string | null | undefined, source: RunTargetSource): RunTarget | null {
  const parsed = parseModelValue(value ?? undefined);
  if (!parsed || !value || blockOf(board, value, source)) return null;
  const cli = cliOfValue(board, value)!;
  const option = board.modelCatalog.find((m) => m.id === parsed.id && m.tool === catalogTool(cli));
  const name = option?.model ?? customName(cli, parsed.id);
  return name ? { cli, model: { name, effort: parsed.effort }, value, source } : null;
}

/**
 * Sem nenhum modelo indicado vale o perfil padrão, com o modelo padrão dele (o marcado na tela de Modelos); sem
 * modelo padrão, a ferramenta decide.
 */
export function defaultTarget(board: TargetBoard): RunTarget {
  const cli = activeProfile(board);
  const option = defaultModelOf(board.modelCatalog, catalogTool(cli));
  return option
    ? { cli, model: { name: option.model, effort: null }, value: option.id, source: 'default' }
    : { cli, model: null, value: '', source: 'default' };
}

/** Um nível preenchido da precedência do modelo: de onde vem, o valor e o nome do agente ou da regra. */
export interface ModelLevel {
  source: 'card' | 'agent' | 'column' | 'rule';
  value: string;
  /** o nome do agente (`agent`), da coluna (`column`, e no card preenchido por ela) ou da regra (`rule`, e no card preenchido por ela); vazio no card escolhido à mão */
  name: string;
  /** o valor do card é o que a regra sugere agora: entrou pelo preenchimento automático (ou foi escolhido igual), não à mão */
  filledByRule?: true;
  /** o valor do card é o modelo da fase da coluna: entrou pelo preenchimento automático (ou foi escolhido igual) */
  filledByColumn?: true;
}

/**
 * Os níveis preenchidos, na ordem de precedência: o campo Modelo do card, o modelo fixo do agente, o modelo da fase da
 * coluna (só coluna em aberto) e a regra de sugestão que casa (mesmo com "preencher automaticamente" desligado). O padrão do board não entra: vale quando a lista é vazia.
 */
export function modelLevels(state: BoardState, card: Card): ModelLevel[] {
  const field = modelFieldOf(state, card);
  const fromCard = field ? valueOf(state, card.id, field.id) : undefined;
  const agent = profileOf(state, card);
  const rule = suggestModelRule(state, card);
  const column = columnOf(state, card);
  const phaseModel = column?.category === 'open' ? column.phaseModel : null;
  const levels: ModelLevel[] = [];
  const ruleName = rule ? rule.name || describeRule(state, rule) : '';
  if (typeof fromCard === 'string' && fromCard) {
    // com modelo na coluna, a regra não preenche o card: só a coluna conta como quem preencheu
    if (phaseModel) {
      levels.push(
        phaseModel === fromCard
          ? { source: 'card', value: fromCard, name: column!.name, filledByColumn: true }
          : { source: 'card', value: fromCard, name: '' },
      );
    } else {
      levels.push(
        rule?.model === fromCard
          ? { source: 'card', value: fromCard, name: ruleName, filledByRule: true }
          : { source: 'card', value: fromCard, name: '' },
      );
    }
  }
  if (agent?.model) levels.push({ source: 'agent', value: agent.model, name: agent.name });
  if (phaseModel) levels.push({ source: 'column', value: phaseModel, name: column!.name });
  if (rule?.model) levels.push({ source: 'rule', value: rule.model, name: ruleName });
  return levels;
}

export interface ModelPrecedence {
  /** o nível que decide a execução; null quando nenhum está preenchido e vale o padrão do board */
  winner: ModelLevel | null;
  /** os níveis abaixo do vencedor com outro valor: as fontes que ele contradiz */
  overridden: ModelLevel[];
}

/**
 * Quem decide o modelo do card e o que fica sobreposto. A precedência é uma só: card > agente > coluna > regra > padrão, e o
 * esforço vai junto com o modelo que venceu (o valor é `<perfil>:<modelo>@<esforço>` de um nível só). O preenchimento
 * automático copia a regra para o card, e aí ela vence o agente com a força do card: `filledByRule` marca esse caso.
 */
export function modelPrecedence(state: BoardState, card: Card): ModelPrecedence {
  const levels = modelLevels(state, card);
  const winner = levels[0] ?? null;
  return { winner, overridden: winner ? levels.slice(1).filter((l) => l.value !== winner.value) : [] };
}

/**
 * O modelo que o board indicaria sem o campo do card: o primeiro nível de `modelLevels` que não é o card (agente, coluna,
 * regra) e, sem nenhum, o padrão do board. Devolve o valor só quando o modelo decidido vem do campo do card e difere dele
 * (inclusive o card preenchido pela regra); `null` quando coincide, quando o modelo vem do agente, da regra ou do padrão,
 * ou quando não há indicação. Nos níveis agente e regra a comparação é pelo valor inteiro (com esforço); no padrão do
 * board, que não fixa esforço, compara só o id do modelo (o card com o modelo padrão em qualquer esforço coincide).
 */
export function suggestedByBoard(state: BoardState, card: Card): string | null {
  if (modelPrecedence(state, card).winner?.source !== 'card') return null;
  const own = modelLevels(state, card).find((l) => l.source === 'card')?.value;
  const level = modelLevels(state, card).find((l) => l.source !== 'card')?.value;
  if (level) return level !== own ? level : null;
  const fallback = defaultTarget(state.board).value;
  if (!fallback) return null;
  return parseModelValue(own ?? '')?.id === parseModelValue(fallback)?.id ? null : fallback;
}

/**
 * Card → agente → regra (mesmo com "aplicar a sugestão" desligado) → padrão (`modelLevels`). A primeira escolha presente
 * é definitiva: se for inválida, devolve o bloqueio tipado em vez de cair para o próximo nível. Vazio herda.
 */
export function resolveRunTarget(state: BoardState, card: Card): RunTargetResult {
  for (const { source, value } of modelLevels(state, card)) {
    const block = blockOf(state.board, value, source);
    if (block) return { blocked: true, block };
    return { target: targetOfValue(state.board, value, source)! };
  }
  return { target: defaultTarget(state.board) };
}

/** Atalho: o alvo, ou null quando a escolha explícita foi bloqueada (use `resolveRunTarget` para o motivo). */
export const runTargetOf = (state: BoardState, card: Card): RunTarget | null => {
  const r = resolveRunTarget(state, card);
  return r.blocked ? null : r.target;
};

/** O perfil padrão mais os perfis dos cards com a IA, sem repetição. */
export function profilesInUse(state: BoardState): AiProfile[] {
  const out = new Map<string, AiProfile>();
  const standard = activeProfile(state.board);
  out.set(standard.id, standard);
  for (const card of aiQueue(state, pendingWork(state))) {
    const t = runTargetOf(state, card);
    if (t) out.set(t.cli.id, t.cli);
  }
  return [...out.values()];
}

export interface ModelGroup {
  cli: string;
  label: string;
  options: ModelOption[];
  /** perfil personalizado (CLI própria ou agente ACP): aceita um identificador livre além do catálogo */
  custom: boolean;
}

/**
 * Um grupo por catálogo dos perfis ligados. `available` deixa de fora os que não podem responder agora
 * (`profileAvailable`): o seletor só oferece o que roda.
 */
export function modelGroups(board: TargetBoard, available?: (profileId: string) => boolean): ModelGroup[] {
  return board.aiProfiles
    .filter((p) => p.enabled && (!available || available(p.id)))
    .map((p) => ({
      cli: p.id,
      label: profileLabel(board, p.id),
      options: board.modelCatalog.filter((m) => m.tool === catalogTool(p)),
      custom: p.kind === 'custom',
    }));
}
