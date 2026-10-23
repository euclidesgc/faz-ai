#!/usr/bin/env node
// Roteiro do teste real do Gemini nos três modos (história 14 da épica "ferramenta por modo").
//
//   node scripts/gemini-real.mjs                       explica e recusa (não chama nada)
//   node scripts/gemini-real.mjs --sim                 roda CLI, ACP e API (gasta cota)
//   node scripts/gemini-real.mjs --sim --modo api      só um modo (cli, acp ou api)
//   node scripts/gemini-real.mjs --sim --capturar-429 test/fixtures/gemini-api-429-real.json
//                                                      além do teste, captura um 429 real da API
//   FAZAI_REAL_CONFIRM=1 node scripts/gemini-real.mjs  o mesmo que --sim
//
// Sem a confirmação nada é executado: nem o teste, nem a captura, nem o binário `gemini`.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AVISO = `
Teste real do Gemini nos três modos (CLI, ACP e API)

O que acontece com a confirmação:
  - um card mínimo roda pelo caminho do board em cada modo, com o modelo e a chave de VERDADE;
  - GASTA COTA da sua conta do Gemini (poucos milhares de tokens por modo, no modelo barato);
  - CLI: precisa do binário \`gemini\` e de GEMINI_API_KEY; ACP: do binário (a chave é opcional,
    sem ela vale o login da conta); API: de GEMINI_API_KEY. Modo sem o requisito é pulado, com o motivo;
  - FAZAI_REAL_GEMINI_MODEL troca o modelo (padrão gemini-2.5-flash).

Depois de rodar, compare os tokens que o teste imprime (linha JSON "gemini": "<modo>") com o painel
do AI Studio (aistudio.google.com > Dashboard > Usage). Roteiro completo e rótulos:
docs/decisoes/ferramenta-por-modo-14-teste-real-gemini.md
`;

/** Lê os argumentos e o ambiente e diz o que fazer. Pura, para o teste e para a recusa. */
export function decide(argv, env) {
  const confirmed = argv.includes('--sim') || env.FAZAI_REAL_CONFIRM === '1';
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mode = at('--modo');
  if (mode !== undefined && !['cli', 'acp', 'api'].includes(mode)) return { error: `--modo inválido: ${mode} (use cli, acp ou api).` };
  const capture = at('--capturar-429');
  if (argv.includes('--capturar-429') && !capture) return { error: '--capturar-429 pede o arquivo de saída.' };
  return { confirmed, mode, capture };
}

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

/**
 * Captura um corpo 429 de verdade, para trocar os montados da história 12 (test/fixtures/gemini-api-429-*.json):
 * pedidos mínimos (1 token de saída) até a API recusar, no máximo 60. A cota gratuita por minuto do modelo
 * (5 a 15 pedidos) estoura rápido; numa conta paga pode não estourar, e aí o roteiro diz isso e não inventa.
 */
async function capture429(file, env) {
  const model = env.FAZAI_REAL_GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  for (let i = 1; i <= 60; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }], generationConfig: { maxOutputTokens: 1 } }),
    });
    if (res.status === 429) {
      const body = await res.json();
      // o corpo do erro não leva a chave, mas confira antes de versionar
      fs.mkdirSync(path.dirname(path.resolve(root, file)), { recursive: true });
      fs.writeFileSync(path.resolve(root, file), JSON.stringify(body, null, 2) + '\n');
      console.log(`429 capturado no pedido ${i}; corpo gravado em ${file}. Leia o arquivo antes de versionar.`);
      return 0;
    }
    if (res.status !== 200) {
      console.error(`Pedido ${i} falhou com ${res.status} (não é 429): ${(await res.text()).slice(0, 300)}`);
      return 1;
    }
  }
  console.error('A API não recusou em 60 pedidos: a conta não estourou o limite por minuto. Nada foi gravado.');
  return 1;
}

async function main() {
  const decision = decide(process.argv.slice(2), process.env);
  console.log(AVISO);
  if (decision.error) {
    console.error(decision.error);
    return 2;
  }
  if (!decision.confirmed) {
    console.error('Sem confirmação: nada foi executado nem cobrado. Para rodar, passe --sim ou defina FAZAI_REAL_CONFIRM=1.');
    return 2;
  }
  if (decision.capture && !process.env.GEMINI_API_KEY) {
    console.error('--capturar-429 precisa de GEMINI_API_KEY no ambiente.');
    return 2;
  }
  const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
  const args = [vitest, 'run', '--config', 'vitest.cli-real.config.ts', 'test/cli-real/gemini.real.ts'];
  if (decision.mode) args.push('-t', `${decision.mode.toUpperCase()}:`);
  const code = await run(process.execPath, args, { ...process.env, FAZAI_REAL_CONFIRM: '1' });
  const captured = decision.capture ? await capture429(decision.capture, process.env) : 0;
  return code || captured;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
