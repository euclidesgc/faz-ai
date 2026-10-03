import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';

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

// ponte stdio usada pelos clientes de IA para falar com o servidor MCP da extensão
const bridge = { ...options, entryPoints: ['src/mcp-bridge/bridge.ts'], outfile: 'dist/mcp-bridge.js', external: [], sourcemap: false };

// board fora do editor: `node dist/cli.js [pasta]` serve o board no navegador
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const cli = {
  ...options,
  entryPoints: ['src/cli/cli.ts'],
  outfile: 'dist/cli.js',
  external: [],
  sourcemap: false,
  define: { FAZAI_VERSION: JSON.stringify(version) },
  banner: { js: '#!/usr/bin/env node' },
};

if (watch) {
  for (const o of [options, bridge, cli]) await (await context(o)).watch();
} else {
  await Promise.all([build(options), build(bridge), build(cli)]);
}
