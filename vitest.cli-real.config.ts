import { defineConfig } from 'vitest/config';

// Separado de npm test: ausência de CLI é falha explícita, nunca teste verde por pulo. A exceção é o
// `gemini.real.ts`: ele cobra cota da conta, então sem a confirmação do roteiro `scripts/gemini-real.mjs`
// (variável FAZAI_REAL_CONFIRMED_BY_SCRIPT, que só o roteiro define) cada modo PULA com o motivo. Quem exige que
// nenhum modo seja pulado é o roteiro, que lê o resultado em JSON e sai com código 1.
export default defineConfig({
  test: {
    include: ['test/cli-real/*.real.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 30_000,
    // o worker sai quando o Vitest principal cai, em vez de ficar órfão rodando testes
    setupFiles: ['test/workerParent.ts'],
  },
});
