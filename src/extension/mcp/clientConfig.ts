import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { samePath } from '../samePath';
import type { AiTool, InstallScope } from '../../shared/harness';
import { excludeLocally } from './pinCommands';

export interface RegisterOptions {
  /** caminho estável do bridge.js */
  bridgePath: string;
  workspaceDir: string;
  homeDir: string;
  /**
   * Caminho absoluto do node. O editor aberto pelo menu do sistema não herda o PATH do terminal, e
   * com o node instalado só pelo nvm um `"command": "node"` falharia ao iniciar o servidor.
   */
  nodeCommand?: string;
  /**
   * `project` grava nos arquivos da pasta do projeto, com a pasta fixa nos argumentos; `user` grava na
   * configuração global da ferramenta, sem a pasta: a ponte descobre o board pelo diretório em que a
   * ferramenta foi aberta, e o mesmo registro serve a todos os projetos. Padrão: `project`.
   */
  scope?: InstallScope;
  /**
   * Pasta de configuração do usuário no VS Code (a do perfil, onde fica o `mcp.json` global do
   * Copilot no editor). Sem ela, o registro global do Copilot fica só na Copilot CLI.
   */
  editorUserDir?: string;
}

export interface Registration {
  tool: AiTool;
  /** arquivo de configuração gravado */
  file: string;
  /** caminho relativo ao projeto quando o arquivo fica dentro dele (candidato ao .gitignore) */
  projectFile: string | null;
  /** o que a pessoa precisa fazer para a ferramenta carregar o servidor */
  next: string;
  /** o arquivo do projeto já ficou fora do git pelo `.git/info/exclude`: não precisa ir para o `.gitignore` */
  excluded?: true;
  /**
   * comandos que quem chama precisa rodar para concluir o registro, em ordem, quando o arquivo é da
   * própria ferramenta e não deve ser gravado por fora (o `~/.claude.json`). O primeiro de cada par
   * pode falhar sem problema: é a remoção do registro anterior.
   */
  run?: { command: string; args: string[]; mayFail?: true }[];
}

const SERVER = 'faz-ai';

/**
 * A pasta aberta no editor, que o Cursor e o VS Code trocam pelo caminho ao iniciar o servidor. Vai no
 * registro global dessas ferramentas: sem ela, o servidor sobe fora do projeto e não acha o board.
 */
export const WORKSPACE_FOLDER = '${workspaceFolder}';

/** A pasta fixa nos argumentos do registro; uma variável da ferramenta (`${workspaceFolder}`) não é pasta fixa. */
export const fixedFolder = (arg: string | undefined): string | undefined => (arg && !/\$\{[^}]*\}/.test(arg) ? arg : undefined);

function mergeJson(file: string, entry: Record<string, unknown>, key = 'mcpServers'): void {
  let config: Record<string, Record<string, unknown> | undefined> = {};
  if (fs.existsSync(file)) {
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof config;
    } catch {
      throw new Error(`${file} não é um JSON válido; corrija-o e tente de novo.`);
    }
  }
  config[key] = { ...config[key], [SERVER]: entry };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}

/** O que `ensureProjectServer` fez com o registro. */
export type ProjectServerResult = 'kept' | 'global' | 'added' | 'repaired' | 'invalid';

/** O registro do board num JSON de configuração, se houver um; `invalid` quando o arquivo não é JSON. */
function readEntry(file: string): { command?: unknown; args?: unknown } | undefined | 'invalid' {
  if (!fs.existsSync(file)) return undefined;
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      mcpServers?: Record<string, { command?: unknown; args?: unknown }>;
    } | null;
    return config?.mcpServers?.[SERVER];
  } catch {
    return 'invalid';
  }
}

const usableCommand = (command: unknown): command is string =>
  typeof command === 'string' && (path.isAbsolute(command) ? fs.existsSync(command) : !!command);

/** A pasta está dentro de `folder` (ou é ela). */
const within = (dir: string, folder: string): boolean => {
  const rel = path.relative(folder, dir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Garante o servidor do board num JSON de configuração do projeto, para a ferramenta que só lê
 * servidores MCP de arquivo (o Cursor em segundo plano).
 *
 * - Um registro que já aponta para este bridge e esta pasta fica como está, mesmo com outro comando:
 *   pode ser o caminho do node que a pessoa escolheu.
 * - Um registro de outra pasta ou de outro bridge (o arquivo veio de um colega pelo git, o projeto
 *   mudou de lugar) é refeito: a IA falaria com outro board, ou com nenhum. O comando da pessoa fica,
 *   se ainda existir.
 * - Um arquivo que não é JSON válido não é tocado (`invalid`): a execução segue, e quem chama avisa.
 *
 * O arquivo entra no `.git/info/exclude` quando o board grava nele: guarda caminhos desta máquina e
 * não deve ir para o repositório num `git add` da própria IA, mas também não muda o `.gitignore` de
 * ninguém (num arquivo já versionado, a exclusão não tem efeito).
 */
export function ensureProjectServer(
  workspaceDir: string,
  relFile: string,
  entry: { command: string; args: string[]; env?: Record<string, string> },
  homeDir: string = os.homedir(),
  opts: { useGlobal?: boolean } = {},
): ProjectServerResult {
  const current = readEntry(path.join(workspaceDir, relFile));
  if (current === 'invalid') return 'invalid';
  const useGlobal = opts.useGlobal ?? true;
  // sem registro no projeto, o global instalado pela pessoa já leva a ferramenta a este board quando
  // aponta para o mesmo bridge e a pasta da execução fica dentro do board (sem pasta fixa, a ponte a
  // acha subindo a partir dela): o projeto fica sem arquivo nenhum. A worktree de uma história fica
  // fora da pasta do board, e ali o registro do projeto continua necessário.
  if (!current && useGlobal && coveredByGlobal(path.join(homeDir, relFile), workspaceDir, entry.args)) return 'global';
  let command = entry.command;
  if (current) {
    const args = Array.isArray(current.args) ? current.args.map(String) : [];
    const same = args.length === entry.args.length && args.every((a, i) => samePath(a, entry.args[i]!));
    const usable = usableCommand(current.command);
    if (same && usable) return 'kept';
    if (usable) command = current.command as string;
  }
  mergeJson(path.join(workspaceDir, relFile), {
    type: 'stdio',
    command,
    args: entry.args,
    ...(entry.env && command === entry.command ? { env: entry.env } : {}),
  });
  excludeLocally(workspaceDir, relFile);
  return current ? 'repaired' : 'added';
}

/** O registro global em `file` leva ao board de `entryArgs` (bridge, pasta) quando a ferramenta roda em `runDir`. */
function coveredByGlobal(file: string, runDir: string, entryArgs: string[]): boolean {
  const global = readEntry(file);
  if (!global || global === 'invalid' || !usableCommand(global.command)) return false;
  const [bridge, arg] = Array.isArray(global.args) ? global.args.map(String) : [];
  const folder = fixedFolder(arg);
  const [wantedBridge, board] = entryArgs;
  if (!bridge || !wantedBridge || !board || !samePath(bridge, wantedBridge)) return false;
  return folder ? samePath(folder, board) : within(runDir, board);
}

/** Substitui (ou acrescenta) a tabela [mcp_servers.faz-ai] sem tocar no resto do TOML. */
export function upsertTomlServer(toml: string, command: string, args: string[]): string {
  const header = `[mcp_servers.${SERVER}]`;
  const lines = toml.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === header);
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end]!)) end++;
    lines.splice(start, end - start);
  }
  const rest = lines.join('\n').replace(/\n+$/, '');
  // strings JSON são strings básicas válidas em TOML
  const block = `${header}\ncommand = ${JSON.stringify(command)}\nargs = [${args.map((a) => JSON.stringify(a)).join(', ')}]\n`;
  return `${rest}${rest ? '\n\n' : ''}${block}`;
}

/**
 * Registra o servidor MCP do board na configuração que cada ferramenta lê. No escopo do projeto:
 * - Claude Code: `.mcp.json` do projeto
 * - Cursor: `.cursor/mcp.json` do projeto
 * - Codex: `.codex/config.toml` do projeto (vale em projetos marcados como confiáveis)
 * - Kimi Code: configuração global, sem a pasta fixa (a ponte descobre o projeto pelo diretório atual)
 * - GitHub Copilot: `.vscode/mcp.json` (VS Code) e `.mcp.json` (Copilot CLI) do projeto
 */
export function registerClients(tools: AiTool[], o: RegisterOptions): Registration[] {
  if (o.scope === 'user') return tools.flatMap((tool) => registerUser(tool, o));
  const args = [o.bridgePath, o.workspaceDir];
  const node = o.nodeCommand ?? 'node';
  const out: Registration[] = [];
  for (const tool of tools) {
    switch (tool) {
      case 'claude': {
        const file = path.join(o.workspaceDir, '.mcp.json');
        mergeJson(file, { type: 'stdio', command: node, args });
        out.push({
          tool,
          file,
          projectFile: '.mcp.json',
          next: 'Claude Code: abra uma sessão nova na pasta e aprove o servidor (/mcp mostra o estado).',
        });
        break;
      }
      case 'cursor': {
        out.push(registerCursorProject(o));
        break;
      }
      case 'codex': {
        const file = path.join(o.workspaceDir, '.codex', 'config.toml');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, upsertTomlServer(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', node, args));
        out.push({
          tool,
          file,
          projectFile: '.codex/config.toml',
          next: 'Codex: o projeto precisa estar marcado como confiável; abra uma sessão nova (codex mcp list confere).',
        });
        break;
      }
      case 'kimi': {
        const file = path.join(o.workspaceDir, '.kimi-code', 'mcp.json');
        mergeJson(file, { transport: 'stdio', command: node, args });
        out.push({ tool, file, projectFile: '.kimi-code/mcp.json', next: 'Kimi Code: abra uma sessão nova na pasta do projeto.' });
        break;
      }
      case 'copilot': {
        // o VS Code lê .vscode/mcp.json (chave `servers`); a Copilot CLI não lê esse arquivo, e sim o .mcp.json
        const vscodeFile = path.join(o.workspaceDir, '.vscode', 'mcp.json');
        mergeJson(vscodeFile, { type: 'stdio', command: node, args }, 'servers');
        out.push({
          tool,
          file: vscodeFile,
          projectFile: '.vscode/mcp.json',
          next: 'GitHub Copilot no VS Code: confirme a confiança e inicie o servidor (MCP: List Servers).',
        });
        const cliFile = path.join(o.workspaceDir, '.mcp.json');
        mergeJson(cliFile, { type: 'stdio', command: node, args, tools: ['*'] });
        out.push({
          tool,
          file: cliFile,
          projectFile: '.mcp.json',
          next: 'Copilot CLI: abra uma sessão nova na pasta e confirme a confiança nela.',
        });
        break;
      }
    }
  }
  return out;
}

/**
 * Registro global (escopo do usuário), o padrão de cada ferramenta para um servidor que vale em
 * qualquer projeto. Sem pasta fixa: cada ferramenta diz ao servidor onde está o projeto do jeito que
 * tem, e a ponte, na falta disso, sobe a partir do diretório em que a ferramenta foi aberta.
 * - Claude Code: `claude mcp add-json --scope user` (o `~/.claude.json` é reescrito pela ferramenta o
 *   tempo todo; gravar nele por fora arrisca perder a mudança ou a dela). A pasta chega pela variável
 *   `CLAUDE_PROJECT_DIR`, que o Claude Code passa ao servidor.
 * - Cursor: nenhum; o registro dele é sempre o do projeto (veja `registerCursorProject`)
 * - Codex: `~/.codex/config.toml`
 * - Kimi Code: `~/.kimi-code/mcp.json` e/ou `~/.kimi/mcp.json` (a Kimi CLI), os que existirem
 * - GitHub Copilot: `~/.copilot/mcp-config.json` (Copilot CLI) e, no VS Code, o `mcp.json` do perfil
 *   do editor, com `${workspaceFolder}`
 */
function registerUser(tool: AiTool, o: RegisterOptions): Registration[] {
  const node = o.nodeCommand ?? 'node';
  const args = [o.bridgePath];
  const home = (...p: string[]) => path.join(o.homeDir, ...p);
  switch (tool) {
    case 'claude': {
      const entry = JSON.stringify({ type: 'stdio', command: node, args });
      return [
        {
          tool,
          file: home('.claude.json'),
          projectFile: null,
          next: 'Claude Code: abra uma sessão nova em qualquer projeto com o board aberto (/mcp mostra o estado).',
          run: [
            { command: 'claude', args: ['mcp', 'remove', '--scope', 'user', SERVER], mayFail: true },
            { command: 'claude', args: ['mcp', 'add-json', '--scope', 'user', SERVER, entry] },
          ],
        },
      ];
    }
    // no Cursor o global não funciona: é um processo só para todas as janelas, que não sabe qual board
    // atender. O registro do Cursor é sempre o do projeto.
    case 'cursor':
      return [registerCursorProject(o)];
    case 'codex': {
      const file = home('.codex', 'config.toml');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, upsertTomlServer(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', node, args));
      return [{ tool, file, projectFile: null, next: 'Codex: abra uma sessão nova (codex mcp list confere).' }];
    }
    case 'kimi': {
      // Kimi Code usa ~/.kimi-code e a Kimi CLI usa ~/.kimi; grava nas que existirem
      const dirs = ['.kimi-code', '.kimi'].map((d) => home(d)).filter((d) => fs.existsSync(d));
      return (dirs.length ? dirs : [home('.kimi-code')]).map((dir) => {
        const file = path.join(dir, 'mcp.json');
        mergeJson(file, { transport: 'stdio', command: node, args });
        return { tool, file, projectFile: null, next: 'Kimi Code: abra uma sessão nova a partir da pasta do projeto.' };
      });
    }
    case 'copilot': {
      const file = home('.copilot', 'mcp-config.json');
      mergeJson(file, { type: 'stdio', command: node, args, tools: ['*'] });
      const out: Registration[] = [{ tool, file, projectFile: null, next: 'Copilot CLI: abra uma sessão nova.' }];
      if (o.editorUserDir) {
        const editorFile = path.join(o.editorUserDir, 'mcp.json');
        mergeJson(editorFile, { type: 'stdio', command: node, args: [...args, WORKSPACE_FOLDER] }, 'servers');
        out.push({
          tool,
          file: editorFile,
          projectFile: null,
          next: 'GitHub Copilot no VS Code: confirme a confiança no servidor quando o editor pedir (MCP: List Servers mostra o estado).',
        });
      }
      return out;
    }
  }
}

/**
 * Tira o registro do board do arquivo de configuração do projeto, deixando o resto como está. O
 * registro do projeto vale sobre o global na ferramenta: um registro velho ali (de outra pasta, de um
 * node que sumiu) estraga o global, por mais que ele seja refeito. false quando não havia o que tirar.
 */
export function removeProjectServer(workspaceDir: string, relFile: string): boolean {
  const file = path.join(workspaceDir, relFile);
  if (!fs.existsSync(file)) return false;
  if (relFile.endsWith('.toml')) {
    const toml = fs.readFileSync(file, 'utf8');
    const lines = toml.split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === `[mcp_servers.${SERVER}]`);
    if (start < 0) return false;
    let end = start + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end]!)) end++;
    lines.splice(start, end - start);
    fs.writeFileSync(file, lines.join('\n').replace(/\n{3,}/g, '\n\n'));
    return true;
  }
  let config: Record<string, Record<string, unknown> | undefined>;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof config;
  } catch {
    throw new Error(`${file} não é um JSON válido; corrija-o e tente de novo.`);
  }
  let removed = false;
  for (const key of ['mcpServers', 'servers']) {
    const section = config[key];
    if (section && SERVER in section) {
      delete section[SERVER];
      removed = true;
    }
  }
  if (removed) fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return removed;
}

/**
 * O servidor do board no Cursor: no `.cursor/mcp.json` do projeto, com a pasta fixa, fora do git pelo
 * `.git/info/exclude`. O Cursor roda os servidores globais num processo só para todas as janelas, que
 * sobe sem saber de qual janela veio (o `${workspaceFolder}` só é trocado quando a pessoa liga o
 * servidor à mão, e aí vale para todas): com dois projetos abertos, as duas IAs falariam com o mesmo
 * board. Os servidores do projeto rodam um por janela, cada um com a sua pasta. A entrada global que
 * uma versão anterior gravou sai, para não aparecer em dobro nem ligar a IA ao board errado.
 */
export function registerCursorProject(o: RegisterOptions): Registration {
  const rel = '.cursor/mcp.json';
  const file = path.join(o.workspaceDir, rel);
  const result = ensureProjectServer(
    o.workspaceDir,
    rel,
    { command: o.nodeCommand ?? 'node', args: [o.bridgePath, o.workspaceDir] },
    o.homeDir,
    { useGlobal: false },
  );
  if (result === 'invalid') throw new Error(`${file} não é um JSON válido; corrija-o e tente de novo.`);
  removeUserCursorServer(o.homeDir);
  return {
    tool: 'cursor',
    file,
    projectFile: rel,
    excluded: true,
    next: 'Cursor: se o "faz-ai" aparecer desligado em Cursor Settings → MCP, ligue.',
  };
}

/**
 * Tira do `~/.cursor/mcp.json` o registro do board que uma versão anterior gravou no global (o que
 * aponta para uma ponte do Faz AI). Um "faz-ai" que a pessoa gravou à mão para outra coisa fica.
 */
export function removeUserCursorServer(homeDir: string): boolean {
  const file = path.join(homeDir, '.cursor', 'mcp.json');
  const current = readEntry(file);
  if (!current || current === 'invalid') return false;
  const bridge = Array.isArray(current.args) ? String(current.args[0] ?? '') : '';
  if (!/[\\/]mcp[\\/]bridge\.js$/.test(bridge)) return false;
  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers: Record<string, unknown> };
  delete config.mcpServers[SERVER];
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return true;
}
