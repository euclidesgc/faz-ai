// A consulta curta a uma CLI (status, versão, lista de modelos), num módulo próprio para os drivers de
// conexão (`ai/drivers/`) a usarem sem importar `cliProbe`, que consulta os drivers.
import { execFile } from 'node:child_process';
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
export function runCli(
  file: string,
  args: string[],
  pathEnv: string | undefined,
  timeoutMs = 20_000,
  /** pasta em que o comando roda; os de plugin do Claude Code acham o escopo de projeto por ela */
  cwd?: string,
  options: { env?: Record<string, string>; noShell?: boolean } = {},
): Promise<CliRun> {
  return new Promise((resolve) => {
    // no Windows, uma CLI instalada como .cmd só roda pelo shell, como nas execuções
    if (options.noShell && process.platform === 'win32' && /\.(cmd|bat)$/i.test(file))
      return resolve({ code: null, stdout: '', stderr: '' });
    const launch = options.noShell ? { file, args, shell: false } : launchSpec(file, args);
    execFile(
      launch.file,
      launch.args,
      {
        timeout: timeoutMs,
        ...(cwd ? { cwd } : {}),
        shell: launch.shell,
        windowsVerbatimArguments: launch.shell,
        // no Windows, o shell abriria uma janela do cmd.exe a cada consulta
        windowsHide: true,
        env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}), ...options.env, NO_COLOR: '1', NO_OPEN_BROWSER: '1' },
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number(err.code) : null) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}
