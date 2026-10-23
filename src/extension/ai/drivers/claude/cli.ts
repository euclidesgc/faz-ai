import { runCli } from '../../../cliRun';
import { claudeProvider } from '../../providers/claude';
import { cliDriver, installSteps, jsonStatus, statusField } from '../cli';

const STATUS = ['auth', 'status'];

/** Se o Claude Code está autenticado (`claude auth status`, JSON com `loggedIn`); null quando não deu para saber. */
export async function claudeSignedIn(executable: string, pathEnv: string | undefined): Promise<boolean | null> {
  return statusField((await runCli(executable, STATUS, pathEnv)).stdout, 'loggedIn');
}

/** Claude Code pela CLI: o único modo dele (o ACP exige cobrança por API, fora da assinatura). */
export const claudeCliDriver = cliDriver({
  tool: 'claude',
  provider: claudeProvider,
  // onde a CLI explica como instalar e os instaladores oficiais (conferidos em 2026-10-13 e 2026-10-11)
  docs: 'https://code.claude.com/docs/en/setup',
  install: {
    unix: installSteps('curl -fsSL https://claude.ai/install.sh | bash'),
    windows: installSteps('irm https://claude.ai/install.ps1 | iex'),
  },
  signedIn: jsonStatus(STATUS, 'loggedIn'),
});
