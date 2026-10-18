import { baseValue } from '../shared/harness';
import type { AiBase } from '../shared/aiProfiles';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiTool } from '../shared/harness';
import type { HarnessIssue } from '../shared/harnessStatus';
import { LOGIN_COMMAND, type BoardRequirement } from '../shared/requirements';
import type { RunnerPermission } from '../shared/runner';
import { byPath, samePath } from './samePath';
import { headlessCommand, headlessUnsupported } from './headless';
import { fixedFolder, kimiHome } from './mcp/clientConfig';
import { editorFinds, trackedInGit } from './mcp/pinCommands';

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

/** O arquivo mostrado com `~` é do usuário; o relativo é do projeto. */
const scopeOf = (shown: string): Registered['scope'] => (shown.startsWith('~') ? 'user' : 'project');

/**
 * O servidor do board no arquivo que a ferramenta lê nas conversas da pessoa (fora do board), nos
 * mesmos lugares em que a instalação do MCP grava: primeiro o do projeto, que vale sobre o global
 * nas ferramentas, e depois o global. null quando não está registrado.
 */
export function registeredServer(tool: AiTool, workspaceDir: string, homeDir: string, server = SERVER): Registered | null {
  const inProject = (rel: string) => path.join(workspaceDir, rel);
  const inHome = (rel: string) => path.join(homeDir, rel);
  switch (tool) {
    case 'claude': {
      // `claude mcp add` grava no projeto (.mcp.json) ou no ~/.claude.json: para o usuário inteiro,
      // ou só para esta pasta (escopo "local", dentro de `projects`)
      const found = fromJson(inProject('.mcp.json'), '.mcp.json', server);
      if (found) return found;
      const user = readJson(inHome('.claude.json'));
      const local = byPath(user?.projects as Record<string, Record<string, unknown>> | undefined, workspaceDir);
      for (const section of [local?.mcpServers, user?.mcpServers]) {
        const entry = (section as Record<string, { command?: unknown; args?: unknown }> | undefined)?.[server];
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
    // o global do Cursor é um processo só para todas as janelas e não sabe qual board atender: não conta
    case 'cursor':
      return fromJson(inProject('.cursor/mcp.json'), '.cursor/mcp.json', server);
    // Kimi Code: primeiro o do projeto (que vale sobre o global), depois o da pasta de dados dele
    case 'kimi':
      return (
        fromJson(inProject('.kimi-code/mcp.json'), '.kimi-code/mcp.json', server) ??
        fromJson(path.join(kimiHome(homeDir), 'mcp.json'), '~/.kimi-code/mcp.json', server)
      );
  }
  return null;
}

/** Como instalar a CLI de cada ferramenta, quando há um comando de uma linha para isso. */
const INSTALL: Record<AiBase, { command: string | null; where: string }> = {
  claude: { command: null, where: 'https://claude.com/claude-code' },
  cursor: {
    command: process.platform === 'win32' ? null : 'curl https://cursor.com/install -fsS | bash',
    where: 'https://cursor.com/cli',
  },
  // o pacote npm oficial vale nos dois sistemas
  kimi: { command: 'npm install -g @moonshot-ai/kimi-code', where: 'https://www.kimi.com/code/docs/en/' },
};

/** A regra que libera as ferramentas do board sem aprovação nas conversas do Kimi Code. */
export const KIMI_MCP_PERMISSION = { decision: 'allow', pattern: 'mcp__faz-ai__*' } as const;

/** O config.toml do Kimi Code já tem uma regra `allow` para as ferramentas do board. */
export function kimiMcpAllowed(homeDir: string): boolean {
  let text: string;
  try {
    text = fs.readFileSync(path.join(kimiHome(homeDir), 'config.toml'), 'utf8');
  } catch {
    return false;
  }
  // cada bloco [[permission.rules]] é conferido sozinho: a decisão e o padrão precisam estar no mesmo
  return text
    .split('[[permission.rules]]')
    .slice(1)
    .some((block) => /decision\s*=\s*"allow"/.test(block) && /pattern\s*=\s*"mcp__faz-ai__\*"/.test(block));
}

/**
 * Grava a regra que libera as ferramentas do board no config.toml do Kimi Code, ACRESCENTANDO o bloco
 * ao final do arquivo: o conteúdo existente nunca é reescrito (não há parser de TOML nas dependências,
 * e um reescrita manual arriscaria perder o que a pessoa tem lá). Cria a pasta e o arquivo quando não
 * existem. Devolve true quando gravou; false quando a regra já estava lá.
 */
export function allowKimiMcp(homeDir: string): boolean {
  if (kimiMcpAllowed(homeDir)) return false;
  const file = path.join(kimiHome(homeDir), 'config.toml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const block = `[[permission.rules]]\ndecision = "${KIMI_MCP_PERMISSION.decision}"\npattern = "${KIMI_MCP_PERMISSION.pattern}"\n`;
  fs.writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${block}`);
  return true;
}

export interface RequirementProbe {
  tool: AiTool;
  permission: RunnerPermission;
  workspaceDir: string;
  homeDir: string;
  /** o bridge.js que este board registra */
  bridgePath: string;
  /** a versão da extensão que gravou a ponte (`bridge.version`); null quando não há o arquivo */
  installedVersion?: string | null;
  /** a versão da extensão em uso; sem as duas versões não há como dizer que o MCP está desatualizado */
  currentVersion?: string;
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
  /**
   * o PATH com que o editor abriu: é nele que o chat do editor procura o comando do MCP. Um programa
   * instalado depois (o node pelo nvm) só entra nele quando o editor fecha e abre de novo
   */
  editorPath?: string;
  /** a skill do fluxo está instalada na ferramenta; ausente quando não dá para saber (sem o inventário) */
  skillInstalled?: boolean;
  /** o que falta no banco de artefatos do board; ausente quando não dá para saber (sem o inventário) */
  harnessIssues?: HarnessIssue[];
  /** o arquivo do projeto está no git (por padrão, `git ls-files`) */
  isTracked?: (workspaceDir: string, rel: string) => boolean;
}

/**
 * O chat do Cursor já conectou o servidor do board deste projeto alguma vez. O Cursor deixa desligado
 * todo servidor novo do projeto, e o liga/desliga fica no banco interno dele; o que dá para ler de fora
 * é a pasta que ele cria ao conectar: `~/.cursor/projects/<pasta do projeto>/mcps/project-<n>-<projeto>-faz-ai`,
 * com o caminho do projeto virando um nome só de letras, números e hífens.
 */
export function cursorConnectedOnce(homeDir: string, workspaceDir: string): boolean {
  const slug = workspaceDir.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  try {
    return fs.readdirSync(path.join(homeDir, '.cursor', 'projects', slug, 'mcps')).some((n) => /^project-\d+-.*-faz-ai$/.test(n));
  } catch {
    return false;
  }
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
  const cli = built.command;
  const executable = p.resolve(cli);
  if (!executable) {
    const install = baseValue(INSTALL, tool) ?? { command: null, where: '' };
    out.push({
      id: 'cli',
      tool,
      cli,
      where: install.where,
      action: install.command ? { kind: 'command', command: install.command } : null,
    });
  }

  if (cli && executable && (await p.signedIn(tool, executable)) === false)
    out.push({ id: 'signin', tool, cli, action: { kind: 'command', command: baseValue(LOGIN_COMMAND, tool) ?? '', terminal: true } });

  // o MCP e a skill do fluxo são necessários em todas as ferramentas: mesmo onde as execuções pelo board
  // levam o servidor sozinhas (Claude, Cursor), a conversa no chat do editor ou no terminal depende dele
  const registered = registeredServer(tool, p.workspaceDir, p.homeDir);
  if (!registered) out.push({ id: 'mcp', tool, action: { kind: 'connect' } });
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
        file: registered.file,
        missing: commandMissing ? registered.command : bridgeMissing ? bridge : folder,
        // o do projeto vale sobre o global: refazer só o global deixaria o aviso para sempre
        action: registered.scope === 'project' ? { kind: 'fixProject', file: registered.file } : { kind: 'connect' },
      });
    // desatualizado é a versão gravada ao lado da ponte diferir da da extensão (o caminho da ponte não
    // diz nada); a extensão atualiza em silêncio e, se não conseguiu, é isto que fica no aviso. Um
    // registro do projeto não é do board atualizar (exceto o Cursor, que só tem esse)
    else if (
      p.installedVersion !== undefined &&
      p.currentVersion !== undefined &&
      p.installedVersion !== p.currentVersion &&
      (registered.scope !== 'project' || tool === 'cursor')
    )
      out.push({
        id: 'mcp-outdated',
        tool,
        file: registered.file,
        missing: bridge,
        action: registered.scope === 'project' ? { kind: 'fixProject', file: registered.file } : { kind: 'connect' },
      });
    // o chat do editor inicia o servidor com o PATH de quando ele abriu: um node instalado depois não
    // está nele. O caminho completo resolve sem fechar o editor (o arquivo do projeto no git, não)
    else if (p.editorPath !== undefined && tool === 'cursor' && p.editor === 'cursor' && !editorFinds(registered.command, p.editorPath)) {
      const tracked = registered.scope === 'project' && (p.isTracked ?? trackedInGit)(p.workspaceDir, registered.file);
      out.push({
        id: 'mcp-path',
        tool,
        file: registered.file,
        missing: registered.command,
        ...(tracked ? { tracked: true as const } : {}),
        action: tracked ? null : { kind: 'pinMcp' },
      });
    }
    // o chat do Cursor só carrega um servidor registrado depois que a janela abriu ao recarregá-la
    else if (
      tool === 'cursor' &&
      p.editor === 'cursor' &&
      p.windowStartedAt !== undefined &&
      modifiedAt(registered.path) > p.windowStartedAt
    )
      out.push({ id: 'mcp-reload', tool, file: registered.file, action: { kind: 'reload' } });
    // carregado, mas o Cursor deixa desligado todo servidor novo do projeto: só a pessoa liga
    else if (tool === 'cursor' && p.editor === 'cursor' && !cursorConnectedOnce(p.homeDir, p.workspaceDir))
      out.push({ id: 'mcp-enable', tool, action: { kind: 'openEditorMcp' } });
  }

  // a skill ensina a IA a conduzir o fluxo do board (fases, documentos, revisão)
  if (p.skillInstalled === false) out.push({ id: 'skill', tool, action: { kind: 'installSkill' } });

  // o harness definido é recomendação, não requisito: o board trabalha sem ele, só sem a economia de contexto
  if (p.harnessIssues?.length)
    out.push({ id: 'harness', tool, optional: true, harnessIssues: p.harnessIssues, action: { kind: 'settings' } });

  const unsupported = headlessUnsupported(tool, p.permission);
  if (unsupported) out.push({ id: 'permission', tool, reason: unsupported, action: { kind: 'settings' } });

  // Kimi Code: sem a regra `allow` no config.toml, as ferramentas do board pedem aprovação uma a uma
  // nas conversas interativas (nas execuções pelo board, em `-p`, nada é perguntado): recomendado, não bloqueia
  if (tool === 'kimi' && !kimiMcpAllowed(p.homeDir))
    out.push({ id: 'permission-mcp', tool, file: '~/.kimi-code/config.toml', optional: true, action: { kind: 'allowKimiMcp' } });

  return out;
}
