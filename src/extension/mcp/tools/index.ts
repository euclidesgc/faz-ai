import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerBoardRulesTools, registerBoardTools } from './board';
import { registerCardContentTools } from './cardContent';
import { registerCardTools } from './cards';
import { registerHarnessTools } from './harness';
import { registerLifecycleTools } from './lifecycle';
import { registerMetricsTools } from './metrics';
import { registerModelTools } from './models';
import { registerQueryTools } from './query';
import { toolRegistrar, type DefineTool, type ToolContext } from './registry';
import { registerTypeAndFieldTools } from './typesAndFields';
import { registerWorkTools } from './work';

export type { ToolContext } from './registry';

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
}

/** Registra todas as ferramentas MCP do board no servidor. */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  defineTools(toolRegistrar(server, ctx), ctx);
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
export function toolDefinitions(): ToolDefinition[] {
  const out: ToolDefinition[] = [];
  const refuse = () => Promise.reject(new Error('Ferramentas definidas só para medir o contexto.'));
  const collect: DefineTool = (name, description, shape) => {
    out.push({ name, description, inputSchema: z.toJSONSchema(z.object(shape).strict(), { target: 'draft-7', io: 'input' }) });
  };
  defineTools(collect, { getRouter: refuse, getRunner: refuse, workspaceDir: '', author: () => '' });
  return out;
}
