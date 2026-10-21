import { describe, expect, it } from 'vitest';
import { checkEnvironment, linuxFamily, type EnvironmentProbe, type LinuxFamily, type OtherToolProbe } from '../src/extension/environment';
import { missingCount, type EnvCheck, type EnvCheckId, type EnvironmentReport } from '../src/shared/environment';
import type { BoardRequirement } from '../src/shared/requirements';

/** Uma máquina de mentira: os comandos que existem, o que cada um responde e os arquivos. */
function probe(o: {
  commands?: Record<string, string>;
  outputs?: Record<string, string | null>;
  files?: Record<string, string>;
  requirements?: BoardRequirement[];
  skillInstalled?: boolean;
  harnessIssues?: EnvironmentProbe['harnessIssues'];
  tool?: EnvironmentProbe['tool'];
  others?: OtherToolProbe[];
  crgMcp?: boolean;
  platform?: NodeJS.Platform;
  pathDirs?: string[];
  linux?: LinuxFamily | null;
  branchRenames?: EnvironmentProbe['branchRenames'];
}): EnvironmentProbe & { ran: string[] } {
  const ran: string[] = [];
  return {
    ran,
    tool: o.tool ?? 'cursor',
    requirements: o.requirements ?? [],
    workspaceDir: '/proj',
    skillInstalled: o.skillInstalled ?? false,
    harnessIssues: o.harnessIssues === undefined ? [] : o.harnessIssues,
    others: o.others ?? [],
    crgMcp: o.crgMcp ?? false,
    branchRenames: o.branchRenames,
    platform: o.platform ?? 'linux',
    homeDir: '/home/u',
    pathDirs: o.pathDirs ?? ['/usr/bin', '/home/u/.local/bin'],
    linux: o.linux === undefined ? 'debian' : o.linux,
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

/** Todos os itens da árvore, na ordem da tela. */
const flat = (checks: EnvCheck[]): EnvCheck[] => checks.flatMap((c) => [c, ...flat(c.children ?? [])]);
const all = (r: EnvironmentReport) => flat([...r.required, ...r.optional, ...r.recommended]);
const find = (checks: EnvCheck[], id: EnvCheckId) => flat(checks).find((c) => c.id === id)!;
/** A árvore só com id e estado, para comparar a forma inteira. */
/** Só os comandos da instalação de um item. */
const commands = (c: EnvCheck) => c.install?.map((s) => s.command);
const shape = (checks: EnvCheck[]): unknown[] =>
  checks.map((c) => (c.children?.length ? [c.id, c.status, shape(c.children)] : [c.id, c.status]));

const CRG = '/home/u/.local/bin/code-review-graph';
const UV_PY = '/home/u/.local/share/uv/tools/code-review-graph/bin/python';
const FIND_SPEC = `${UV_PY} -c import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('sentence_transformers') else 1)`;

describe('Diagnóstico do ambiente', () => {
  it('máquina vazia: o que depende de outro item fica dentro dele, esperando', async () => {
    const node: BoardRequirement = { id: 'node', tool: 'cursor', action: null };
    const cli: BoardRequirement = { id: 'cli', tool: 'cursor', cli: 'cursor-agent', action: null };
    const r = await checkEnvironment(probe({ requirements: [node, cli] }));
    expect(shape(r.required)).toEqual([
      ['node', 'missing'],
      [
        'tool',
        'missing',
        [
          ['cli', 'missing', [['signin', 'skipped']]],
          ['mcp', 'ok'],
          ['skill', 'missing'],
          // o harness depende da CLI: sem ela, nem ele nem o que falta nele dá para conferir
          [
            'harness',
            'skipped',
            [
              ['harness-artifacts', 'skipped'],
              ['harness-agents', 'skipped'],
              ['harness-rules', 'skipped'],
              ['harness-missing', 'skipped'],
              ['harness-isolation', 'skipped'],
            ],
          ],
          ['permission', 'ok'],
        ],
      ],
    ]);
    expect(r.optional).toEqual([]);
    expect(shape(r.recommended)).toEqual([
      ['git', 'missing', [['repo', 'skipped']]],
      ['branch-name', 'ok'],
      ['gh', 'missing', [['gh-auth', 'skipped']]],
      // na ordem de instalar: o uv, depois o Code Review Graph, depois o que ele faz no projeto
      [
        'uv',
        'missing',
        [
          [
            'crg',
            'skipped',
            [
              ['crg-graph', 'skipped'],
              ['crg-mcp', 'skipped'],
              ['crg-embeddings', 'skipped'],
            ],
          ],
        ],
      ],
    ]);
    // o bloco da ferramenta só resume: contam o Node, a CLI e a skill
    expect(missingCount(r.required)).toBe(3);
  });

  it('o nome da branch fica pendente, em recomendados, enquanto houver renomeação à espera', async () => {
    const none = await checkEnvironment(probe({ tool: 'claude' }));
    expect(find(none.recommended, 'branch-name').status).toBe('ok');
    expect(find(none.recommended, 'branch-name').command).toBeUndefined();
    const pending = await checkEnvironment(
      probe({
        tool: 'claude',
        branchRenames: [
          { kind: 'main', from: 'master', to: 'main', previous: '' },
          { kind: 'develop', from: 'dev', to: 'develop', previous: 'dev' },
        ],
      }),
    );
    expect(find(pending.recommended, 'branch-name')).toMatchObject({
      status: 'missing',
      command: 'git branch -m master main && git branch -m dev develop',
      inProject: true,
    });
    // recomendação: não entra na contagem do que falta para a IA trabalhar
    expect(missingCount(pending.required)).toBe(missingCount(none.required));
    expect(pending.required.some((c) => c.id === 'branch-name')).toBe(false);
  });

  it('o board não instala nada de terceiros: cada item traz o site ou o comando para copiar', async () => {
    const r = await checkEnvironment(probe({ tool: 'claude' }));
    const items = all(r);
    expect(items.filter((c) => c.requirement?.action && c.requirement.action.kind !== 'settings')).toEqual([]);
    expect(find(r.required, 'node').docs).toBe('https://nodejs.org/en/download');
    expect(find(r.required, 'cli').docs).toBe('https://code.claude.com/docs/en/setup');
    expect(find(r.required, 'signin').command).toBe('claude auth login');
    expect(find(r.recommended, 'repo').command).toBe('git init');
    expect(find(r.recommended, 'gh-auth').command).toBe('gh auth login');
    expect(find(r.recommended, 'crg-graph').command).toBe('code-review-graph build');
    expect(find(r.recommended, 'crg-mcp').command).toBe('code-review-graph install --platform claude-code');
    expect(find(r.recommended, 'crg-embeddings').command).toBe('code-review-graph embed --provider local');
  });

  it('o MCP, a skill e a permissão da ferramenta do projeto levam o requisito do aviso, com o botão dele', async () => {
    const mcp: BoardRequirement = { id: 'mcp-enable', tool: 'cursor', action: { kind: 'openEditorMcp' } };
    const signin: BoardRequirement = {
      id: 'signin',
      tool: 'cursor',
      cli: 'cursor-agent',
      action: { kind: 'command', command: 'cursor-agent login' },
    };
    const r = await checkEnvironment(probe({ requirements: [mcp, signin], commands: { 'cursor-agent': '/bin/cursor-agent' } }));
    expect(find(r.required, 'mcp')).toMatchObject({ status: 'missing', requirement: mcp });
    expect(find(r.required, 'skill')).toMatchObject({ status: 'missing', requirement: { action: { kind: 'settings' } } });
    expect(find(r.required, 'signin')).toMatchObject({ status: 'missing', command: 'cursor-agent login', requirement: signin });
  });

  it('Node.js abaixo da versão mínima falta, com a versão encontrada', async () => {
    const old = await checkEnvironment(
      probe({ commands: { node: '/usr/bin/node' }, outputs: { '/usr/bin/node --version': 'v20.11.0\n' } }),
    );
    expect(find(old.required, 'node')).toMatchObject({ status: 'missing', version: '20.11.0' });
    const ok = await checkEnvironment(probe({ commands: { node: '/usr/bin/node' }, outputs: { '/usr/bin/node --version': 'v22.3.0\n' } }));
    expect(find(ok.required, 'node')).toMatchObject({ status: 'ok', version: '22.3.0' });
  });

  it('a outra ferramenta encontrada na máquina entra nos opcionais, só com o estado de cada item', async () => {
    const claude: OtherToolProbe = { tool: 'claude', cli: '/bin/claude', signedIn: false, mcp: true, skill: false, permission: null };
    const r = await checkEnvironment(probe({ others: [claude], outputs: { '/bin/claude --version': '2.1.4 (Claude Code)' } }));
    expect(shape(r.optional)).toEqual([
      [
        'tool',
        'missing',
        [
          ['cli', 'ok', [['signin', 'missing']]],
          ['mcp', 'ok'],
          ['skill', 'missing'],
          ['permission', 'ok'],
        ],
      ],
    ]);
    expect(r.optional[0]!.tool).toBe('claude');
    expect(find(r.optional, 'cli').version).toBe('2.1.4');
    expect(find(r.optional, 'signin').command).toBe('claude auth login');
    expect(flat(r.optional).some((c) => c.requirement)).toBe(false);
    // a ferramenta achada pelo editor, sem a CLI: o login espera a CLI
    const editor = await checkEnvironment(
      probe({ tool: 'claude', others: [{ tool: 'cursor', cli: null, signedIn: null, mcp: false, skill: false, permission: null }] }),
    );
    expect(find(editor.optional, 'cli').status).toBe('missing');
    expect(find(editor.optional, 'signin').status).toBe('skipped');
  });

  it('tudo instalado: mostra as versões e não falta nada', async () => {
    const p = probe({
      skillInstalled: true,
      crgMcp: true,
      commands: {
        node: '/usr/bin/node',
        'cursor-agent': '/bin/cursor-agent',
        git: '/usr/bin/git',
        gh: '/usr/bin/gh',
        'code-review-graph': CRG,
      },
      outputs: {
        '/usr/bin/node --version': 'v22.3.0\n',
        '/bin/cursor-agent --version': '2026.09.30-abc\n',
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
    expect(
      all(r)
        .filter((c) => c.status !== 'ok')
        .map((c) => c.id),
    ).toEqual([]);
    expect(
      all(r)
        .filter((c) => c.version)
        .map((c) => [c.id, c.version]),
    ).toEqual([
      ['node', '22.3.0'],
      ['cli', '2026.09.30'],
      ['git', '2.43.0'],
      ['gh', '2.92.0'],
      ['crg', '2.3.6'],
    ]);
    // com o Code Review Graph instalado, o uv e o Python ficam de fora
    expect(find(r.recommended, 'crg').children!.map((c) => c.id)).toEqual(['crg-graph', 'crg-mcp', 'crg-embeddings']);
  });

  it('sem o #! (Windows), a busca semântica é lida da lista do uv', async () => {
    const r = await checkEnvironment(
      probe({
        commands: { 'code-review-graph': 'C:\\u\\.local\\bin\\code-review-graph.exe', uv: 'C:\\uv.exe' },
        outputs: {
          'uv tool list --show-with --show-extras': 'code-review-graph v2.3.6 [with: sentence-transformers]\n- code-review-graph\n',
        },
      }),
    );
    expect(find(r.recommended, 'crg-embeddings').status).toBe('ok');
  });

  it('o #! com env usa o Python que vem depois', async () => {
    const r = await checkEnvironment(
      probe({
        commands: { 'code-review-graph': CRG },
        files: { [CRG]: '#!/usr/bin/env python3\n' },
        outputs: { "python3 -c import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('sentence_transformers') else 1)": '' },
      }),
    );
    expect(find(r.recommended, 'crg-embeddings').status).toBe('ok');
  });

  it('git sem repositório e gh sem login', async () => {
    const r = await checkEnvironment(
      probe({ commands: { git: '/usr/bin/git', gh: '/usr/bin/gh' }, outputs: { '/usr/bin/git rev-parse --is-inside-work-tree': null } }),
    );
    expect(find(r.recommended, 'repo').status).toBe('missing');
    expect(find(r.recommended, 'gh-auth').status).toBe('missing');
  });

  it('com o uv, o Code Review Graph fica faltando, com o comando dele; instalado, ele sobe e o uv sai', async () => {
    const uv = { commands: { uv: '/home/u/.local/bin/uv' }, outputs: { '/home/u/.local/bin/uv --version': 'uv 0.12.23' } };
    const before = await checkEnvironment(probe(uv));
    expect(find(before.recommended, 'uv')).toMatchObject({ status: 'ok', version: '0.12.23', install: undefined });
    expect(find(before.recommended, 'crg').status).toBe('missing');
    expect(commands(find(before.recommended, 'crg'))).toEqual(['uv tool install code-review-graph']);
    const after = await checkEnvironment(probe({ commands: { ...uv.commands, 'code-review-graph': CRG }, files: { [CRG]: `#!${UV_PY}` } }));
    expect(after.recommended.map((c) => c.id)).toEqual(['git', 'branch-name', 'gh', 'crg']);
    expect(find(after.recommended, 'crg').install).toBeUndefined();
    // a busca semântica: o pacote pelo mesmo caminho do Code Review Graph, depois o embed
    expect(commands(find(after.recommended, 'crg-embeddings'))).toEqual(['uv tool install --reinstall "code-review-graph[embeddings]"']);
    expect(find(after.recommended, 'crg-embeddings')).toMatchObject({
      command: 'code-review-graph embed --provider local',
      inProject: true,
    });
    const pipx = await checkEnvironment(
      probe({ commands: { 'code-review-graph': CRG }, files: { [CRG]: '#!/home/u/.local/pipx/venvs/code-review-graph/bin/python' } }),
    );
    expect(commands(find(pipx.recommended, 'crg-embeddings'))).toEqual(['pipx inject code-review-graph "sentence-transformers>=3,<4"']);
  });

  it('o que falta traz o comando de instalação oficial, neutro: curl no Linux e no macOS, PowerShell no Windows', async () => {
    const cli: BoardRequirement = { id: 'cli', tool: 'claude', cli: 'claude', action: null };
    const node: BoardRequirement = { id: 'node', tool: 'claude', action: null };
    const unix = await checkEnvironment(probe({ tool: 'claude', requirements: [node, cli] }));
    expect(commands(find(unix.required, 'node'))).toEqual([
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash',
      '. "$HOME/.nvm/nvm.sh"',
      'nvm install 22',
    ]);
    expect(commands(find(unix.required, 'cli'))).toEqual(['curl -fsSL https://claude.ai/install.sh | bash']);
    expect(commands(find(unix.recommended, 'uv'))).toEqual(['curl -LsSf https://astral.sh/uv/install.sh | sh']);
    const windows = await checkEnvironment(probe({ tool: 'claude', requirements: [node, cli], platform: 'win32' }));
    expect(commands(find(windows.required, 'cli'))).toEqual(['irm https://claude.ai/install.ps1 | iex']);
    expect(commands(find(windows.required, 'node'))).toEqual(['winget install OpenJS.NodeJS.LTS']);
    // no Windows, o programa só aparece num terminal novo
    expect(find(windows.required, 'node').reopenTerminal).toBe(true);
    expect(windows.curlMissing).toBeUndefined();
    // a outra ferramenta, achada pelo editor sem a CLI: o comando da CLI dela
    const cursor = await checkEnvironment(
      probe({ tool: 'claude', others: [{ tool: 'cursor', cli: null, signedIn: null, mcp: false, skill: false, permission: null }] }),
    );
    expect(commands(find(cursor.optional, 'cli'))).toEqual(['curl https://cursor.com/install -fsS | bash']);
  });

  it('o Node.js pelo nvm diz cada passo; com o nvm já instalado, falta só o Node', async () => {
    const node: BoardRequirement = { id: 'node', tool: 'claude', action: null };
    const sem = await checkEnvironment(probe({ tool: 'claude', requirements: [node] }));
    expect(find(sem.required, 'node').install!.map((s) => s.step)).toEqual(['nvm', 'nvm-load', 'node']);
    const com = await checkEnvironment(probe({ tool: 'claude', requirements: [node], files: { '/home/u/.nvm/nvm.sh': '' } }));
    expect(commands(find(com.required, 'node'))).toEqual(['. "$HOME/.nvm/nvm.sh"', 'nvm install 22']);
  });

  it('sem ~/.local/bin no PATH, a CLI e o uv trazem o passo do PATH; sem curl, o aviso', async () => {
    const cli: BoardRequirement = { id: 'cli', tool: 'cursor', cli: 'cursor-agent', action: null };
    const r = await checkEnvironment(probe({ requirements: [cli], pathDirs: ['/usr/bin'] }));
    expect(commands(find(r.required, 'cli'))).toEqual([
      'curl https://cursor.com/install -fsS | bash',
      `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc`,
      'export PATH="$HOME/.local/bin:$PATH"',
    ]);
    // o instalador do uv já grava no arquivo do shell: falta só o terminal aberto
    expect(commands(find(r.recommended, 'uv'))).toEqual([
      'curl -LsSf https://astral.sh/uv/install.sh | sh',
      'export PATH="$HOME/.local/bin:$PATH"',
    ]);
    expect(r.curlMissing).toBe(true);
    const mac = await checkEnvironment(
      probe({ requirements: [cli], pathDirs: ['/usr/bin'], platform: 'darwin', commands: { curl: '/usr/bin/curl' } }),
    );
    expect(commands(find(mac.required, 'cli'))![1]).toBe(`echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`);
    expect(mac.curlMissing).toBeUndefined();
  });

  it('as ações no projeto dizem que rodam na pasta do projeto', async () => {
    const r = await checkEnvironment(probe({ commands: { git: '/usr/bin/git' } }));
    expect(find(r.recommended, 'repo').inProject).toBe(true);
    expect(find(r.recommended, 'crg-graph').inProject).toBe(true);
    expect(find(r.recommended, 'gh-auth').inProject).toBeUndefined();
  });

  it('o git e o GitHub CLI, sem instalador neutro, trazem o comando do sistema; numa distribuição desconhecida, só o site', async () => {
    const at = async (o: Parameters<typeof probe>[0]) => {
      const r = await checkEnvironment(probe(o));
      return [commands(find(r.recommended, 'git')), commands(find(r.recommended, 'gh'))];
    };
    // no Ubuntu de uma máquina nova, o apt não acha nada antes do update
    expect(await at({})).toEqual([
      ['sudo apt update', 'sudo apt install -y git'],
      ['sudo apt update', 'sudo apt install -y gh'],
    ]);
    expect(await at({ linux: 'fedora' })).toEqual([['sudo dnf install -y git'], ['sudo dnf install -y gh']]);
    expect(await at({ linux: 'arch' })).toEqual([['sudo pacman -S --needed git'], ['sudo pacman -S --needed github-cli']]);
    expect(await at({ platform: 'darwin' })).toEqual([['xcode-select --install'], ['brew install gh']]);
    expect(await at({ platform: 'win32' })).toEqual([['winget install --id Git.Git -e'], ['winget install --id GitHub.cli -e']]);
    expect(await at({ linux: null })).toEqual([undefined, undefined]);
    const r = await checkEnvironment(probe({}));
    expect(find(r.recommended, 'git').install!.map((s) => s.step)).toEqual(['apt-update', undefined]);
  });

  it('reconhece a distribuição pelo /etc/os-release', () => {
    expect(linuxFamily('ID=ubuntu\nPRETTY_NAME="Ubuntu 24.04.3 LTS"\n')).toBe('debian');
    expect(linuxFamily('ID=linuxmint\nID_LIKE="ubuntu debian"\n')).toBe('debian');
    expect(linuxFamily('ID=fedora\n')).toBe('fedora');
    expect(linuxFamily('ID="rocky"\nID_LIKE="rhel centos fedora"\n')).toBe('fedora');
    expect(linuxFamily('ID=manjaro\nID_LIKE=arch\n')).toBe('arch');
    expect(linuxFamily('ID=alpine\n')).toBeNull();
    expect(linuxFamily(null)).toBeNull();
  });

  it('pronto não sugere instalar', async () => {
    const r = await checkEnvironment(probe({ commands: { node: '/usr/bin/node' }, outputs: { '/usr/bin/node --version': 'v22.3.0' } }));
    expect(find(r.required, 'node').install).toBeUndefined();
    expect(find(r.required, 'cli').install).toBeUndefined();
  });
});
