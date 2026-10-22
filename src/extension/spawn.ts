import { execFile, spawn } from 'node:child_process';
import * as os from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import type { OutputStream } from './aiOutput/reader';
import type { HeadlessCommand } from './headless';
import type { RunningProcess } from './runner';
import type { AcpProcess } from './ai/acp/provider';
import { commandNotFound, resolveCommand } from './cliResolve';
import { randomUUID } from 'node:crypto';
import { processBirth, processGroupState, SpawnNotStartedError, type SpawnControl, type ProcessIdentity } from './processIdentity';
import { SPAWN_GATE } from './spawnGate';

let shellPath: Promise<string | undefined> | undefined;

/**
 * PATH do shell de login da pessoa. O editor aberto pelo Dock não herda o PATH do terminal, e é
 * lá que ficam as CLIs das ferramentas de IA (npm global, Homebrew, ~/.local/bin…).
 */
export function loginShellPath(fresh = false): Promise<string | undefined> {
  // `fresh` lê de novo: a pessoa instalou alguma coisa que mudou o PATH com o editor aberto
  if (fresh) shellPath = undefined;
  shellPath ??= new Promise((resolve) => {
    if (process.platform === 'win32') return resolve(undefined);
    const shell = process.env.SHELL || os.userInfo().shell || '/bin/sh';
    // um shell interativo com nvm, conda ou oh-my-zsh pode levar vários segundos para abrir. O PATH vale
    // mesmo que o shell termine com erro depois de imprimi-lo (um .zshrc que falha no fim)
    execFile(shell, ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"'], { timeout: 10_000 }, (_err, stdout) => {
      resolve(/__PATH__(.*)__PATH__/s.exec(String(stdout ?? ''))?.[1] || undefined);
    });
  });
  // sem PATH (o shell travou ou não aceita -ilc), a próxima chamada tenta de novo
  const current = shellPath;
  void current.then((p) => {
    if (!p && shellPath === current) shellPath = undefined;
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
  control?: SpawnControl,
  opts: { stdin?: 'close' | 'open' } = {},
): RunningProcess & Partial<AcpProcess> {
  const open = opts.stdin === 'open';
  // quem só usa a extensão da ferramenta no editor não tem a CLI no PATH: procura também onde ela costuma ficar
  const executable = resolveCommand(command.command, command.env?.PATH ?? pathEnv, os.homedir(), command.lookup);
  if (!executable) throw new SpawnNotStartedError(commandNotFound(command.command));
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
  if (command.noShell && process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable))
    throw new SpawnNotStartedError('O perfil precisa de executável direto, sem shell.');
  const launch = command.noShell ? { file: executable, args: command.args, shell: false } : launchSpec(executable, command.args);
  try {
    control?.beforePreparation();
  } catch (e) {
    throw new SpawnNotStartedError('Não foi possível preparar a identidade da execução.', e);
  }
  const launcherEnv: NodeJS.ProcessEnv = { ...env };
  // No Windows, as variáveis são case-insensitive; nenhuma variante pode carregar código antes do WAL.
  for (const key of Object.keys(launcherEnv))
    if (['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE'].includes(key.toUpperCase())) delete launcherEnv[key];
  launcherEnv.ELECTRON_RUN_AS_NODE = '1';
  const child = (() => {
    try {
      return spawn(control ? process.execPath : launch.file, control ? ['-e', SPAWN_GATE] : launch.args, {
        cwd,
        env: control ? launcherEnv : env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: control ? false : launch.shell,
        windowsVerbatimArguments: control ? false : launch.shell,
        // no Windows, o shell abriria uma janela do cmd.exe a cada execução
        windowsHide: true,
        // fora do Windows, um grupo de processos próprio: Parar encerra a CLI e tudo o que ela iniciou
        // (servidores MCP, testes, comandos do terminal), e não só o processo direto
        detached: process.platform !== 'win32',
      });
    } catch (e) {
      throw new SpawnNotStartedError('Não foi possível criar o processo da ferramenta de IA.', e);
    }
  })();
  child.once('error', () => {});
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
  let identity: ProcessIdentity | undefined;
  let cancelled = false;
  let startError: Error | undefined;
  let exited = false;
  let directClosed = false;
  const listeners: ((code: number | null, error?: Error) => void)[] = [];
  const finish = (code: number | null, error?: Error) => {
    if (exited) return;
    exited = true;
    listeners.forEach((fn) => fn(code, error));
  };
  child.on('error', (e: NodeJS.ErrnoException) => finish(null, e.code === 'ENOENT' ? new Error(commandNotFound(command.command)) : e));
  child.on('close', (code) => {
    directClosed = true;
    finish(code, startError);
  });
  if (control && child.pid) {
    identity = {
      pid: child.pid,
      birth: processBirth(child.pid),
      platform: process.platform,
      groupId: process.platform === 'win32' ? null : child.pid,
      generation: randomUUID(),
    };
    const release = () => {
      // Parar ou queda do launcher durante o flush não pode liberar uma CLI atrasada.
      if (cancelled || exited || child.stdin.destroyed) return;
      const description = JSON.stringify({ version: 1, ...launch, cwd, env, stdin: command.stdin ?? '', stdinOpen: open });
      // entrada aberta: a descrição termina na primeira quebra de linha e o pipe segue para o agente
      if (open) child.stdin.write(description + '\n');
      else child.stdin.end(description);
    };
    try {
      const ready = control.beforeStart(identity);
      if (ready) {
        void ready.then(release).catch((e: unknown) => {
          startError = new SpawnNotStartedError('Não foi possível registrar a identidade da execução antes de iniciar a IA.', e);
          child.stdin.destroy();
          child.kill('SIGKILL');
        });
      } else release();
    } catch (e) {
      // Nenhuma descrição foi enviada ao launcher: a CLI não chegou a existir.
      child.stdin.destroy();
      child.kill('SIGKILL');
      throw new SpawnNotStartedError('Não foi possível registrar a identidade da execução antes de iniciar a IA.', e);
    }
  } else if (!open) child.stdin.end(control ? '' : (command.stdin ?? ''));
  else if (command.stdin) child.stdin.write(command.stdin);

  return {
    ...(open
      ? {
          write: (text: string) => {
            if (!child.stdin.destroyed && child.stdin.writable) child.stdin.write(text);
          },
          end: () => {
            if (!child.stdin.destroyed) child.stdin.end();
          },
        }
      : {}),
    identity,
    terminationConfirmed: () => {
      if (identity && directClosed) return processGroupState(identity) === 'dead';
      if (!child.pid) return true;
      if (!directClosed || process.platform === 'win32') return false;
      try {
        process.kill(-child.pid, 0);
        return false;
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'ESRCH';
      }
    },
    onExit: (fn) => listeners.push(fn),
    kill: () => {
      cancelled = true;
      // a árvore inteira: no Windows pelo taskkill (pelo cmd.exe, o filho direto é só o shell), e nos
      // outros pelo grupo de processos. Se o taskkill falhar (fora do PATH, acesso negado), sobra o filho
      const signal = (sig: NodeJS.Signals) => {
        try {
          if (child.pid && process.platform !== 'win32') return void process.kill(-child.pid, sig);
        } catch {
          /* o grupo já acabou: vale o filho */
        }
        child.kill(sig);
      };
      if (process.platform === 'win32' && child.pid)
        execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], (err) => err && child.kill());
      else signal('SIGTERM');
      // se a ferramenta ignorar o pedido, encerra à força; e se nem assim o processo fechar (um neto
      // segurando a saída), a execução termina para o board, em vez de ocupar a vaga para sempre
      setTimeout(() => {
        if (exited) return;
        signal('SIGKILL');
        setTimeout(() => finish(null, new Error('o processo não encerrou depois de interrompido.')), 5000).unref();
      }, 5000).unref();
    },
  };
}

/** Inicia o agente ACP: o mesmo processo de `spawnHeadless`, com a entrada aberta a sessão inteira. */
export function spawnAcpProcess(
  command: HeadlessCommand,
  cwd: string,
  out: (text: string, stream: OutputStream) => void,
  pathEnv: string | undefined,
  control?: SpawnControl,
): AcpProcess {
  return spawnHeadless(command, cwd, out, pathEnv, control, { stdin: 'open' }) as AcpProcess;
}
