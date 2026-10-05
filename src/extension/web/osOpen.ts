import { spawn } from 'node:child_process';
import * as path from 'node:path';

function run(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', shell: false });
  child.on('error', () => {});
  child.unref();
}

/** Abre um arquivo, uma pasta ou um endereço com o programa padrão do sistema. */
export function openWithSystem(target: string): void {
  if (process.platform === 'darwin') run('open', [target]);
  // o explorer abre arquivo, pasta e endereço com o programa padrão, sem passar pelo cmd.exe, que
  // leria `&`, `^` e `%` do caminho como comandos
  else if (process.platform === 'win32') run('explorer', [target]);
  else run('xdg-open', [target]);
}

/** Mostra o arquivo no gerenciador de arquivos do sistema. */
export function revealInSystem(file: string): void {
  if (process.platform === 'darwin') run('open', ['-R', file]);
  else if (process.platform === 'win32') run('explorer', [`/select,${file}`]);
  else run('xdg-open', [path.dirname(file)]);
}
