import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * A pasta na forma da chave: absoluta e, no Windows, com a letra do drive minúscula, como o VS Code
 * a entrega (`c:\Users\...`). O terminal (`faz-ai`, `process.cwd()`) dá `C:\Users\...`: sem isso,
 * a mesma pasta teria dois boards, dois bancos e dois servidores. No Linux e no macOS o caminho fica
 * como veio, para os boards que já existem continuarem com a mesma chave.
 */
export function canonicalFolder(folderPath: string, platform = process.platform): string {
  if (platform !== 'win32') return path.posix.resolve(folderPath);
  return path.win32.resolve(folderPath).replace(/^([A-Za-z]):/, (_, d: string) => `${d.toLowerCase()}:`);
}

/** Chave do board de uma pasta (a mesma usada no banco). */
export const workspaceKey = (folderPath: string, platform = process.platform): string =>
  createHash('sha1').update(canonicalFolder(folderPath, platform)).digest('hex');

/**
 * Endereço do socket local do servidor MCP de uma pasta. Fica na home (e não em tmpdir) porque o
 * VSCode e o cliente de IA podem rodar com TMPDIR diferentes.
 */
export function socketPath(folderPath: string): string {
  const key = workspaceKey(folderPath).slice(0, 16);
  if (process.platform === 'win32') return `\\\\.\\pipe\\fazai-${key}`;
  return path.join(os.homedir(), '.faz-ai', `${key}.sock`);
}
