import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import { NODE_MIN_MAJOR, type EnvCheck, type EnvCheckId, type EnvironmentReport } from '../shared/environment';
import { CLI_COMMAND, LOGIN_COMMAND, type BoardRequirement, type RequirementId } from '../shared/requirements';

/** A outra ferramenta de IA, como o host a encontrou na máquina. */
export interface OtherToolProbe {
  tool: AiTool;
  /** o executável da CLI, ou null (a ferramenta foi achada pelo editor: o board está aberto no Cursor) */
  cli: string | null;
  /** null quando a CLI não diz */
  signedIn: boolean | null;
  /** o MCP do board está registrado nela */
  mcp: boolean;
  /** a skill do fluxo existe para ela */
  skill: boolean;
  /** por que ela não roda com o nível de permissão do board; null quando roda */
  permission: string | null;
}

export interface EnvironmentProbe {
  tool: AiTool;
  /** o que `checkRequirements` acabou de achar: os itens da ferramenta do projeto vêm daí, com o texto e a ação do aviso */
  requirements: BoardRequirement[];
  workspaceDir: string;
  /** a skill do fluxo está pronta para a ferramenta do projeto */
  skillInstalled: boolean;
  /** a outra ferramenta, quando encontrada na máquina */
  other: OtherToolProbe | null;
  /** o MCP do Code Review Graph está registrado na ferramenta do projeto */
  crgMcp: boolean;
  /** no Windows, os comandos de instalação são os do PowerShell */
  windows: boolean;
  /** caminho do executável de um comando, ou null */
  resolve(command: string): string | null;
  /** roda um comando e devolve a saída padrão; null quando ele falha ou não existe */
  run(command: string, args: string[], cwd?: string): Promise<string | null>;
  /** a primeira linha de um arquivo (o `#!` de um script), ou null */
  firstLine(file: string): string | null;
  exists(file: string): boolean;
}

/** Os requisitos do aviso que cada item da ferramenta do projeto resume. */
const FROM: Partial<Record<EnvCheckId, RequirementId[]>> = {
  node: ['node'],
  cli: ['cli'],
  signin: ['signin'],
  mcp: ['mcp', 'mcp-stale', 'mcp-elsewhere', 'mcp-outdated', 'mcp-reload', 'mcp-enable', 'mcp-path'],
  permission: ['permission'],
  skill: ['skill'],
};

/** O nome da ferramenta no `code-review-graph install --platform`. */
const CRG_PLATFORM: Record<AiTool, string> = {
  claude: 'claude-code',
  cursor: 'cursor',
};

/** Onde cada item explica como instalar ou configurar (conferido em 2026-10-11). */
const BOARD_DOCS = 'https://github.com/euclidesgc/faz-ai#usando-com-ia';
const CRG_DOCS = 'https://github.com/tirth8205/code-review-graph';
const DOCS: Partial<Record<EnvCheckId, string>> = {
  node: 'https://nodejs.org/en/download',
  mcp: BOARD_DOCS,
  skill: BOARD_DOCS,
  git: 'https://git-scm.com/downloads',
  gh: 'https://cli.github.com',
  crg: CRG_DOCS,
  uv: 'https://docs.astral.sh/uv/getting-started/installation/',
  'crg-embeddings': `${CRG_DOCS}#usage`,
};
const TOOL_DOCS: Record<AiTool, Partial<Record<EnvCheckId, string>>> = {
  claude: { cli: 'https://code.claude.com/docs/en/setup', permission: 'https://code.claude.com/docs/en/iam' },
  cursor: { cli: 'https://cursor.com/docs/cli/installation', permission: 'https://cursor.com/docs/cli/reference/permissions' },
};

/**
 * Os comandos que instalam cada programa, conforme o site oficial dele (conferido em 2026-10-11). Só
 * os instaladores neutros, que valem em qualquer distribuição: `curl` no Linux e no macOS, PowerShell
 * no Windows. O git e o GitHub CLI não têm um assim: ficam só com o site.
 */
const INSTALL: Record<'unix' | 'windows', Partial<Record<'node' | 'claude' | 'cursor' | 'uv', string[]>>> = {
  unix: {
    node: [
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash',
      '. "$HOME/.nvm/nvm.sh"',
      `nvm install ${NODE_MIN_MAJOR}`,
    ],
    claude: ['curl -fsSL https://claude.ai/install.sh | bash'],
    cursor: ['curl https://cursor.com/install -fsS | bash'],
    uv: ['curl -LsSf https://astral.sh/uv/install.sh | sh'],
  },
  windows: {
    node: ['winget install Schniz.fnm', `fnm install ${NODE_MIN_MAJOR}`],
    claude: ['irm https://claude.ai/install.ps1 | iex'],
    cursor: ["irm 'https://cursor.com/install?win32=true' | iex"],
    uv: ['powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'],
  },
};

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

/** O bloco de uma ferramenta: pronto só quando tudo dentro dele está pronto. */
function toolGroup(tool: AiTool, children: EnvCheck[]): EnvCheck {
  return {
    id: 'tool',
    tool,
    status: children.every((c) => c.status === 'ok' && (c.children ?? []).every((g) => g.status === 'ok')) ? 'ok' : 'missing',
    children,
  };
}

/**
 * O Diagnóstico do ambiente: uma lista do que o board precisa, do que é opcional (a outra ferramenta
 * de IA) e do que ele aproveita quando existe. O board não instala nada de terceiros: cada item diz se
 * está pronto e onde a pessoa encontra como instalar. Só o MCP e a skill do board têm botão.
 */
export async function checkEnvironment(p: EnvironmentProbe): Promise<EnvironmentReport> {
  const req = (id: EnvCheckId) => p.requirements.find((r) => FROM[id]?.includes(r.id));
  const tool = p.tool;
  const install = INSTALL[p.windows ? 'windows' : 'unix'];

  // o Node.js que roda o MCP do board: a partir da versão mínima
  const nodeExe = p.resolve('node');
  const nodeVersion = !req('node') && nodeExe ? version(await p.run(nodeExe, ['--version'])) : undefined;
  const nodeOk = !req('node') && (!nodeVersion || Number(nodeVersion.split('.')[0]) >= NODE_MIN_MAJOR);
  const node: EnvCheck = {
    id: 'node',
    status: statusOf(nodeOk),
    version: nodeVersion,
    docs: DOCS.node,
    install: nodeOk ? undefined : install.node,
  };

  const cliMissing = !!req('cli');
  const cliExe = cliMissing ? null : p.resolve(CLI_COMMAND[tool]);
  const signin = req('signin');
  const skill = p.skillInstalled ? undefined : (req('skill') ?? { id: 'skill' as const, tool, action: { kind: 'installSkill' as const } });
  const own = toolGroup(tool, [
    {
      id: 'cli',
      tool,
      status: statusOf(!cliMissing),
      version: cliExe ? version(await p.run(cliExe, ['--version'])) : undefined,
      docs: TOOL_DOCS[tool].cli,
      install: cliMissing ? install[tool] : undefined,
      children: [{ id: 'signin', tool, status: statusOf(!signin, !cliMissing), command: LOGIN_COMMAND[tool], requirement: signin }],
    },
    { id: 'mcp', tool, status: statusOf(!req('mcp')), docs: DOCS.mcp, requirement: req('mcp') },
    { id: 'skill', tool, status: statusOf(p.skillInstalled), docs: DOCS.skill, requirement: skill },
    { id: 'permission', tool, status: statusOf(!req('permission')), docs: TOOL_DOCS[tool].permission, requirement: req('permission') },
  ]);

  // a outra ferramenta: o board só confere; ele instala o MCP e a skill quando ela vira a do projeto
  const optional: EnvCheck[] = [];
  const o = p.other;
  if (o)
    optional.push(
      toolGroup(o.tool, [
        {
          id: 'cli',
          tool: o.tool,
          status: statusOf(!!o.cli),
          version: o.cli ? version(await p.run(o.cli, ['--version'])) : undefined,
          docs: TOOL_DOCS[o.tool].cli,
          install: o.cli ? undefined : install[o.tool],
          children: [{ id: 'signin', tool: o.tool, status: statusOf(o.signedIn !== false, !!o.cli), command: LOGIN_COMMAND[o.tool] }],
        },
        { id: 'mcp', tool: o.tool, status: statusOf(o.mcp), docs: DOCS.mcp },
        { id: 'skill', tool: o.tool, status: statusOf(o.skill), docs: DOCS.skill },
        { id: 'permission', tool: o.tool, status: statusOf(!o.permission), docs: TOOL_DOCS[o.tool].permission },
      ]),
    );

  const gitExe = p.resolve('git');
  const repo = gitExe ? (await p.run(gitExe, ['rev-parse', '--is-inside-work-tree'], p.workspaceDir))?.trim() === 'true' : false;
  const git: EnvCheck = {
    id: 'git',
    status: statusOf(!!gitExe),
    version: gitExe ? version(await p.run(gitExe, ['--version'])) : undefined,
    docs: DOCS.git,
    children: [{ id: 'repo', status: statusOf(repo, !!gitExe), command: 'git init' }],
  };

  const ghExe = p.resolve('gh');
  // `gh auth status` sai com erro sem login (ou com o token vencido)
  const ghAuth = ghExe ? (await p.run(ghExe, ['auth', 'status'])) !== null : false;
  const gh: EnvCheck = {
    id: 'gh',
    status: statusOf(!!ghExe),
    version: ghExe ? version(await p.run(ghExe, ['--version'])) : undefined,
    docs: DOCS.gh,
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
    { id: 'crg-graph', status: statusOf(graph, !!crgExe), command: 'code-review-graph build' },
    { id: 'crg-mcp', tool, status: statusOf(p.crgMcp, !!crgExe), command: `code-review-graph install --platform ${CRG_PLATFORM[tool]}` },
    {
      id: 'crg-embeddings',
      status: statusOf(embeddings, !!crgExe),
      install: embeddings ? undefined : [addEmbeddings],
      command: 'code-review-graph embed --provider local',
      docs: DOCS['crg-embeddings'],
    },
  ];
  const crg: EnvCheck = {
    id: 'crg',
    status: statusOf(!!crgExe, !!crgExe || !!uvExe),
    version: crgExe ? version(await p.run(crgExe, ['--version'])) : undefined,
    docs: DOCS.crg,
    install: crgExe ? undefined : ['uv tool install code-review-graph'],
    children: crgChildren,
  };
  const codeGraph: EnvCheck = crgExe
    ? crg
    : {
        id: 'uv',
        status: statusOf(!!uvExe),
        version: uvExe ? version(await p.run(uvExe, ['--version'])) : undefined,
        docs: DOCS.uv,
        install: uvExe ? undefined : install.uv,
        children: [crg],
      };

  return { tool, required: [node, own], optional, recommended: [git, gh, codeGraph], checkedAt: Date.now() };
}
