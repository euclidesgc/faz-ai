// O registro dos drivers de conexão, por (ferramenta, modo). Entrar com uma ferramenta é escrever
// `drivers/<ferramenta>/<modo>.ts`, registrar aqui e pôr a linha dela em `TOOLS` (`shared/aiTools.ts`);
// `test/drivers.test.ts` confere que todo modo oferecido no catálogo tem driver.
import { toolModeOf, type ToolMode } from '../../../shared/aiTools';
import type { AiProfile, AiProfileConfig } from '../../../shared/aiProfiles';
import { ACP_AGENTS } from '../acp/agents';
import { acpDriver } from './acp';
import { claudeCliDriver } from './claude/cli';
import { cursorCliDriver } from './cursor/cli';
import { geminiAcpDriver } from './gemini/acp';
import { kimiCliDriver } from './kimi/cli';
import type { ConnectionDriver } from './types';

export type { ConnectionDriver, DriverAuth, SignInProbe } from './types';

const key = (tool: string, mode: ToolMode) => `${tool}/${mode}`;
const DRIVERS = new Map<string, ConnectionDriver>(
  [
    claudeCliDriver,
    cursorCliDriver,
    kimiCliDriver,
    geminiAcpDriver,
    // os demais agentes do catálogo ACP, inclusive os que ainda não são perfil pronto (Cursor e Kimi
    // Code pelo ACP rodam hoje só por um perfil personalizado com `acpAgent`)
    ...ACP_AGENTS.filter((a) => a.id !== geminiAcpDriver.tool).map(acpDriver),
  ].map((d) => [key(d.tool, d.mode), d]),
);

/** O driver de uma ferramenta num modo; undefined quando a extensão não traz esse modo. */
export const driverFor = (tool: string, mode: ToolMode): ConnectionDriver | undefined => DRIVERS.get(key(tool, mode));

/** Todos os drivers registrados. */
export const allDrivers = (): ConnectionDriver[] => [...DRIVERS.values()];

/** O driver de um perfil, pela ferramenta e pelo modo dele; undefined na CLI personalizada. */
export function driverOf(profile: Pick<AiProfile, 'kind' | 'tool' | 'mode'> & { config?: AiProfileConfig }): ConnectionDriver | undefined {
  const tm = toolModeOf(profile);
  return tm ? driverFor(tm.tool, tm.mode) : undefined;
}
