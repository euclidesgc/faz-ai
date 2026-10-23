import { ACP_ENFORCEMENT, toolModeEntry } from '../../../shared/aiTools';
import { resolveCommand } from '../../cliResolve';
import { acpCommand, acpMeasure, acpSessionMode, type AcpAgent } from '../acp/provider';
import { spawnAcp } from '../acp/run';
import type { ToolDriver } from './types';

/**
 * O driver de um agente do catálogo ACP (`ACP_AGENTS`): os dados do agente viram o contrato. O
 * transporte (`acp/run.ts`) e o leitor (`acp/reader.ts`) são os mesmos para todos.
 */
export function acpDriver(agent: AcpAgent): ToolDriver {
  return {
    tool: agent.id,
    mode: 'acp',
    command: agent.command,
    locate: (pathEnv, homeDir) => resolveCommand(agent.command, pathEnv, homeDir),
    versionArgs: ['--version'],
    docs: agent.docs,
    // o catálogo não traz instalador: a página oficial de cada agente explica
    install: () => [],
    auth: agent.apiKeyAuth
      ? { kind: 'api-key', methodId: agent.apiKeyAuth.methodId, terminal: agent.login }
      : { kind: 'acp-authenticate', terminal: agent.login },
    // o agente não tem comando de status. Com login por chave, a chave no cofre conta como login; sem ela,
    // "não verificado" e não "sem login": o agente pode ter o login dele (`GEMINI_API_KEY`, o do terminal)
    signedIn: async (probe) => (agent.apiKeyAuth && probe.hasApiKey ? true : null),
    measure: acpMeasure(agent),
    // o agente ACP fora do catálogo da tela (o do Cursor, o do Kimi Code) tem a linha do protocolo
    enforcement: toolModeEntry(agent.id, 'acp')?.enforcement ?? ACP_ENFORCEMENT,
    transport: 'acp',
    run: (input, ctx) => {
      // o gateway confere o transporte antes de chegar aqui; a falta dele é um erro de quem chamou
      if (!ctx.spawnAcp) throw new Error('Transporte ACP indisponível neste host.');
      return spawnAcp(agent, input, ctx.cwd, {
        spawn: ctx.spawnAcp,
        log: ctx.log,
        runId: ctx.runId,
        leaseCoordinationDir: ctx.leaseCoordinationDir,
        // a chave do cofre vai no `authenticate` de cada processo; sem ela, vale o login que o agente tiver
        ...(agent.apiKeyAuth && ctx.apiKey ? { auth: { methodId: agent.apiKeyAuth.methodId, apiKey: ctx.apiKey } } : {}),
      });
    },
    // no ACP o vínculo é o comando e os argumentos do agente: não há flags de isolamento, arquivo
    // temporário nem formato de saída; o modelo do card entra nos argumentos quando o agente aceita. O modo
    // da sessão também entra: no modo sem perguntas (`fullMode`) o board não decide mais cada pedido,
    // então uma prova feita no modo padrão nunca pode valer para ele
    bindingContext: (input) => {
      const built = acpCommand(agent, input);
      return {
        invocation: { transport: 'acp', agent: agent.id, ...built, sessionMode: acpSessionMode(agent, input) ?? 'padrao' },
        // o comando do agente não traz ambiente nem PATH próprios: vale o do host
        command: built.command,
      };
    },
  };
}
