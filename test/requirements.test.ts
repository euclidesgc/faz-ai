import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkRequirements, registeredServer, type RequirementProbe } from '../src/extension/requirements';
import { registerClients } from '../src/extension/mcp/clientConfig';

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

const connect = (tool: RequirementProbe['tool'], node = process.execPath) =>
  registerClients([tool], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: node });

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
      { id: 'signin', tool: 'cursor', cli: 'cursor-agent', action: { kind: 'command', command: 'cursor-agent login' } },
    ]);
  });

  it('login que não dá para saber (outras ferramentas) não vira aviso', async () => {
    connect('claude');
    expect(await checkRequirements(probe({ tool: 'claude', signedIn: async () => null }))).toEqual([]);
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
        optional: true,
        file: '.cursor/mcp.json',
        missing: path.join(home, '.nvm/versions/node/v20.0.0/bin/node'),
        // o registro do projeto vale sobre o global: corrigir é tirá-lo dali
        action: { kind: 'fixProject', file: '.cursor/mcp.json' },
      },
    ]);
  });

  it('no Claude e no Cursor o servidor não registrado é recomendado, não requisito; no Codex é requisito', async () => {
    const ids = async (tool: RequirementProbe['tool']) =>
      (await checkRequirements(probe({ tool, permission: 'full' }))).map((r) => [r.id, r.optional ?? false]);
    expect(await ids('claude')).toEqual([['mcp', true]]);
    expect(await ids('cursor')).toEqual([['mcp', true]]);
    expect(await ids('codex')).toEqual([['mcp', false]]);
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
        optional: true,
        file: '.cursor/mcp.json',
        missing: '/outro/projeto',
        action: { kind: 'fixProject', file: '.cursor/mcp.json' },
      },
    ]);
  });

  it('permissão que a ferramenta não aceita leva às configurações', async () => {
    connect('kimi');
    const list = await checkRequirements(probe({ tool: 'kimi', permission: 'edits' }));
    expect(list.map((r) => [r.id, r.action])).toEqual([['permission', { kind: 'settings' }]]);
    expect(list[0]!.reason).toContain('Sem restrições');
  });

  it('acha o registro onde cada ferramenta o lê', () => {
    for (const tool of ['claude', 'cursor', 'codex', 'copilot', 'kimi'] as const) {
      expect(registeredServer(tool, project, home)).toBeNull();
      connect(tool);
      expect(registeredServer(tool, project, home)).toMatchObject({ command: process.execPath });
    }
    expect(registeredServer('codex', project, home)!.args).toEqual([BRIDGE, project]);
  });

  it('o registro global, sem a pasta, também conta e não vira aviso de outra pasta', async () => {
    for (const tool of ['codex', 'copilot', 'kimi'] as const) {
      expect(registeredServer(tool, project, home)).toBeNull();
      registerClients([tool], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: process.execPath, scope: 'user' });
      expect(registeredServer(tool, project, home)).toMatchObject({ file: expect.stringMatching(/^~\//), scope: 'user', args: [BRIDGE] });
    }
    expect(await checkRequirements(probe({ tool: 'codex', permission: 'full' }))).toEqual([]);
    // o do projeto vale sobre o global
    connect('codex');
    expect(registeredServer('codex', project, home)).toMatchObject({ file: '.codex/config.toml', args: [BRIDGE, project] });
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
    // instalar "no global" do Cursor grava no projeto e tira o global antigo
    registerClients(['cursor'], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: process.execPath, scope: 'user' });
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
    registerClients(['codex'], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: '/sumiu/node', scope: 'user' });
    expect(await checkRequirements(probe({ tool: 'codex', permission: 'full' }))).toEqual([
      { id: 'mcp-stale', tool: 'codex', file: '~/.codex/config.toml', missing: '/sumiu/node', action: { kind: 'connect' } },
    ]);
  });

  it('no Cursor, o registro gravado depois que a janela abriu pede para recarregar', async () => {
    registerClients(['cursor'], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: process.execPath });
    const written = fs.statSync(path.join(project, '.cursor', 'mcp.json')).mtimeMs;
    expect(await checkRequirements(probe({ editor: 'cursor', windowStartedAt: written - 1000 }))).toEqual([
      { id: 'mcp-reload', tool: 'cursor', optional: true, file: '.cursor/mcp.json', action: { kind: 'reload' } },
    ]);
    // depois de recarregar, a janela é mais nova que o registro, mas o Cursor deixa o servidor novo desligado
    expect(await checkRequirements(probe({ editor: 'cursor', windowStartedAt: written + 1000 }))).toEqual([
      { id: 'mcp-enable', tool: 'cursor', optional: true, action: null },
    ]);
    // ligado, o Cursor cria a pasta do servidor do projeto, com o caminho virando um nome de hífens
    const slug = project.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    fs.mkdirSync(path.join(home, '.cursor', 'projects', slug, 'mcps', 'project-0-x-faz-ai'), { recursive: true });
    expect(await checkRequirements(probe({ editor: 'cursor', windowStartedAt: written + 1000 }))).toEqual([]);
    // fora do Cursor (VS Code, navegador) não há o que recarregar
    expect(await checkRequirements(probe({ editor: 'vscode', windowStartedAt: written - 1000 }))).toEqual([]);
    expect(await checkRequirements(probe())).toEqual([]);
  });

  it('o mcp.json global do VS Code conta para o Copilot', async () => {
    const userDir = path.join(home, 'Code', 'User');
    registerClients(['copilot'], {
      bridgePath: BRIDGE,
      workspaceDir: project,
      homeDir: home,
      nodeCommand: process.execPath,
      scope: 'user',
      editorUserDir: userDir,
    });
    fs.rmSync(path.join(home, '.copilot'), { recursive: true });
    expect(registeredServer('copilot', project, home, userDir)).toMatchObject({ scope: 'user', args: [BRIDGE, '${workspaceFolder}'] });
  });

  it('registro com a ponte de antes (na pasta de dados do editor) pede para instalar de novo', async () => {
    const old = path.join(home, 'Code', 'User', 'globalStorage', 'euclidesgc.faz-ai', 'mcp', 'bridge.js');
    fs.mkdirSync(path.dirname(old), { recursive: true });
    fs.writeFileSync(old, '// ponte antiga');
    registerClients(['codex'], { bridgePath: old, workspaceDir: project, homeDir: home, nodeCommand: process.execPath, scope: 'user' });
    expect(await checkRequirements(probe({ tool: 'codex', permission: 'full' }))).toEqual([
      { id: 'mcp-outdated', tool: 'codex', file: '~/.codex/config.toml', missing: old, action: { kind: 'connect' } },
    ]);
  });
});
