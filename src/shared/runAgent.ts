// O agente capaz de uma execução. A fase e o modo dizem o que a execução pede (tools neutras, pela estrutura, nunca
// pelo texto da fase: o Terminal numa branch, mais o que as skills do card pedem); o agente diz o que concede. Quando o agente do card não concede o que a execução pede, o
// board delega a execução a outro agente do board, numa ordem fixa, e registra na história; só sem nenhum agente
// capaz a história para, com o motivo e o caminho. Só funções puras: o runner, o get_card e a tela usam as mesmas.
import { NEUTRAL_TOOLS, neutralFromNative, supportsToolList, type NeutralTool } from './artifactTools';
import { activityKindOf } from './activity';
import { linkedCards } from './artifactLibrary';
import { profileBase } from './aiProfiles';
import { CONDUCTOR_AGENT, manifestOf, profileOf, type ExecProfile } from './execution';
import type { BoardState, Card } from './model';
import type { AiRunMode } from './runner';
import { columnOf } from './selectors';
import { storyOf } from './story';

/**
 * O que toda execução numa branch pede e nenhuma lista de ferramentas substitui: o terminal (git, `gh`, as checagens).
 * Só o essencial e certo: ler, buscar e editar variam por agente (um revisor lê, um executor edita) e não decidem se a
 * execução pode acontecer. Uma fase que só produz documento não pede nada: o documento vai pelo MCP.
 */
const BRANCH_NEEDS: readonly NeutralTool[] = ['shell'];
const TEXT_NEEDS: readonly NeutralTool[] = [];

const inOrder = (ids: Iterable<NeutralTool>): NeutralTool[] => {
  const set = new Set(ids);
  return NEUTRAL_TOOLS.map((x) => x.id).filter((id) => set.has(id));
};

/**
 * As tools que a execução de um card pede: pela atividade (branch ou texto) do modo e da fase, mais o que as skills
 * vinculadas ao card pedem. Refinar, resumir e responder só usam o board.
 */
export function runNeeds(s: BoardState, card: Card, mode: AiRunMode = 'phase'): NeutralTool[] {
  const needs = new Set<NeutralTool>();
  if (mode !== 'refine' && mode !== 'summarize' && mode !== 'reply')
    for (const id of activityKindOf(s, card, mode) === 'branch' ? BRANCH_NEEDS : TEXT_NEEDS) needs.add(id);
  for (const skill of s.harness.library?.artifacts ?? []) {
    if (skill.kind !== 'skill' || !skill.tools?.length || !linkedCards(s, skill).some((c) => c.id === card.id)) continue;
    for (const id of skill.tools) needs.add(id);
  }
  return inOrder(needs);
}

/**
 * O que o agente concede: a lista nativa da execução traduzida (vazia = todas as ferramentas), menos as negadas. É a
 * lista que a execução impõe; as tools neutras do artefato só a originam. Numa CLI sem lista de ferramentas por
 * agente, a execução tem todas.
 */
export function grantedTools(profile: Pick<ExecProfile, 'tools' | 'deniedTools'>, cli = ''): NeutralTool[] | 'all' {
  if (cli && !supportsToolList(cli)) return 'all';
  // um perfil parcial (estado antigo, fixture) sem listas concede tudo, como a execução faz
  const tools = profile.tools ?? [];
  if (!tools.length) return 'all';
  const denied = new Set(neutralFromNative(profile.deniedTools ?? []));
  return neutralFromNative(tools).filter((id) => !denied.has(id));
}

export const missingFor = (needs: readonly NeutralTool[], granted: NeutralTool[] | 'all'): NeutralTool[] =>
  granted === 'all' ? [] : needs.filter((id) => !granted.includes(id));

export interface RunAgentResolution {
  /** o agente que roda (o escolhido, ou o delegado) */
  profile: ExecProfile | undefined;
  /** o agente do card quando a execução foi delegada a outro */
  delegatedFrom?: ExecProfile;
  /** o que o agente do card não concede e a execução pede */
  missing: NeutralTool[];
  /** nenhum agente do board concede tudo o que a execução pede: a execução não deve começar */
  unresolved: boolean;
}

/** A base da CLI que executa o card, para saber se há lista de ferramentas por agente. */
const cliOf = (s: BoardState, card: Card): string => profileBase(manifestOf(s, card).target.cli) ?? '';

/**
 * O agente da execução: o escolhido (o do card, ou o que quem chama indica) quando concede o que a execução pede;
 * senão, o primeiro capaz nesta ordem fixa: o agente da história (numa sub-tarefa), o agente padrão do board, o
 * condutor, os demais por nome. Sem nenhum capaz, `unresolved`.
 */
export function resolveRunAgent(
  s: BoardState,
  card: Card,
  mode: AiRunMode = 'phase',
  chosen: ExecProfile | undefined = profileOf(s, card),
): RunAgentResolution {
  if (!chosen) return { profile: undefined, missing: [], unresolved: false };
  const needs = runNeeds(s, card, mode);
  const cli = cliOf(s, card);
  const missing = missingFor(needs, grantedTools(chosen, cli));
  if (!missing.length) return { profile: chosen, missing, unresolved: false };
  const covers = (p: ExecProfile) => p.id !== chosen.id && !missingFor(needs, grantedTools(p, cli)).length;
  const story = card.parentId ? storyOf(s, card) : undefined;
  const storyAgent = story ? profileOf(s, story) : undefined;
  const all = s.board.execProfiles;
  const candidates = [
    storyAgent,
    all.find((p) => p.isDefault),
    all.find((p) => p.name === CONDUCTOR_AGENT),
    ...[...all].sort((a, b) => a.name.localeCompare(b.name)),
  ].filter((p): p is ExecProfile => !!p);
  const delegate = candidates.find(covers);
  if (!delegate) return { profile: chosen, missing, unresolved: true };
  return { profile: delegate, delegatedFrom: chosen, missing, unresolved: false };
}

/** Os rótulos das tools, para a pessoa ("Terminal, Rede"). */
export const toolLabels = (ids: readonly NeutralTool[]): string =>
  ids.map((id) => NEUTRAL_TOOLS.find((x) => x.id === id)?.label ?? id).join(', ');

/** O nome da fase em que a história está (a coluna da história, não a da sub-tarefa). */
const phaseNameOf = (s: BoardState, card: Card): string => columnOf(s, storyOf(s, card) ?? card)?.name ?? '';

/** A nota, na conversa da história, de que a execução foi delegada: a causa em palavras e o caminho para mudar. */
export function delegationNote(s: BoardState, card: Card, from: ExecProfile, to: ExecProfile, missing: readonly NeutralTool[]): string {
  return `A execução de #${card.number} vai com o agente ${to.name}: o agente ${from.name} não concede ${toolLabels(missing)}, que a fase ${phaseNameOf(s, card)} pede. Para mudar, dê a ferramenta ao agente ou escolha outro agente para o card (Configurações → Harness → Agentes).`;
}

/** O motivo do bloqueio da história quando nenhum agente do board concede o que a execução pede. */
export function unresolvedReason(s: BoardState, card: Card, missing: readonly NeutralTool[]): string {
  return `Nenhum agente do board concede ${toolLabels(missing)}, que a fase ${phaseNameOf(s, card)} de #${card.number} pede. Dê a ferramenta a um agente ou crie um (Configurações → Harness → Agentes) e responda aqui: a resposta devolve a vez à IA.`;
}
