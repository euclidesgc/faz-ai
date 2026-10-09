import { describe, expect, it } from 'vitest';
import { checkEnvironment, type EnvironmentProbe } from '../src/extension/environment';
import type { EnvCheckId, EnvOs } from '../src/shared/environment';
import { detectOs, installFix } from '../src/extension/installers';

const UBUNTU: EnvOs = { platform: 'linux', family: 'debian', label: 'Ubuntu 24.04.3 LTS' };
import type { BoardRequirement } from '../src/shared/requirements';

/** Uma máquina de mentira: os comandos que existem, o que cada um responde e os arquivos. */
function probe(o: {
  commands?: Record<string, string>;
  outputs?: Record<string, string | null>;
  files?: Record<string, string>;
  requirements?: BoardRequirement[];
  skillInstalled?: boolean;
  tool?: EnvironmentProbe['tool'];
  os?: EnvOs;
  pathDirs?: string[];
}): EnvironmentProbe & { ran: string[] } {
  const ran: string[] = [];
  return {
    ran,
    tool: o.tool ?? 'cursor',
    requirements: o.requirements ?? [],
    workspaceDir: '/proj',
    os: o.os ?? UBUNTU,
    pathDirs: o.pathDirs ?? ['/usr/bin'],
    homeDir: '/home/u',
    skillInstalled: o.skillInstalled ?? false,
    resolve: (c) => o.commands?.[c] ?? null,
    run: async (c, args) => {
      const key = [c, ...args].join(' ');
      ran.push(key);
      return key in (o.outputs ?? {}) ? o.outputs![key]! : null;
    },
    firstLine: (f) => o.files?.[f]?.split('\n')[0] ?? null,
    exists: (f) => f in (o.files ?? {}),
  };
}

const byId = (checks: { id: EnvCheckId }[], id: EnvCheckId) => checks.find((c) => c.id === id) as never as Record<string, unknown>;

const CRG = '/home/u/.local/bin/code-review-graph';
const UV_PY = '/home/u/.local/share/uv/tools/code-review-graph/bin/python';
const FIND_SPEC = `${UV_PY} -c import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('sentence_transformers') else 1)`;

describe('Diagnóstico do ambiente', () => {
  it('máquina vazia: os itens que dependem de outro ficam para depois, e cada falta tem como resolver', async () => {
    const cli: BoardRequirement = {
      id: 'cli',
      tool: 'cursor',
      cli: 'cursor-agent',
      action: { kind: 'command', command: 'curl https://cursor.com/install -fsS | bash' },
    };
    const node: BoardRequirement = { id: 'node', tool: 'cursor', action: null };
    const r = await checkEnvironment(probe({ requirements: [node, cli] }));
    expect(r.checks.map((c) => [c.id, c.status])).toEqual([
      ['node', 'missing'],
      ['cli', 'missing'],
      ['signin', 'skipped'],
      ['mcp', 'ok'],
      ['permission', 'ok'],
      ['skill', 'missing'],
      ['git', 'missing'],
      ['repo', 'skipped'],
      ['gh', 'missing'],
      ['gh-auth', 'skipped'],
      ['crg', 'missing'],
      ['uv', 'missing'],
      ['python', 'skipped'],
      ['crg-graph', 'skipped'],
      ['crg-embeddings', 'skipped'],
    ]);
    // o obrigatório leva o requisito do aviso, com o texto e a ação dele
    expect(byId(r.checks, 'cli').requirement).toBe(cli);
    expect(byId(r.checks, 'skill').fix).toEqual({ kind: 'installSkill' });
    // o que espera o item anterior já traz o comando, para o "Instalar tudo" rodar em sequência
    expect(byId(r.checks, 'signin').fix).toEqual({ kind: 'commands', commands: ['cursor-agent login'] });
    expect(byId(r.checks, 'repo').fix).toEqual({ kind: 'commands', commands: ['git init'] });
    expect(byId(r.checks, 'gh-auth').fix).toEqual({ kind: 'commands', commands: ['gh auth login'] });
    expect(byId(r.checks, 'crg-graph').fix).toEqual({ kind: 'commands', commands: ['code-review-graph build'] });
    expect((byId(r.checks, 'crg-embeddings').fix as { commands: string[] }).commands[0]).toContain('uv tool install');
    // o registro do MCP vai só para a ferramenta do projeto; o uv é um pré-requisito à parte, com o PATH
    expect(byId(r.checks, 'crg').fix).toEqual({
      kind: 'commands',
      commands: ['uv tool install code-review-graph', 'code-review-graph install --platform cursor'],
    });
    expect(byId(r.checks, 'uv')).toMatchObject({
      parent: 'crg',
      fix: { kind: 'commands', commands: ['curl -LsSf https://astral.sh/uv/install.sh | sh', 'export PATH="$HOME/.local/bin:$PATH"'] },
    });
    // a CLI do Cursor cai em ~/.local/bin, fora do PATH: os comandos incluem a pasta
    expect(byId(r.checks, 'cli').fix).toEqual({
      kind: 'commands',
      commands: [
        'curl https://cursor.com/install -fsS | bash',
        `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc`,
        'export PATH="$HOME/.local/bin:$PATH"',
      ],
    });
    // Node, git e gh com o comando do sistema
    expect((byId(r.checks, 'node').fix as { commands: string[] }).commands.at(-1)).toBe('nvm install --lts');
    expect(byId(r.checks, 'git').fix).toEqual({ kind: 'commands', commands: ['sudo apt update', 'sudo apt install -y git'] });
    expect(byId(r.checks, 'gh').fix).toEqual({ kind: 'commands', commands: ['sudo apt update', 'sudo apt install -y gh'] });
  });

  it('o MCP e a skill do fluxo são necessários em todas as ferramentas', async () => {
    const mcp: BoardRequirement = { id: 'mcp-enable', tool: 'cursor', action: { kind: 'openEditorMcp' } };
    const cursor = await checkEnvironment(probe({ requirements: [mcp] }));
    expect(byId(cursor.checks, 'mcp')).toMatchObject({ level: 'required', status: 'missing', requirement: mcp });
    expect(byId(cursor.checks, 'skill')).toMatchObject({ level: 'required', status: 'missing', fix: { kind: 'installSkill' } });
    const claude = await checkEnvironment(probe({ tool: 'claude', skillInstalled: true }));
    expect(byId(claude.checks, 'mcp')).toMatchObject({ level: 'required', status: 'ok' });
    expect(byId(claude.checks, 'skill')).toMatchObject({ level: 'required', status: 'ok' });
  });

  it('tudo instalado: mostra as versões e não sugere nada', async () => {
    const p = probe({
      skillInstalled: true,
      commands: { node: '/usr/bin/node', git: '/usr/bin/git', gh: '/usr/bin/gh', 'code-review-graph': CRG, uv: '/usr/bin/uv' },
      outputs: {
        '/usr/bin/node --version': 'v22.3.0\n',
        '/usr/bin/git --version': 'git version 2.43.0\n',
        '/usr/bin/git rev-parse --is-inside-work-tree': 'true\n',
        '/usr/bin/gh --version': 'gh version 2.92.0 (2026-04-28)\n',
        '/usr/bin/gh auth status': '',
        [`${CRG} --version`]: 'code-review-graph 2.3.6\n',
        [FIND_SPEC]: '',
      },
      files: { [CRG]: `#!${UV_PY}\nimport sys`, '/proj/.code-review-graph': '' },
    });
    const r = await checkEnvironment(p);
    expect(r.checks.filter((c) => c.status !== 'ok').map((c) => c.id)).toEqual([]);
    expect(r.checks.filter((c) => c.version).map((c) => [c.id, c.version])).toEqual([
      ['node', '22.3.0'],
      ['git', '2.43.0'],
      ['gh', '2.92.0'],
      ['crg', '2.3.6'],
    ]);
  });

  it('Code Review Graph sem grafo e sem a busca semântica: build e embed local, pelo instalador que ele usou', async () => {
    const base = { commands: { 'code-review-graph': CRG }, outputs: { [`${CRG} --version`]: '2.3.6' } };
    const uv = await checkEnvironment(probe({ ...base, files: { [CRG]: `#!${UV_PY}` } }));
    expect(byId(uv.checks, 'crg-graph').fix).toEqual({ kind: 'commands', commands: ['code-review-graph build'] });
    expect(byId(uv.checks, 'crg-embeddings').fix).toEqual({
      kind: 'commands',
      commands: ['uv tool install --reinstall "code-review-graph[embeddings]"', 'code-review-graph embed --provider local'],
    });
    const pipx = await checkEnvironment(probe({ ...base, files: { [CRG]: '#!/home/u/.local/pipx/venvs/code-review-graph/bin/python' } }));
    expect((byId(pipx.checks, 'crg-embeddings').fix as { commands: string[] }).commands[0]).toBe(
      'pipx inject code-review-graph "sentence-transformers>=3,<4"',
    );
  });

  it('sem o #! (Windows), a busca semântica é lida da lista do uv', async () => {
    const r = await checkEnvironment(
      probe({
        os: { platform: 'win32', family: 'windows', label: 'Windows' },
        commands: { 'code-review-graph': 'C:\\u\\.local\\bin\\code-review-graph.exe', uv: 'C:\\uv.exe' },
        outputs: {
          'uv tool list --show-with --show-extras': 'code-review-graph v2.3.6 [with: sentence-transformers]\n- code-review-graph\n',
        },
      }),
    );
    expect(byId(r.checks, 'crg-embeddings').status).toBe('ok');
  });

  it('o #! com env usa o Python que vem depois', async () => {
    const p = probe({
      commands: { 'code-review-graph': CRG },
      files: { [CRG]: '#!/usr/bin/env python3\n' },
      outputs: { "python3 -c import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('sentence_transformers') else 1)": '' },
    });
    const r = await checkEnvironment(p);
    expect(byId(r.checks, 'crg-embeddings').status).toBe('ok');
  });

  it('git sem repositório e gh sem login: git init e gh auth login', async () => {
    const r = await checkEnvironment(
      probe({ commands: { git: '/usr/bin/git', gh: '/usr/bin/gh' }, outputs: { '/usr/bin/git rev-parse --is-inside-work-tree': null } }),
    );
    expect(byId(r.checks, 'repo')).toMatchObject({ status: 'missing', fix: { kind: 'commands', commands: ['git init'] } });
    expect(byId(r.checks, 'gh-auth')).toMatchObject({ status: 'missing', fix: { kind: 'commands', commands: ['gh auth login'] } });
  });

  it('o uv e o Python só aparecem enquanto falta o Code Review Graph; com o uv, o Python vem dele', async () => {
    const uv = { commands: { uv: '/home/u/.local/bin/uv' }, outputs: { '/home/u/.local/bin/uv --version': 'uv 0.12.23' } };
    const semPython = await checkEnvironment(probe(uv));
    expect(byId(semPython.checks, 'uv')).toMatchObject({ status: 'ok', version: '0.12.23' });
    expect(byId(semPython.checks, 'python')).toMatchObject({
      status: 'missing',
      fix: { kind: 'commands', commands: ['uv python install 3.12'] },
    });
    const comPython = await checkEnvironment(
      probe({
        ...uv,
        outputs: {
          ...uv.outputs,
          '/home/u/.local/bin/uv python find >=3.10': '/home/u/.local/share/uv/python/cpython-3.14/bin/python3.14\n',
          '/home/u/.local/share/uv/python/cpython-3.14/bin/python3.14 --version': 'Python 3.14.0',
        },
      }),
    );
    expect(byId(comPython.checks, 'python')).toMatchObject({ status: 'ok', version: '3.14.0' });
    // um Python antigo do sistema não serve
    const antigo = await checkEnvironment(
      probe({ commands: { python3: '/usr/bin/python3' }, outputs: { '/usr/bin/python3 --version': 'Python 3.8.10' } }),
    );
    expect(byId(antigo.checks, 'python').status).toBe('skipped');
    const instalado = await checkEnvironment(probe({ commands: { 'code-review-graph': CRG } }));
    expect(instalado.checks.map((c) => c.id)).not.toContain('uv');
  });

  it('com ~/.local/bin no PATH, a CLI do Cursor não pede o passo do PATH', async () => {
    const cli: BoardRequirement = {
      id: 'cli',
      tool: 'cursor',
      action: { kind: 'command', command: 'curl https://cursor.com/install -fsS | bash' },
    };
    const r = await checkEnvironment(probe({ requirements: [cli], pathDirs: ['/home/u/.local/bin/', '/usr/bin'] }));
    expect(byId(r.checks, 'cli').fix).toBeUndefined();
  });

  it('"Instalar tudo" no Claude Code (fora do Cursor) também enfileira o login depois de instalar a CLI', async () => {
    const cli: BoardRequirement = { id: 'cli', tool: 'claude', cli: 'claude', action: null };
    const r = await checkEnvironment(probe({ tool: 'claude', requirements: [cli] }));
    expect(byId(r.checks, 'signin')).toMatchObject({ status: 'skipped' });
    expect(byId(r.checks, 'signin').fix).toEqual({ kind: 'commands', commands: ['claude login'] });
  });
});

describe('instaladores por sistema', () => {
  it('reconhece a família pelo /etc/os-release', () => {
    expect(detectOs('linux', 'PRETTY_NAME="Zorin OS 18.1"\nID=zorin\nID_LIKE="ubuntu debian"\n')).toEqual({
      platform: 'linux',
      family: 'debian',
      label: 'Zorin OS 18.1',
    });
    expect(detectOs('linux', 'ID=fedora\nPRETTY_NAME="Fedora Linux 42"').family).toBe('fedora');
    expect(detectOs('linux', 'ID=arch\n').family).toBe('arch');
    expect(detectOs('linux', 'ID=nixos\n')).toMatchObject({ family: 'linux', label: 'Linux' });
    expect(detectOs('darwin', null).family).toBe('macos');
    expect(detectOs('win32', null).family).toBe('windows');
  });

  it('cada sistema com o seu gerenciador', () => {
    const win: EnvOs = { platform: 'win32', family: 'windows', label: 'Windows' };
    const mac: EnvOs = { platform: 'darwin', family: 'macos', label: 'macOS' };
    expect(installFix('gh', win)).toEqual({ kind: 'commands', commands: ['winget install --id GitHub.cli -e'], reopenTerminal: true });
    expect(installFix('uv', win)).toMatchObject({ reopenTerminal: true, commands: [expect.stringContaining('install.ps1')] });
    expect(installFix('gh', mac)).toEqual({ kind: 'commands', commands: ['brew install gh'], brew: true });
    expect(installFix('git', mac)).toEqual({ kind: 'commands', commands: ['xcode-select --install'] });
    expect(installFix('gh', { platform: 'linux', family: 'arch', label: 'Arch' })).toEqual({
      kind: 'commands',
      commands: ['sudo pacman -S --needed github-cli'],
    });
    expect(installFix('git', { platform: 'linux', family: 'fedora', label: 'Fedora' })).toEqual({
      kind: 'commands',
      commands: ['sudo dnf install -y git'],
    });
    // distribuição desconhecida: sem comando, fica o link de download
    expect(installFix('git', { platform: 'linux', family: 'linux', label: 'Linux' })).toBeNull();
  });
});
