// Alvo da execução: o perfil de CLI e o modelo que valem para um card. Regra pura (sem banco nem `vscode`).
// O valor do campo Modelo (`<perfil>:<modelo>@<esforço>`) carrega a CLI: o prefixo identifica o perfil.
import { activeProfile, catalogTool, profileLabel, type AiProfile, isCatalogCopy } from './aiProfiles';
import type { BoardState, Card } from './model';
import { defaultModelOf, modelFieldOf, parseModelValue, suggestModelRule, type ModelOption } from './models';
import { profileOf } from './execution';
import { aiQueue, pendingWork } from './pending';
import { valueOf } from './selectors';

export type RunTargetSource = 'card' | 'agent' | 'rule' | 'default' | 'chat' | 'fallback';

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

/**
 * Card → agente → regra (mesmo com "aplicar a sugestão" desligado) → padrão. A primeira escolha presente é
 * definitiva: se for inválida, devolve o bloqueio tipado em vez de cair para o próximo nível. Vazio herda.
 */
export function resolveRunTarget(state: BoardState, card: Card): RunTargetResult {
  const field = modelFieldOf(state, card);
  const fromCard = field ? valueOf(state, card.id, field.id) : undefined;
  const levels: [RunTargetSource, string | null | undefined][] = [
    ['card', typeof fromCard === 'string' ? fromCard : null],
    ['agent', profileOf(state, card)?.model],
    ['rule', suggestModelRule(state, card)?.model],
  ];
  for (const [source, value] of levels) {
    if (!value) continue;
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
