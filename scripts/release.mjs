#!/usr/bin/env node
// Publica uma nova versão da extensão pela linha de comando.
//
//   npm run release -- <patch|minor|major|x.y.z|current|finish> [opções]
//
// A main só aceita mudanças por pull request. Por isso, depois de publicar nas lojas, o script
// leva o commit da versão por um PR (release/vX.Y.Z), espera o merge e só então cria a tag e a
// GitHub Release sobre o commit mergeado. Se o merge demorar, o script para e avisa; depois do
// merge, `npm run release -- finish` conclui (tag e GitHub Release) sem publicar de novo.
//
// Opções:
//   --dry-run          valida, testa e gera o .vsix, mas não publica nem faz commit/tag
//   --no-marketplace   não publica no Visual Studio Marketplace
//   --no-ovsx          não publica no Open VSX (Cursor, Kimi e outros forks do VS Code)
//   --no-git           não faz commit, PR, tag nem GitHub Release
//   --allow-dirty      permite rodar com alterações não commitadas
//   --allow-branch     permite rodar fora da branch main
//
// Tokens (variáveis de ambiente ou arquivo .env.release na raiz, fora do git):
//   VSCE_PAT  (opcional) PAT global do Azure DevOps com escopo Marketplace > Manage.
//             Sem ele, o Marketplace usa o login da Azure CLI (az login) via --azure-credential.
//             PATs globais deixam de funcionar em 01/12/2026, então o az login é o caminho padrão.
//   OVSX_PAT  token de https://open-vsx.org/user-settings/tokens

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const bump = args.find((a) => !a.startsWith('--'));
const MERGE_WAIT_MINUTES = 30;

const dryRun = flags.has('--dry-run');
const toMarketplace = !flags.has('--no-marketplace');
const toOvsx = !flags.has('--no-ovsx');
const withGit = !flags.has('--no-git');

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

function read(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadEnvFile() {
  const file = join(root, '.env.release');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

function version() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
}

// "Não lançado" / "Unreleased" nos CHANGELOGs passa a ser a versão que está saindo
function renameUnreleased(next) {
  for (const [file, heading] of [
    ['CHANGELOG.md', 'Não lançado'],
    ['CHANGELOG_EN.md', 'Unreleased'],
  ]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    const renamed = text.replace(`## ${heading}\n`, `## ${next}\n`);
    if (renamed !== text) {
      writeFileSync(path, renamed);
      run(`git add ${file}`);
    }
  }
}

// Leva o commit da versão para a main por pull request e espera o merge
async function versionPullRequest(next, tag) {
  const releaseBranch = `release/${tag}`;
  run(`git switch -c ${releaseBranch}`);
  run('git add package.json package-lock.json');
  renameUnreleased(next);
  run(`git commit -m "Release ${tag}"`);
  run(`git push -u origin ${releaseBranch}`);
  const body = `Versão ${next}, já publicada nas lojas. Depois do merge, o release cria a tag ${tag} e a GitHub Release.`;
  const url = read(`gh pr create --base main --head ${releaseBranch} --title "Release ${tag}" --body "${body}"`).split('\n').pop();
  console.log(`\n▶ PR da versão: ${url}\n  Esperando o merge (até ${MERGE_WAIT_MINUTES} min)...`);
  const deadline = Date.now() + MERGE_WAIT_MINUTES * 60_000;
  while (read(`gh pr view ${url} --json state -q .state`) !== 'MERGED') {
    if (Date.now() > deadline) {
      fail(`O PR ${url} ainda não foi mergeado. Depois do merge, rode: npm run release -- finish`);
    }
    await sleep(15_000);
  }
  run(`git switch ${branch}`);
}

// Tag e GitHub Release sobre a main já com a versão
function tagAndRelease(next, tag, vsix) {
  run(`git switch ${branch}`);
  run(`git pull --ff-only origin ${branch}`);
  if (version() !== next) fail(`A ${branch} está na versão ${version()}, e não na ${next}. Mergeie o PR da versão antes.`);
  if (read(`git ls-remote --tags origin ${tag}`)) fail(`A tag ${tag} já existe no remoto.`);
  run(`git tag -a ${tag} -m "${tag}"`);
  run(`git push origin ${tag}`);
  run(`gh release create ${tag} ${existsSync(join(root, vsix)) ? vsix : ''} --title "${tag}" --generate-notes`);
}

if (!bump || !/^(patch|minor|major|current|finish|\d+\.\d+\.\d+)$/.test(bump)) {
  fail('Informe a versão: npm run release -- <patch|minor|major|x.y.z|current|finish> [--dry-run]');
}

loadEnvFile();

// Pré-condições
const branch = read('git rev-parse --abbrev-ref HEAD');
if (withGit && !dryRun && branch !== 'main' && !flags.has('--allow-branch')) {
  fail(`Você está na branch "${branch}". Faça o release a partir da main ou use --allow-branch.`);
}
if (!flags.has('--allow-dirty') && read('git status --porcelain')) {
  fail('Há alterações não commitadas. Faça commit/stash antes ou use --allow-dirty.');
}
const marketplaceAuth = process.env.VSCE_PAT ? '' : ' --azure-credential';
if (!dryRun && toMarketplace && marketplaceAuth) {
  try {
    read('az account show');
  } catch {
    fail('Sem VSCE_PAT e sem login na Azure CLI. Rode: az login --allow-no-subscriptions (ou use --no-marketplace).');
  }
  run('npx vsce verify-pat euclidesgc --azure-credential');
}
if (!dryRun && toOvsx && !process.env.OVSX_PAT) {
  fail('OVSX_PAT não definido (env ou .env.release). Use --no-ovsx para pular.');
}

// Concluir um release já publicado: só a tag e a GitHub Release, depois do merge do PR da versão
if (bump === 'finish') {
  const finished = version();
  tagAndRelease(finished, `v${finished}`, `releases/faz-ai-${finished}.vsix`);
  console.log(`\n✔ v${finished} concluído.`);
  process.exit(0);
}

// Versão
const previous = version();
if (bump !== 'current') {
  run(`npm version ${bump} --no-git-tag-version`, { stdio: 'pipe' });
}
const next = version();
const tag = `v${next}`;
if (withGit && (read(`git tag --list ${tag}`) || read(`git ls-remote --tags origin ${tag}`))) {
  fail(`A tag ${tag} já existe.`);
}
console.log(`\n▶ Release ${previous} → ${next}${dryRun ? ' (dry-run)' : ''}`);

// Validação e empacotamento (vsce roda "vscode:prepublish", que faz o build)
run('npm run typecheck');
run('npm test');
// Os pacotes ficam em releases/ (fora do git): um por versão e uma cópia da última
mkdirSync(join(root, 'releases'), { recursive: true });
const vsix = `releases/faz-ai-${next}.vsix`;
run(`npx vsce package --out ${vsix}`);
copyFileSync(join(root, vsix), join(root, 'releases/faz-ai-latest.vsix'));

if (dryRun) {
  console.log(`\n✔ Dry-run concluído: ${vsix} gerado. Nada foi publicado.`);
  if (bump !== 'current') console.log('  (package.json foi alterado; descarte com: git checkout package.json package-lock.json)');
  process.exit(0);
}

// Publicação
if (toMarketplace) run(`npx vsce publish --packagePath ${vsix}${marketplaceAuth}`);
if (toOvsx) run(`npx ovsx publish ${vsix}`);

// Git: PR da versão (a main é protegida), tag e GitHub Release com o .vsix anexado
if (withGit) {
  if (bump !== 'current') await versionPullRequest(next, tag);
  tagAndRelease(next, tag, vsix);
}

console.log(`\n✔ ${tag} publicado.`);
