import * as path from 'node:path';

/**
 * O caminho na forma de comparar: absoluto, com `/` e, onde o sistema de arquivos não diferencia
 * maiúsculas (Windows e, por padrão, macOS), em minúsculas. O VS Code dá `c:\Users\...`, o Node dá
 * `C:\Users\...`, o git e o Claude Code gravam `C:/Users/...`: é a mesma pasta.
 */
export function pathKey(p: string, platform = process.platform): string {
  const resolved = (platform === 'win32' ? path.win32 : path.posix).resolve(p).replace(/\\/g, '/');
  const trimmed = resolved.length > 1 ? resolved.replace(/\/+$/, '') : resolved;
  return platform === 'win32' || platform === 'darwin' ? trimmed.toLowerCase() : trimmed;
}

/** Se os dois caminhos são a mesma pasta ou o mesmo arquivo (ver `pathKey`). */
export function samePath(a: string, b: string, platform = process.platform): boolean {
  return pathKey(a, platform) === pathKey(b, platform);
}

/** O valor de um objeto indexado por caminho (`projects` do ~/.claude.json), com a chave em qualquer forma. */
export function byPath<T>(record: Record<string, T> | undefined, p: string): T | undefined {
  if (!record) return undefined;
  if (p in record) return record[p];
  const key = Object.keys(record).find((k) => samePath(k, p));
  return key === undefined ? undefined : record[key];
}
