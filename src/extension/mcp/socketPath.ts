import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

/** Chave do board de uma pasta (a mesma usada no banco). */
export const workspaceKey = (folderPath: string): string => createHash('sha1').update(folderPath).digest('hex');

/**
 * Endereço do socket local do servidor MCP de uma pasta. Fica na home (e não em tmpdir) porque o
 * VSCode e o cliente de IA podem rodar com TMPDIR diferentes.
 */
export function socketPath(folderPath: string): string {
  const key = workspaceKey(folderPath).slice(0, 16);
  if (process.platform === 'win32') return `\\\\.\\pipe\\fazai-${key}`;
  return path.join(os.homedir(), '.faz-ai', `${key}.sock`);
}
