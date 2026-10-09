import { execFile } from 'node:child_process';
import type { ModelOption } from '../shared/models';
import { parseCursorModels } from './models';
import { launchSpec } from './spawn';

export interface CliRun {
  /** código de saída; null quando o processo nem rodou ou passou do tempo */
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Roda um comando curto de consulta de uma CLI (status, lista de modelos) e devolve a saída. Nunca
 * rejeita: uma CLI que falha, some ou trava vira `code: null`, e quem chama trata como "não deu
 * para saber", não como erro do board.
 */
export function runCli(file: string, args: string[], pathEnv: string | undefined, timeoutMs = 20_000): Promise<CliRun> {
  return new Promise((resolve) => {
    // no Windows, uma CLI instalada como .cmd só roda pelo shell, como nas execuções
    const launch = launchSpec(file, args);
    execFile(
      launch.file,
      launch.args,
      {
        timeout: timeoutMs,
        shell: launch.shell,
        windowsVerbatimArguments: launch.shell,
        // no Windows, o shell abriria uma janela do cmd.exe a cada consulta
        windowsHide: true,
        env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}), NO_COLOR: '1', NO_OPEN_BROWSER: '1' },
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number(err.code) : null) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Se a CLI do Cursor está autenticada (`cursor-agent status --format json`); null quando não deu para saber. */
export async function cursorSignedIn(executable: string, pathEnv: string | undefined): Promise<boolean | null> {
  const run = await runCli(executable, ['status', '--format', 'json'], pathEnv);
  try {
    const v = JSON.parse(run.stdout) as { isAuthenticated?: unknown };
    return typeof v.isAuthenticated === 'boolean' ? v.isAuthenticated : null;
  } catch {
    return null;
  }
}

/** Se o Claude Code está autenticado (`claude auth status`, JSON com `loggedIn`); null quando não deu para saber. */
export async function claudeSignedIn(executable: string, pathEnv: string | undefined): Promise<boolean | null> {
  const run = await runCli(executable, ['auth', 'status'], pathEnv);
  try {
    const v = JSON.parse(run.stdout) as { loggedIn?: unknown };
    return typeof v.loggedIn === 'boolean' ? v.loggedIn : null;
  } catch {
    return null;
  }
}

/** Os modelos da conta em uso no Cursor (`cursor-agent models`); vazio sem login ou com erro. */
export async function cursorModels(executable: string, pathEnv: string | undefined): Promise<ModelOption[]> {
  const run = await runCli(executable, ['models'], pathEnv);
  return run.code === 0 ? parseCursorModels(run.stdout) : [];
}
