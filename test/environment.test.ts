import { describe, expect, it } from 'vitest';
import { checkEnvironment, linuxFamily, type EnvironmentProbe, type LinuxFamily } from '../src/extension/environment';
import { BUILTIN_PROFILES } from '../src/shared/aiProfiles';
import { profileHealth, type ProfileHealth } from '../src/shared/profileHealth';
import { missingCount, type EnvCheck, type EnvCheckId, type EnvironmentReport } from '../src/shared/environment';
import type { BoardRequirement } from '../src/shared/requirements';

/** Uma máquina de mentira: os comandos que existem, o que cada um responde e os arquivos. */
function probe(o: {
  commands?: Record<string, string>;
  outputs?: Record<string, string | null>;
  files?: Record<string, string>;
  requirements?: BoardRequirement[];
  health?: ProfileHealth[];
  harnessIssues?: EnvironmentProbe['harnessIssues'];
  platform?: NodeJS.Platform;
  pathDirs?: string[];
  linux?: LinuxFamily | null;
  branchRenames?: EnvironmentProbe['branchRenames'];
}): EnvironmentProbe & { ran: string[] } {
  const ran: string[] = [];
  return {
    ran,
    requirements: o.requirements ?? [],
    health: o.health ?? [],
    workspaceDir: '/proj',
    harnessIssues: o.harnessIssues === undefined ? [] : o.harnessIssues,
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
const all = (r: EnvironmentReport) => flat([...r.required, r.harness, ...r.recommended]);
/** A saúde de um perfil pronto: com a CLI achada ou não. */
const health = (id: string, found = true, version?: string): ProfileHealth =>
  profileHealth({
    profile: BUILTIN_PROFILES.find((p) => p.id === id)!,
    isDefault: id === 'claude',
    pendingReview: false,
    probe: {
      id,
      found,
      login: found ? 'signed-in' : 'unchecked',
      ...(found ? { path: `/bin/${id}`, ...(version ? { version } : {}) } : {}),
    },
    authExpired: false,
    validationRequired: false,
    credentials: [],
    capabilities: [],
    admission: null,
    evidence: { state: 'never' },
    install: null,
  });
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
    const node: BoardRequirement = { id: 'node', action: null };
    const r = await checkEnvironment(probe({ requirements: [node] }));
    expect(shape(r.required)).toEqual([['node', 'missing']]);
    // o banco de artefatos não depende de ferramenta nenhuma
    expect(shape([r.harness])).toEqual([
      [
        'harness',
        'ok',
        [
          ['harness-artifacts', 'ok'],
          ['harness-agents', 'ok'],
          ['harness-rules', 'ok'],
          ['harness-missing', 'ok'],
        ],
      ],
    ]);
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
              ['crg-embeddings', 'skipped'],
            ],
          ],
        ],
      ],
    ]);
    expect(missingCount(r.required)).toBe(1);
  });

  it('um bloco por perfil, na ordem que o host mandou; sem o crg-mcp nem itens de MCP, skill ou permissão (RF02, RF23)', async () => {
    const r = await checkEnvironment(probe({ health: [health('claude'), health('cursor', false)] }));
    expect(r.profiles.map((h) => h.id)).toEqual(['claude', 'cursor']);
    expect(r.availability).toEqual({ blocked: false, reason: null, warnings: [{ id: 'cursor', name: 'Cursor', problem: 'cli' }] });
    const ids = all(r).map((c) => c.id as string);
    for (const gone of ['tool', 'cli', 'signin', 'mcp', 'skill', 'permission', 'crg-mcp', 'harness-cursor'])
      expect(ids).not.toContain(gone);
  });

  it('o nome da branch fica pendente, em recomendados, enquanto houver renomeação à espera', async () => {
    const none = await checkEnvironment(probe({}));
    expect(find(none.recommended, 'branch-name').status).toBe('ok');
    expect(find(none.recommended, 'branch-name').command).toBeUndefined();
    const pending = await checkEnvironment(
      probe({
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
    const r = await checkEnvironment(probe({}));
    expect(find(r.required, 'node').docs).toBe('https://nodejs.org/en/download');
    expect(find(r.recommended, 'repo').command).toBe('git init');
    expect(find(r.recommended, 'gh-auth').command).toBe('gh auth login');
    expect(find(r.recommended, 'crg-graph').command).toBe('code-review-graph build');
    expect(find(r.recommended, 'crg-embeddings').command).toBe('code-review-graph embed --provider local');
  });

  it('o banco de artefatos leva o requisito do aviso, com o atalho para o Harness, e o que falta vira filho', async () => {
    const harness: BoardRequirement = { id: 'harness', optional: true, harnessIssues: ['rules'], action: { kind: 'settings' } };
    const r = await checkEnvironment(probe({ requirements: [harness], harnessIssues: ['rules', 'missing'] }));
    expect(r.harness).toMatchObject({ status: 'missing', requirement: harness });
    expect(r.harness.children!.map((c) => [c.id, c.status])).toEqual([
      ['harness-artifacts', 'ok'],
      ['harness-agents', 'ok'],
      ['harness-rules', 'missing'],
      ['harness-missing', 'missing'],
    ]);
    // recomendação: só as faltas dentro dele contam, e sem o inventário fica pulado
    expect(missingCount([r.harness])).toBe(2);
    expect((await checkEnvironment(probe({ harnessIssues: null }))).harness.status).toBe('skipped');
  });

  it('Node.js abaixo da versão mínima falta, com a versão encontrada', async () => {
    const old = await checkEnvironment(
      probe({ commands: { node: '/usr/bin/node' }, outputs: { '/usr/bin/node --version': 'v20.11.0\n' } }),
    );
    expect(find(old.required, 'node')).toMatchObject({ status: 'missing', version: '20.11.0' });
    const ok = await checkEnvironment(probe({ commands: { node: '/usr/bin/node' }, outputs: { '/usr/bin/node --version': 'v22.3.0\n' } }));
    expect(find(ok.required, 'node')).toMatchObject({ status: 'ok', version: '22.3.0' });
  });

  it('tudo instalado: mostra as versões e não falta nada', async () => {
    const p = probe({
      health: [health('cursor', true, '2026.09.30')],
      commands: {
        node: '/usr/bin/node',
        git: '/usr/bin/git',
        gh: '/usr/bin/gh',
        'code-review-graph': CRG,
      },
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
      ['git', '2.43.0'],
      ['gh', '2.92.0'],
      ['crg', '2.3.6'],
    ]);
    // com o Code Review Graph instalado, o uv e o Python ficam de fora
    expect(find(r.recommended, 'crg').children!.map((c) => c.id)).toEqual(['crg-graph', 'crg-embeddings']);
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
    const node: BoardRequirement = { id: 'node', action: null };
    const missing = [health('claude', false), health('cursor', false), health('kimi', false)];
    const unix = await checkEnvironment(probe({ requirements: [node], health: missing }));
    expect(commands(find(unix.required, 'node'))).toEqual([
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash',
      '. "$HOME/.nvm/nvm.sh"',
      'nvm install 22',
    ]);
    const steps = (r: EnvironmentReport) =>
      r.profiles.map((h) => (h.install && 'steps' in h.install ? h.install.steps.map((s) => s.command)[0] : null));
    expect(steps(unix)).toEqual([
      'curl -fsSL https://claude.ai/install.sh | bash',
      'curl https://cursor.com/install -fsS | bash',
      'npm install -g @moonshot-ai/kimi-code',
    ]);
    expect(unix.profiles[0]!.install).toMatchObject({ docs: 'https://code.claude.com/docs/en/setup' });
    expect(commands(find(unix.recommended, 'uv'))).toEqual(['curl -LsSf https://astral.sh/uv/install.sh | sh']);
    const windows = await checkEnvironment(probe({ requirements: [node], health: missing, platform: 'win32' }));
    expect(steps(windows)[0]).toBe('irm https://claude.ai/install.ps1 | iex');
    expect(commands(find(windows.required, 'node'))).toEqual(['winget install OpenJS.NodeJS.LTS']);
    // no Windows, o programa só aparece num terminal novo
    expect(find(windows.required, 'node').reopenTerminal).toBe(true);
    expect(windows.curlMissing).toBeUndefined();
  });

  it('perfil com a CLI achada não sugere instalar; o que já traz um link (cópia ou personalizado) fica como veio', async () => {
    const ok = health('claude');
    const custom: ProfileHealth = {
      ...health('cursor', false),
      kind: 'custom',
      base: 'generic',
      install: { url: 'https://example.org/i' },
    };
    const r = await checkEnvironment(probe({ health: [ok, custom] }));
    expect(r.profiles[0]!.install).toBeNull();
    expect(r.profiles[1]!.install).toEqual({ url: 'https://example.org/i' });
  });

  it('o Node.js pelo nvm diz cada passo; com o nvm já instalado, falta só o Node', async () => {
    const node: BoardRequirement = { id: 'node', action: null };
    const sem = await checkEnvironment(probe({ requirements: [node] }));
    expect(find(sem.required, 'node').install!.map((s) => s.step)).toEqual(['nvm', 'nvm-load', 'node']);
    const com = await checkEnvironment(probe({ requirements: [node], files: { '/home/u/.nvm/nvm.sh': '' } }));
    expect(commands(find(com.required, 'node'))).toEqual(['. "$HOME/.nvm/nvm.sh"', 'nvm install 22']);
  });

  it('sem ~/.local/bin no PATH, a CLI e o uv trazem o passo do PATH; sem curl, o aviso', async () => {
    const r = await checkEnvironment(probe({ health: [health('cursor', false)], pathDirs: ['/usr/bin'] }));
    const cursor = r.profiles[0]!.install as { steps: { command: string }[] };
    expect(cursor.steps.map((s) => s.command)).toEqual([
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
      probe({ health: [health('cursor', false)], pathDirs: ['/usr/bin'], platform: 'darwin', commands: { curl: '/usr/bin/curl' } }),
    );
    expect((mac.profiles[0]!.install as { steps: { command: string }[] }).steps[1]!.command).toBe(
      `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`,
    );
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
  });
});
