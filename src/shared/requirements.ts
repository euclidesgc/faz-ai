import type { AiTool } from './harness';
import type { HarnessIssue } from './harnessStatus';

/** O que falta para o board trabalhar com a ferramenta de IA do projeto. */
export type RequirementId =
  | 'node'
  | 'cli'
  | 'signin'
  | 'mcp'
  | 'mcp-stale'
  | 'mcp-elsewhere'
  | 'mcp-outdated'
  | 'mcp-reload'
  | 'mcp-enable'
  | 'mcp-path'
  | 'skill'
  | 'harness'
  | 'permission'
  /** a ferramenta pede aprovação a cada ferramenta do board nas conversas dela (a regra `allow` nas permissões) */
  | 'permission-mcp';

/** O que a pessoa pode fazer, pela própria faixa de aviso, para resolver. */
export type RequirementAction =
  /** registrar (de novo) o servidor do board na ferramenta: a seção Servidores MCP da ferramenta, no Harness de IA */
  | { kind: 'connect' }
  /**
   * tirar o registro quebrado do arquivo do projeto, que vale sobre o global na ferramenta, e deixar o
   * global (refeito com os caminhos atuais) valendo: reinstalar só o global não resolveria
   */
  | { kind: 'fixProject'; file: string }
  /** recarregar a janela do editor, para o chat dele carregar o servidor recém-registrado */
  | { kind: 'reload' }
  /** abrir a tela de MCPs do editor (no Cursor, Customize → MCPs), onde só a pessoa ativa o MCP */
  | { kind: 'openEditorMcp' }
  /** instalar a skill do fluxo na ferramenta do projeto, no escopo global */
  | { kind: 'installSkill' }
  /** gravar o caminho completo do comando nos registros que o editor não acha (o node instalado depois que ele abriu) */
  | { kind: 'pinMcp' }
  /** liberar as ferramentas do board sem aprovação nas conversas da ferramenta (a regra `mcp__faz-ai__*` no config.toml do Kimi Code) */
  | { kind: 'allowKimiMcp' }
  /** um comando para rodar no terminal, com botão de copiar; `terminal` soma o botão "Abrir no terminal" (só o login usa) */
  | { kind: 'command'; command: string; terminal?: true }
  /** a tela de Configurações → Harness de IA */
  | { kind: 'settings' };

/**
 * Um requisito que falta. O texto é montado na interface a partir do `id` e dos valores, para sair
 * no idioma dela; o host só diz o que falta e com que nomes.
 */
export interface BoardRequirement {
  id: RequirementId;
  tool: AiTool;
  /** o comando da CLI procurado (`cursor-agent`, `claude`…), em `cli` e `signin` */
  cli?: string;
  /** onde instalar quando não há comando de uma linha, em `cli` */
  where?: string;
  /** o arquivo de configuração e o caminho que não existe mais (`mcp-stale`) ou a outra pasta (`mcp-elsewhere`) */
  file?: string;
  missing?: string;
  /** o arquivo do projeto está no git: o board não grava nele o caminho desta máquina (`mcp-path`) */
  tracked?: true;
  /** a explicação da recusa, em `permission` (a mesma de `aiRunUnsupported`) */
  reason?: string;
  /** o que falta no banco de artefatos do board, em `harness` */
  harnessIssues?: HarnessIssue[];
  /**
   * recomendado, mas não impede as execuções pelo board (o servidor do board no Claude e no Cursor,
   * que as execuções levam sozinhas): o aviso mostra, sem contar como requisito que falta
   */
  optional?: true;
  action: RequirementAction | null;
}

/** O comando da CLI de cada ferramenta. */
export const CLI_COMMAND: Record<AiTool, string> = { claude: 'claude', cursor: 'cursor-agent', kimi: 'kimi' };

/** O comando que faz o login na CLI de cada ferramenta (conferido nas CLIs em 2026-10-13). */
export const LOGIN_COMMAND: Record<AiTool, string> = { claude: 'claude auth login', cursor: 'cursor-agent login', kimi: 'kimi login' };

/** Sem login a execução pelo board nem começa: usado pelos 4 gatilhos (manual, Refinar com IA, heartbeat, autopiloto). */
export function blocksExecution(state: { requirements: BoardRequirement[]; authExpired: AiTool | null }): boolean {
  return state.requirements.some((r) => r.id === 'signin') || state.authExpired !== null;
}
