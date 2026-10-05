import { execFile, spawn } from 'node:child_process';
import * as os from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import type { OutputStream } from './aiOutput/reader';
import type { HeadlessCommand } from './headless';
import type { RunningProcess } from './runner';
import { commandNotFound, resolveCommand } from './cliResolve';

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

/**
 * Inicia a CLI da ferramenta de IA na pasta do projeto.
 *
 * `out` recebe de qual canal o pedaço veio. Os dois canais ficam separados de propósito: no modo de
 * saída estruturada o `stderr` é texto de gente (um aviso, um pedido de atualização) e, se entrasse
 * no interpretador de JSONL, inventaria "saída estruturada quebrada" em toda execução que escreve
 * um aviso.
 */
export function spawnHeadless(
  command: HeadlessCommand,
  cwd: string,
  out: (text: string, stream: OutputStream) => void,
  pathEnv: string | undefined,
): RunningProcess {
  // quem só usa a extensão da ferramenta no editor não tem a CLI no PATH: procura também onde ela costuma ficar
  const executable = resolveCommand(command.command, pathEnv, os.homedir());
  if (!executable) throw new Error(commandNotFound(command.command));
  // um editor aberto de dentro de uma sessão do Claude Code herda as variáveis dela; a execução do board é uma sessão própria
  const env: NodeJS.ProcessEnv = { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}), ...command.env };
  for (const name of [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_HOST_SESSION_ID',
    'CLAUDE_CODE_MESSAGING_SOCKET',
    'CLAUDE_CODE_MESSAGING_TOKEN',
  ])
    delete env[name];
  const child = spawn(executable, command.args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    // no Windows as CLIs instaladas pelo npm são .cmd e só rodam pelo shell
    shell: process.platform === 'win32',
  });
  // um decodificador por canal: o pipe corta onde quiser, inclusive no meio de um caractere acentuado,
  // e `Buffer.toString()` em cada pedaço trocaria as duas metades por `\uFFFD`. O decodificador guarda
  // a metade até o próximo pedaço; o `end` devolve o que sobrou quando o canal fecha.
  for (const stream of ['stdout', 'stderr'] as const) {
    const decoder = new StringDecoder('utf8');
    const channel = child[stream];
    channel.on('data', (d: Buffer) => {
      const text = decoder.write(d);
      if (text) out(text, stream);
    });
    channel.on('end', () => {
      const rest = decoder.end();
      if (rest) out(rest, stream);
    });
  }
  child.stdin.on('error', () => {});
  child.stdin.end(command.stdin ?? '');

  let exited = false;
  const listeners: ((code: number | null, error?: Error) => void)[] = [];
  const finish = (code: number | null, error?: Error) => {
    if (exited) return;
    exited = true;
    listeners.forEach((fn) => fn(code, error));
  };
  child.on('error', (e: NodeJS.ErrnoException) => finish(null, e.code === 'ENOENT' ? new Error(commandNotFound(command.command)) : e));
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
