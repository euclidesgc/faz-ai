import type { ModelOption } from '../../../../shared/models';
import { runCli } from '../../../cliRun';
import { CURSOR_BOARD_SERVER } from '../../../mcp/clientConfig';
import { parseCursorModels } from '../../../models';
import { cursorProvider } from '../../providers/cursor';
import { cliDriver, installSteps, jsonStatus, statusField } from '../cli';

const STATUS = ['status', '--format', 'json'];

/** Se a CLI do Cursor está autenticada (`cursor-agent status --format json`); null quando não deu para saber. */
export async function cursorSignedIn(executable: string, pathEnv: string | undefined): Promise<boolean | null> {
  return statusField((await runCli(executable, STATUS, pathEnv)).stdout, 'isAuthenticated');
}

/** Os modelos da conta em uso no Cursor (`cursor-agent models`); vazio sem login ou com erro. */
export async function cursorModels(executable: string, pathEnv: string | undefined): Promise<ModelOption[]> {
  const run = await runCli(executable, ['models'], pathEnv);
  return run.code === 0 ? parseCursorModels(run.stdout) : [];
}

/** Cursor pela CLI (`cursor-agent`): os modelos são os da conta, e só a CLI diz quais são. */
export const cursorCliDriver = cliDriver({
  tool: 'cursor',
  provider: cursorProvider,
  docs: 'https://cursor.com/docs/cli/installation',
  install: {
    unix: installSteps('curl https://cursor.com/install -fsS | bash'),
    windows: installSteps("irm 'https://cursor.com/install?win32=true' | iex"),
  },
  signedIn: jsonStatus(STATUS, 'isAuthenticated'),
  listModels: cursorModels,
  boardServer: CURSOR_BOARD_SERVER,
});
