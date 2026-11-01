// `npm run validate`: a conferência antes de dar uma história como concluída ou abrir/mergear o PR.
// Roda, em ordem e parando no primeiro erro: typecheck; eslint e prettier nos arquivos alterados contra a
// base (diff + não rastreados); os testes que importam os arquivos alterados (`vitest related`); e os
// cenários de ponta a ponta do card (`test/scenarios`), que pegam a quebra entre as peças que os testes
// isolados não pegam (#364). Não é a suíte inteira (`npm test`), que fica para o release.
//
// Uso: `npm run validate` (base `origin/develop`) ou `npm run validate -- --base <ref>`.
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

const argBase = process.argv.indexOf('--base');
const BASE = argBase >= 0 ? process.argv[argBase + 1] : 'origin/develop';
const WIN = process.platform === 'win32';

/** O que o eslint e o prettier deste repositório cobrem (o resto o prettier ignora pelo `--ignore-unknown`). */
const LINTED = /\.(ts|tsx|js|mjs|cjs)$/;
const FORMATTED = /\.(ts|tsx|js|mjs|cjs|json|css|html|md|ya?ml)$/;
/** Os arquivos que o `vitest related` sabe ligar aos testes. */
const RELATED = /^(src|test)\/.*\.(ts|tsx)$/;

/**
 * Testes que uma mudança em certa pasta liga sem importar o código dela: as histórias de referência da avaliação
 * (`evals/`) são dados lidos em tempo de execução, e só a prova do conjunto os confere (#1233).
 */
const EXTRA_TESTS = [{ prefix: 'evals/', test: 'test/evals/referenceSet.test.ts' }];

const results = [];

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function summary(failed) {
  console.log('\n== Resumo do validate ==');
  for (const r of results) console.log(`${r.status.padEnd(8)} ${r.name}${r.note ? ` (${r.note})` : ''}`);
  console.log(failed ? `\nFalhou em: ${failed}. Corrija e rode de novo.` : '\nTudo certo.');
}

/** O passo em curso: o sinal que encerra o validate encerra também o grupo dele (ver `forward`). */
let running = null;

/**
 * Quem roda o validate pode encerrá-lo no meio (o terminal da IA estoura o tempo, Ctrl+C). Sem repassar
 * o sinal, o passo seguiria sozinho, e os workers do Vitest ficariam órfãos ocupando CPU e memória.
 */
function forward(signal) {
  if (running?.pid) {
    try {
      if (WIN) running.kill(signal);
      else process.kill(-running.pid, signal);
    } catch {
      /* o passo já acabou */
    }
  }
  process.exit(128 + ({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 }[signal] ?? 0));
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => forward(signal));

/** Roda um passo; na falha imprime o resumo e encerra com o código do passo. */
async function step(name, command, args, note) {
  console.log(`\n== ${name} ==\n$ ${command} ${args.join(' ')}`);
  const started = Date.now();
  // fora do Windows, num grupo próprio: o sinal repassado alcança o passo e tudo o que ele iniciou
  running = spawn(command, args, { stdio: 'inherit', shell: WIN, detached: !WIN });
  const status = await new Promise((resolve) => {
    running.once('error', () => resolve(1));
    running.once('close', (code) => resolve(code));
  });
  running = null;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = status === 0;
  results.push({ name, status: ok ? 'ok' : 'FALHOU', note: [note, `${seconds}s`].filter(Boolean).join(', ') });
  if (!ok) {
    summary(name);
    process.exit(status || 1);
  }
}

function skip(name, why) {
  console.log(`\n== ${name} ==\n(pulado: ${why})`);
  results.push({ name, status: 'pulado', note: why });
}

let changed;
try {
  const mergeBase = git(['merge-base', BASE, 'HEAD'])[0];
  // contra o ponto em que a branch saiu da base: o que está no commit, no índice e na pasta, sem os apagados
  const tracked = git(['diff', '--name-only', '--diff-filter=d', mergeBase]);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  changed = [...new Set([...tracked, ...untracked])].filter((f) => fs.existsSync(f)).sort();
} catch (e) {
  console.error(`Não foi possível listar os arquivos alterados contra ${BASE}: ${e.message}`);
  console.error('Atualize a base (git fetch origin) ou informe outra com --base <ref>.');
  process.exit(2);
}
console.log(`Arquivos alterados contra ${BASE}: ${changed.length ? `\n  ${changed.join('\n  ')}` : 'nenhum'}`);

await step('typecheck', 'npm', ['run', 'typecheck']);

const lint = changed.filter((f) => LINTED.test(f));
if (lint.length) await step('eslint', 'npx', ['eslint', '--no-warn-ignored', ...lint], `${lint.length} arquivo(s)`);
else skip('eslint', 'nenhum arquivo que o eslint cobre');

const format = changed.filter((f) => FORMATTED.test(f));
if (format.length) await step('prettier', 'npx', ['prettier', '--check', '--ignore-unknown', ...format], `${format.length} arquivo(s)`);
else skip('prettier', 'nenhum arquivo que o prettier cobre');

const related = changed.filter((f) => RELATED.test(f));
for (const { prefix, test } of EXTRA_TESTS) {
  if (changed.some((f) => f.startsWith(prefix)) && !related.includes(test)) related.push(test);
}
if (related.length)
  await step('vitest related', 'npx', ['vitest', 'related', '--run', '--passWithNoTests', ...related], `${related.length} arquivo(s)`);
else skip('vitest related', 'nenhum arquivo de src/ ou test/ alterado');

await step('cenários (test/scenarios)', 'npx', ['vitest', 'run', 'test/scenarios']);

summary(null);
