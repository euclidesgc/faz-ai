#!/usr/bin/env node
// Publica uma nova versão da extensão pela linha de comando.
//
//   npm run release -- <patch|minor|major|x.y.z|current|finish> [opções]
//
// Fluxo normal: a develop já tem no package.json a versão que está no topo do changelog, então o
// release roda com essa versão explícita (ex.: `npm run release -- 0.47.0`); nada é renomeado nem
// subido. `patch|minor|major` seguem valendo para quem mantém uma seção "Não lançado".
//
// Gitflow: a main só aceita mudanças por pull request e a develop recebe o trabalho. O release
// roda na develop (versão nova) ou numa branch hotfix/... (correção); outra branch é recusada
// (só o --dry-run vale em qualquer branch). Nada é empurrado direto para a main:
//   1. na develop, cria a branch release/vX.Y.Z; na hotfix/..., usa a própria branch. Nela, ajusta
//      a versão (package.json) e os CHANGELOGs ("Não lançado" vira a versão), faz o commit e empacota;
//   2. confere o .vsix gerado (README.md, README_EN.md, CHANGELOG.md e CHANGELOG_EN.md), recusando
//      antes de publicar se algum arquivo estiver errado;
//   3. publica nas lojas;
//   4. envia a branch, abre (ou reaproveita) o PR para a main e o mergeia com merge commit (--merge);
//   5. cria a tag e a GitHub Release sobre origin/main, sem trocar de branch;
//   6. devolve a main para a develop por PR com merge commit e apaga a branch de release (local, se
//      não estiver aberta, e remota).
// Se algo parar depois da publicação nas lojas, `npm run release -- finish` retoma de onde parou:
// cada passo confere o estado (PR, tag, release, main contida na develop, branches) e só faz o que falta.
//
// Opções:
//   --dry-run          valida, testa e gera o .vsix, mas não publica nem faz commit/tag (vale em qualquer branch)
//   --no-marketplace   não publica no Visual Studio Marketplace
//   --no-ovsx          não publica no Open VSX (Cursor, Kimi e outros forks do VS Code)
//   --no-git           não faz commit, PR, merge, tag nem GitHub Release
//   --allow-dirty      permite rodar com alterações não commitadas
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
import { BRANCHES, finishPlan, releaseSource, wrongBranchMessage } from './releaseFlow.mjs';

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

// Um comando de verificação: true se terminou com sucesso, false se falhou (sem poluir a saída)
function succeeds(cmd) {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
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

// Merge de um PR com merge commit, sem apagar a branch (a main e a develop nunca são apagadas, e a
// de release é apagada depois, por este script). Se o gh falhar, confere se o PR acabou mergeado e
// tenta de novo algumas vezes, porque o GitHub leva uns segundos para calcular se o PR é mergeável
// logo depois de aberto.
async function mergePullRequest(url, failure) {
  for (let attempt = 1; ; attempt++) {
    try {
      run(`gh pr merge ${url} --merge`);
      return;
    } catch {
      if (read(`gh pr view ${url} --json state -q .state`) === 'MERGED') return;
      if (attempt === 5) fail(failure);
      console.log(`  Merge recusado (tentativa ${attempt}/5); tentando de novo em 5 s...`);
      await sleep(5_000);
    }
  }
}

// O PR da branch (o aberto vence; senão o mais recente), ou undefined
function findPullRequest(head, base) {
  const baseFilter = base ? ` --base ${base}` : '';
  const list = JSON.parse(read(`gh pr list --head ${head}${baseFilter} --state all --json url,state,baseRefName`));
  return list.find((p) => p.state === 'OPEN') ?? list.find((p) => p.state === 'MERGED') ?? list[0];
}

// A versão que está na origin/main (a tag sai sobre ela, sem trocar de branch)
function originMainVersion() {
  return JSON.parse(read('git show origin/main:package.json')).version;
}

// Envia a branch de release, abre o PR para a main (se ainda não existir) e mergeia
async function mergeVersionPullRequest(head, next, tag) {
  if (read(`git branch --list ${head}`)) run(`git push -u origin ${head}`);
  let pr = findPullRequest(head);
  if (!pr) {
    const body = `Versão ${next}, já publicada nas lojas. Depois do merge, o release cria a tag ${tag} e a GitHub Release.`;
    const url = read(`gh pr create --base ${BRANCHES.main} --head ${head} --title "Release ${tag}" --body "${body}"`).split('\n').pop();
    pr = { url, state: 'OPEN', baseRefName: BRANCHES.main };
  }
  console.log(`\n▶ PR da versão: ${pr.url}`);
  if (pr.baseRefName !== BRANCHES.main) fail(`O PR ${pr.url} vai para ${pr.baseRefName}, e a correção precisa ir para a main.`);
  if (pr.state === 'CLOSED') fail(`O PR ${pr.url} foi fechado sem merge. Reabra-o e rode: npm run release -- finish`);
  if (pr.state === 'OPEN') {
    await mergePullRequest(pr.url, `Não consegui mergear ${pr.url}. Mergeie o PR e rode: npm run release -- finish`);
  }
  run(`git fetch origin ${BRANCHES.main}`);
}

// Volta a main para a develop por PR com merge commit (reaproveita o PR aberto)
async function backMergeToDevelop(tag) {
  const [open] = JSON.parse(read(`gh pr list --base ${BRANCHES.develop} --head ${BRANCHES.main} --state open --json url`));
  const url =
    open?.url ??
    read(
      `gh pr create --base ${BRANCHES.develop} --head ${BRANCHES.main} --title "Volta ${tag} para a develop" ` +
        `--body "Devolve a main (com a versão ${tag}) para a develop."`,
    )
      .split('\n')
      .pop();
  console.log(`\n▶ PR da volta para a develop: ${url}`);
  const conflict = `Resolva o conflito no PR ${url} e rode: npm run release -- finish`;
  if (read(`gh pr view ${url} --json mergeable -q .mergeable`) === 'CONFLICTING') fail(conflict);
  await mergePullRequest(url, conflict);
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

// As branches abertas em alguma pasta (a do projeto ou worktrees) não podem ser apagadas
function openedBranches() {
  return read('git worktree list --porcelain')
    .split('\n')
    .filter((l) => l.startsWith('branch refs/heads/'))
    .map((l) => l.slice('branch refs/heads/'.length));
}

// Conclui o release, sobre fatos lidos do estado, e só faz o que falta (RF24): merge do PR, tag e
// GitHub Release sobre origin/main, volta main -> develop e limpeza. Sem `pullRequest` (--bump
// current), só a tag e a release.
async function conclude({ head, next, tag, vsix, pullRequest }) {
  const readPlan = () => {
    const pr = pullRequest ? findPullRequest(head) : undefined;
    return finishPlan({
      prState: pr?.state ?? 'NONE',
      tagOnOrigin: Boolean(read(`git ls-remote --tags origin ${tag}`)),
      releaseExists: succeeds(`gh release view ${tag}`),
      mainInDevelop: succeeds(`git merge-base --is-ancestor origin/${BRANCHES.main} origin/${BRANCHES.develop}`),
      headExistsLocal: Boolean(read(`git branch --list ${head}`)),
      headExistsRemote: Boolean(read(`git ls-remote --heads origin ${head}`)),
    });
  };
  run(`git fetch origin ${BRANCHES.main} ${BRANCHES.develop} --tags`);
  let plan = readPlan();

  if (pullRequest && plan.mergePr) {
    await mergeVersionPullRequest(head, next, tag);
    // A main andou com o merge: a volta para a develop e a limpeza se decidem sobre o estado novo
    run(`git fetch origin ${BRANCHES.main} ${BRANCHES.develop}`);
    plan = { ...plan, ...readPlan(), tag: plan.tag, release: plan.release };
  }

  if (plan.tag || plan.release) {
    const onMain = originMainVersion();
    if (onMain !== next) fail(`A origin/main está na versão ${onMain}, e não na ${next}. O PR da versão não foi mergeado.`);
  }
  if (plan.tag) {
    if (!read(`git tag --list ${tag}`)) run(`git tag -a ${tag} -m "${tag}" origin/${BRANCHES.main}`);
    run(`git push origin ${tag}`);
  }
  if (plan.release) {
    run(`gh release create ${tag} ${existsSync(join(root, vsix)) ? vsix : ''} --title "${tag}" --generate-notes`);
  }

  if (!pullRequest) return;
  if (plan.backMerge) await backMergeToDevelop(tag);
  run('git fetch --prune origin');

  // Sai da branch de release (a develop é o ponto de partida); a hotfix/ fica onde está
  if (read('git rev-parse --abbrev-ref HEAD') === head && head.startsWith(BRANCHES.release)) {
    run(`git switch ${BRANCHES.develop}`);
  }
  if (read('git rev-parse --abbrev-ref HEAD') === BRANCHES.develop) run(`git pull --ff-only origin ${BRANCHES.develop}`);

  if (plan.deleteLocal) {
    if (openedBranches().includes(head)) console.log(`  A branch ${head} está aberta numa pasta: mantida localmente.`);
    else run(`git branch -D ${head}`);
  }
  if (plan.deleteRemote) run(`git push origin --delete ${head}`);
}

if (!bump || !/^(patch|minor|major|current|finish|\d+\.\d+\.\d+)$/.test(bump)) {
  fail('Informe a versão: npm run release -- <patch|minor|major|x.y.z|current|finish> [--dry-run]');
}

loadEnvFile();

// Pré-condições
const branch = read('git rev-parse --abbrev-ref HEAD');
const finishing = bump === 'finish';
const source = releaseSource(branch);
if (withGit && !dryRun && !finishing && !source) fail(wrongBranchMessage(branch));
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

// Retomar um release já publicado nas lojas, de qualquer branch. Numa release/ ou hotfix/, é a
// própria branch; em outra, a versão é a da origin/main (a branch de release é release/vX.Y.Z).
if (finishing) {
  const ownBranch = branch.startsWith(BRANCHES.release) || source === 'hotfix';
  let finished;
  if (ownBranch) {
    finished = version();
  } else {
    run(`git fetch origin ${BRANCHES.main}`);
    finished = originMainVersion();
  }
  const head = ownBranch ? branch : `${BRANCHES.release}v${finished}`;
  await conclude({ head, next: finished, tag: `v${finished}`, vsix: `releases/faz-ai-${finished}.vsix`, pullRequest: true });
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

// A branch de release parte da develop atualizada (nada de commits locais soltos indo junto no PR);
// a hotfix/ usa a própria branch e reaproveita o PR aberto, que precisa ir para a main
const viaPullRequest = withGit && !dryRun && bump !== 'current';
if (viaPullRequest && source === 'develop') {
  run(`git fetch origin ${BRANCHES.develop} ${BRANCHES.main}`);
  if (read(`git rev-list --count origin/${BRANCHES.develop}..HEAD`) !== '0')
    fail('A develop local tem commits que não estão na origin/develop. Eles iriam no PR da versão.');
  if (read(`git rev-list --count HEAD..origin/${BRANCHES.develop}`) !== '0') run(`git pull --ff-only origin ${BRANCHES.develop}`);
}
if (viaPullRequest && source === 'hotfix') {
  const open = findPullRequest(branch);
  if (open && open.baseRefName !== BRANCHES.main) {
    fail(`O PR ${open.url} vai para ${open.baseRefName}, e a correção precisa ir para a main.`);
  }
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
const releaseBranch = source === 'hotfix' ? branch : `${BRANCHES.release}${tag}`;
if (viaPullRequest && source === 'develop') run(`git switch -c ${releaseBranch}`);
// A develop já traz a versão no package.json quando a seção do topo do changelog é a versão que
// está saindo (`npm run release -- x.y.z` com a versão atual): o npm recusaria "subir" para a mesma.
if (next !== previous) run(`npm version ${next} --no-git-tag-version`, { stdio: 'pipe' });

if (viaPullRequest) run('git add package.json package-lock.json');
prepareChangelogs(next, viaPullRequest);
if (viaPullRequest) run(`git commit -m "Release ${tag}"`);

// Empacotamento (vsce roda "vscode:prepublish", que faz o build). Os pacotes ficam em releases/
// (fora do git): um por versão e uma cópia da última. Se falhar, nada saiu da máquina: a branch
// de release é descartada e a develop fica como estava (na hotfix/, o commit da versão fica nela).
const vsix = `releases/faz-ai-${next}.vsix`;
try {
  mkdirSync(join(root, 'releases'), { recursive: true });
  run(`npx vsce package --out ${vsix}`);
  copyFileSync(join(root, vsix), join(root, 'releases/faz-ai-latest.vsix'));
} catch (err) {
  if (viaPullRequest && source === 'develop') {
    run(`git switch ${BRANCHES.develop}`);
    run(`git branch -D ${releaseBranch}`);
  }
  throw err;
}

// Confere o pacote antes de qualquer publicação, inclusive no --dry-run: o ensaio precisa ensaiar
// a conferência. Uma recusa aqui chama fail(), que sai com código 1 sem publicar nada.
await checkPackage(vsix, next);

if (dryRun) {
  console.log(`\n✔ Dry-run concluído: ${vsix} gerado. Nada foi publicado.`);
  if (next !== previous) console.log('  (package.json foi alterado; descarte com: git checkout package.json package-lock.json)');
  process.exit(0);
}

// Publicação
if (toMarketplace) run(`npx vsce publish --packagePath ${vsix}${marketplaceAuth}`);
if (toOvsx) run(`npx ovsx publish ${vsix}`);

// Git: PR da versão, tag e GitHub Release com o .vsix, volta para a develop e limpeza
if (withGit) {
  await conclude({ head: releaseBranch, next, tag, vsix, pullRequest: viaPullRequest });
}

console.log(`\n✔ ${tag} publicado.`);
