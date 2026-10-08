import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Os servidores MCP cujo comando o board fixa com o caminho completo: o dele e o do Code Review Graph,
 * que o Diagnóstico instala. Os outros servidores do arquivo são da pessoa e ficam como estão.
 */
export const PINNED_SERVERS = ['faz-ai', 'code-review-graph'] as const;
export type PinnedServer = (typeof PINNED_SERVERS)[number];

/** Um arquivo de MCPs que o editor lê (a lista fica na chave `mcpServers`). */
export interface EditorMcpFile {
  file: string;
  /** do projeto: pode estar no git, e aí o caminho desta máquina não pode ser gravado nele */
  project?: { workspaceDir: string; rel: string };
}

/** Os arquivos de MCP que o Cursor lê nesta pasta: o do projeto e o do usuário. */
export function editorMcpFiles(workspaceDir: string, homeDir: string): EditorMcpFile[] {
  return [
    { file: path.join(workspaceDir, '.cursor', 'mcp.json'), project: { workspaceDir, rel: '.cursor/mcp.json' } },
    { file: path.join(homeDir, '.cursor', 'mcp.json') },
  ];
}

const isFile = (file: string): boolean => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * O comando é achado pelo editor: um caminho completo que existe, ou um nome numa pasta do PATH com
 * que o editor abriu. Um programa instalado depois disso não está nesse PATH até o editor fechar e
 * abrir de novo (recarregar a janela não basta).
 */
export function editorFinds(command: string, editorPath: string): boolean {
  if (path.isAbsolute(command)) return isFile(command);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  return editorPath
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => exts.some((ext) => isFile(path.join(dir, command + ext))));
}

/** O arquivo está no git (versionado): gravar nele um caminho desta máquina iria para o repositório. */
export function trackedInGit(workspaceDir: string, rel: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', rel], { cwd: workspaceDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Um servidor que o editor não consegue iniciar, e onde ele está registrado. */
export interface Unreachable {
  server: PinnedServer;
  command: string;
  file: string;
  /** o caminho completo que resolve, quando o programa existe nesta máquina */
  fullPath: string | null;
  /** o arquivo é do projeto e está no git: o board não grava o caminho nele */
  tracked: boolean;
}

const readServers = (f: EditorMcpFile): Record<string, { command?: unknown }> | null => {
  try {
    const json = JSON.parse(fs.readFileSync(f.file, 'utf8')) as Record<string, unknown> | null;
    const section = json?.mcpServers;
    return section && typeof section === 'object' ? (section as Record<string, { command?: unknown }>) : null;
  } catch {
    return null;
  }
};

/** O servidor está registrado em algum dos arquivos que o editor lê. */
export function registeredIn(files: EditorMcpFile[], server: PinnedServer): boolean {
  return files.some((f) => !!readServers(f)?.[server]);
}

/** Os servidores do board e do Code Review Graph registrados para o editor cujo comando ele não acha. */
export function unreachableServers(
  files: EditorMcpFile[],
  editorPath: string,
  resolve: (command: string) => string | null,
  isTracked: (workspaceDir: string, rel: string) => boolean = trackedInGit,
): Unreachable[] {
  const out: Unreachable[] = [];
  for (const f of files) {
    const servers = readServers(f);
    if (!servers) continue;
    for (const server of PINNED_SERVERS) {
      const command = servers[server]?.command;
      if (typeof command !== 'string' || !command || editorFinds(command, editorPath)) continue;
      out.push({
        server,
        command,
        file: f.file,
        fullPath: path.isAbsolute(command) ? null : resolve(command),
        tracked: !!f.project && isTracked(f.project.workspaceDir, f.project.rel),
      });
    }
  }
  return out;
}

/**
 * Troca o comando pelo caminho completo nos registros que o editor não acha, menos nos arquivos do
 * projeto que estão no git. O arquivo do projeto fica fora do git pelo `.git/info/exclude`, já que
 * passa a guardar caminhos desta máquina. Devolve o que trocou.
 */
export function pinEditorCommands(
  files: EditorMcpFile[],
  editorPath: string,
  resolve: (command: string) => string | null,
  isTracked: (workspaceDir: string, rel: string) => boolean = trackedInGit,
): Unreachable[] {
  const pinned: Unreachable[] = [];
  for (const u of unreachableServers(files, editorPath, resolve, isTracked)) {
    if (u.tracked || !u.fullPath) continue;
    const f = files.find((x) => x.file === u.file)!;
    const json = JSON.parse(fs.readFileSync(f.file, 'utf8')) as Record<string, Record<string, Record<string, unknown>>>;
    json.mcpServers![u.server]!.command = u.fullPath;
    fs.writeFileSync(f.file, JSON.stringify(json, null, 2) + '\n');
    if (f.project) excludeLocally(f.project.workspaceDir, f.project.rel);
    pinned.push(u);
  }
  return pinned;
}

/** Acrescenta o caminho ao `.git/info/exclude` do repositório, se houver um e ele ainda não estiver lá. */
export function excludeLocally(workspaceDir: string, relFile: string): void {
  const exclude = path.join(workspaceDir, '.git', 'info', 'exclude');
  if (!fs.existsSync(path.join(workspaceDir, '.git'))) return;
  try {
    const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
    if (current.split(/\r?\n/).some((l) => l.trim() === relFile)) return;
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.writeFileSync(exclude, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${relFile}\n`);
  } catch {
    /* `.git` pode ser um arquivo (worktree, submódulo): fica sem a exclusão local */
  }
}
