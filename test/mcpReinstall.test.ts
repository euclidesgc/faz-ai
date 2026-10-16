import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureUserServers, runRegistrationSteps, toolsNeedingInstall, userRegisteredTools } from '../src/extension/mcp/reinstall';
import { installFlowSkillFiles } from '../src/extension/flowSkill';
import type { Registration } from '../src/extension/mcp/clientConfig';

let project: string;
let home: string;
const OLD_BRIDGE = '/dados/antigos/mcp/bridge.js';
const BRIDGE = '/dados/faz-ai/mcp/bridge.js';
/** um PATH sem CLI nenhuma: a pasta vazia do teste */
let emptyPath: string;

// a sonda de registro lê a pasta de dados do Kimi Code; isola do KIMI_CODE_HOME da máquina
const savedKimiHome = process.env.KIMI_CODE_HOME;
beforeEach(() => {
  delete process.env.KIMI_CODE_HOME;
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-reinstall-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-reinstall-home-'));
  emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-reinstall-path-'));
});
afterEach(() => {
  if (savedKimiHome === undefined) delete process.env.KIMI_CODE_HOME;
  else process.env.KIMI_CODE_HOME = savedKimiHome;
  for (const dir of [project, home, emptyPath]) fs.rmSync(dir, { recursive: true, force: true });
});

const kimiFile = () => path.join(home, '.kimi-code', 'mcp.json');
const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};
const server = (bridge: string, ...rest: string[]) => ({
  mcpServers: { 'faz-ai': { command: process.execPath, args: [bridge, ...rest] } },
});

const options = () => ({
  bridgePath: BRIDGE,
  workspaceDir: project,
  homeDir: home,
  nodeCommand: process.execPath,
  pathEnv: emptyPath,
});

describe('userRegisteredTools', () => {
  it('sem registro nenhum, nenhuma ferramenta', () => {
    expect(userRegisteredTools(project, home)).toEqual([]);
  });

  it('devolve as ferramentas com o board registrado no global', () => {
    writeJson(kimiFile(), server(OLD_BRIDGE));
    expect(userRegisteredTools(project, home)).toEqual(['kimi']);
    writeJson(path.join(home, '.claude.json'), server(OLD_BRIDGE));
    expect(userRegisteredTools(project, home)).toEqual(['claude', 'kimi']);
  });

  it('um registro só no projeto não conta: a ativação não mexe em arquivo do projeto', () => {
    writeJson(path.join(project, '.kimi-code', 'mcp.json'), server(OLD_BRIDGE, project));
    writeJson(path.join(project, '.mcp.json'), server(OLD_BRIDGE, project));
    expect(userRegisteredTools(project, home)).toEqual([]);
  });

  it('um "faz-ai" que não aponta para a ponte do board é da pessoa: fica como está', () => {
    writeJson(kimiFile(), { mcpServers: { 'faz-ai': { command: 'uvx', args: ['meu-servidor'] } } });
    writeJson(path.join(home, '.claude.json'), { mcpServers: { 'faz-ai': { command: 'node', args: ['/outro/servidor.js'] } } });
    expect(userRegisteredTools(project, home)).toEqual([]);
  });

  it('o Cursor nunca entra: o registro dele é o do projeto, refeito a cada abertura da pasta', () => {
    writeJson(path.join(project, '.cursor', 'mcp.json'), server(OLD_BRIDGE, project));
    writeJson(path.join(home, '.cursor', 'mcp.json'), server(OLD_BRIDGE));
    expect(userRegisteredTools(project, home)).toEqual([]);
  });
});

describe('runRegistrationSteps', () => {
  const step = (mayFail?: true): Registration => ({
    tool: 'claude',
    file: path.join(home, '.claude.json'),
    projectFile: null,
    next: '',
    run: [{ command: 'cli-que-nao-existe', args: ['mcp', 'add-json', '{"a": 1}'], ...(mayFail ? { mayFail } : {}) }],
  });

  it('um comando que pode falhar e não existe é pulado', async () => {
    await expect(runRegistrationSteps([step(true)], emptyPath, home)).resolves.toBeUndefined();
  });

  it('sem mayFail, lança com a linha para a pessoa rodar à mão', async () => {
    await expect(runRegistrationSteps([step()], emptyPath, home)).rejects.toThrow(
      `A linha de comando "cli-que-nao-existe" não foi encontrada. Rode no terminal: cli-que-nao-existe mcp add-json '{"a": 1}'`,
    );
  });

  it('sem passos de CLI, não faz nada', async () => {
    await expect(runRegistrationSteps([{ ...step(), run: undefined }], emptyPath, home)).resolves.toBeUndefined();
  });
});

describe('toolsNeedingInstall', () => {
  it('versão igual e ponte de hoje: nada a fazer', () => {
    writeJson(kimiFile(), server(BRIDGE));
    expect(toolsNeedingInstall(project, home, BRIDGE, [], '1.0.0', '1.0.0')).toEqual([]);
  });

  it('versão antiga ou ausente, ou ponte de outro caminho: refaz', () => {
    writeJson(kimiFile(), server(BRIDGE));
    expect(toolsNeedingInstall(project, home, BRIDGE, [], '0.9.0', '1.0.0')).toEqual(['kimi']);
    expect(toolsNeedingInstall(project, home, BRIDGE, [], null, '1.0.0')).toEqual(['kimi']);
    writeJson(kimiFile(), server(OLD_BRIDGE));
    expect(toolsNeedingInstall(project, home, BRIDGE, [], '1.0.0', '1.0.0')).toEqual(['kimi']);
  });

  it('a ferramenta do board sem registro de usuário entra; o Cursor não', () => {
    expect(toolsNeedingInstall(project, home, BRIDGE, ['kimi', 'cursor'], '1.0.0', '1.0.0')).toEqual(['kimi']);
  });

  it('registro só no projeto conta como sem registro de usuário, e o arquivo do projeto não é tocado', async () => {
    const file = path.join(project, '.mcp.json');
    writeJson(file, server(OLD_BRIDGE, project));
    const before = fs.readFileSync(file, 'utf8');
    expect(toolsNeedingInstall(project, home, BRIDGE, [], '1.0.0', '1.0.0')).toEqual([]);
    writeJson(kimiFile(), { mcpServers: {} });
    const r = await ensureUserServers({ ...options(), installedVersion: '1.0.0', currentVersion: '1.0.0', wanted: ['kimi'] });
    expect(r.done).toEqual(['kimi']);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('um "faz-ai" de usuário que não é a ponte do board é da pessoa', () => {
    writeJson(kimiFile(), { mcpServers: { 'faz-ai': { command: 'uvx', args: ['meu-servidor'] } } });
    expect(toolsNeedingInstall(project, home, BRIDGE, ['kimi'], null, '1.0.0')).toEqual([]);
  });
});

describe('ensureUserServers', () => {
  const ensure = (wanted: 'kimi'[] = []) => ensureUserServers({ ...options(), installedVersion: '0.9.0', currentVersion: '1.0.0', wanted });

  it('regrava o registro global do Kimi Code com a ponte nova', async () => {
    writeJson(kimiFile(), { mcpServers: { outro: { command: 'x' }, 'faz-ai': { command: '/sumiu/node', args: [OLD_BRIDGE] } } });
    await expect(ensure()).resolves.toEqual({ done: ['kimi'], failed: [] });
    expect(JSON.parse(fs.readFileSync(kimiFile(), 'utf8')).mcpServers).toEqual({
      outro: { command: 'x' },
      'faz-ai': { command: process.execPath, args: [BRIDGE] },
    });
  });

  it('instala na ferramenta do board que ainda não tinha registro', async () => {
    await expect(ensure(['kimi'])).resolves.toEqual({ done: ['kimi'], failed: [] });
    expect(JSON.parse(fs.readFileSync(kimiFile(), 'utf8')).mcpServers['faz-ai'].args).toEqual([BRIDGE]);
  });

  it('não cria registro onde não havia', async () => {
    await expect(ensure()).resolves.toEqual({ done: [], failed: [] });
    expect(fs.existsSync(kimiFile())).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude.json'))).toBe(false);
  });

  it('a falha vai em failed, com a mensagem, e o registro de projeto fica intacto', async () => {
    // o JSON do Kimi Code está quebrado: não dá para registrar. Nunca usa o Claude Code aqui: a CLI real
    // da máquina escreveria no ~/.claude.json de quem roda o teste
    fs.mkdirSync(path.dirname(kimiFile()), { recursive: true });
    fs.writeFileSync(kimiFile(), '{ quebrado');
    const r = await ensure(['kimi']);
    expect(r.done).toEqual([]);
    expect(r.failed).toEqual([{ tool: 'kimi', message: expect.any(String) }]);
  });
});

describe('installFlowSkillFiles', () => {
  it('grava o conjunto e é idempotente: sem replace não sobrescreve o que a pessoa ajustou', () => {
    const root = path.join(home, 'skills');
    const first = installFlowSkillFiles(root);
    expect(first.length).toBeGreaterThan(0);
    const file = path.join(root, first[0]!, 'SKILL.md');
    fs.writeFileSync(file, 'minha versão');
    expect(installFlowSkillFiles(root)).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe('minha versão');
    expect(installFlowSkillFiles(root, true).length).toBe(first.length);
  });
});
