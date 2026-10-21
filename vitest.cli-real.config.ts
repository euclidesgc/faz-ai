import { defineConfig } from 'vitest/config';

// Separado de npm test: ausência de CLI é falha explícita, nunca teste verde por pulo.
export default defineConfig({
  test: {
    include: ['test/cli-real/*.real.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 30_000,
  },
});
