import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkRequirements, profileInstallUrl, registeredServer } from '../src/extension/requirements';
import { registerClients } from '../src/extension/mcp/clientConfig';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import type { ExecutionAdmissionDecision } from '../src/shared/executionAdmission';
import { profileHealth, type ProfileHealth } from '../src/shared/profileHealth';
import { blocksExecution, type BoardRequirement } from '../src/shared/requirements';

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

/** O registro do Claude Code é feito pela CLI dele; o teste grava no `~/.claude.json` a entrada que ela receberia. */
const connect = (tool: string, node = process.execPath) => {
  const done = registerClients([tool as 'claude'], { bridgePath: BRIDGE, workspaceDir: project, homeDir: home, nodeCommand: node });
  for (const step of done.flatMap((d) => d.run ?? [])) {
    if (step.args[1] !== 'add-json') continue;
    const entry = JSON.parse(step.args[step.args.length - 1]!);
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { 'faz-ai': entry } }));
  }
  return done;
};

/** A saúde de um perfil pronto; cada teste muda o que quer. */
const health = (id: string, over: Partial<ProfileHealth> = {}, profile: Partial<AiProfile> = {}): ProfileHealth => ({
  ...profileHealth({
    profile: { ...BUILTIN_PROFILES.find((p) => p.id === id)!, ...profile } as AiProfile,
    isDefault: id === 'claude',
    pendingReview: false,
    probe: { id, found: true, path: `/bin/${id}`, version: '1.0.0', login: 'signed-in' },
    authExpired: false,
    validationRequired: false,
    credentials: [],
    capabilities: [],
    admission: null as ExecutionAdmissionDecision | null,
    evidence: { state: 'never' },
    install: null,
  }),
  ...over,
});
const down = (id: string): ProfileHealth => health(id, { probe: { id, found: false, login: 'unchecked' }, problem: 'cli' });

describe('requisitos do board', () => {
  it('com tudo pronto, nada falta', () => {
    expect(checkRequirements({ nodePath: process.execPath, health: [health('claude')], harnessIssues: [] })).toEqual([]);
  });

  it('critério de aceite: Claude Code pronto e Cursor sem CLI não bloqueiam; só o aviso do Cursor, sem bloquear', () => {
    const list = checkRequirements({ nodePath: process.execPath, health: [health('claude'), down('cursor')] });
    expect(list).toEqual([
      {
        id: 'profile',
        profile: 'cursor',
        name: 'Cursor',
        problem: 'cli',
        optional: true,
        action: { kind: 'diagnostic', profile: 'cursor' },
      },
    ]);
    expect(blocksExecution({ requirements: list, authExpired: null, board: { aiTool: 'claude' } })).toBe(false);
  });

  it('sem node no PATH, o primeiro aviso é o node', () => {
    expect(checkRequirements({ nodePath: undefined, health: [health('claude')] })[0]).toEqual({ id: 'node', action: null });
  });

  it('nenhum perfil ligado ou disponível: no-profile bloqueia, com os avisos de cada perfil', () => {
    const none = checkRequirements({ nodePath: process.execPath, health: [] });
    expect(none).toEqual([{ id: 'no-profile', reason: 'no-enabled', action: { kind: 'diagnostic' } }]);
    expect(blocksExecution({ requirements: none, authExpired: null, board: { aiTool: 'claude' } })).toBe(true);
    const list = checkRequirements({ nodePath: process.execPath, health: [down('claude'), down('cursor')] });
    expect(list.map((r) => [r.id, r.reason ?? r.profile])).toEqual([
      ['no-profile', 'unavailable'],
      ['profile', 'claude'],
      ['profile', 'cursor'],
    ]);
    expect(blocksExecution({ requirements: list, authExpired: null, board: { aiTool: 'claude' } })).toBe(true);
  });

  it('sem login num perfil pronto, o aviso traz o comando de login; num perfil personalizado, o link para o bloco', () => {
    const out = (id: string) => health(id, { probe: { id, found: true, path: `/bin/${id}`, login: 'signed-out' }, problem: 'signin' });
    const list = checkRequirements({ nodePath: process.execPath, health: [health('kimi'), out('claude')] });
    expect(list).toEqual([
      {
        id: 'profile',
        profile: 'claude',
        name: 'Claude Code',
        problem: 'signin',
        optional: true,
        action: { kind: 'command', command: 'claude auth login', terminal: true },
      },
    ]);
    const custom = health('claude', {
      id: 'local',
      kind: 'custom',
      base: 'generic',
      problem: 'signin',
      name: 'CLI local',
      isDefault: false,
    });
    expect(checkRequirements({ nodePath: process.execPath, health: [health('cursor'), custom] })[0]).toMatchObject({
      profile: 'local',
      action: { kind: 'diagnostic', profile: 'local' },
    });
  });

  it('o login vencido numa execução (sem o probe confirmar a saída) vem marcado como expirado', () => {
    const list = checkRequirements({
      nodePath: process.execPath,
      health: [health('claude'), health('cursor', { authExpired: true, problem: 'signin' })],
    });
    expect(list[0]).toMatchObject({ profile: 'cursor', problem: 'signin', expired: true });
  });

  it('login vencido de um perfil, com outro disponível, não bloqueia o board (RF26)', () => {
    const list = checkRequirements({
      nodePath: process.execPath,
      health: [health('claude', { authExpired: true, problem: 'signin' }), health('cursor')],
    });
    expect(blocksExecution({ requirements: list, authExpired: null, board: { aiTool: 'claude' } })).toBe(false);
  });

  it('desligado e pendente de revisão nunca viram aviso', () => {
    const list = checkRequirements({
      nodePath: process.execPath,
      health: [
        health('claude'),
        health('cursor', { registration: 'disabled', problem: 'cli' }),
        health('kimi', { registration: 'pending-review', problem: 'pending-review' }),
      ],
    });
    expect(list).toEqual([]);
  });

  it('o harness é recomendação (optional), com o que falta e o atalho para o Harness; sem faltas ou sem inventário, nada', () => {
    const list = checkRequirements({ nodePath: process.execPath, health: [health('claude')], harnessIssues: ['artifacts', 'agents'] });
    expect(list).toEqual([{ id: 'harness', optional: true, harnessIssues: ['artifacts', 'agents'], action: { kind: 'settings' } }]);
    expect(checkRequirements({ nodePath: process.execPath, health: [health('claude')], harnessIssues: [] })).toEqual([]);
  });

  it('nunca devolve requisito de MCP, skill ou permissão na ferramenta (RF23)', () => {
    const ids = checkRequirements({ nodePath: undefined, health: [down('claude')], harnessIssues: ['rules'] }).map((r) => r.id);
    expect(ids.every((id) => ['node', 'profile', 'no-profile', 'harness'].includes(id))).toBe(true);
  });
});

describe('blocksExecution', () => {
  const state = (requirements: BoardRequirement[], authExpired: string | null = null) => ({
    requirements,
    authExpired,
    board: { aiTool: 'claude' },
  });
  it('bloqueia com no-profile e não por outro requisito, nem por um perfil só', () => {
    expect(blocksExecution(state([{ id: 'no-profile', action: null }]))).toBe(true);
    expect(
      blocksExecution(
        state([
          { id: 'profile', action: null },
          { id: 'node', action: null },
        ]),
      ),
    ).toBe(false);
    expect(blocksExecution(state([]))).toBe(false);
  });
  it('o login vencido numa execução trava o perfil padrão, não o de outro perfil', () => {
    expect(blocksExecution(state([], 'claude'))).toBe(true);
    expect(blocksExecution(state([], 'cursor'))).toBe(false);
  });
});

describe('o servidor do board registrado em cada ferramenta (usado pela reinstalação)', () => {
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

  it('um registro antigo no .mcp.json do projeto ainda é reconhecido, como do projeto', () => {
    fs.writeFileSync(
      path.join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'faz-ai': { command: '/sumiu/node', args: [BRIDGE, project] } } }),
    );
    expect(registeredServer('claude', project, home)).toMatchObject({ file: '.mcp.json', scope: 'project' });
  });

  it('no Cursor o global não conta: o registro é sempre o do projeto, fora do git', () => {
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

  it('grava no mcp.json da pasta de dados do usuário, sem o campo type e sem arquivo no projeto, e ele vale para o projeto', () => {
    connect('kimi');
    const file = path.join(home, '.kimi-code', 'mcp.json');
    // o global não prende a pasta: o bridge acha o projeto pelo diretório em que a CLI o inicia; a CLI
    // 2.1.1 documenta a entrada stdio sem o campo `type`
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers['faz-ai']).toEqual({ command: process.execPath, args: [BRIDGE] });
    expect(fs.existsSync(path.join(project, '.kimi-code'))).toBe(false);
    expect(registeredServer('kimi', project, home)).toMatchObject({ file: '~/.kimi-code/mcp.json' });
  });
});

describe('link de instalação de um perfil', () => {
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
  it('só https sem credencial nem parâmetros; perfil pendente não divulga o link', () => {
    expect(profileInstallUrl(custom)).toBe('https://example.org/install');
    expect(
      profileInstallUrl({ ...custom, config: { ...custom.config, installUrl: 'https://example.org/install?token=segredo' } }),
    ).toBeNull();
    expect(profileInstallUrl({ ...custom, credentials: { ...custom.credentials, review: 'pending' } })).toBeNull();
  });
});
