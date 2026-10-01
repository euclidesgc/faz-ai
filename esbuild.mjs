import { build, context } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
};

// sql.js precisa do .wasm ao lado do bundle
mkdirSync('dist', { recursive: true });
cpSync('node_modules/sql.js/dist/sql-wasm.wasm', 'dist/sql-wasm.wasm');

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
