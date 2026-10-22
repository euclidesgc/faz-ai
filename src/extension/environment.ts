import { baseValue } from '../shared/harness';
import type { AiBase } from '../shared/aiProfiles';
import * as path from 'node:path';
import type { BranchRenamePending } from '../shared/branchRename';
import { NODE_MIN_MAJOR, type EnvCheck, type EnvironmentReport, type InstallStep } from '../shared/environment';
import { HARNESS_ISSUES, type HarnessIssue } from '../shared/harnessStatus';
import { boardAvailability, type ProfileHealth } from '../shared/profileHealth';
import type { AiTool } from '../shared/harness';
import type { EffectiveLimits } from '../shared/orchestration';
import type { PolicySimulation } from '../shared/policyManagement';
import type { BoardRequirement } from '../shared/requirements';

/** As famílias de distribuição Linux com gerenciador de pacotes conhecido. */
export type LinuxFamily = 'debian' | 'fedora' | 'arch';

/** A família da distribuição pelo `/etc/os-release` (`ID` e `ID_LIKE`); null quando não é uma conhecida. */
export function linuxFamily(osRelease: string | null): LinuxFamily | null {
  const field = (name: string) => new RegExp(`^${name}="?([^"\\n]*)"?`, 'm').exec(osRelease ?? '')?.[1] ?? '';
  const ids = `${field('ID')} ${field('ID_LIKE')}`.toLowerCase().split(/\s+/);
  if (ids.some((i) => i === 'debian' || i === 'ubuntu')) return 'debian';
  if (ids.some((i) => i === 'fedora' || i === 'rhel' || i === 'centos')) return 'fedora';
  if (ids.some((i) => i === 'arch')) return 'arch';
  return null;
}

export interface EnvironmentProbe {
  /** o que `checkRequirements` acabou de achar: o Node.js e o banco de artefatos vêm daí, com o texto e a ação do aviso */
  requirements: BoardRequirement[];
  /** a saúde de cada perfil de CLI, já montada pelo host (todos os perfis, ligados ou não) */
  health: ProfileHealth[];
  workspaceDir: string;
  /** os perfis que o board usa por conta própria (`profilesInUse`) */
  profilesInUse?: AiTool[];
  /**
   * O simulador de políticas (#620) para o alvo padrão: recebe se o padrão está disponível. Nunca chama
   * o gateway nem a IA. Ausente: `nextRun` fica null.
   */
  simulateNextRun?(defaultAvailable: boolean): PolicySimulation | null;
  /** Os limites efetivos (#621); ausente: `limits` fica null. */
  effectiveLimits?(): EffectiveLimits | null;
  /** o que falta no banco de artefatos do board; null quando não dá para saber (sem o inventário) */
  harnessIssues: HarnessIssue[] | null;
  /** as renomeações de branch à espera de Renomear/Desfazer (#466): o item "Nome da branch" fica pendente enquanto houver */
  branchRenames?: BranchRenamePending[];
  /** o sistema: no Windows, os comandos de instalação são os do PowerShell */
  platform: NodeJS.Platform;
  homeDir: string;
  /** as pastas do PATH do terminal: diz se `~/.local/bin` (onde as CLIs e o uv se instalam) já está nele */
  pathDirs: string[];
  /** no Linux, a família da distribuição (pelo /etc/os-release): o gerenciador de pacotes do git e do gh */
  linux: LinuxFamily | null;
  /** caminho do executável de um comando, ou null */
  resolve(command: string): string | null;
  /** roda um comando e devolve a saída padrão; null quando ele falha ou não existe */
  run(command: string, args: string[], cwd?: string): Promise<string | null>;
  /** a primeira linha de um arquivo (o `#!` de um script), ou null */
  firstLine(file: string): string | null;
  exists(file: string): boolean;
}

/** Onde cada item explica como instalar ou configurar (conferido em 2026-10-13). */
const CRG_DOCS = 'https://github.com/tirth8205/code-review-graph';
const DOCS: Record<string, string> = {
  node: 'https://nodejs.org/en/download',
  harness: `https://github.com/euclidesgc/faz-ai#harness-de-ia`,
  git: 'https://git-scm.com/downloads',
  gh: 'https://cli.github.com',
  crg: CRG_DOCS,
  uv: 'https://docs.astral.sh/uv/getting-started/installation/',
  'crg-embeddings': `${CRG_DOCS}#usage`,
};
/** Onde cada CLI pronta explica como instalar (conferido em 2026-10-13). */
const CLI_DOCS: Record<AiBase, string> = {
  claude: 'https://code.claude.com/docs/en/setup',
  cursor: 'https://cursor.com/docs/cli/installation',
  kimi: 'https://www.kimi.com/code/docs/en/',
};

/**
 * Os comandos que instalam cada programa, conforme o site oficial dele (conferido em 2026-10-11): os
 * instaladores neutros, que valem em qualquer distribuição (`curl` no Linux e no macOS, PowerShell no
 * Windows). O git e o GitHub CLI não têm um assim: ver `packageInstall`.
 */
const steps = (...commands: string[]): InstallStep[] => commands.map((command) => ({ command }));
const NVM: InstallStep = { command: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash', step: 'nvm' };
const INSTALL: Record<'unix' | 'windows', Record<'node' | AiBase | 'uv', InstallStep[]>> = {
  unix: {
    // o Node.js pelo nvm, como o site do Node.js ensina: primeiro o nvm, depois o Node com ele
    node: [NVM, { command: '. "$HOME/.nvm/nvm.sh"', step: 'nvm-load' }, { command: `nvm install ${NODE_MIN_MAJOR}`, step: 'node' }],
    claude: steps('curl -fsSL https://claude.ai/install.sh | bash'),
    cursor: steps('curl https://cursor.com/install -fsS | bash'),
    kimi: steps('npm install -g @moonshot-ai/kimi-code'),
    uv: steps('curl -LsSf https://astral.sh/uv/install.sh | sh'),
  },
  // no Windows, o instalador de cada um já põe o programa no PATH: falta só abrir um terminal novo
  windows: {
    node: steps('winget install OpenJS.NodeJS.LTS'),
    claude: steps('irm https://claude.ai/install.ps1 | iex'),
    cursor: steps("irm 'https://cursor.com/install?win32=true' | iex"),
    kimi: steps('npm install -g @moonshot-ai/kimi-code'),
    uv: steps('powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'),
  },
};

/**
 * O git e o GitHub CLI não têm instalador neutro: o comando é o do sistema (o do macOS, o winget do
 * Windows, o gerenciador da distribuição Linux), conforme o site de cada um. Numa distribuição
 * desconhecida, fica só o site. O apt de uma máquina nova não acha nada antes do `apt update`.
 */
function packageInstall(p: EnvironmentProbe, what: 'git' | 'gh'): InstallStep[] | undefined {
  if (p.platform === 'win32') return steps(what === 'git' ? 'winget install --id Git.Git -e' : 'winget install --id GitHub.cli -e');
  if (p.platform === 'darwin') return what === 'git' ? steps('xcode-select --install') : [{ command: 'brew install gh', step: 'brew' }];
  const pkg = what === 'git' ? 'git' : 'gh';
  switch (p.linux) {
    case 'debian':
      return [{ command: 'sudo apt update', step: 'apt-update' }, ...steps(`sudo apt install -y ${pkg}`)];
    case 'fedora':
      return steps(`sudo dnf install -y ${pkg}`);
    case 'arch':
      return steps(`sudo pacman -S --needed ${what === 'git' ? 'git' : 'github-cli'}`);
    default:
      return undefined;
  }
}

/**
 * Os passos do PATH depois de um instalador que põe o programa em `~/.local/bin`, quando essa pasta
 * ainda não está no PATH: sem eles, o terminal aberto não acha o comando logo depois. O da CLI do
 * Claude Code e do Cursor só explica como pôr a pasta no PATH; o do uv já grava no arquivo do shell,
 * e falta só o terminal aberto.
 */
function localBin(p: EnvironmentProbe, save: boolean): InstallStep[] {
  const dir = path.join(p.homeDir, '.local', 'bin');
  if (p.platform === 'win32' || p.pathDirs.some((d) => d.replace(/\/+$/, '') === dir)) return [];
  const rc = p.platform === 'darwin' ? '~/.zshrc' : '~/.bashrc';
  const load: InstallStep = { command: 'export PATH="$HOME/.local/bin:$PATH"', step: 'path-load' };
  return save ? [{ command: `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${rc}`, step: 'path-save' }, load] : [load];
}

const version = (out: string | null): string | undefined => /\d+\.\d+(?:\.\d+)?/.exec(out ?? '')?.[0];

/** O Python do Code Review Graph, pelo `#!` do script dele, e por onde ele foi instalado. */
function crgInstaller(p: EnvironmentProbe, exe: string): { python: string | null; via: 'uv' | 'pipx' | 'pip' } {
  const shebang = p.firstLine(exe);
  const words = shebang?.startsWith('#!') ? shebang.slice(2).trim().split(/\s+/) : [];
  // `#!/usr/bin/env python3`: o Python é o segundo
  const python = (/(^|\/)env$/.test(words[0] ?? '') ? words[1] : words[0]) ?? null;
  const where = (python ?? exe).replace(/\\/g, '/');
  return { python, via: /\/uv\/tools\//.test(where) ? 'uv' : /\/pipx\//.test(where) ? 'pipx' : p.resolve('uv') ? 'uv' : 'pip' };
}

/** A busca semântica local precisa do sentence-transformers no mesmo Python do Code Review Graph. */
async function hasEmbeddings(p: EnvironmentProbe, python: string | null): Promise<boolean> {
  if (python) {
    const found = await p.run(python, [
      '-c',
      "import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('sentence_transformers') else 1)",
    ]);
    if (found !== null) return true;
  }
  // sem o `#!` (no Windows o comando é um .exe): o uv lista o que foi instalado junto
  const listed = p.resolve('uv') ? await p.run('uv', ['tool', 'list', '--show-with', '--show-extras']) : null;
  const line = listed?.split('\n').find((l) => l.startsWith('code-review-graph '));
  return !!line && /sentence-transformers|embeddings/.test(line);
}

const statusOf = (ok: boolean, parentOk = true): EnvCheck['status'] => (!parentOk ? 'skipped' : ok ? 'ok' : 'missing');

/**
 * O banco de artefatos do board: o que falta nele, um filho por falta. Pulado sem o inventário. É
 * recomendação: o requisito do aviso do topo é `optional`.
 */
function harnessCheck(issues: HarnessIssue[] | null, requirement?: BoardRequirement): EnvCheck {
  const known = issues !== null;
  return {
    id: 'harness',
    status: statusOf(known && issues.length === 0, known),
    docs: DOCS.harness,
    requirement,
    children: HARNESS_ISSUES.map((issue) => ({ id: `harness-${issue}` as const, status: statusOf(!issues?.includes(issue), known) })),
  };
}

/**
 * O Diagnóstico do ambiente: o Node.js, um bloco por perfil de CLI (CLI, login, credenciais), o banco
 * de artefatos do board e o que ele aproveita quando existe. O board não instala nada de terceiros:
 * cada item diz se está pronto e onde a pessoa encontra como instalar.
 */
export async function checkEnvironment(p: EnvironmentProbe): Promise<EnvironmentReport> {
  const req = (id: BoardRequirement['id']) => p.requirements.find((r) => r.id === id);
  const windows = p.platform === 'win32';
  const install = INSTALL[windows ? 'windows' : 'unix'];
  const reopen = windows ? { reopenTerminal: true as const } : {};
  // a CLI de cada perfil pronto, com o PATH quando ela cai numa pasta fora dele
  const cliInstall = (base: AiBase) => [...(baseValue(install, base) ?? []), ...localBin(p, true)];

  // o Node.js que roda o MCP do board: a partir da versão mínima
  const nodeExe = p.resolve('node');
  const nodeVersion = !req('node') && nodeExe ? version(await p.run(nodeExe, ['--version'])) : undefined;
  const nodeOk = !req('node') && (!nodeVersion || Number(nodeVersion.split('.')[0]) >= NODE_MIN_MAJOR);
  const node: EnvCheck = {
    id: 'node',
    status: statusOf(nodeOk),
    version: nodeVersion,
    docs: DOCS.node,
    // com o nvm já instalado, falta só o Node com ele
    install: nodeOk
      ? undefined
      : !windows && p.exists(path.join(p.homeDir, '.nvm', 'nvm.sh'))
        ? install.node.filter((s) => s !== NVM)
        : install.node,
    ...(nodeOk ? {} : reopen),
  };

  // os perfis: o que faltar em cada CLI pronta traz o instalador oficial do sistema; os demais já trazem o link
  const profiles = p.health.map((h): ProfileHealth =>
    h.kind === 'builtin' && h.probe?.found !== true && h.base !== 'generic'
      ? { ...h, install: { steps: cliInstall(h.base), docs: CLI_DOCS[h.base] } }
      : h,
  );

  const gitExe = p.resolve('git');
  const repo = gitExe ? (await p.run(gitExe, ['rev-parse', '--is-inside-work-tree'], p.workspaceDir))?.trim() === 'true' : false;
  const git: EnvCheck = {
    id: 'git',
    status: statusOf(!!gitExe),
    version: gitExe ? version(await p.run(gitExe, ['--version'])) : undefined,
    docs: DOCS.git,
    install: gitExe ? undefined : packageInstall(p, 'git'),
    ...(gitExe ? {} : reopen),
    children: [{ id: 'repo', status: statusOf(repo, !!gitExe), command: 'git init', inProject: true }],
  };

  // o nome novo da principal ou da develop já está nas configurações, mas o repositório ainda não o segue:
  // o comando é o do clone local; a lista completa (GitHub, upstream, origin/HEAD) vem no aviso de renomeação
  const renames = p.branchRenames ?? [];
  const branchName: EnvCheck = {
    id: 'branch-name',
    status: statusOf(renames.length === 0),
    ...(renames.length ? { command: renames.map((r) => `git branch -m ${r.from} ${r.to}`).join(' && '), inProject: true as const } : {}),
  };

  const ghExe = p.resolve('gh');
  // `gh auth status` sai com erro sem login (ou com o token vencido)
  const ghAuth = ghExe ? (await p.run(ghExe, ['auth', 'status'])) !== null : false;
  const gh: EnvCheck = {
    id: 'gh',
    status: statusOf(!!ghExe),
    version: ghExe ? version(await p.run(ghExe, ['--version'])) : undefined,
    docs: DOCS.gh,
    install: ghExe ? undefined : packageInstall(p, 'gh'),
    ...(ghExe ? {} : reopen),
    children: [{ id: 'gh-auth', status: statusOf(ghAuth, !!ghExe), command: 'gh auth login' }],
  };

  // o Code Review Graph se instala pelo uv, que traz um Python só para ele quando falta: lendo de cima
  // para baixo, a ordem de instalar. Com ele já instalado (por qualquer caminho), o uv não importa mais
  const crgExe = p.resolve('code-review-graph');
  const uvExe = p.resolve('uv');
  // o grafo de cada projeto fica na pasta .code-review-graph, criada pelo build
  const graph = !!crgExe && p.exists(path.join(p.workspaceDir, '.code-review-graph'));
  const installer = crgExe ? crgInstaller(p, crgExe) : null;
  const embeddings = installer ? await hasEmbeddings(p, installer.python) : false;
  // o pacote da busca semântica vai pelo mesmo caminho por onde o Code Review Graph foi instalado
  const addEmbeddings =
    installer?.via === 'pipx'
      ? 'pipx inject code-review-graph "sentence-transformers>=3,<4"'
      : installer?.via === 'pip'
        ? 'pip install "code-review-graph[embeddings]"'
        : 'uv tool install --reinstall "code-review-graph[embeddings]"';
  const crgChildren: EnvCheck[] = [
    { id: 'crg-graph', status: statusOf(graph, !!crgExe), command: 'code-review-graph build', inProject: true },
    {
      id: 'crg-embeddings',
      status: statusOf(embeddings, !!crgExe),
      install: embeddings ? undefined : steps(addEmbeddings),
      command: 'code-review-graph embed --provider local',
      inProject: true,
      docs: DOCS['crg-embeddings'],
    },
  ];
  const crg: EnvCheck = {
    id: 'crg',
    status: statusOf(!!crgExe, !!crgExe || !!uvExe),
    version: crgExe ? version(await p.run(crgExe, ['--version'])) : undefined,
    docs: DOCS.crg,
    install: crgExe ? undefined : steps('uv tool install code-review-graph'),
    children: crgChildren,
  };
  const codeGraph: EnvCheck = crgExe
    ? crg
    : {
        id: 'uv',
        status: statusOf(!!uvExe),
        version: uvExe ? version(await p.run(uvExe, ['--version'])) : undefined,
        docs: DOCS.uv,
        install: uvExe ? undefined : [...install.uv, ...localBin(p, false)],
        ...(uvExe ? {} : reopen),
        children: [crg],
      };

  const defaultHealth = profiles.find((h) => h.isDefault);
  const simulation = p.simulateNextRun?.(!!defaultHealth && defaultHealth.problem === null) ?? null;
  const inUse = new Set(p.profilesInUse ?? []);
  const nextRun = simulation
    ? {
        simulation,
        blockedInUse: profiles.flatMap((h) =>
          inUse.has(h.id) && h.problem !== null ? [{ id: h.id, name: h.name, problem: h.problem }] : [],
        ),
      }
    : null;

  return {
    required: [node],
    profiles,
    availability: boardAvailability(profiles),
    regime: 'exclusive',
    nextRun,
    limits: p.effectiveLimits?.() ?? null,
    harness: harnessCheck(p.harnessIssues, req('harness')),
    recommended: [git, branchName, gh, codeGraph],
    // os instaladores do Linux e do macOS baixam pelo curl, que um Ubuntu desktop novo não traz
    ...(!windows && !p.resolve('curl') ? { curlMissing: true as const } : {}),
    checkedAt: Date.now(),
  };
}
