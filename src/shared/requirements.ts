import type { AiTool } from './harness';

/** O que falta para o board trabalhar com a ferramenta de IA do projeto. */
export type RequirementId =
  'node' | 'cli' | 'signin' | 'mcp' | 'mcp-stale' | 'mcp-elsewhere' | 'mcp-outdated' | 'mcp-reload' | 'mcp-enable' | 'permission';

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
  /** um comando para rodar no terminal, com botão de copiar */
  | { kind: 'command'; command: string }
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
  /** a explicação da recusa, em `permission` (a mesma de `aiRunUnsupported`) */
  reason?: string;
  /**
   * recomendado, mas não impede as execuções pelo board (o servidor do board no Claude e no Cursor,
   * que as execuções levam sozinhas): o aviso mostra, sem contar como requisito que falta
   */
  optional?: true;
  action: RequirementAction | null;
}
