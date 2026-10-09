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
 * Onde fica a ponte (`bridge.js`) que as ferramentas de IA iniciam. Na home e não na pasta de dados
 * do editor: o VS Code e o Cursor têm pastas diferentes, e o registro global que um deles gravasse
 * apontaria para uma cópia que o outro não atualiza. A mesma ponte serve aos dois e ao `faz-ai`.
 */
export const stableBridgePath = (homeDir = os.homedir()): string => path.join(homeDir, '.faz-ai', 'mcp', 'bridge.js');

/** Nome do usuário do sistema, ou '' quando não dá para saber (contas sem perfil, contêineres). */
function userName(): string {
  try {
    return os.userInfo().username || process.env.USERNAME || process.env.USER || '';
  } catch {
    return process.env.USERNAME || process.env.USER || '';
  }
}

/**
 * Endereço do socket local do servidor MCP de uma pasta. Fica na home (e não em tmpdir) porque o
 * VSCode e o cliente de IA podem rodar com TMPDIR diferentes. No Windows, o named pipe é global na
 * máquina e sem ACL: o nome leva o usuário, para dois usuários com a mesma pasta não disputarem o
 * mesmo pipe.
 */
export function socketPath(folderPath: string, platform = process.platform, user = userName()): string {
  const key = workspaceKey(folderPath, platform).slice(0, 16);
  if (platform === 'win32') {
    const who = user.replace(/[^A-Za-z0-9_.-]/g, '_');
    return `\\\\.\\pipe\\fazai-${who ? `${who}-` : ''}${key}`;
  }
  return path.join(os.homedir(), '.faz-ai', `${key}.sock`);
}
