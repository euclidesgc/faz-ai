import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import type { BoardRequirement } from '../shared/requirements';
import type { RunnerPermission } from '../shared/runner';
import { byPath, samePath } from './samePath';
import { headlessCommand, headlessUnsupported } from './headless';
import { fixedFolder } from './mcp/clientConfig';

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

const SERVER = 'faz-ai';

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** O registro do servidor do board num JSON (`mcpServers` ou, no VS Code, `servers`). */
function fromJson(file: string, shown: string, key = 'mcpServers'): Registered | null {
  const section = readJson(file)?.[key] as Record<string, { command?: unknown; args?: unknown }> | undefined;
  const entry = section?.[SERVER];
  if (!entry || typeof entry.command !== 'string') return null;
  return {
    file: shown,
    path: file,
    scope: scopeOf(shown),
    command: entry.command,
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
  };
}

/** O arquivo mostrado com `~` é do usuário; o relativo é do projeto. */
const scopeOf = (shown: string): Registered['scope'] => (shown.startsWith('~') ? 'user' : 'project');

/** O registro na tabela `[mcp_servers.faz-ai]` do TOML do Codex (só `command` e `args`, que é o que o board grava). */
function fromToml(file: string, shown: string): Registered | null {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const block = new RegExp(`^\\[mcp_servers\\.${SERVER}\\]\\s*$([\\s\\S]*?)(?=^\\s*\\[|$(?![\\s\\S]))`, 'm').exec(text)?.[1];
  if (block === undefined) return null;
  const command = /^\s*command\s*=\s*("(?:[^"\\]|\\.)*")/m.exec(block)?.[1];
  const args = /^\s*args\s*=\s*(\[.*\])/m.exec(block)?.[1];
  try {
    return {
      file: shown,
      path: file,
      scope: scopeOf(shown),
      command: JSON.parse(command ?? '""') as string,
      args: args ? (JSON.parse(args) as string[]) : [],
    };
  } catch {
    return null;
  }
}

/**
 * O servidor do board no arquivo que a ferramenta lê nas conversas da pessoa (fora do board), nos
 * mesmos lugares em que a instalação do MCP grava: primeiro o do projeto, que vale sobre o global
 * nas ferramentas, e depois o global. null quando não está registrado.
 */
export function registeredServer(tool: AiTool, workspaceDir: string, homeDir: string, editorUserDir?: string): Registered | null {
  const inProject = (rel: string) => path.join(workspaceDir, rel);
  const inHome = (rel: string) => path.join(homeDir, rel);
  switch (tool) {
    case 'claude': {
      // `claude mcp add` grava no projeto (.mcp.json) ou no ~/.claude.json: para o usuário inteiro,
      // ou só para esta pasta (escopo "local", dentro de `projects`)
      const found = fromJson(inProject('.mcp.json'), '.mcp.json');
      if (found) return found;
      const user = readJson(inHome('.claude.json'));
      const local = byPath(user?.projects as Record<string, Record<string, unknown>> | undefined, workspaceDir);
      for (const section of [local?.mcpServers, user?.mcpServers]) {
        const entry = (section as Record<string, { command?: unknown; args?: unknown }> | undefined)?.[SERVER];
        if (entry && typeof entry.command === 'string')
          return {
            file: '~/.claude.json',
            path: inHome('.claude.json'),
            scope: 'user',
            command: entry.command,
            args: Array.isArray(entry.args) ? entry.args.map(String) : [],
          };
      }
      return null;
    }
    case 'cursor':
      return fromJson(inProject('.cursor/mcp.json'), '.cursor/mcp.json') ?? fromJson(inHome('.cursor/mcp.json'), '~/.cursor/mcp.json');
    case 'codex':
      return (
        fromToml(inProject('.codex/config.toml'), '.codex/config.toml') ?? fromToml(inHome('.codex/config.toml'), '~/.codex/config.toml')
      );
    case 'copilot':
      return (
        fromJson(inProject('.vscode/mcp.json'), '.vscode/mcp.json', 'servers') ??
        (editorUserDir ? fromJson(path.join(editorUserDir, 'mcp.json'), '~/…/User/mcp.json', 'servers') : null) ??
        fromJson(inHome('.copilot/mcp-config.json'), '~/.copilot/mcp-config.json')
      );
    case 'kimi': {
      const found = fromJson(inProject('.kimi-code/mcp.json'), '.kimi-code/mcp.json');
      if (found) return found;
      for (const dir of ['.kimi-code', '.kimi']) {
        const global = fromJson(inHome(`${dir}/mcp.json`), `~/${dir}/mcp.json`);
        if (global) return global;
      }
      return null;
    }
  }
}

/** Como instalar a CLI de cada ferramenta, quando há um comando de uma linha para isso. */
const INSTALL: Record<AiTool, { command: string | null; where: string }> = {
  claude: { command: null, where: 'https://claude.com/claude-code' },
  codex: { command: 'npm install -g @openai/codex', where: 'https://developers.openai.com/codex' },
  cursor: {
    command: process.platform === 'win32' ? null : 'curl https://cursor.com/install -fsS | bash',
    where: 'https://cursor.com/cli',
  },
  kimi: { command: null, where: 'https://moonshotai.github.io/kimi-code' },
  copilot: { command: 'npm install -g @github/copilot', where: 'https://github.com/features/copilot/cli' },
};

export interface RequirementProbe {
  tool: AiTool;
  permission: RunnerPermission;
  workspaceDir: string;
  homeDir: string;
  /** o bridge.js que este board registra */
  bridgePath: string;
  /** o node encontrado no PATH do terminal, com caminho absoluto */
  nodePath: string | undefined;
  /** caminho do executável de um comando, ou null */
  resolve(command: string): string | null;
  /** se a CLI está autenticada; null quando a ferramenta não tem como dizer */
  signedIn(tool: AiTool, executable: string): Promise<boolean | null>;
  /** o editor em que o board está aberto; ausente fora do editor (o `faz-ai` no terminal) */
  editor?: 'vscode' | 'cursor';
  /** quando a janela do editor abriu: um registro gravado depois disso só vale no chat do editor ao recarregar */
  windowStartedAt?: number;
  /** a pasta de configuração do usuário no VS Code, onde fica o `mcp.json` global do Copilot no editor */
  editorUserDir?: string;
}

/** Quando o arquivo foi gravado pela última vez, em ms; 0 quando não dá para saber. */
const modifiedAt = (file: string): number => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

/**
 * O que falta, agora, para o board trabalhar com a ferramenta do projeto. Lista vazia é tudo pronto.
 * A ordem é a de resolver: sem node não há servidor, sem CLI não há login, e assim por diante.
 */
export async function checkRequirements(p: RequirementProbe): Promise<BoardRequirement[]> {
  const out: BoardRequirement[] = [];
  const tool = p.tool;

  if (!p.nodePath) out.push({ id: 'node', tool, action: null });

  const built = headlessCommand(tool, { prompt: '', permission: 'full' });
  const cli = 'unsupported' in built ? null : built.command;
  const executable = cli ? p.resolve(cli) : null;
  if (cli && !executable) {
    const install = INSTALL[tool];
    out.push({
      id: 'cli',
      tool,
      cli,
      where: install.where,
      action: install.command ? { kind: 'command', command: install.command } : null,
    });
  }

  if (cli && executable && (await p.signedIn(tool, executable)) === false)
    out.push({ id: 'signin', tool, cli, action: { kind: 'command', command: `${cli} login` } });

  // no Claude e no Cursor as execuções pelo board levam o servidor sozinhas: o registro só falta nas
  // conversas da pessoa fora do board, e o aviso diz isso sem contar como requisito
  const optional = tool === 'claude' || tool === 'cursor' ? { optional: true as const } : {};
  const registered = registeredServer(tool, p.workspaceDir, p.homeDir, p.editorUserDir);
  if (!registered) out.push({ id: 'mcp', tool, ...optional, action: { kind: 'connect' } });
  else {
    const [bridge, arg] = registered.args;
    // `${workspaceFolder}` é a pasta aberta, que a ferramenta troca ao iniciar: não é pasta fixa
    const folder = fixedFolder(arg);
    const commandMissing = path.isAbsolute(registered.command) ? !fs.existsSync(registered.command) : !p.resolve(registered.command);
    const bridgeMissing = !!bridge && !samePath(bridge, p.bridgePath) && !fs.existsSync(bridge);
    // o registro de outra pasta (veio de um colega pelo git, o projeto mudou de lugar) liga a IA a outro board
    const otherFolder = !!folder && !samePath(folder, p.workspaceDir);
    if (commandMissing || bridgeMissing || otherFolder)
      out.push({
        id: commandMissing || bridgeMissing ? 'mcp-stale' : 'mcp-elsewhere',
        tool,
        ...optional,
        file: registered.file,
        missing: commandMissing ? registered.command : bridgeMissing ? bridge : folder,
        // o do projeto vale sobre o global: refazer só o global deixaria o aviso para sempre
        action: registered.scope === 'project' ? { kind: 'fixProject', file: registered.file } : { kind: 'connect' },
      });
    // a ponte de antes ficava na pasta de dados de cada editor e não é mais atualizada: não acha o
    // projeto aberto nos registros globais (nem a pasta que o Cursor e o Claude Code informam)
    else if (bridge && !samePath(bridge, p.bridgePath))
      out.push({
        id: 'mcp-outdated',
        tool,
        ...optional,
        file: registered.file,
        missing: bridge,
        action: registered.scope === 'project' ? { kind: 'fixProject', file: registered.file } : { kind: 'connect' },
      });
    // o chat do Cursor só carrega um servidor registrado depois que a janela abriu ao recarregá-la
    else if (
      tool === 'cursor' &&
      p.editor === 'cursor' &&
      p.windowStartedAt !== undefined &&
      modifiedAt(registered.path) > p.windowStartedAt
    )
      out.push({ id: 'mcp-reload', tool, optional: true, file: registered.file, action: { kind: 'reload' } });
  }

  const unsupported = headlessUnsupported(tool, p.permission);
  if (unsupported) out.push({ id: 'permission', tool, reason: unsupported, action: { kind: 'settings' } });

  return out;
}
