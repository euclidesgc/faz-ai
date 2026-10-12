import { describe, expect, it } from 'vitest';
import { checkEnvironment, type EnvironmentProbe, type OtherToolProbe } from '../src/extension/environment';
import { missingCount, type EnvCheck, type EnvCheckId, type EnvironmentReport } from '../src/shared/environment';
import type { BoardRequirement } from '../src/shared/requirements';

/** Uma máquina de mentira: os comandos que existem, o que cada um responde e os arquivos. */
function probe(o: {
  commands?: Record<string, string>;
  outputs?: Record<string, string | null>;
  files?: Record<string, string>;
  requirements?: BoardRequirement[];
  skillInstalled?: boolean;
  tool?: EnvironmentProbe['tool'];
  other?: OtherToolProbe | null;
  crgMcp?: boolean;
  windows?: boolean;
}): EnvironmentProbe & { ran: string[] } {
  const ran: string[] = [];
  return {
    ran,
    tool: o.tool ?? 'cursor',
    requirements: o.requirements ?? [],
    workspaceDir: '/proj',
    skillInstalled: o.skillInstalled ?? false,
    other: o.other ?? null,
    crgMcp: o.crgMcp ?? false,
    windows: o.windows ?? false,
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
          ['permission', 'ok'],
        ],
      ],
    ]);
    expect(r.optional).toEqual([]);
    expect(shape(r.recommended)).toEqual([
      ['git', 'missing', [['repo', 'skipped']]],
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

  it('o board não instala nada de terceiros: cada item traz o site ou o comando para copiar', async () => {
    const r = await checkEnvironment(probe({ tool: 'claude' }));
    const items = all(r);
    expect(items.filter((c) => c.requirement?.action && c.requirement.action.kind !== 'installSkill')).toEqual([]);
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
    expect(find(r.required, 'skill')).toMatchObject({ status: 'missing', requirement: { action: { kind: 'installSkill' } } });
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
    const r = await checkEnvironment(probe({ other: claude, outputs: { '/bin/claude --version': '2.1.4 (Claude Code)' } }));
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
      probe({ tool: 'claude', other: { tool: 'cursor', cli: null, signedIn: null, mcp: false, skill: false, permission: null } }),
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
    expect(find(before.recommended, 'crg')).toMatchObject({ status: 'missing', install: ['uv tool install code-review-graph'] });
    const after = await checkEnvironment(probe({ commands: { ...uv.commands, 'code-review-graph': CRG }, files: { [CRG]: `#!${UV_PY}` } }));
    expect(after.recommended.map((c) => c.id)).toEqual(['git', 'gh', 'crg']);
    expect(find(after.recommended, 'crg').install).toBeUndefined();
    // a busca semântica: o pacote pelo mesmo caminho do Code Review Graph, depois o embed
    expect(find(after.recommended, 'crg-embeddings')).toMatchObject({
      install: ['uv tool install --reinstall "code-review-graph[embeddings]"'],
      command: 'code-review-graph embed --provider local',
    });
    const pipx = await checkEnvironment(
      probe({ commands: { 'code-review-graph': CRG }, files: { [CRG]: '#!/home/u/.local/pipx/venvs/code-review-graph/bin/python' } }),
    );
    expect(find(pipx.recommended, 'crg-embeddings').install).toEqual(['pipx inject code-review-graph "sentence-transformers>=3,<4"']);
  });

  it('o que falta traz o comando de instalação oficial, neutro: curl no Linux e no macOS, PowerShell no Windows', async () => {
    const cli: BoardRequirement = { id: 'cli', tool: 'claude', cli: 'claude', action: null };
    const node: BoardRequirement = { id: 'node', tool: 'claude', action: null };
    const unix = await checkEnvironment(probe({ tool: 'claude', requirements: [node, cli] }));
    expect(find(unix.required, 'node').install).toEqual([
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash',
      '. "$HOME/.nvm/nvm.sh"',
      'nvm install 22',
    ]);
    expect(find(unix.required, 'cli').install).toEqual(['curl -fsSL https://claude.ai/install.sh | bash']);
    expect(find(unix.recommended, 'uv').install).toEqual(['curl -LsSf https://astral.sh/uv/install.sh | sh']);
    // o git e o GitHub CLI não têm instalador neutro: só o site
    expect(find(unix.recommended, 'git').install).toBeUndefined();
    expect(find(unix.recommended, 'gh').install).toBeUndefined();
    const windows = await checkEnvironment(probe({ tool: 'claude', requirements: [node, cli], windows: true }));
    expect(find(windows.required, 'cli').install).toEqual(['irm https://claude.ai/install.ps1 | iex']);
    expect(find(windows.required, 'node').install).toEqual(['winget install Schniz.fnm', 'fnm install 22']);
    // a outra ferramenta, achada pelo editor sem a CLI: o comando da CLI dela
    const cursor = await checkEnvironment(
      probe({ tool: 'claude', other: { tool: 'cursor', cli: null, signedIn: null, mcp: false, skill: false, permission: null } }),
    );
    expect(find(cursor.optional, 'cli').install).toEqual(['curl https://cursor.com/install -fsS | bash']);
  });

  it('pronto não sugere instalar', async () => {
    const r = await checkEnvironment(probe({ commands: { node: '/usr/bin/node' }, outputs: { '/usr/bin/node --version': 'v22.3.0' } }));
    expect(find(r.required, 'node').install).toBeUndefined();
    expect(find(r.required, 'cli').install).toBeUndefined();
  });
});
