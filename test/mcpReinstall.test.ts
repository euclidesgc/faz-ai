import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { reinstallUserServers, runRegistrationSteps, userRegisteredTools } from '../src/extension/mcp/reinstall';
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

const options = (log: string[] = []) => ({
  bridgePath: BRIDGE,
  workspaceDir: project,
  homeDir: home,
  nodeCommand: process.execPath,
  pathEnv: emptyPath,
  log: (m: string) => log.push(m),
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

describe('reinstallUserServers', () => {
  it('regrava o registro global do Kimi Code com a ponte nova', async () => {
    writeJson(kimiFile(), { mcpServers: { outro: { command: 'x' }, 'faz-ai': { command: '/sumiu/node', args: [OLD_BRIDGE] } } });
    await expect(reinstallUserServers(options())).resolves.toEqual(['kimi']);
    expect(JSON.parse(fs.readFileSync(kimiFile(), 'utf8')).mcpServers).toEqual({
      outro: { command: 'x' },
      'faz-ai': { command: process.execPath, args: [BRIDGE] },
    });
  });

  it('não cria registro onde não havia', async () => {
    const log: string[] = [];
    await expect(reinstallUserServers(options(log))).resolves.toEqual([]);
    expect(fs.existsSync(kimiFile())).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude.json'))).toBe(false);
    expect(log).toEqual([]);
  });

  it('a falha numa ferramenta vai para o log e não derruba as outras', async () => {
    // o Claude Code registrado no global, mas a CLI dele fora do PATH: o registro não dá para refazer
    writeJson(path.join(home, '.claude.json'), server(OLD_BRIDGE));
    writeJson(kimiFile(), server(OLD_BRIDGE));
    const log: string[] = [];
    await expect(reinstallUserServers(options(log))).resolves.toEqual(['kimi']);
    expect(log).toEqual([
      expect.stringMatching(
        /^Faz AI: não foi possível refazer o registro do board no Claude Code: A linha de comando "claude" não foi encontrada\. Rode no terminal: claude mcp add-json --scope user faz-ai '/,
      ),
    ]);
    expect(JSON.parse(fs.readFileSync(kimiFile(), 'utf8')).mcpServers['faz-ai'].args).toEqual([BRIDGE]);
  });
});
