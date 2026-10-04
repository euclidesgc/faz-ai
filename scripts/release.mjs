#!/usr/bin/env node
// Publica uma nova versão da extensão pela linha de comando.
//
//   npm run release -- <patch|minor|major|x.y.z|current|finish> [opções]
//
// A main só aceita mudanças por pull request, então o release nunca faz push nela:
//   1. cria a branch release/vX.Y.Z a partir da main atualizada e, nela, ajusta a versão
//      (package.json) e os CHANGELOGs ("Não lançado" vira a versão, em todos os modos), faz o
//      commit e empacota;
//   2. confere o .vsix gerado (README.md, README_EN.md, CHANGELOG.md e CHANGELOG_EN.md), recusando
//      antes de publicar se algum arquivo estiver errado;
//   3. publica nas lojas;
//   4. envia a branch (push), abre o PR para a main e, com o push concluído, faz o merge (squash);
//   5. atualiza a main local, apaga a branch de release (local e remota);
//   6. cria a tag e a GitHub Release sobre o commit mergeado.
// Se algo parar depois da publicação nas lojas, `npm run release -- finish` retoma de onde parou
// (na branch release/vX.Y.Z ou na main), sem publicar de novo.
//
// Opções:
//   --dry-run          valida, testa e gera o .vsix, mas não publica nem faz commit/tag
//   --no-marketplace   não publica no Visual Studio Marketplace
//   --no-ovsx          não publica no Open VSX (Cursor, Kimi e outros forks do VS Code)
//   --no-git           não faz commit, PR, merge, tag nem GitHub Release
//   --allow-dirty      permite rodar com alterações não commitadas
//   --allow-branch     permite rodar fora da branch main
//   --allow-no-notes   permite publicar sem a seção "Não lançado" no CHANGELOG
//
// Tokens (variáveis de ambiente ou arquivo .env.release na raiz, fora do git):
//   VSCE_PAT  (opcional) PAT global do Azure DevOps com escopo Marketplace > Manage.
//             Sem ele, o Marketplace usa o login da Azure CLI (az login) via --azure-credential.
//             PATs globais deixam de funcionar em 01/12/2026, então o az login é o caminho padrão.
//   OVSX_PAT  token de https://open-vsx.org/user-settings/tokens

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buffer as streamToBuffer } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';
import { open as openZip } from 'yauzl-promise';
import { SHOWCASE, firstSection, packageProblems, renameUnreleased } from './releaseCheck.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const bump = args.find((a) => !a.startsWith('--'));

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

// "Não lançado" / "Unreleased" nos CHANGELOGs passa a ser a versão que está saindo, sempre (até em
// --dry-run e --no-git), para que o .vsix nunca saia com o título errado no topo do changelog. Quando
// o release vai commitar, o arquivo renomeado entra no commit da versão (`commit: true`); quando não
// vai, o texto original é guardado e devolvido ao disco no `process.on('exit')` do chamador — mesmo
// em falha, já que `fail()` chama `process.exit(1)` e não passa por `finally`.
function prepareChangelogs(next, commit) {
  for (const entry of SHOWCASE.filter((e) => e.kind === 'changelog')) {
    const path = join(root, entry.file);
    if (!existsSync(path)) continue;
    const original = readFileSync(path, 'utf8');
    const { text, renamed } = renameUnreleased(original, entry.unreleased, next);
    if (!renamed) continue;
    writeFileSync(path, text);
    if (commit) {
      run(`git add ${entry.file}`);
    } else {
      process.on('exit', () => writeFileSync(path, original));
    }
  }
}

// Próxima versão a partir da atual (o mesmo que o `npm version` calcularia)
function nextVersion(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = current.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Merge do PR da versão. Se o gh falhar, confere se o PR acabou mergeado (ex.: só a exclusão da
// branch falhou) e tenta de novo algumas vezes, porque o GitHub leva uns segundos para calcular
// se o PR é mergeável logo depois de aberto.
async function mergePullRequest(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      run(`gh pr merge ${url} --squash --delete-branch`);
      return;
    } catch {
      if (read(`gh pr view ${url} --json state -q .state`) === 'MERGED') return;
      if (attempt === 5) fail(`Não consegui mergear ${url}. Mergeie o PR e rode: npm run release -- finish`);
      console.log(`  Merge recusado (tentativa ${attempt}/5); tentando de novo em 5 s...`);
      await sleep(5_000);
    }
  }
}

// Envia a branch de release, abre o PR (se ainda não existir), mergeia, atualiza a main local e
// apaga a branch de release, local e remota
async function mergeVersionPullRequest(next, tag) {
  const releaseBranch = `release/${tag}`;
  run(`git push -u origin ${releaseBranch}`);
  let pr = JSON.parse(read(`gh pr list --head ${releaseBranch} --state all --json url,state`))[0];
  if (!pr) {
    const body = `Versão ${next}, já publicada nas lojas. Depois do merge, o release cria a tag ${tag} e a GitHub Release.`;
    const url = read(`gh pr create --base main --head ${releaseBranch} --title "Release ${tag}" --body "${body}"`).split('\n').pop();
    pr = { url, state: 'OPEN' };
  }
  console.log(`\n▶ PR da versão: ${pr.url}`);
  if (pr.state === 'CLOSED') fail(`O PR ${pr.url} foi fechado sem merge. Reabra-o e rode: npm run release -- finish`);
  run('git switch main');
  if (pr.state === 'OPEN') await mergePullRequest(pr.url);
  run('git pull --ff-only origin main');
  if (read(`git branch --list ${releaseBranch}`)) run(`git branch -D ${releaseBranch}`);
  if (read(`git ls-remote --heads origin ${releaseBranch}`)) run(`git push origin --delete ${releaseBranch}`);
  run('git fetch --prune origin');
}

// Confere os quatro arquivos de vitrine de dentro do .vsix antes de publicar. O `vsce` minuscula só
// os dois arquivos que o manifesto aponta (README.md/CHANGELOG.md viram readme.md/changelog.md
// dentro do pacote), enquanto os de inglês mantêm o nome original — por isso o casamento com o nome
// do zip é sem distinção de maiúsculas. A decisão de "está certo?" fica inteira em packageProblems
// (releaseCheck.mjs): aqui só se lê o disco e o zip.
async function checkPackage(vsix, next) {
  console.log(`\n▶ Conferindo o pacote: ${vsix}`);
  const contents = {};
  const zip = await openZip(join(root, vsix));
  try {
    for await (const entry of zip) {
      const match = SHOWCASE.find((e) => `extension/${e.file}`.toLowerCase() === entry.filename.toLowerCase());
      if (!match) continue;
      contents[match.file] = (await streamToBuffer(await entry.openReadStream())).toString('utf8');
    }
  } finally {
    await zip.close();
  }
  const problems = packageProblems(contents, next);
  if (problems.length > 0) {
    fail(
      `O pacote ${vsix} não pode ser publicado:\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n  Corrija os arquivos e rode o release de novo; nada foi publicado.',
    );
  }
}

// Tag e GitHub Release sobre a main já com a versão
function tagAndRelease(next, tag, vsix) {
  run('git switch main');
  run('git pull --ff-only origin main');
  if (version() !== next) fail(`A main está na versão ${version()}, e não na ${next}. O PR da versão não foi mergeado.`);
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
const finishing = bump === 'finish';
if (withGit && !dryRun && !finishing && branch !== 'main' && !flags.has('--allow-branch')) {
  fail(`Você está na branch "${branch}". Faça o release a partir da main ou use --allow-branch.`);
}
if (!flags.has('--allow-dirty') && read('git status --porcelain')) {
  fail('Há alterações não commitadas. Faça commit/stash antes ou use --allow-dirty.');
}
const marketplaceAuth = process.env.VSCE_PAT ? '' : ' --azure-credential';
if (!dryRun && !finishing && toMarketplace && marketplaceAuth) {
  try {
    read('az account show');
  } catch {
    fail('Sem VSCE_PAT e sem login na Azure CLI. Rode: az login --allow-no-subscriptions (ou use --no-marketplace).');
  }
  run('npx vsce verify-pat euclidesgc --azure-credential');
}
if (!dryRun && !finishing && toOvsx && !process.env.OVSX_PAT) {
  fail('OVSX_PAT não definido (env ou .env.release). Use --no-ovsx para pular.');
}

// Retomar um release já publicado nas lojas: na branch release/vX.Y.Z, conclui o PR (push, merge e
// limpeza das branches); na main, só a tag e a GitHub Release
if (finishing) {
  const finished = version();
  if (branch.startsWith('release/')) await mergeVersionPullRequest(finished, `v${finished}`);
  tagAndRelease(finished, `v${finished}`, `releases/faz-ai-${finished}.vsix`);
  console.log(`\n✔ v${finished} concluído.`);
  process.exit(0);
}

// Versão
const previous = version();
const next = bump === 'current' ? previous : nextVersion(previous, bump);
const tag = `v${next}`;
if (withGit && (read(`git tag --list ${tag}`) || read(`git ls-remote --tags origin ${tag}`))) {
  fail(`A tag ${tag} já existe.`);
}
console.log(`\n▶ Release ${previous} → ${next}${dryRun ? ' (dry-run)' : ''}`);

// A branch de release parte da main atualizada: nada de commits locais soltos indo junto no PR
const viaPullRequest = withGit && !dryRun && bump !== 'current';
if (viaPullRequest && branch === 'main') {
  run('git fetch origin main');
  if (read('git rev-list --count HEAD..origin/main') !== '0') fail('A main local está atrás da origin/main. Rode: git pull --ff-only');
  if (read('git rev-list --count origin/main..HEAD') !== '0')
    fail('A main local tem commits que não estão na origin/main. Eles iriam no PR da versão.');
}

// Sem "Não lançado" para renomear e sem já estar na versão que está saindo, não há notas para
// publicar. Vem antes de criar a branch e de mexer no package.json: uma recusa aqui não deixa nada
// para desfazer. Quando não há "Não lançado" mas a primeira seção já é a versão (caso do `current`,
// que republica sem renomear nada), segue sem precisar da opção.
if (!flags.has('--allow-no-notes')) {
  const entry = SHOWCASE.find((e) => e.file === 'CHANGELOG.md');
  const changelogPath = join(root, entry.file);
  if (existsSync(changelogPath)) {
    const text = readFileSync(changelogPath, 'utf8');
    const first = firstSection(text);
    if (!text.includes(`## ${entry.unreleased}`) && first !== next) {
      fail(
        `${entry.file} não tem a seção "## ${entry.unreleased}", e a primeira seção é "${first}", não "${next}".\n` +
          '  Escreva o que mudou em "## Não lançado" ou rode de novo com --allow-no-notes para publicar sem notas.',
      );
    }
  }
}

// Validação (a versão não influencia os testes, então roda antes de mexer em qualquer branch)
run('npm run typecheck');
run('npm test');

// Versão, CHANGELOGs e commit, na branch de release (a main nunca recebe push direto)
const releaseBranch = `release/${tag}`;
if (viaPullRequest) run(`git switch -c ${releaseBranch}`);
if (bump !== 'current') run(`npm version ${next} --no-git-tag-version`, { stdio: 'pipe' });

if (viaPullRequest) run('git add package.json package-lock.json');
prepareChangelogs(next, viaPullRequest);
if (viaPullRequest) run(`git commit -m "Release ${tag}"`);

// Empacotamento (vsce roda "vscode:prepublish", que faz o build). Os pacotes ficam em releases/
// (fora do git): um por versão e uma cópia da última. Se falhar, nada saiu da máquina: a branch
// de release é descartada e a main fica como estava.
const vsix = `releases/faz-ai-${next}.vsix`;
try {
  mkdirSync(join(root, 'releases'), { recursive: true });
  run(`npx vsce package --out ${vsix}`);
  copyFileSync(join(root, vsix), join(root, 'releases/faz-ai-latest.vsix'));
} catch (err) {
  if (viaPullRequest) {
    run('git switch main');
    run(`git branch -D ${releaseBranch}`);
  }
  throw err;
}

// Confere o pacote antes de qualquer publicação, inclusive no --dry-run: o ensaio precisa ensaiar
// a conferência. Uma recusa aqui chama fail(), que sai com código 1 sem publicar nada.
await checkPackage(vsix, next);

if (dryRun) {
  console.log(`\n✔ Dry-run concluído: ${vsix} gerado. Nada foi publicado.`);
  if (bump !== 'current') console.log('  (package.json foi alterado; descarte com: git checkout package.json package-lock.json)');
  process.exit(0);
}

// Publicação
if (toMarketplace) run(`npx vsce publish --packagePath ${vsix}${marketplaceAuth}`);
if (toOvsx) run(`npx ovsx publish ${vsix}`);

// Git: PR da versão (push da branch de release, merge e limpeza), tag e GitHub Release com o .vsix
if (withGit) {
  if (viaPullRequest) await mergeVersionPullRequest(next, tag);
  tagAndRelease(next, tag, vsix);
}

console.log(`\n✔ ${tag} publicado.`);
