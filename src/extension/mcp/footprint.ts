import type { McpFootprint } from '../../shared/contextEstimate';
import { BOARD_SERVER } from '../execution';
import { MCP_INSTRUCTIONS } from './server';
import { toolDefinitions } from './tools';

let measured: McpFootprint | undefined;
let names: readonly string[] | undefined;

/** O nome de uma ferramenta do board como a sessão a vê, com o prefixo do servidor. */
const qualified = (name: string) => `mcp__${BOARD_SERVER}__${name}`;

/**
 * O que o servidor MCP do board põe numa sessão, para a tela estimar o contexto de um card. Medido uma
 * vez: as ferramentas não mudam enquanto a extensão roda. As definições contam como a ferramenta de IA
 * as manda ao modelo: o nome com o prefixo do servidor, a descrição e o schema.
 */
export function boardServerFootprint(): McpFootprint {
  if (measured) return measured;
  const tools = toolDefinitions();
  measured = {
    server: BOARD_SERVER,
    tools: tools.length,
    names: tools.reduce((n, t) => n + qualified(t.name).length + 1, 0),
    instructions: MCP_INSTRUCTIONS.length,
    definitions: JSON.stringify(tools.map((t) => ({ name: qualified(t.name), description: t.description, input_schema: t.inputSchema })))
      .length,
  };
  return measured;
}

/**
 * Todas as ferramentas do servidor do board pelo nome qualificado (`mcp__faz-ai__get_card`). É o que o Claude
 * Code recebe por `mcp__faz-ai__*` em qualquer nível de permissão (o nível limita as ferramentas nativas, não as
 * do board); o contrato do ACP e do modo API leva a mesma lista, por nome exato, porque a ponte não aceita curinga.
 */
export function boardToolNames(): readonly string[] {
  names ??= toolDefinitions().map((t) => qualified(t.name));
  return names;
}
