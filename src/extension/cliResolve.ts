import * as fs from 'node:fs';
import * as path from 'node:path';

/** Pastas de extensões dos editores baseados no VS Code, dentro da home. */
const EDITOR_DIRS = [
  '.vscode',
  '.vscode-insiders',
  '.cursor',
  '.windsurf',
  '.vscode-oss',
  // o lado remoto (SSH, WSL, contêiner): lá a extensão do editor roda, e lá fica o binário embutido
  '.vscode-server',
  '.vscode-server-insiders',
  '.cursor-server',
];

const isWindows = process.platform === 'win32';

function isExecutable(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (!isWindows) fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Compara "1.2.10" com "1.2.9" pelos números, para escolher a extensão mais nova. */
function byVersionDesc(a: string, b: string): number {
  const nums = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
  const [x, y] = [nums(a), nums(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
}

/** Binários que as extensões de editor trazem embutidos: quem só usa a extensão não tem a CLI no PATH. */
function bundledCandidates(command: string, homeDir: string): string[] {
  const out: string[] = [];
  for (const editor of EDITOR_DIRS) {
    const dir = path.join(homeDir, editor, 'extensions');
    let entries: string[];
    try {
      entries = fs.readdirSync(dir).sort(byVersionDesc);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (command === 'claude' && e.startsWith('anthropic.claude-code-'))
        out.push(path.join(dir, e, 'resources', 'native-binary', isWindows ? 'claude.exe' : 'claude'));
      if (command === 'codex' && e.startsWith('openai.chatgpt-')) {
        try {
          for (const platform of fs.readdirSync(path.join(dir, e, 'bin')))
            out.push(path.join(dir, e, 'bin', platform, isWindows ? 'codex.exe' : 'codex'));
        } catch {
          /* extensão sem binário embutido */
        }
      }
    }
  }
  return out;
}

/**
 * Outros nomes do mesmo executável. O instalador do Cursor cria `cursor-agent` e `agent`; o board
 * chama `cursor-agent`, que não se confunde com outro programa chamado `agent` no PATH, e aceita
 * `agent` em instalações que só tenham esse.
 */
const ALIASES: Record<string, string[]> = { 'cursor-agent': ['agent'] };

/** Versões da CLI do Cursor guardadas pelo instalador, da mais nova para a mais antiga. */
function cursorVersions(homeDir: string): string[] {
  const dir = path.join(homeDir, '.local', 'share', 'cursor-agent', 'versions');
  try {
    return fs
      .readdirSync(dir)
      .filter((v) => !v.startsWith('.'))
      .sort(byVersionDesc)
      .map((v) => path.join(dir, v, 'cursor-agent'));
  } catch {
    return [];
  }
}

/** Onde os instaladores das ferramentas costumam deixar a CLI quando a pasta não está no PATH do editor. */
function commonDirs(command: string, homeDir: string): string[] {
  const dirs = [
    path.join(homeDir, '.local', 'bin'),
    path.join(homeDir, 'bin'),
    path.join(homeDir, '.npm-global', 'bin'),
    path.join(homeDir, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  if (command === 'claude') dirs.unshift(path.join(homeDir, '.claude', 'local'));
  if (isWindows && process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm'));
  return dirs;
}

/**
 * Caminho do executável de uma ferramenta de IA: no PATH, nas pastas de instalação usuais ou embutido
 * numa extensão de editor (Claude Code, Codex). Devolve null quando não acha em lugar nenhum.
 */
export function resolveCommand(command: string, pathEnv: string | undefined, homeDir: string): string | null {
  if (path.isAbsolute(command)) return isExecutable(command) ? command : null;
  const exts = isWindows ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  const inDirs = (name: string, dirs: string[]) => {
    for (const dir of dirs) {
      if (!dir) continue;
      for (const ext of exts) {
        const file = path.join(dir, name + ext);
        if (isExecutable(file)) return file;
      }
    }
    return null;
  };
  const pathDirs = (pathEnv ?? process.env.PATH ?? '').split(path.delimiter);
  const lookup = (name: string) => inDirs(name, pathDirs) ?? (homeDir ? inDirs(name, commonDirs(command, homeDir)) : null);
  const direct = lookup(command);
  if (direct) return direct;
  // a instalação do próprio Cursor vem antes do apelido: um `agent` qualquer no PATH pode ser outro programa
  const installed = homeDir && command === 'cursor-agent' ? cursorVersions(homeDir).find(isExecutable) : undefined;
  if (installed) return installed;
  for (const alias of ALIASES[command] ?? []) {
    const found = lookup(alias);
    if (found) return found;
  }
  if (!homeDir) return null;
  return bundledCandidates(command, homeDir).find(isExecutable) ?? null;
}

/** Mensagem para quando a CLI não foi encontrada, com o que a pessoa pode fazer. */
export function commandNotFound(command: string): string {
  const install: Record<string, string> = {
    claude: 'Instale o Claude Code (https://claude.com/claude-code) ou a extensão dele no editor.',
    codex: 'Instale a CLI do Codex (npm install -g @openai/codex).',
    copilot: 'Instale a GitHub Copilot CLI (npm install -g @github/copilot).',
    'cursor-agent': 'Instale a CLI do Cursor (curl https://cursor.com/install -fsS | bash) e entre na conta com "cursor-agent login".',
    kimi: 'Instale a CLI do Kimi Code.',
  };
  return `comando "${command}" não encontrado no PATH, nas pastas de instalação usuais nem nas extensões do editor. ${install[command] ?? 'Instale a ferramenta.'} Depois confira no terminal se "${command} --version" responde.`;
}
