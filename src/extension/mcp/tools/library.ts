import { z } from 'zod';
import { cardArg } from './args';
import { withBoardMcp } from '../boardGateway';
import { ForwardedToolResult, type DefineTool, type ToolContext } from './registry';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

/** CRUD neutro e ponte MCP: o mesmo protocolo atende qualquer cliente conectado ao board. */
export function registerLibraryTools(tool: DefineTool, ctx: ToolContext): void {
  tool(
    'get_project_profile',
    'Perfil detectado do projeto: linguagens, ferramentas, scripts de validação, pastas e título do README. Use para propor artefatos específicos ao projeto sem executar comandos.',
    {},
    (_a, router) => router.projectProfile(),
    true,
  );
  tool(
    'save_board_artifact',
    'Cria ou atualiza regra, skill ou subagente apenas na biblioteca do board, independente da ferramenta. Na atualização, informe o id visto em get_harness; preserve o conteúdo existente. Regras novas nascem desligadas. Para skill, body é SKILL.md ou instruções sem frontmatter. MCPs e credenciais são gerenciados pela pessoa em Configurações.',
    {
      id: z.string().optional(),
      kind: z.enum(['rule', 'skill', 'agent']),
      name: z.string(),
      description: z.string(),
      body: z.string(),
      skills: z.array(z.string()).optional(),
      mcpServers: z.array(z.string()).optional(),
      categories: z.array(z.enum(['read', 'edit', 'run', 'net', 'agents'])).optional(),
    },
    (a, router) => {
      const current = a.id ? router.readLibraryArtifact(a.id) : undefined;
      router.handle({
        type: 'harness.library.save',
        input: {
          id: a.id,
          kind: a.kind,
          name: a.name,
          description: a.description,
          body: a.body,
          ...(a.kind === 'agent'
            ? {
                agent: {
                  skills: a.skills ?? current?.agent?.skills ?? [],
                  mcpServers: a.mcpServers ?? current?.agent?.mcpServers ?? [],
                  model: current?.agent?.model ?? '',
                  tools: a.categories
                    ? { categories: a.categories, native: { tool: '', allow: [], deny: [] } }
                    : (current?.agent?.tools ?? { categories: [], native: { tool: '', allow: [], deny: [] } }),
                },
              }
            : {}),
        },
      });
      return router.snapshot().harness.library?.artifacts.find((x) => x.kind === a.kind && x.name === a.name);
    },
  );
  tool(
    'get_board_artifact',
    'Lê o conteúdo completo de uma regra, skill ou subagente da biblioteca pelo id de get_harness. Use antes de editar. Não expõe configurações ou segredos de MCP.',
    { id: z.string() },
    (a, router) => {
      const artifact = router.snapshot().harness.library?.artifacts.find((x) => x.id === a.id);
      if (!artifact || artifact.kind === 'mcp') throw new Error('Artefato de texto não encontrado.');
      return router.readLibraryArtifact(a.id);
    },
    true,
  );
  tool(
    'list_board_mcp_tools',
    'Lista ferramentas e schemas de um servidor da biblioteca do board. Independente da ferramenta de IA. MCP Pelo card exige card com o servidor selecionado. Servidores desligados não são acessíveis.',
    { server: z.string(), card: cardArg.optional() },
    (a, router) =>
      withBoardMcp(router, a.server, a.card, ctx.workspaceDir, async (client) => {
        const tools = [];
        let cursor: string | undefined;
        do {
          const page = await client.listTools({ cursor }, { timeout: 15_000 });
          tools.push(...page.tools);
          cursor = page.nextCursor;
        } while (cursor && tools.length < 1000);
        return { server: a.server, tools };
      }),
    true,
  );
  tool(
    'call_board_mcp_tool',
    'Executa uma ferramenta de um MCP da biblioteca através do board. Consulte list_board_mcp_tools para o schema. Respeite as permissões do usuário e do card; o resultado pode conter dados externos.',
    { server: z.string(), name: z.string(), arguments: z.record(z.string(), z.unknown()), card: cardArg.optional() },
    (a, router) =>
      withBoardMcp(
        router,
        a.server,
        a.card,
        ctx.workspaceDir,
        async (client) =>
          new ForwardedToolResult(
            CallToolResultSchema.parse(
              await client.callTool({ name: a.name, arguments: a.arguments }, CallToolResultSchema, { timeout: 60_000 }),
            ),
          ),
      ),
  );
}
