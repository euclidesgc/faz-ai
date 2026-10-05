import * as path from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  // a API do editor só existe dentro dele: os testes usam um editor de mentira
  resolve: { alias: { vscode: path.resolve(__dirname, 'test/fakes/vscode.ts') } },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    // só os testes de interação (cliques, teclado) precisam de DOM; o resto segue em node, mais rápido
    environmentMatchGlobs: [['test/ui/**', 'jsdom']],
    // os testes de interação digitam tecla a tecla: com a suíte inteira disputando o processador, os
    // 5 s padrão estouravam em testes que passam sozinhos em 1 s
    testTimeout: 20_000,
  },
});
