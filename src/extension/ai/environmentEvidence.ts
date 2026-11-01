// Coletor das fontes gerenciadas que a CLI do Claude lê fora do projeto e do usuário.
// Ausência de arquivo conferida conta como fonte conhecida; erro de leitura deixa o ambiente "unknown".
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export type EnvironmentEvidence = { state: 'complete'; digest: string } | { state: 'unknown' };

/** Pasta das políticas gerenciadas do Claude Code por plataforma. */
export function claudeManagedDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return '/Library/Application Support/ClaudeCode';
  if (platform === 'win32') return path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'ClaudeCode');
  return '/etc/claude-code';
}
const FILES = ['managed-settings.json', 'managed-mcp.json'];

export function collectClaudeEnvironment(dir: string = claudeManagedDir()): EnvironmentEvidence {
  const hash = createHash('sha256');
  try {
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
    // a pasta de drop-ins (managed-settings.d) também altera a política efetiva
    const names = entries.filter((n) => FILES.includes(n) || n === 'managed-settings.d');
    hash.update(`dir:${names.length ? 'present' : 'absent'}\n`);
    for (const name of FILES) {
      const file = path.join(dir, name);
      if (!names.includes(name)) {
        hash.update(`${name}:absent\n`);
        continue;
      }
      hash.update(`${name}:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}\n`);
    }
    if (names.includes('managed-settings.d')) {
      const drop = path.join(dir, 'managed-settings.d');
      for (const n of fs.readdirSync(drop).sort())
        hash.update(
          `d/${n}:${createHash('sha256')
            .update(fs.readFileSync(path.join(drop, n)))
            .digest('hex')}\n`,
        );
    }
    return { state: 'complete', digest: hash.digest('hex') };
  } catch {
    return { state: 'unknown' };
  }
}
