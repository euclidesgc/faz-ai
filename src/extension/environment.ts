import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import type { EnvCheck, EnvCheckId, EnvironmentReport } from '../shared/environment';
import type { BoardRequirement, RequirementId } from '../shared/requirements';

export interface EnvironmentProbe {
  tool: AiTool;
  /** o que `checkRequirements` acabou de achar: os itens obrigatórios vêm daí, com o texto e a ação do aviso */
  requirements: BoardRequirement[];
  workspaceDir: string;
  platform: NodeJS.Platform;
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
};

/** O nome da ferramenta no `code-review-graph install --platform` (sem nome lá, ele registra em todas as que achar). */
const CRG_PLATFORM: Partial<Record<AiTool, string>> = {
  claude: 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  copilot: 'copilot-cli',
};

const version = (out: string | null): string | undefined => /\d+\.\d+(?:\.\d+)?/.exec(out ?? '')?.[0];

/** Instala o `uv`, o instalador de ferramentas Python que o Code Review Graph recomenda. */
const installUv = (platform: NodeJS.Platform) =>
  platform === 'win32'
    ? 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
    : 'curl -LsSf https://astral.sh/uv/install.sh | sh';

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
    version: !node && nodeExe ? version(await p.run(nodeExe, ['--version'])) : undefined,
  });
  const cli = req('cli');
  checks.push({ id: 'cli', level: 'required', status: cli ? 'missing' : 'ok', requirement: cli });
  const signin = req('signin');
  checks.push({ id: 'signin', level: 'required', status: cli ? 'skipped' : signin ? 'missing' : 'ok', requirement: signin });
  const mcp = req('mcp');
  // no Claude e no Cursor as execuções pelo board levam o servidor sozinhas: o MCP só falta nas conversas da pessoa
  const mcpLevel = p.tool === 'claude' || p.tool === 'cursor' ? 'recommended' : 'required';
  checks.push({ id: 'mcp', level: mcpLevel, status: mcp ? 'missing' : 'ok', requirement: mcp });
  const permission = req('permission');
  checks.push({ id: 'permission', level: 'required', status: permission ? 'missing' : 'ok', requirement: permission });

  checks.push({
    id: 'skill',
    level: 'recommended',
    status: p.skillInstalled ? 'ok' : 'missing',
    fix: p.skillInstalled ? undefined : { kind: 'installSkill' },
  });

  const gitExe = p.resolve('git');
  const gitVersion = gitExe ? version(await p.run(gitExe, ['--version'])) : undefined;
  checks.push({ id: 'git', level: 'recommended', status: gitExe ? 'ok' : 'missing', version: gitVersion });
  const repo = gitExe ? (await p.run(gitExe, ['rev-parse', '--is-inside-work-tree'], p.workspaceDir))?.trim() === 'true' : false;
  checks.push({
    id: 'repo',
    level: 'recommended',
    status: !gitExe ? 'skipped' : repo ? 'ok' : 'missing',
    fix: gitExe && !repo ? { kind: 'commands', commands: ['git init'] } : undefined,
  });

  const ghExe = p.resolve('gh');
  checks.push({
    id: 'gh',
    level: 'recommended',
    status: ghExe ? 'ok' : 'missing',
    version: ghExe ? version(await p.run(ghExe, ['--version'])) : undefined,
  });
  // `gh auth status` sai com erro sem login (ou com o token vencido)
  const ghAuth = ghExe ? (await p.run(ghExe, ['auth', 'status'])) !== null : false;
  checks.push({
    id: 'gh-auth',
    level: 'recommended',
    status: !ghExe ? 'skipped' : ghAuth ? 'ok' : 'missing',
    fix: ghExe && !ghAuth ? { kind: 'commands', commands: ['gh auth login'] } : undefined,
  });

  const crgExe = p.resolve('code-review-graph');
  const platform = CRG_PLATFORM[p.tool];
  const register = `code-review-graph install${platform ? ` --platform ${platform}` : ''}`;
  checks.push({
    id: 'crg',
    level: 'recommended',
    status: crgExe ? 'ok' : 'missing',
    version: crgExe ? version(await p.run(crgExe, ['--version'])) : undefined,
    fix: crgExe
      ? undefined
      : {
          kind: 'commands',
          commands: [...(p.resolve('uv') ? [] : [installUv(p.platform)]), 'uv tool install code-review-graph', register],
        },
  });
  // o grafo de cada projeto fica na pasta .code-review-graph, criada pelo build
  const graph = !!crgExe && p.exists(path.join(p.workspaceDir, '.code-review-graph'));
  checks.push({
    id: 'crg-graph',
    level: 'recommended',
    status: !crgExe ? 'skipped' : graph ? 'ok' : 'missing',
    fix: crgExe && !graph ? { kind: 'commands', commands: ['code-review-graph build'] } : undefined,
  });
  const installer = crgExe ? crgInstaller(p, crgExe) : null;
  const embeddings = installer ? await hasEmbeddings(p, installer.python) : false;
  const addEmbeddings =
    installer?.via === 'uv'
      ? 'uv tool install --reinstall "code-review-graph[embeddings]"'
      : installer?.via === 'pipx'
        ? 'pipx inject code-review-graph "sentence-transformers>=3,<4"'
        : 'pip install "code-review-graph[embeddings]"';
  checks.push({
    id: 'crg-embeddings',
    level: 'recommended',
    status: !crgExe ? 'skipped' : embeddings ? 'ok' : 'missing',
    fix: crgExe && !embeddings ? { kind: 'commands', commands: [addEmbeddings, 'code-review-graph embed --provider local'] } : undefined,
  });

  return { tool: p.tool, checks, checkedAt: Date.now() };
}
