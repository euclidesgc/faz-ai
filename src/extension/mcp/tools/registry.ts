import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MessageRouter } from '../../panel/messageRouter';

export interface ToolContext {
  getRouter: () => Promise<MessageRouter>;
  /** base para caminhos relativos em add_attachment */
  workspaceDir: string;
  /** nome que assina os comentários feitos por esta sessão */
  author: () => string;
}

/** Registra uma ferramenta; o retorno vira JSON e exceções viram erro legível para o modelo. */
export type DefineTool = <S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (args: z.infer<z.ZodObject<S>>, router: MessageRouter) => unknown,
  readOnly?: boolean,
) => void;

export function toolRegistrar(server: McpServer, ctx: ToolContext): DefineTool {
  return (name, description, shape, run, readOnly = false) => {
    // estrito: um parâmetro com nome errado vira erro com o nome dele, em vez de ser descartado e a
    // ferramenta seguir com o padrão (um `parent` escrito errado criaria uma história, não a sub-tarefa)
    const inputSchema = z.object(shape).strict();
    server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: readOnly } }, (async (args: unknown) => {
      try {
        const result = run(args as Parameters<typeof run>[0], await ctx.getRouter());
        return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 1) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] };
      }
    }) as never);
  };
}
