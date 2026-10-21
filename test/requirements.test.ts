import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  allowKimiMcp,
  checkProfileCli,
  checkRequirements,
  kimiMcpAllowed,
  registeredServer,
  type RequirementProbe,
} from '../src/extension/requirements';
import { BUILTIN_PROFILES } from '../src/shared/aiProfiles';
import { registerClients } from '../src/extension/mcp/clientConfig';
import { blocksExecution, cliProblem } from '../src/shared/requirements';
import type { BoardRequirement } from '../src/shared/requirements';

let project: string;
let home: string;
const BRIDGE = '/dados/faz-ai/mcp/bridge.js';

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-req-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-req-home-'));
});
afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

/** Uma máquina com tudo pronto; cada teste tira uma coisa. */
const probe = (over: Partial<RequirementProbe> = {}): RequirementProbe => ({
  tool: 'cursor',
  permission: 'board',
  workspaceDir: project,
  homeDir: home,
  bridgePath: BRIDGE,
  nodePath: process.execPath,
  resolve: (command) => (command === 'node' ? process.execPath : `/usr/bin/${command}`),
  signedIn: async () => true,
  ...over,
});

/**
 * A instalação global de uma ferramenta. O registro do Claude Code é feito pela CLI dele (`claude mcp
 * add-json`), que o teste não roda: grava no `~/.claude.json` a entrada que o comando receberia.
 */
const connect = (tool: RequirementProbe['tool'], node = process.execPath) => {
  const done = registerClients([tool], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: node });
  for (const step of done.flatMap((d) => d.run ?? [])) {
    if (step.args[1] !== 'add-json') continue;
    const entry = JSON.parse(step.args[step.args.length - 1]!);
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'faz-ai': entry } }));
  }
  return done;
};

describe('requisitos do board', () => {
  it('com tudo pronto, nada falta', async () => {
    connect('cursor');
    expect(await checkRequirements(probe())).toEqual([]);
  });

  it('Cursor sem nada: CLI com o comando de instalação e o servidor por conectar', async () => {
    const list = await checkRequirements(probe({ resolve: (c) => (c === 'node' ? process.execPath : null) }));
    expect(list.map((r) => r.id)).toEqual(['cli', 'mcp']);
    expect(list[0]).toMatchObject({ tool: 'cursor', cli: 'cursor-agent' });
    if (process.platform !== 'win32')
      expect(list[0]!.action).toEqual({ kind: 'command', command: 'curl https://cursor.com/install -fsS | bash' });
    expect(list[1]!.action).toEqual({ kind: 'connect' });
  });

  it('CLI do Cursor sem login: oferece o comando de login', async () => {
    connect('cursor');
    const list = await checkRequirements(probe({ signedIn: async () => false }));
    expect(list).toEqual([
      { id: 'signin', tool: 'cursor', cli: 'cursor-agent', action: { kind: 'command', command: 'cursor-agent login', terminal: true } },
    ]);
  });

  it('login que não dá para saber (outras ferramentas) não vira aviso', async () => {
    connect('claude');
    expect(await checkRequirements(probe({ tool: 'claude', signedIn: async () => null }))).toEqual([]);
  });

  it('CLI do Claude Code sem login: oferece o comando de login, igual ao Cursor', async () => {
    connect('claude');
    expect(await checkRequirements(probe({ tool: 'claude', signedIn: async () => false }))).toEqual([
      { id: 'signin', tool: 'claude', cli: 'claude', action: { kind: 'command', command: 'claude auth login', terminal: true } },
    ]);
  });

  it('sem node no PATH, o primeiro aviso é o node', async () => {
    connect('cursor');
    expect((await checkRequirements(probe({ nodePath: undefined })))[0]).toMatchObject({ id: 'node' });
  });

  it('registro apontando para um node que sumiu (nvm trocou de versão) pede para conectar de novo', async () => {
    connect('cursor', path.join(home, '.nvm/versions/node/v20.0.0/bin/node'));
    const list = await checkRequirements(probe());
    expect(list).toEqual([
      {
        id: 'mcp-stale',
        tool: 'cursor',
        file: '.cursor/mcp.json',
        missing: path.join(home, '.nvm/versions/node/v20.0.0/bin/node'),
        // o registro do projeto vale sobre o global: corrigir é tirá-lo dali
        action: { kind: 'fixProject', file: '.cursor/mcp.json' },
      },
    ]);
  });

  it('o MCP do board é requisito em todas as ferramentas (o chat do editor e o terminal dependem dele)', async () => {
    const ids = async (tool: RequirementProbe['tool']) =>
      (await checkRequirements(probe({ tool, permission: 'full' }))).map((r) => [r.id, r.optional ?? false]);
    expect(await ids('claude')).toEqual([['mcp', false]]);
    expect(await ids('cursor')).toEqual([['mcp', false]]);
  });

  it('a skill do fluxo não é requisito: nenhuma ferramenta pede para instalá-la', async () => {
    connect('cursor');
    const list = await checkRequirements(probe({ tool: 'cursor' }));
    expect(list.some((r) => r.id === 'skill')).toBe(false);
    expect(await checkRequirements(probe({ tool: 'claude' }))).not.toContainEqual(expect.objectContaining({ id: 'skill' }));
  });

  it('o registro do Claude para o usuário inteiro ou só para esta pasta (~/.claude.json) também vale', async () => {
    const server = { command: process.execPath, args: [BRIDGE, project] };
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'faz-ai': server } }));
    expect(registeredServer('claude', project, home)).toMatchObject({ file: '~/.claude.json', args: server.args });
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects: { [project]: { mcpServers: { 'faz-ai': server } } } }));
    expect(await checkRequirements(probe({ tool: 'claude' }))).toEqual([]);
  });

  it('registro de outra pasta (veio pelo git, ou o projeto mudou de lugar) pede para conectar de novo', async () => {
    fs.mkdirSync(path.join(project, '.cursor'));
    fs.writeFileSync(
      path.join(project, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'faz-ai': { command: process.execPath, args: [BRIDGE, '/outro/projeto'] } } }),
    );
    expect(await checkRequirements(probe())).toEqual([
      {
        id: 'mcp-elsewhere',
        tool: 'cursor',
        file: '.cursor/mcp.json',
        missing: '/outro/projeto',
        action: { kind: 'fixProject', file: '.cursor/mcp.json' },
      },
    ]);
  });

  it('acha o registro onde cada ferramenta o lê', () => {
    for (const tool of ['claude', 'cursor'] as const) {
      expect(registeredServer(tool, project, home)).toBeNull();
      connect(tool);
      expect(registeredServer(tool, project, home)).toMatchObject({ command: process.execPath });
    }
    // o Claude Code vai para o global, sem a pasta fixa; o Cursor, para o projeto, com ela
    expect(registeredServer('claude', project, home)).toMatchObject({ file: '~/.claude.json', scope: 'user', args: [BRIDGE] });
    expect(registeredServer('cursor', project, home)!.args).toEqual([BRIDGE, project]);
  });

  it('a instalação do Claude Code é pela CLI dele, no escopo do usuário, sem arquivo no projeto', () => {
    const [done] = registerClients(['claude'], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: process.execPath });
    expect(done).toMatchObject({ tool: 'claude', file: path.join(home, '.claude.json'), projectFile: null });
    expect(done!.run!.map((s) => s.args.slice(0, 4))).toEqual([
      ['mcp', 'remove', '--scope', 'user'],
      ['mcp', 'add-json', '--scope', 'user'],
    ]);
    expect(fs.existsSync(path.join(project, '.mcp.json'))).toBe(false);
  });

  it('um registro antigo no .mcp.json do projeto ainda é reconhecido, como do projeto (o botão "Corrigir o registro")', async () => {
    fs.writeFileSync(
      path.join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'faz-ai': { command: '/sumiu/node', args: [BRIDGE, project] } } }),
    );
    expect(registeredServer('claude', project, home)).toMatchObject({ file: '.mcp.json', scope: 'project' });
    expect(await checkRequirements(probe({ tool: 'claude' }))).toEqual([
      { id: 'mcp-stale', tool: 'claude', file: '.mcp.json', missing: '/sumiu/node', action: { kind: 'fixProject', file: '.mcp.json' } },
    ]);
  });

  it('no Cursor o global não conta: o registro é sempre o do projeto, fora do git', async () => {
    fs.mkdirSync(path.join(project, '.git', 'info'), { recursive: true });
    // um global de uma versão anterior, com a ponte do board
    fs.mkdirSync(path.join(home, '.cursor'));
    fs.writeFileSync(
      path.join(home, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { outro: { command: 'x' }, 'faz-ai': { command: 'node', args: [BRIDGE, '${workspaceFolder}'] } } }),
    );
    expect(registeredServer('cursor', project, home)).toBeNull();
    // instalar no Cursor grava no projeto e tira o global antigo
    connect('cursor');
    expect(registeredServer('cursor', project, home)).toMatchObject({
      file: '.cursor/mcp.json',
      scope: 'project',
      args: [BRIDGE, project],
    });
    expect(JSON.parse(fs.readFileSync(path.join(home, '.cursor', 'mcp.json'), 'utf8')).mcpServers).toEqual({ outro: { command: 'x' } });
    expect(fs.readFileSync(path.join(project, '.git', 'info', 'exclude'), 'utf8')).toContain('.cursor/mcp.json');
    expect(await checkRequirements(probe())).toEqual([]);
  });

  it('registro global quebrado pede para conectar de novo, sem mexer no projeto', async () => {
    const server = { command: '/sumiu/node', args: [BRIDGE] };
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'faz-ai': server } }));
    expect(await checkRequirements(probe({ tool: 'claude' }))).toEqual([
      { id: 'mcp-stale', tool: 'claude', file: '~/.claude.json', missing: '/sumiu/node', action: { kind: 'connect' } },
    ]);
  });

  it('no Cursor, o registro gravado depois que a janela abriu pede para recarregar', async () => {
    registerClients(['cursor'], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: process.execPath });
    const written = fs.statSync(path.join(project, '.cursor', 'mcp.json')).mtimeMs;
    expect(await checkRequirements(probe({ editor: 'cursor', windowStartedAt: written - 1000 }))).toEqual([
      { id: 'mcp-reload', tool: 'cursor', file: '.cursor/mcp.json', action: { kind: 'reload' } },
    ]);
    // depois de recarregar, a janela é mais nova que o registro, mas o Cursor deixa o servidor novo desligado
    expect(await checkRequirements(probe({ editor: 'cursor', windowStartedAt: written + 1000 }))).toEqual([
      { id: 'mcp-enable', tool: 'cursor', action: { kind: 'openEditorMcp' } },
    ]);
    // ligado, o Cursor cria a pasta do servidor do projeto, com o caminho virando um nome de hífens
    const slug = project.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    fs.mkdirSync(path.join(home, '.cursor', 'projects', slug, 'mcps', 'project-0-x-faz-ai'), { recursive: true });
    expect(await checkRequirements(probe({ editor: 'cursor', windowStartedAt: written + 1000 }))).toEqual([]);
    // fora do Cursor (VS Code, navegador) não há o que recarregar
    expect(await checkRequirements(probe({ editor: 'vscode', windowStartedAt: written - 1000 }))).toEqual([]);
    expect(await checkRequirements(probe())).toEqual([]);
  });

  it('o editor que não acha o node do registro (instalado depois que ele abriu) pede o caminho completo', async () => {
    registerClients(['cursor'], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: 'node' });
    const written = fs.statSync(path.join(project, '.cursor', 'mcp.json')).mtimeMs;
    const inCursor = { editor: 'cursor' as const, windowStartedAt: written + 1000, editorPath: '/usr/bin/nada' };
    expect(await checkRequirements(probe({ ...inCursor, isTracked: () => false }))).toEqual([
      { id: 'mcp-path', tool: 'cursor', file: '.cursor/mcp.json', missing: 'node', action: { kind: 'pinMcp' } },
    ]);
    // o arquivo no git: o board não grava nele o caminho desta máquina
    expect(await checkRequirements(probe({ ...inCursor, isTracked: () => true }))).toEqual([
      { id: 'mcp-path', tool: 'cursor', file: '.cursor/mcp.json', missing: 'node', tracked: true, action: null },
    ]);
    // o editor acha o node no PATH dele: segue para os passos de sempre
    const nodeDir = path.dirname(process.execPath);
    expect((await checkRequirements(probe({ ...inCursor, editorPath: nodeDir }))).map((r) => r.id)).toEqual(['mcp-enable']);
  });

  it('registro com a ponte de antes (na pasta de dados do editor) pede para instalar de novo', async () => {
    const old = path.join(home, 'Code', 'User', 'globalStorage', 'euclidesgc.faz-ai', 'mcp', 'bridge.js');
    fs.mkdirSync(path.dirname(old), { recursive: true });
    fs.writeFileSync(old, '// ponte antiga');
    const server = { command: process.execPath, args: [old] };
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'faz-ai': server } }));
    // a versão gravada ao lado da ponte é a da extensão: o caminho antigo, sozinho, não é aviso
    expect(await checkRequirements(probe({ tool: 'claude', installedVersion: '1.0.0', currentVersion: '1.0.0' }))).toEqual([]);
    expect(await checkRequirements(probe({ tool: 'claude', installedVersion: '0.9.0', currentVersion: '1.0.0' }))).toEqual([
      { id: 'mcp-outdated', tool: 'claude', file: '~/.claude.json', missing: old, action: { kind: 'connect' } },
    ]);
  });

  it('registro no projeto (fora o Cursor) com versão diferente não gera aviso de desatualizado', async () => {
    fs.writeFileSync(
      path.join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'faz-ai': { command: process.execPath, args: [BRIDGE] } } }),
    );
    const versions = { installedVersion: '0.9.0', currentVersion: '1.0.0' };
    expect((await checkRequirements(probe({ tool: 'claude', ...versions }))).map((r) => r.id)).not.toContain('mcp-outdated');
  });
});

describe('blocksExecution', () => {
  const req = (id: BoardRequirement['id']): BoardRequirement => ({ id, tool: 'claude', action: null });

  it('bloqueia quando falta login', () => {
    expect(blocksExecution({ requirements: [req('signin')], authExpired: [] }, 'claude')).toBe(true);
  });

  it('não bloqueia por outro requisito que falte (MCP…); a CLI ausente bloqueia o perfil dela', () => {
    expect(blocksExecution({ requirements: [req('mcp')], authExpired: [] }, 'claude')).toBe(false);
    expect(blocksExecution({ requirements: [req('cli')], authExpired: [] }, 'claude')).toBe(true);
  });

  it('sem nenhum requisito pendente nem sinal reativo, não bloqueia', () => {
    expect(blocksExecution({ requirements: [], authExpired: [] }, 'claude')).toBe(false);
  });

  it('bloqueia pelo sinal reativo mesmo sem "signin" nos requisitos (o probe não soube dizer)', () => {
    expect(blocksExecution({ requirements: [], authExpired: ['cursor'] }, 'cursor')).toBe(true);
  });
});

describe('problemas por perfil de CLI', () => {
  const req = (id: BoardRequirement['id'], tool: string): BoardRequirement => ({ id, tool, action: null });

  it('cliProblem olha só o perfil pedido', () => {
    const state = { requirements: [req('cli', 'cursor'), req('signin', 'kimi')], authExpired: ['claude'] };
    expect(cliProblem(state, 'cursor')).toBe('cli');
    expect(cliProblem(state, 'kimi')).toBe('signin');
    expect(cliProblem(state, 'claude')).toBe('expired');
    expect(cliProblem(state, 'outro')).toBeNull();
  });

  it('blocksExecution trava só o perfil com problema', () => {
    const state = { requirements: [req('signin', 'cursor')], authExpired: [] };
    expect(blocksExecution(state, 'cursor')).toBe(true);
    expect(blocksExecution(state, 'claude')).toBe(false);
  });

  it('checkProfileCli devolve só cli e signin, com tool = id do perfil', async () => {
    const cursor = { ...BUILTIN_PROFILES.find((p) => p.id === 'cursor')!, enabled: true };
    // sem MCP registrado, sem skill: nada disso entra
    const ok = await checkProfileCli(cursor, probe({ tool: 'claude' }));
    expect(ok).toEqual([]);
    const missing = await checkProfileCli(cursor, probe({ tool: 'claude', resolve: () => null }));
    expect(missing.map((r) => [r.id, r.tool])).toEqual([['cli', 'cursor']]);
    const signedOut = await checkProfileCli(cursor, probe({ tool: 'claude', profileSignedIn: async () => false }));
    expect(signedOut.map((r) => [r.id, r.tool])).toEqual([['signin', 'cursor']]);
  });
});

describe('Kimi Code', () => {
  // a sonda de registro lê a pasta de dados do Kimi Code; isola do KIMI_CODE_HOME da máquina
  const saved = process.env.KIMI_CODE_HOME;
  beforeEach(() => delete process.env.KIMI_CODE_HOME);
  afterEach(() => {
    if (saved === undefined) delete process.env.KIMI_CODE_HOME;
    else process.env.KIMI_CODE_HOME = saved;
  });

  it('um registro antigo no .kimi-code/mcp.json do projeto vale sobre o global e ainda é reconhecido', () => {
    connect('kimi');
    const file = path.join(project, '.kimi-code', 'mcp.json');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { 'faz-ai': { command: process.execPath, args: [BRIDGE, project] } } }));
    expect(registeredServer('kimi', project, home)).toMatchObject({
      file: '.kimi-code/mcp.json',
      scope: 'project',
      args: [BRIDGE, project],
    });
  });

  it('grava no mcp.json da pasta de dados do usuário, sem o campo type e sem arquivo no projeto, e ele vale para o projeto', async () => {
    connect('kimi');
    const file = path.join(home, '.kimi-code', 'mcp.json');
    // o global não prende a pasta: o bridge acha o projeto pelo diretório em que a CLI o inicia; a CLI
    // 2.1.1 documenta a entrada stdio sem o campo `type`
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers['faz-ai']).toEqual({ command: process.execPath, args: [BRIDGE] });
    expect(fs.existsSync(path.join(project, '.kimi-code'))).toBe(false);
    expect(registeredServer('kimi', project, home)).toMatchObject({ file: '~/.kimi-code/mcp.json' });
    // com o servidor registrado e a regra de permissão, nada falta
    allowKimiMcp(home);
    expect(await checkRequirements(probe({ tool: 'kimi' }))).toEqual([]);
  });

  it('sem a regra de permissão no config.toml, o aviso recomendado; com ela, some', async () => {
    connect('kimi');
    expect(await checkRequirements(probe({ tool: 'kimi' }))).toEqual([
      { id: 'permission-mcp', tool: 'kimi', file: '~/.kimi-code/config.toml', optional: true, action: { kind: 'allowKimiMcp' } },
    ]);
    expect(allowKimiMcp(home)).toBe(true);
    expect(await checkRequirements(probe({ tool: 'kimi' }))).toEqual([]);
    // a regra já está lá: não grava de novo
    expect(allowKimiMcp(home)).toBe(false);
  });

  it('a regra é acrescentada ao config.toml sem tocar no que já está lá', () => {
    fs.mkdirSync(path.join(home, '.kimi-code'));
    const existing = 'default_model = "kimi-code/k3"\n';
    fs.writeFileSync(path.join(home, '.kimi-code', 'config.toml'), existing);
    expect(allowKimiMcp(home)).toBe(true);
    const text = fs.readFileSync(path.join(home, '.kimi-code', 'config.toml'), 'utf8');
    expect(text.startsWith(existing)).toBe(true);
    expect(text).toContain('[[permission.rules]]');
    expect(text).toContain('pattern = "mcp__faz-ai__*"');
    expect(kimiMcpAllowed(home)).toBe(true);
  });

  it('uma regra allow de outro padrão não vale: a do board precisa estar no mesmo bloco', () => {
    fs.mkdirSync(path.join(home, '.kimi-code'));
    fs.writeFileSync(
      path.join(home, '.kimi-code', 'config.toml'),
      '[[permission.rules]]\ndecision = "allow"\npattern = "mcp__github__*"\n',
    );
    expect(kimiMcpAllowed(home)).toBe(false);
  });
});
describe('requisitos por perfil configurável', () => {
  const custom = {
    id: 'local',
    name: 'CLI local',
    kind: 'custom' as const,
    base: 'generic' as const,
    enabled: true,
    position: 3,
    config: { command: 'comando-privado', installUrl: 'https://example.org/install' },
    credentials: { secretRef: 'a'.repeat(64), review: 'reviewed' as const, available: true },
  };
  it('personalizado ausente indica instalação sem expor comando e não exige registro MCP', async () => {
    const list = await checkRequirements(probe({ profile: custom, resolve: () => null }));
    expect(list.find((r) => r.id === 'cli')).toMatchObject({
      tool: 'local',
      cli: 'CLI local',
      where: 'https://example.org/install',
      action: null,
    });
    expect(list.some((r) => r.id.startsWith('mcp') || r.id === 'signin' || r.id === 'skill')).toBe(false);
    expect(JSON.stringify(list)).not.toContain('comando-privado');
  });
  it('sem statusArgs não cobra login; perfil pendente não resolve nem sonda', async () => {
    const { vi } = await import('vitest');
    const query = vi.fn(async () => false),
      resolve = vi.fn(() => '/bin/local');
    const list = await checkRequirements(probe({ profile: custom, profileSignedIn: query, resolve }));
    expect(list.some((r) => r.id === 'signin')).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith('comando-privado', expect.objectContaining({ onlyPath: true }));
    resolve.mockClear();
    const pending = { ...custom, credentials: { ...custom.credentials, review: 'pending' as const } };
    expect(await checkRequirements(probe({ profile: pending, profileSignedIn: query, resolve }))).toMatchObject([{ id: 'permission' }]);
    expect(resolve).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it('URL com credencial/parâmetro não aparece no requisito', async () => {
    const profile = { ...custom, config: { ...custom.config, installUrl: 'https://example.org/install?token=segredo' } };
    const list = await checkRequirements(probe({ profile, resolve: () => null }));
    expect(JSON.stringify(list)).not.toContain('segredo');
  });
});
