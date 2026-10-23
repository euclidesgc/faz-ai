import { ACP_ENFORCEMENT, toolModeEntry } from '../../../shared/aiTools';
import { resolveCommand } from '../../cliResolve';
import { acpMeasure, type AcpAgent } from '../acp/provider';
import type { ConnectionDriver } from './types';

/**
 * O driver de um agente do catálogo ACP (`ACP_AGENTS`): os dados do agente viram o contrato. O
 * transporte (`acp/run.ts`) e o leitor (`acp/reader.ts`) são os mesmos para todos.
 */
export function acpDriver(agent: AcpAgent): ConnectionDriver {
  return {
    tool: agent.id,
    mode: 'acp',
    command: agent.command,
    locate: (pathEnv, homeDir) => resolveCommand(agent.command, pathEnv, homeDir),
    versionArgs: ['--version'],
    docs: agent.docs,
    // o catálogo não traz instalador: a página oficial de cada agente explica
    install: () => [],
    auth: { kind: 'acp-authenticate', terminal: agent.login },
    // o agente não tem comando de status; o login pela tela (`authMethods`) é a história 7
    signedIn: async () => null,
    measure: acpMeasure(agent),
    // o agente ACP fora do catálogo da tela (o do Cursor, o do Kimi Code) tem a linha do protocolo
    enforcement: toolModeEntry(agent.id, 'acp')?.enforcement ?? ACP_ENFORCEMENT,
  };
}
