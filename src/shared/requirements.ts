import type { AiTool } from './harness';
import type { HarnessIssue } from './harnessStatus';
import type { BoardState, Card } from './model';
import { runTargetOf } from './runTarget';
import type { BoardAvailability, ProfileProblem } from './profileHealth';

/**
 * O que falta para o board trabalhar: o Node.js, um perfil de CLI disponível (`no-profile` quando
 * nenhum está) ou o problema de um perfil ligado (`profile`, que não bloqueia se outro estiver
 * disponível) e o banco de artefatos (`harness`, recomendação).
 */
export type RequirementId = 'node' | 'profile' | 'no-profile' | 'harness';

/** O que a pessoa pode fazer, pela própria faixa de aviso, para resolver. */
export type RequirementAction =
  /** um comando para rodar no terminal, com botão de copiar; `terminal` soma o botão "Abrir no terminal" (só o login usa) */
  | { kind: 'command'; command: string; terminal?: true }
  /** abre o Diagnóstico, no bloco do perfil quando há um */
  | { kind: 'diagnostic'; profile?: AiTool }
  /** a tela de Configurações → Harness */
  | { kind: 'settings' }
  /**
   * Conectar agentes, na aba Conexão do agente: o login da ferramenta que entra por chave de API (história 7) e o
   * Reconectar do perfil do catálogo cuja prova perdeu a validade (história 13)
   */
  | { kind: 'connect'; profile: AiTool }
  /** Conectar agentes, na aba Conexão do perfil: o "Verificar capacidades" do perfil verificável sem Conectar (história 13) */
  | { kind: 'aiTools'; profile: AiTool };

/**
 * Um requisito que falta. O texto é montado na interface a partir do `id` e dos valores, para sair
 * no idioma dela; o host só diz o que falta e com que nomes.
 */
export interface BoardRequirement {
  id: RequirementId;
  /** o perfil, em `profile` */
  profile?: AiTool;
  /** o nome do perfil, para o texto (o perfil pode ter sido apagado depois) */
  name?: string;
  /**
   * o que impede o perfil, em `profile`; `evidence-invalidated` não impede: a prova de capacidades gravada
   * deixou de valer porque o vínculo de isolamento mudou (binário, ambiente, extensão) e precisa ser refeita
   */
  problem?: ProfileProblem | 'evidence-invalidated';
  /**
   * em `evidence-invalidated`: o board refaz a verificação sozinho (agente ACP); sem isso, a pessoa refaz em
   * Conectar agentes (o Reconectar, ou o "Verificar capacidades" do perfil sem Conectar), pela `action`
   */
  automatic?: true;
  /** só o login que venceu numa execução (o probe não confirmou a saída): uma execução manual ainda pode limpar */
  expired?: true;
  /** por que nenhum perfil serve, em `no-profile` */
  reason?: BoardAvailability['reason'];
  /** o que falta no banco de artefatos do board, em `harness` */
  harnessIssues?: HarnessIssue[];
  /** não bloqueia: aviso de um perfil (com outro disponível) e o harness */
  optional?: true;
  action: RequirementAction | null;
}

/** O problema de um perfil de CLI que impede a execução: CLI ausente, sem login (probe) ou login vencido (falha numa execução). */
export type CliProblem = 'cli' | 'signin' | 'expired';

type ProblemState = { requirements: BoardRequirement[]; authExpired: AiTool[] };

/**
 * O problema do perfil `cli` (id do perfil), ou null. Só olha os sinais daquele perfil. O requisito
 * `profile` do Diagnóstico vale mesmo `optional` (outro perfil disponível não livra este); só a CLI
 * ausente e o login (probe ou vencido numa execução) bloqueiam aqui. Os demais problemas (pendente de
 * revisão, não validado, vencido, não admissível) são decididos pela admissão, não por este bloqueio.
 */
export function cliProblem(state: ProblemState, cli: AiTool): CliProblem | null {
  const own = state.requirements.find((r) => r.id === 'profile' && r.profile === cli);
  if (own?.problem === 'cli') return 'cli';
  if (own?.problem === 'signin') return own.expired ? 'expired' : 'signin';
  return state.authExpired.includes(cli) ? 'expired' : null;
}

/** A execução no perfil `cli` nem começa: usado pelos gatilhos (manual, Refinar com IA, heartbeat, autopiloto). Os outros perfis seguem. */
export const blocksExecution = (state: ProblemState, cli: AiTool): boolean => cliProblem(state, cli) !== null;

/** Nenhum perfil ligado disponível (`no-profile`): nenhuma execução pelo board começa, nem a do heartbeat e do autopiloto. */
export const noProfileAvailable = (state: { requirements: BoardRequirement[] }): boolean =>
  state.requirements.some((r) => r.id === 'no-profile');

/**
 * O problema do perfil de CLI que executaria o card (`runTargetOf`), ou null. Um alvo bloqueado (escolha
 * explícita inválida) não é problema de CLI: quem executa trata isso à parte.
 */
export function cardCliProblem(state: BoardState, card: Card): CliProblem | null {
  const target = runTargetOf(state, card);
  return target ? cliProblem(state, target.cli.id) : null;
}

/**
 * Por que o perfil que executaria o card não roda pelo board (personalizado de CLI, permissão sem argumento, root),
 * ou null. É do perfil do card, não do padrão: um card com o modelo de outro agente ligado roda mesmo com o padrão
 * sem rodar, e vice-versa.
 */
export function cardRunUnsupported(state: BoardState, card: Card): string | null {
  const target = runTargetOf(state, card);
  return (target && state.aiRunUnsupportedBy?.[target.cli.id]) || null;
}
