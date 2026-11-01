// Gera o bundle de evals/cli.ts em evals/.build/eval.cjs (fora do dist/, para não entrar no VSIX) e o executa.
/* global process */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'evals', '.build', 'eval.cjs');

await build({
  absWorkingDir: root,
  entryPoints: ['evals/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile,
  external: ['vscode'],
  sourcemap: false,
  logLevel: 'warning',
});

const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
