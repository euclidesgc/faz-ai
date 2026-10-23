// O servidor MCP do board em cada ferramenta, pelo driver dela (épica "ferramenta por modo", história 13). Até a
// história 13, `registerClients` e `registeredServer` tinham um `switch` por ferramenta (`claude`, `cursor`,
// `kimi`); agora cada driver de CLI que fala MCP traz o próprio `boardServer` (`mcp/clientConfig.ts`), e entrar
// com uma ferramenta não muda este arquivo. Fica fora do `clientConfig.ts` porque os drivers importam de lá: o
// despacho por `driverFor` ali fecharia um ciclo de importação.
import type { AiTool } from '../../shared/harness';
import { driverFor } from '../ai/drivers';
import type { RegisterOptions, Registered, Registration } from './clientConfig';

/**
 * O suporte ao servidor do board de uma ferramenta: o da CLI dela. O id é o do perfil pronto (a ferramenta);
 * uma ferramenta sem driver de CLI, ou cujo driver não registra o servidor (o Gemini, que recebe os servidores
 * do card na home isolada de cada execução), não tem: nada é registrado nem lido, como antes.
 */
const supportOf = (tool: AiTool) => driverFor(tool, 'cli')?.boardServer;

/**
 * Registra o servidor MCP do board em cada ferramenta (no global dela; no Cursor, no projeto, fora do git):
 * a ponte descobre o board pelo diretório em que a ferramenta foi aberta.
 */
export function registerClients(tools: AiTool[], o: RegisterOptions): Registration[] {
  return tools.flatMap((tool) => supportOf(tool)?.register(o) ?? []);
}

/**
 * O servidor do board (ou `server`) no arquivo que a ferramenta lê nas conversas da pessoa (fora do board):
 * primeiro o do projeto, que vale sobre o global, e depois o global. null quando não está registrado.
 */
export function registeredServer(tool: AiTool, workspaceDir: string, homeDir: string, server?: string): Registered | null {
  return supportOf(tool)?.registered(workspaceDir, homeDir, server) ?? null;
}
