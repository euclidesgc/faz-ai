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

/** Caracteres que o cmd.exe interpreta, mesmo dentro de aspas, e que precisam de `^` na frente. */
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Um argumento pronto para a linha de comando do cmd.exe, como o `cross-spawn` faz: aspas e barras
 * no padrão do Windows, e os metacaracteres escapados duas vezes, porque o `.cmd` que o npm gera
 * repassa os argumentos (`%*`) para outro comando, que os lê de novo. Quebra de linha não atravessa
 * o cmd.exe de jeito nenhum: vira espaço.
 */
export function cmdArg(arg: string): string {
  const a = arg
    .replace(/\r?\n/g, ' ')
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\*)$/, '$1$1');
  return `"${a}"`.replace(CMD_META, '^$1').replace(CMD_META, '^$1');
}

/**
 * Como iniciar o executável. No Windows, `.cmd` e `.bat` só rodam pelo cmd.exe, que não recebe a
 * lista de argumentos e sim uma linha de texto: sem escape, um prompt com aspas, `&` ou `|` seria
 * cortado ou viraria outro comando. Um `.exe` roda direto, sem shell e sem escape.
 */
export function launchSpec(
  executable: string,
  args: string[],
  platform = process.platform,
): { file: string; args: string[]; shell: boolean } {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(executable)) return { file: executable, args, shell: false };
  return { file: `"${executable}"`.replace(CMD_META, '^$1'), args: args.map(cmdArg), shell: true };
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
  // no Windows as CLIs instaladas pelo npm são .cmd e só rodam pelo shell, com os argumentos escapados
  const launch = launchSpec(executable, command.args);
  const child = spawn(launch.file, launch.args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: launch.shell,
    windowsVerbatimArguments: launch.shell,
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
      // pelo cmd.exe, o processo filho é o shell: matar só ele deixaria a CLI rodando sozinha. Se o
      // taskkill falhar (fora do PATH, acesso negado), sobra encerrar o shell
      if (launch.shell && child.pid) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], (err) => err && child.kill());
      else child.kill('SIGTERM');
      // se a ferramenta ignorar o pedido, encerra à força; e se nem assim o processo fechar (um neto
      // segurando a saída), a execução termina para o board, em vez de ocupar a vaga para sempre
      setTimeout(() => {
        if (exited) return;
        child.kill('SIGKILL');
        setTimeout(() => finish(null, new Error('o processo não encerrou depois de interrompido.')), 5000).unref();
      }, 5000).unref();
    },
  };
}
