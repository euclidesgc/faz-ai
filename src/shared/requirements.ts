import type { AiBase } from './aiProfiles';
import type { AiTool } from './harness';
import type { HarnessIssue } from './harnessStatus';
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
  | { kind: 'settings' };

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
  /** o que impede o perfil, em `profile` */
  problem?: ProfileProblem;
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

/** O comando da CLI de cada ferramenta. */
export const CLI_COMMAND: Record<AiBase, string> = { claude: 'claude', cursor: 'cursor-agent', kimi: 'kimi' };

/** O comando que faz o login na CLI de cada ferramenta (conferido nas CLIs em 2026-10-13). */
export const LOGIN_COMMAND: Record<AiBase, string> = { claude: 'claude auth login', cursor: 'cursor-agent login', kimi: 'kimi login' };

/**
 * Sem nenhum perfil disponível a execução pelo board nem começa, e o heartbeat e o autopiloto também
 * não insistem enquanto o login do perfil padrão (o alvo dos cards nesta versão) está vencido
 * numa execução. O problema de outro perfil (CLI ausente, login) não trava o board: vale só para o
 * que depende dele.
 */
export function blocksExecution(state: {
  requirements: BoardRequirement[];
  authExpired: AiTool | null;
  board: { aiTool: AiTool };
}): boolean {
  return state.requirements.some((r) => r.id === 'no-profile') || state.authExpired === state.board.aiTool;
}
