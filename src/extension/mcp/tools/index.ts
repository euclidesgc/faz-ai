import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBoardRulesTools, registerBoardTools } from './board';
import { registerCardContentTools } from './cardContent';
import { registerCardTools } from './cards';
import { registerHarnessTools } from './harness';
import { registerLifecycleTools } from './lifecycle';
import { registerModelTools } from './models';
import { registerQueryTools } from './query';
import { toolRegistrar, type ToolContext } from './registry';
import { registerTypeAndFieldTools } from './typesAndFields';
import { registerWorkTools } from './work';

export type { ToolContext } from './registry';

/** Registra todas as ferramentas MCP do board. A ordem é a que a IA vê em tools/list: mantenha-a. */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  const tool = toolRegistrar(server, ctx);
  registerQueryTools(tool);
  registerCardTools(tool, ctx);
  registerWorkTools(tool, ctx);
  registerLifecycleTools(tool);
  registerCardContentTools(tool, ctx);
  registerBoardTools(tool);
  registerTypeAndFieldTools(tool);
  registerBoardRulesTools(tool);
  registerModelTools(tool);
  registerHarnessTools(tool);
}
