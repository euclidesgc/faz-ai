import { toolModeEntry } from '../../../shared/aiTools';
import type { InstallStep } from '../../../shared/environment';
import type { AiBase } from '../../../shared/aiProfiles';
import { CLI_COMMAND, LOGIN_COMMAND } from '../../../shared/requirements';
import { resolveCommand } from '../../cliResolve';
import { spawnMeasured } from '../../aiOutput/measured';
import { headlessCommand } from '../../headless';
import type { AiProvider } from '../provider';
import type { ConnectionDriver, Executor, SignInProbe, ToolDriver } from './types';

/**
 * A execução de uma CLI de uma passada. É a mesma para toda CLI, inclusive a personalizada: o comando, os
 * argumentos e o leitor da saída vêm do provider do perfil (`providerFor`, pela base e pelo cofre), e a
 * medição é a de `spawnMeasured`. Por isso a CLI personalizada, que não tem driver de conexão
 * (`toolModeOf` → null), roda por este mesmo executor (`executorOf`).
 */
export const cliExecutor: Executor = {
  transport: 'cli',
  run: (input, ctx) =>
    spawnMeasured(ctx.profile, input, ctx.cwd, {
      spawn: ctx.spawn,
      log: ctx.log,
      runId: ctx.runId,
      leaseCoordinationDir: ctx.leaseCoordinationDir,
      execManifest: ctx.execManifest,
    }),
  // o vínculo é o comando inteiro, com a saída estruturada (a volta para texto não muda o que a CLI
  // carrega); onde a permissão muda a linha de comando (perfil personalizado), ela entra por aqui
  bindingContext: (input, { profile }) => {
    const command = headlessCommand(profile, { ...input, structured: true });
    return { invocation: command, command: command.command, pathEnv: command.env?.PATH, lookup: command.lookup, env: command.env };
  },
};

/** Os comandos de instalação, um por linha, conforme o site oficial de cada CLI. */
export const installSteps = (...commands: string[]): InstallStep[] => commands.map((command) => ({ command }));

/**
 * O driver de uma CLI pronta: envolve o provider dela (o que a execução usa) e completa com o que só a
 * conexão precisa. O comando e o login vêm de `CLI_COMMAND` e `LOGIN_COMMAND`, que a webview também lê.
 */
export function cliDriver(o: {
  tool: AiBase;
  provider: AiProvider;
  docs: string;
  install: Record<'unix' | 'windows', InstallStep[]>;
  signedIn(probe: SignInProbe): Promise<boolean | null>;
  listModels?: ConnectionDriver['listModels'];
}): ToolDriver {
  const command = CLI_COMMAND[o.tool];
  return {
    tool: o.tool,
    mode: 'cli',
    command,
    locate: (pathEnv, homeDir) => resolveCommand(command, pathEnv, homeDir),
    versionArgs: ['--version'],
    docs: o.docs,
    install: (platform) => o.install[platform],
    auth: { kind: 'login-command', command: LOGIN_COMMAND[o.tool] },
    signedIn: o.signedIn,
    ...(o.listModels ? { listModels: o.listModels } : {}),
    measure: o.provider.measure,
    enforcement: toolModeEntry(o.tool, 'cli')!.enforcement,
    ...cliExecutor,
  };
}

/** O campo booleano de um JSON de status; null quando a saída não diz. */
export function statusField(stdout: string, field: string): boolean | null {
  try {
    const value = (JSON.parse(stdout) as Record<string, unknown>)[field];
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

/** A sonda de login por um comando de status em JSON: sem resposta, não dá para saber. */
export const jsonStatus =
  (args: string[], field: string) =>
  async (probe: SignInProbe): Promise<boolean | null> => {
    const run = await probe.query(args);
    return run.code === null ? null : statusField(run.stdout, field);
  };
