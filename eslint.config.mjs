// Config "flat" do ESLint 9. Sem regras que dependem de type-checking: o lint tem que ser rápido
// o bastante para rodar junto com os testes.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // saídas de build e os scripts de build/release (fora do tsconfig) ficam de fora
  { ignores: ['dist/**', 'node_modules/**', 'releases/**', 'esbuild.mjs', 'scripts/**', '.impeccable/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // o código usa `_nome` para descartar valores de propósito (ex.: desestruturação com rest)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // os testes leem o JSON devolvido pelas ferramentas MCP, que não tem tipo; tipar cada resposta só somaria casts
    files: ['test/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['src/webview/**/*.{ts,tsx}', 'test/**/*.tsx'],
    ...react.configs.flat['jsx-runtime'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
