// Script `dist/cursor-hook.js`, chamado pelo Cursor a cada evento: lê o evento do stdin, acha o
// manifesto da pasta de trabalho e responde allow/deny no stdout. Qualquer falha libera.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { decide } from './cursorHook';
import { MANIFEST_DIR_ENV, manifestPath, type CursorManifest } from './cursorManifest';

export const defaultManifestDir = (home = os.homedir()): string => path.join(home, '.faz-ai', 'cursor-manifests');

export function loadManifest(input: unknown, dir: string): CursorManifest | null {
  try {
    const roots = (input as { workspace_roots?: unknown })?.workspace_roots;
    const root = Array.isArray(roots) && typeof roots[0] === 'string' ? roots[0] : undefined;
    if (!root) return null;
    return JSON.parse(fs.readFileSync(manifestPath(dir, root), 'utf8')) as CursorManifest;
  } catch {
    return null;
  }
}

function main(): void {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c: string) => (raw += c));
  process.stdin.on('end', () => {
    let verdict: ReturnType<typeof decide> = { permission: 'allow' };
    try {
      const input: unknown = JSON.parse(raw);
      verdict = decide(input, loadManifest(input, process.env[MANIFEST_DIR_ENV] || defaultManifestDir()));
    } catch {
      // entrada ilegível: liberar
    }
    process.stdout.write(JSON.stringify(verdict));
  });
}

if (require.main === module) main();
