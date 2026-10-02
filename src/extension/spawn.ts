import { execFile, spawn } from 'node:child_process';
import * as os from 'node:os';
import type { HeadlessCommand } from './headless';
import type { RunningProcess } from './runner';

let shellPath: Promise<string | undefined> | undefined;

/**
 * PATH do shell de login da pessoa. O editor aberto pelo Dock não herda o PATH do terminal, e é
 * lá que ficam as CLIs das ferramentas de IA (npm global, Homebrew, ~/.local/bin…).
 */
export function loginShellPath(): Promise<string | undefined> {
  shellPath ??= new Promise((resolve) => {
    if (process.platform === 'win32') return resolve(undefined);
    const shell = process.env.SHELL || os.userInfo().shell || '/bin/sh';
    execFile(shell, ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"'], { timeout: 5000 }, (err, stdout) => {
      resolve(err ? undefined : /__PATH__(.*)__PATH__/s.exec(stdout)?.[1] || undefined);
    });
  });
  return shellPath;
}

/** Inicia a CLI da ferramenta de IA na pasta do projeto. */
export function spawnHeadless(command: HeadlessCommand, cwd: string, log: (text: string) => void, pathEnv: string | undefined): RunningProcess {
  const child = spawn(command.command, command.args, {
    cwd,
    env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}), ...command.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    // no Windows as CLIs instaladas pelo npm são .cmd e só rodam pelo shell
    shell: process.platform === 'win32',
  });
  child.stdout.on('data', (d: Buffer) => log(d.toString()));
  child.stderr.on('data', (d: Buffer) => log(d.toString()));
  child.stdin.on('error', () => {});
  child.stdin.end(command.stdin ?? '');

  let exited = false;
  const listeners: ((code: number | null, error?: Error) => void)[] = [];
  const finish = (code: number | null, error?: Error) => {
    if (exited) return;
    exited = true;
    listeners.forEach((fn) => fn(code, error));
  };
  child.on('error', (e: NodeJS.ErrnoException) => finish(null, e.code === 'ENOENT' ? new Error(`comando "${command.command}" não encontrado. Instale a ferramenta e confira se ela roda no terminal.`) : e));
  child.on('close', (code) => finish(code));

  return {
    onExit: (fn) => listeners.push(fn),
    kill: () => {
      child.kill('SIGTERM');
      // se a ferramenta ignorar o pedido, encerra à força
      setTimeout(() => !exited && child.kill('SIGKILL'), 5000).unref();
    },
  };
}
