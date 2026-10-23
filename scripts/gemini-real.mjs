#!/usr/bin/env node
// Roteiro do teste real do Gemini nos três modos (história 14 da épica "ferramenta por modo").
//
//   node scripts/gemini-real.mjs                       explica e recusa (não chama nada)
//   node scripts/gemini-real.mjs --sim                 roda CLI, ACP e API (gasta cota)
//   node scripts/gemini-real.mjs --sim --modo api      só um modo (cli, acp ou api); pular é falha
//   node scripts/gemini-real.mjs --sim --capturar-429 test/fixtures/gemini-api-429-real.json
//                                                      o teste e, se passar, a captura de um 429 real
//   node scripts/gemini-real.mjs --sim --so-capturar --capturar-429 <arquivo>   só a captura
//   ... --forcar                                       deixa a captura sobrescrever o arquivo
//   FAZAI_REAL_CONFIRM=1 node scripts/gemini-real.mjs  o mesmo que --sim
//
// Sem a confirmação nada é executado: nem o teste, nem a captura, nem o binário `gemini`. Só este roteiro liga o
// teste (pela variável FAZAI_REAL_CONFIRMED_BY_SCRIPT): exportar FAZAI_REAL_CONFIRM no shell não faz o
// `npm run test:cli-real` gastar cota.
//
// Códigos de saída: 0 tudo passou; 1 falha, ou algum modo pedido foi pulado; 2 recusa (sem confirmação ou
// argumento inválido).
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODES = ['cli', 'acp', 'api'];

const AVISO = `
Teste real do Gemini nos três modos (CLI, ACP e API)

O que acontece com a confirmação:
  - um card mínimo roda pelo caminho do board em cada modo, com o modelo e a chave de VERDADE;
  - GASTA COTA da sua conta do Gemini (poucos milhares de tokens por modo, no modelo barato);
  - CLI: precisa do binário \`gemini\` e de GEMINI_API_KEY; API: de GEMINI_API_KEY; ACP: do binário;
  - sem o requisito o modo é pulado, e PULAR É FALHA aqui (código de saída 1): o roteiro só termina
    com 0 se todos os modos pedidos passaram;
  - FAZAI_REAL_GEMINI_MODEL troca o modelo (padrão gemini-2.5-flash).

ATENÇÃO, ACP sem GEMINI_API_KEY (login OAuth): o Gemini roda com a sua home REAL (~/.gemini). Ele lê e
pode ALTERAR essa pasta (credenciais renovadas, histórico), e carrega as suas settings, GEMINI.md e
extensões, o que pode gerar desvio na conferência. Não se confere vazamento do token OAuth. Com a chave, o
ACP usa uma home temporária vazia.

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
  if (argv.includes('--modo') && !MODES.includes(mode ?? '')) return { error: `--modo inválido: ${mode} (use cli, acp ou api).` };
  const capture = at('--capturar-429');
  if (argv.includes('--capturar-429') && (!capture || capture.startsWith('-')))
    return { error: '--capturar-429 pede o arquivo de saída (um valor que não comece com "-").' };
  const onlyCapture = argv.includes('--so-capturar');
  if (onlyCapture && !capture) return { error: '--so-capturar pede --capturar-429 <arquivo>.' };
  if (onlyCapture && mode) return { error: '--so-capturar não combina com --modo.' };
  return { confirmed, mode, capture, onlyCapture, force: argv.includes('--forcar') };
}

/** Os modos pedidos que não passaram, a partir do JSON do vitest. Pura. */
export function unmet(report, modes) {
  const results = (report.testResults ?? []).flatMap((f) => f.assertionResults ?? []);
  return modes.flatMap((m) => {
    const found = results.filter((r) => (r.title ?? '').startsWith(`${m.toUpperCase()}:`));
    const status = found.length === 1 ? found[0].status : 'ausente';
    return status === 'passed' ? [] : [{ mode: m, status: status === 'pending' || status === 'skipped' ? 'pulado' : status }];
  });
}

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

/** Roda o teste real e devolve 0 só se todos os modos pedidos passaram (nenhum pulado). */
async function runTest(mode) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-gemini-real-')), 'resultado.json');
  const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
  const args = [vitest, 'run', '--config', 'vitest.cli-real.config.ts', 'test/cli-real/gemini.real.ts'];
  args.push('--reporter=default', '--reporter=json', `--outputFile.json=${out}`);
  if (mode) args.push('-t', `${mode.toUpperCase()}:`);
  const code = await run(process.execPath, args, { ...process.env, FAZAI_REAL_CONFIRMED_BY_SCRIPT: '1' });
  let report;
  try {
    report = JSON.parse(fs.readFileSync(out, 'utf8'));
  } catch {
    console.error('Não consegui ler o resultado do vitest; tratando como falha.');
    return 1;
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
  const missed = unmet(report, mode ? [mode] : MODES);
  for (const m of missed) console.error(`Modo ${m.mode.toUpperCase()}: ${m.status}. Pedido e não passou: isto é falha.`);
  return code || (missed.length ? 1 : 0);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Captura um corpo 429 de verdade, para trocar os montados da história 12 (test/fixtures/gemini-api-429-*.json):
 * pedidos mínimos (1 token de saída) até a API recusar, no máximo 60, com pausa curta e tempo limite em cada um.
 * A cota gratuita por minuto do modelo (5 a 15 pedidos) estoura rápido; numa conta paga pode não estourar, e aí o
 * roteiro diz isso e não inventa. Não sobrescreve arquivo existente sem --forcar, e falha se o corpo ou o erro
 * contiver a chave.
 */
export async function capture429(file, env, force = false) {
  const key = env.GEMINI_API_KEY;
  const target = path.resolve(root, file);
  if (!force && fs.existsSync(target)) {
    console.error(`${file} já existe; use --forcar para sobrescrever. Nada foi chamado.`);
    return 1;
  }
  const model = env.FAZAI_REAL_GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  for (let i = 1; i <= 60; i++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }], generationConfig: { maxOutputTokens: 1 } }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      const msg = String(e?.message ?? e);
      console.error(`Pedido ${i} falhou: ${msg.includes(key) ? '[mensagem omitida: continha a chave]' : msg}`);
      return 1;
    }
    const text = await res.text();
    if (text.includes(key)) {
      console.error(`O corpo do pedido ${i} contém a chave; nada foi gravado nem impresso. Revogue a chave.`);
      return 1;
    }
    if (res.status === 429) {
      try {
        // 'wx': nunca sobrescreve sem --forcar, nem numa corrida entre dois roteiros
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(JSON.parse(text), null, 2) + '\n', { flag: force ? 'w' : 'wx' });
      } catch (e) {
        console.error(`Não gravei ${file}: ${String(e?.message ?? e).replaceAll(key, '[chave]')}`);
        return 1;
      }
      console.log(`429 capturado no pedido ${i}; corpo gravado em ${file}. Leia o arquivo antes de versionar.`);
      return 0;
    }
    if (res.status !== 200) {
      console.error(`Pedido ${i} falhou com ${res.status} (não é 429): ${text.slice(0, 300)}`);
      return 1;
    }
    await pause(250);
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
  if (!decision.onlyCapture) {
    const code = await runTest(decision.mode);
    // a captura não roda se o teste falhou (ou se um modo pedido foi pulado)
    if (code) {
      if (decision.capture) console.error('A captura do 429 não rodou porque o teste não passou.');
      return code;
    }
  }
  return decision.capture ? capture429(decision.capture, process.env, decision.force) : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
