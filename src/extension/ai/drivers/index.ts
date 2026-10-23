// O registro dos drivers de conexão, por (ferramenta, modo). Entrar com uma ferramenta é escrever
// `drivers/<ferramenta>/<modo>.ts`, registrar aqui e pôr a linha dela em `TOOLS` (`shared/aiTools.ts`);
// `test/drivers.test.ts` confere que todo modo oferecido no catálogo tem driver.
import { toolModeOf, type ToolMode } from '../../../shared/aiTools';
import { isAcpProfile, toolLabel, type AiProfile, type AiProfileConfig } from '../../../shared/aiProfiles';
import { ACP_AGENTS, acpAgent } from '../acp/agents';
import { acpDriver } from './acp';
import { cliExecutor } from './cli';
import { claudeCliDriver } from './claude/cli';
import { cursorCliDriver } from './cursor/cli';
import { geminiAcpDriver } from './gemini/acp';
import { geminiApiDriver } from './gemini/api';
import { kimiCliDriver } from './kimi/cli';
import type { Executor, ToolDriver } from './types';

export type {
  ApiBinding,
  ApiInvocation,
  BindingInvocation,
  ProcessBinding,
  ConnectionDriver,
  DriverAuth,
  Executor,
  ExecutorContext,
  SignInProbe,
  ToolDriver,
} from './types';

const key = (tool: string, mode: ToolMode) => `${tool}/${mode}`;
const DRIVERS = new Map<string, ToolDriver>(
  [
    claudeCliDriver,
    cursorCliDriver,
    kimiCliDriver,
    geminiAcpDriver,
    geminiApiDriver,
    // os demais agentes do catálogo ACP, inclusive os que ainda não são perfil pronto (Cursor e Kimi
    // Code pelo ACP rodam hoje só por um perfil personalizado com `acpAgent`)
    ...ACP_AGENTS.filter((a) => a.id !== geminiAcpDriver.tool).map(acpDriver),
  ].map((d) => [key(d.tool, d.mode), d]),
);

/** O driver de uma ferramenta num modo; undefined quando a extensão não traz esse modo. */
export const driverFor = (tool: string, mode: ToolMode): ToolDriver | undefined => DRIVERS.get(key(tool, mode));

/** Todos os drivers registrados. */
export const allDrivers = (): ToolDriver[] => [...DRIVERS.values()];

/** O driver de um perfil, pela ferramenta e pelo modo dele; undefined na CLI personalizada. */
export function driverOf(profile: Pick<AiProfile, 'kind' | 'tool' | 'mode'> & { config?: AiProfileConfig }): ToolDriver | undefined {
  const tm = toolModeOf(profile);
  return tm ? driverFor(tm.tool, tm.mode) : undefined;
}

/**
 * Quem executa um perfil: o gateway roda por ele e a admissão monta o vínculo com ele. O transporte é o
 * que roda de fato (`isAcpProfile`, a mesma regra de sempre do gateway e da admissão), não só o modo
 * declarado: o agente ACP roda pelo driver do agente do catálogo, e o id desconhecido é recusado, como
 * antes. Na CLI, o driver do perfil quando há (pronta e cópia); a CLI personalizada não tem driver
 * (`toolModeOf` → null) e roda pelo executor genérico de CLI, que é o mesmo que os drivers de CLI usam:
 * o comando e a leitura da saída vêm do provider do perfil.
 */
export function executorOf(profile: AiProfile): Executor {
  // o modo API só roda pelo driver dele (o Gemini desde a história 10): sem driver (uma ferramenta que ainda
  // não traz o laço, ou o perfil veio de uma versão mais nova), recusa com a causa, em vez de cair no
  // executor de CLI ou no agente ACP
  if (profile.mode === 'api') {
    const driver = driverOf(profile);
    if (driver?.transport !== 'api') throw new Error(`O modo API de ${toolLabel(profile.tool)} ainda não roda nesta versão da extensão.`);
    return driver;
  }
  if (isAcpProfile(profile)) {
    const agent = acpAgent(String(profile.config.acpAgent));
    const driver = agent && driverFor(agent.id, 'acp');
    if (!driver) throw new Error(`Agente ACP desconhecido: ${String(profile.config.acpAgent)}.`);
    return driver;
  }
  const driver = driverOf(profile);
  return driver?.transport === 'cli' ? driver : cliExecutor;
}
