import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AiRunner } from '../../runner';
import type { MessageRouter } from '../../panel/messageRouter';
import { NO_TRACE } from '../../log/trace';
import { summarize } from '../../../shared/trace';

export interface ToolContext {
  getRouter: () => Promise<MessageRouter>;
  /** o runner da pasta, para ferramentas que disparam e aguardam uma execução de IA (ex.: generate_summary) */
  getRunner: () => Promise<AiRunner>;
  /** base para caminhos relativos em add_attachment */
  workspaceDir: string;
  /** nome que assina os comentários feitos por esta sessão */
  author: () => string;
  sessionToken?: () => string | undefined;
}

/** Resultado de uma ferramenta externa: preserva blocos de conteúdo e o isError do protocolo. */
export class ForwardedToolResult {
  constructor(readonly result: CallToolResult) {}
}

/** Registra uma ferramenta; o retorno vira JSON e exceções viram erro legível para o modelo. */
export type DefineTool = <S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  // algumas ferramentas (ex.: generate_summary) aguardam uma execução de IA terminar antes de responder
  run: (args: z.infer<z.ZodObject<S>>, router: MessageRouter) => unknown | Promise<unknown>,
  readOnly?: boolean,
) => void;

export function toolRegistrar(server: McpServer, ctx: ToolContext): DefineTool {
  return (name, description, shape, run, readOnly = false) => {
    // estrito: um parâmetro com nome errado vira erro com o nome dele, em vez de ser descartado e a
    // ferramenta seguir com o padrão (um `parent` escrito errado criaria uma história, não a sub-tarefa)
    const inputSchema = z.object(shape).strict();
    server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: readOnly } }, (async (args: unknown) => {
      let redact = (text: string) => text;
      // o rastreio da chamada: quem chamou, com o quê, quanto levou e como terminou
      let trace = NO_TRACE;
      const startedAt = Date.now();
      try {
        const router = await ctx.getRouter();
        trace = router.trace;
        redact = (text) => router.executions.redact(router.redactCredentials(text));
        const token = ctx.sessionToken?.();
        if (token !== undefined) router.executions.assert(token);
        const cleanArgs = router.executions.sanitize(args);
        const operation = router.executions.tool(router, token, name, cleanArgs, readOnly, router.executions.redact(ctx.author()));
        const result = await run(cleanArgs as Parameters<typeof run>[0], operation.router);
        operation.assert();
        trace.write({
          src: 'mcp',
          ev: 'tool',
          type: name,
          ms: Date.now() - startedAt,
          ok: true,
          data: { by: ctx.author(), args: summarize(cleanArgs) },
        });
        if (result instanceof ForwardedToolResult)
          return JSON.parse(
            JSON.stringify(router.executions.sanitize(result.result), (_key, value: unknown) =>
              typeof value === 'string' ? redact(value) : value,
            ),
          ) as typeof result.result;
        return {
          content: [
            {
              type: 'text' as const,
              text: router.executions.redact(typeof result === 'string' ? result : JSON.stringify(result, null, 1)),
            },
          ],
        };
      } catch (e) {
        trace.write({
          src: 'mcp',
          ev: 'tool',
          type: name,
          ms: Date.now() - startedAt,
          ok: false,
          err: redact(e instanceof Error ? e.message : String(e)),
          data: { by: ctx.author(), args: summarize(args) },
        });
        return { isError: true, content: [{ type: 'text' as const, text: redact(e instanceof Error ? e.message : String(e)) }] };
      }
    }) as never);
  };
}
