import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { byPath, samePath } from '../samePath';
import type { AiTool } from '../../shared/harness';
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

/** A pasta de dados do Kimi Code: $KIMI_CODE_HOME quando definida, senão ~/.kimi-code. */
export const kimiHome = (homeDir: string): string => process.env.KIMI_CODE_HOME || path.join(homeDir, '.kimi-code');

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
  opts: { useGlobal?: boolean; stdioType?: boolean } = {},
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
    // o Kimi Code documenta a entrada stdio sem o campo `type`; as outras ferramentas o esperam
    ...(opts.stdioType === false ? {} : { type: 'stdio' }),
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

/** Onde a ferramenta lê o servidor do board, e o que está registrado lá. */
export interface Registered {
  /** o arquivo, como a pessoa o reconhece (relativo ao projeto ou com `~`) */
  file: string;
  /** o arquivo, com o caminho completo */
  path: string;
  /** do projeto (vale sobre o global na ferramenta) ou do usuário */
  scope: 'project' | 'user';
  command: string;
  args: string[];
}

/**
 * O servidor do board numa ferramenta (épica "ferramenta por modo", história 13): como registrá-lo e onde ela o
 * lê. Cada driver de CLI que fala MCP traz o dele (`ConnectionDriver.boardServer`), no lugar dos `switch` por
 * ferramenta que `registerClients` e `registeredServer` tinham; o despacho fica em `mcp/boardServer.ts`.
 */
export interface BoardServerSupport {
  /**
   * Registra o servidor MCP do board, sem a pasta fixa: a ponte descobre o board pelo diretório em que a
   * ferramenta foi aberta, e o mesmo registro serve a todos os projetos. Nada entra na pasta do projeto,
   * que pode ser compartilhada com quem não tem a extensão; o Cursor é a exceção documentada.
   */
  register(o: RegisterOptions): Registration[];
  /**
   * O servidor (por padrão, o do board) no arquivo que a ferramenta lê nas conversas da pessoa (fora do
   * board), nos mesmos lugares em que `register` grava: primeiro o do projeto, que vale sobre o global
   * nas ferramentas, e depois o global. null quando não está registrado.
   */
  registered(workspaceDir: string, homeDir: string, server?: string): Registered | null;
}

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** O arquivo mostrado com `~` é do usuário; o relativo é do projeto. */
const scopeOf = (shown: string): Registered['scope'] => (shown.startsWith('~') ? 'user' : 'project');

/** O registro de um servidor (por padrão, o do board) num JSON (`mcpServers`). */
function fromJson(file: string, shown: string, server = SERVER): Registered | null {
  const section = readJson(file)?.mcpServers as Record<string, { command?: unknown; args?: unknown }> | undefined;
  const entry = section?.[server];
  if (!entry || typeof entry.command !== 'string') return null;
  return {
    file: shown,
    path: file,
    scope: scopeOf(shown),
    command: entry.command,
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
  };
}

/**
 * Claude Code: `claude mcp add-json --scope user` (o `~/.claude.json` é reescrito pela ferramenta o tempo
 * todo; gravar nele por fora arrisca perder a mudança ou a dela). A pasta chega pela variável
 * `CLAUDE_PROJECT_DIR`, que o Claude Code passa ao servidor.
 */
export const CLAUDE_BOARD_SERVER: BoardServerSupport = {
  register(o) {
    const entry = JSON.stringify({ type: 'stdio', command: o.nodeCommand ?? 'node', args: [o.bridgePath] });
    return [
      {
        tool: 'claude',
        file: path.join(o.homeDir, '.claude.json'),
        projectFile: null,
        next: 'Claude Code: abra uma sessão nova em qualquer projeto com o board aberto (/mcp mostra o estado).',
        run: [
          { command: 'claude', args: ['mcp', 'remove', '--scope', 'user', SERVER], mayFail: true },
          { command: 'claude', args: ['mcp', 'add-json', '--scope', 'user', SERVER, entry] },
        ],
      },
    ];
  },
  // `claude mcp add` grava no projeto (.mcp.json) ou no ~/.claude.json: para o usuário inteiro, ou só para
  // esta pasta (escopo "local", dentro de `projects`)
  registered(workspaceDir, homeDir, server = SERVER) {
    const found = fromJson(path.join(workspaceDir, '.mcp.json'), '.mcp.json', server);
    if (found) return found;
    const user = readJson(path.join(homeDir, '.claude.json'));
    const local = byPath(user?.projects as Record<string, Record<string, unknown>> | undefined, workspaceDir);
    for (const section of [local?.mcpServers, user?.mcpServers]) {
      const entry = (section as Record<string, { command?: unknown; args?: unknown }> | undefined)?.[server];
      if (entry && typeof entry.command === 'string')
        return {
          file: '~/.claude.json',
          path: path.join(homeDir, '.claude.json'),
          scope: 'user',
          command: entry.command,
          args: Array.isArray(entry.args) ? entry.args.map(String) : [],
        };
    }
    return null;
  },
};

/**
 * Cursor: no global não funciona (é um processo só para todas as janelas, que não sabe qual board atender);
 * o registro dele é sempre o do projeto (`registerCursorProject`), e o global não conta na leitura.
 */
export const CURSOR_BOARD_SERVER: BoardServerSupport = {
  register: (o) => [registerCursorProject(o)],
  registered: (workspaceDir, _homeDir, server = SERVER) =>
    fromJson(path.join(workspaceDir, '.cursor/mcp.json'), '.cursor/mcp.json', server),
};

/**
 * Kimi Code: `~/.kimi-code/mcp.json` ($KIMI_CODE_HOME/mcp.json), um JSON só de servidores que a ferramenta
 * não regrava: a escrita direta é segura. Na leitura, primeiro o do projeto (que vale sobre o global).
 */
export const KIMI_BOARD_SERVER: BoardServerSupport = {
  register(o) {
    const file = path.join(kimiHome(o.homeDir), 'mcp.json');
    // a entrada do Kimi Code não leva o campo `type` (documentação da CLI 2.1.1)
    mergeJson(file, { command: o.nodeCommand ?? 'node', args: [o.bridgePath] });
    return [{ tool: 'kimi', file, projectFile: null, next: 'Kimi Code: abra uma sessão nova em qualquer projeto com o board aberto.' }];
  },
  registered: (workspaceDir, homeDir, server = SERVER) =>
    fromJson(path.join(workspaceDir, '.kimi-code/mcp.json'), '.kimi-code/mcp.json', server) ??
    fromJson(path.join(kimiHome(homeDir), 'mcp.json'), '~/.kimi-code/mcp.json', server),
};

/**
 * Tira o registro do board do arquivo de configuração do projeto, deixando o resto como está. O
 * registro do projeto vale sobre o global na ferramenta: um registro velho ali (de outra pasta, de um
 * node que sumiu) estraga o global, por mais que ele seja refeito. false quando não havia o que tirar.
 */
export function removeProjectServer(workspaceDir: string, relFile: string): boolean {
  const file = path.join(workspaceDir, relFile);
  if (!fs.existsSync(file)) return false;
  let config: Record<string, Record<string, unknown> | undefined>;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof config;
  } catch {
    throw new Error(`${file} não é um JSON válido; corrija-o e tente de novo.`);
  }
  const section = config.mcpServers;
  if (!section || !(SERVER in section)) return false;
  delete section[SERVER];
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return true;
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

/** O argumento aponta para uma ponte do Faz AI (qualquer versão): distingue o registro do board de um "faz-ai" que a pessoa gravou à mão. */
export function isBoardBridge(arg: string | undefined): boolean {
  return /[\\/]mcp[\\/]bridge\.js$/.test(arg ?? '');
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
  if (!isBoardBridge(bridge)) return false;
  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers: Record<string, unknown> };
  delete config.mcpServers[SERVER];
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return true;
}
