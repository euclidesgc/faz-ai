import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import type { EnvCheck, EnvCheckId, EnvironmentReport, EnvOs } from '../shared/environment';
import { installFix } from './installers';
import type { BoardRequirement, RequirementId } from '../shared/requirements';

export interface EnvironmentProbe {
  tool: AiTool;
  /** o que `checkRequirements` acabou de achar: os itens obrigatórios vêm daí, com o texto e a ação do aviso */
  requirements: BoardRequirement[];
  workspaceDir: string;
  /** o sistema da máquina: escolhe os comandos de instalação */
  os: EnvOs;
  /** as pastas do PATH do terminal: diz se `~/.local/bin` (onde a CLI do Cursor e o uv se instalam) já está nele */
  pathDirs: string[];
  homeDir: string;
  /**
   * o MCP do Code Review Graph no editor (o Cursor): `unregistered` quando o
   * editor não o tem, `unreachable` quando ele não acha o comando (instalado depois que o editor abriu),
   * `tracked` quando o arquivo está no git e o board não pode gravar o caminho; ausente fora do editor
   */
  crgMcp?: 'ok' | 'unregistered' | 'unreachable' | 'tracked';
  /** a skill do fluxo está instalada na ferramenta do projeto (global ou no projeto) */
  skillInstalled: boolean;
  /** caminho do executável de um comando, ou null */
  resolve(command: string): string | null;
  /** roda um comando e devolve a saída padrão; null quando ele falha ou não existe */
  run(command: string, args: string[], cwd?: string): Promise<string | null>;
  /** a primeira linha de um arquivo (o `#!` de um script), ou null */
  firstLine(file: string): string | null;
  exists(file: string): boolean;
}

/** Os requisitos do aviso que cada item obrigatório resume. */
const FROM: Partial<Record<EnvCheckId, RequirementId[]>> = {
  node: ['node'],
  cli: ['cli'],
  signin: ['signin'],
  mcp: ['mcp', 'mcp-stale', 'mcp-elsewhere', 'mcp-outdated', 'mcp-reload', 'mcp-enable'],
  permission: ['permission'],
  skill: ['skill'],
};

/** O nome da ferramenta no `code-review-graph install --platform` (sem nome lá, ele registra em todas as que achar). */
const CRG_PLATFORM: Partial<Record<AiTool, string>> = {
  claude: 'claude-code',
  cursor: 'cursor',
};

const version = (out: string | null): string | undefined => /\d+\.\d+(?:\.\d+)?/.exec(out ?? '')?.[0];

/** A versão do Python é 3.10 ou mais nova (o mínimo do Code Review Graph). */
const python310 = (v: string | undefined): boolean => {
  const [major = 0, minor = 0] = (v ?? '').split('.').map(Number);
  return major > 3 || (major === 3 && minor >= 10);
};

/**
 * Um Python 3.10 ou mais novo para o Code Review Graph: com o uv, o que ele acha (o dele ou o do
 * sistema); sem o uv, o do sistema. Devolve a versão, ou undefined.
 */
async function findPython(p: EnvironmentProbe, uv: string | null): Promise<string | undefined> {
  const candidates: string[] = [];
  if (uv) {
    const found = (await p.run(uv, ['python', 'find', '>=3.10']))?.trim();
    if (found) candidates.push(found);
  }
  for (const name of p.os.family === 'windows' ? ['py', 'python'] : ['python3', 'python']) {
    const exe = p.resolve(name);
    if (exe) candidates.push(exe);
  }
  for (const exe of candidates) {
    const v = version(await p.run(exe, ['--version']));
    if (python310(v)) return v;
  }
  return undefined;
}

/** Por onde o Code Review Graph foi instalado, pelo Python do script dele. */
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

/**
 * A instalação da CLI, com o passo do PATH quando ela cai em `~/.local/bin` (o instalador do Cursor) e
 * essa pasta ainda não está no PATH: sem ele, o terminal aberto não acha o comando logo depois.
 */
function cliFix(p: EnvironmentProbe, install: string): EnvCheck['fix'] {
  const localBin = path.join(p.homeDir, '.local', 'bin');
  const inPath = p.pathDirs.some((d) => d.replace(/\/+$/, '') === localBin);
  if (inPath || p.os.family === 'windows' || !install.includes('cursor.com/install')) return undefined;
  const rc = p.os.family === 'macos' ? '~/.zshrc' : '~/.bashrc';
  return {
    kind: 'commands',
    commands: [install, `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${rc}`, 'export PATH="$HOME/.local/bin:$PATH"'],
  };
}

/**
 * O Diagnóstico do ambiente: tudo de que o board precisa ou que ele usa, com o estado de cada item e
 * como resolver. Os obrigatórios repetem o aviso de requisitos (mesma conferência, mesmas ações); os
 * recomendados são conferidos só aqui, porque rodam comandos que o aviso não precisa rodar a toda hora.
 */
export async function checkEnvironment(p: EnvironmentProbe): Promise<EnvironmentReport> {
  const checks: EnvCheck[] = [];
  const req = (id: EnvCheckId) => p.requirements.find((r) => FROM[id]?.includes(r.id));

  const node = req('node');
  const nodeExe = p.resolve('node');
  checks.push({
    id: 'node',
    level: 'required',
    status: node ? 'missing' : 'ok',
    requirement: node,
    fix: node ? (installFix('node', p.os) ?? undefined) : undefined,
    version: !node && nodeExe ? version(await p.run(nodeExe, ['--version'])) : undefined,
  });
  const cli = req('cli');
  checks.push({
    id: 'cli',
    level: 'required',
    status: cli ? 'missing' : 'ok',
    requirement: cli,
    fix: cli?.action?.kind === 'command' ? cliFix(p, cli.action.command) : undefined,
  });
  const signin = req('signin');
  checks.push({
    id: 'signin',
    level: 'required',
    status: cli ? 'skipped' : signin ? 'missing' : 'ok',
    requirement: signin,
    // sem a CLI ainda, o login vem logo depois dela no "Instalar tudo"
    fix: cli?.cli ? { kind: 'commands', commands: [`${cli.cli} login`] } : undefined,
  });
  const mcp = req('mcp');
  checks.push({ id: 'mcp', level: 'required', status: mcp ? 'missing' : 'ok', requirement: mcp });
  const permission = req('permission');
  checks.push({ id: 'permission', level: 'required', status: permission ? 'missing' : 'ok', requirement: permission });

  checks.push({
    id: 'skill',
    level: 'required',
    status: p.skillInstalled ? 'ok' : 'missing',
    fix: p.skillInstalled ? undefined : { kind: 'installSkill' },
  });

  const gitExe = p.resolve('git');
  const gitVersion = gitExe ? version(await p.run(gitExe, ['--version'])) : undefined;
  checks.push({
    id: 'git',
    level: 'recommended',
    status: gitExe ? 'ok' : 'missing',
    version: gitVersion,
    fix: gitExe ? undefined : (installFix('git', p.os) ?? undefined),
  });
  const repo = gitExe ? (await p.run(gitExe, ['rev-parse', '--is-inside-work-tree'], p.workspaceDir))?.trim() === 'true' : false;
  checks.push({
    id: 'repo',
    level: 'recommended',
    status: !gitExe ? 'skipped' : repo ? 'ok' : 'missing',
    fix: !repo ? { kind: 'commands', commands: ['git init'] } : undefined,
  });

  const ghExe = p.resolve('gh');
  checks.push({
    id: 'gh',
    level: 'recommended',
    status: ghExe ? 'ok' : 'missing',
    version: ghExe ? version(await p.run(ghExe, ['--version'])) : undefined,
    fix: ghExe ? undefined : (installFix('gh', p.os) ?? undefined),
  });
  // `gh auth status` sai com erro sem login (ou com o token vencido)
  const ghAuth = ghExe ? (await p.run(ghExe, ['auth', 'status'])) !== null : false;
  checks.push({
    id: 'gh-auth',
    level: 'recommended',
    status: !ghExe ? 'skipped' : ghAuth ? 'ok' : 'missing',
    fix: !ghAuth ? { kind: 'commands', commands: ['gh auth login'] } : undefined,
  });

  const crgExe = p.resolve('code-review-graph');
  const platform = CRG_PLATFORM[p.tool];
  const register = `code-review-graph install${platform ? ` --platform ${platform}` : ''}`;
  // o Code Review Graph é um programa Python, instalado pelo uv (que traz um Python só para ele)
  const uvExe = p.resolve('uv');
  checks.push({
    id: 'crg',
    level: 'recommended',
    status: crgExe ? 'ok' : 'missing',
    version: crgExe ? version(await p.run(crgExe, ['--version'])) : undefined,
    fix: crgExe ? undefined : { kind: 'commands', commands: ['uv tool install code-review-graph', register] },
  });
  // os pré-requisitos só importam para instalar: com o Code Review Graph instalado, ficam de fora
  if (!crgExe) {
    checks.push({
      id: 'uv',
      parent: 'crg',
      level: 'recommended',
      status: uvExe ? 'ok' : 'missing',
      version: uvExe ? version(await p.run(uvExe, ['--version'])) : undefined,
      fix: uvExe ? undefined : (installFix('uv', p.os) ?? undefined),
    });
    const python = await findPython(p, uvExe);
    checks.push({
      id: 'python',
      parent: 'crg',
      level: 'recommended',
      // sem Python e sem uv, o Python vem junto com o uv
      status: python ? 'ok' : uvExe ? 'missing' : 'skipped',
      version: python,
      fix: !python && uvExe ? { kind: 'commands', commands: ['uv python install 3.12'] } : undefined,
    });
  }
  // o grafo de cada projeto fica na pasta .code-review-graph, criada pelo build
  const graph = !!crgExe && p.exists(path.join(p.workspaceDir, '.code-review-graph'));
  checks.push({
    id: 'crg-graph',
    level: 'recommended',
    status: !crgExe ? 'skipped' : graph ? 'ok' : 'missing',
    fix: !graph ? { kind: 'commands', commands: ['code-review-graph build'] } : undefined,
  });
  if (crgExe && p.crgMcp)
    checks.push({
      id: 'crg-mcp',
      level: 'recommended',
      status: p.crgMcp === 'ok' ? 'ok' : 'missing',
      ...(p.crgMcp === 'tracked' ? { tracked: true as const } : {}),
      fix:
        p.crgMcp === 'unregistered'
          ? { kind: 'commands', commands: [register] }
          : p.crgMcp === 'unreachable'
            ? { kind: 'pinMcp' }
            : undefined,
    });
  const installer = crgExe ? crgInstaller(p, crgExe) : null;
  const embeddings = installer ? await hasEmbeddings(p, installer.python) : false;
  // sem o Code Review Graph ainda, ele vem pelo uv (o caminho que o Diagnóstico ensina)
  const addEmbeddings =
    installer?.via === 'pipx'
      ? 'pipx inject code-review-graph "sentence-transformers>=3,<4"'
      : installer?.via === 'pip'
        ? 'pip install "code-review-graph[embeddings]"'
        : 'uv tool install --reinstall "code-review-graph[embeddings]"';
  checks.push({
    id: 'crg-embeddings',
    level: 'recommended',
    status: !crgExe ? 'skipped' : embeddings ? 'ok' : 'missing',
    fix: !embeddings ? { kind: 'commands', commands: [addEmbeddings, 'code-review-graph embed --provider local'] } : undefined,
  });

  return { tool: p.tool, os: p.os, checks, checkedAt: Date.now() };
}
