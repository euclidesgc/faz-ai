import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerBoardRulesTools, registerBoardTools } from './board';
import { registerCardContentTools } from './cardContent';
import { registerCardTools } from './cards';
import { registerLibraryTools } from './library';
import { registerHarnessTools } from './harness';
import { registerLifecycleTools } from './lifecycle';
import { registerMetricsTools } from './metrics';
import { registerModelTools } from './models';
import { registerQueryTools } from './query';
import { toolRegistrar, type DefineTool, type ToolContext } from './registry';
import { registerTypeAndFieldTools } from './typesAndFields';
import { registerWorkTools } from './work';

export type { ToolContext } from './registry';

/**
 * Quem recebe a sessão: a pessoa (ou a IA que ela conversa no editor), com o board inteiro, ou a execução de um
 * card pelo board, que só lê e grava o próprio card e o que a fase pede.
 */
export type ToolAudience = 'interactive' | 'execution';

/**
 * As ferramentas que a execução de um card recebe. As outras (colunas, tipos, campos, regras, catálogo de modelos,
 * biblioteca, lixeira, métricas) são configuração do board, que a guarda da execução já recusa ("Configuração
 * global fora do escopo desta execução"); descrevê-las em todo pedido ao modelo só custava contexto: eram 80
 * ferramentas, 65 mil caracteres de definição em cada pedido (rodada real de 04/11/2026), metade deles de
 * ferramentas que a execução nunca podia chamar.
 */
export const EXECUTION_TOOLS: ReadonlySet<string> = new Set([
  'get_board',
  'list_cards',
  'get_card',
  'get_pending_work',
  'read_attachment',
  'create_card',
  'update_card',
  'move_card',
  'start_work',
  'request_review',
  'ask_questions',
  'ask_question',
  'block_card',
  'release_card',
  'prepare_workspace',
  'set_base_branch',
  'set_card_profile',
  'set_pull_request',
  'link_cards',
  'unlink_cards',
  'add_checklist_item',
  'update_checklist_item',
  'delete_checklist_item',
  'add_comment',
  'generate_summary',
  'update_comment',
  'add_attachment',
  'get_models',
  'get_harness',
  'read_rule_file',
  'get_skill',
  'get_agent',
  'get_board_artifact',
  'list_board_mcp_tools',
  'call_board_mcp_tool',
]);

/** O registrador que só define as ferramentas do público; a ordem relativa é a mesma do board inteiro. */
const onlyFor =
  (audience: ToolAudience, tool: DefineTool): DefineTool =>
  (name, description, shape, run, readOnly) => {
    if (audience === 'interactive' || EXECUTION_TOOLS.has(name)) tool(name, description, shape, run, readOnly);
  };

/** Define todas as ferramentas MCP do board. A ordem é a que a IA vê em tools/list: mantenha-a. */
function defineTools(tool: DefineTool, ctx: ToolContext): void {
  registerQueryTools(tool);
  registerMetricsTools(tool);
  registerCardTools(tool, ctx);
  registerWorkTools(tool, ctx);
  registerLifecycleTools(tool);
  registerCardContentTools(tool, ctx);
  registerBoardTools(tool);
  registerTypeAndFieldTools(tool);
  registerBoardRulesTools(tool);
  registerModelTools(tool);
  registerHarnessTools(tool);
  registerLibraryTools(tool, ctx);
}

/** Registra as ferramentas MCP do board no servidor: todas para a pessoa, as da execução para um card. */
export function registerTools(server: McpServer, ctx: ToolContext, audience: ToolAudience = 'interactive'): void {
  defineTools(onlyFor(audience, toolRegistrar(server, ctx)), ctx);
}

/** Uma ferramenta do board como tools/list a descreve. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

/**
 * As definições das ferramentas do board, sem abrir um servidor: servem para medir o que elas ocupam no
 * contexto de uma sessão. O schema sai com as mesmas opções que o SDK usa no tools/list; nenhuma
 * ferramenta roda, então o contexto só recusa.
 */
export function toolDefinitions(audience: ToolAudience = 'interactive'): ToolDefinition[] {
  const out: ToolDefinition[] = [];
  const refuse = () => Promise.reject(new Error('Ferramentas definidas só para medir o contexto.'));
  const collect: DefineTool = (name, description, shape) => {
    out.push({ name, description, inputSchema: z.toJSONSchema(z.object(shape).strict(), { target: 'draft-7', io: 'input' }) });
  };
  defineTools(onlyFor(audience, collect), { getRouter: refuse, getRunner: refuse, workspaceDir: '', author: () => '' });
  return out;
}
