import type { EnvFix, EnvOs } from '../shared/environment';

/**
 * A família da distribuição Linux, pelo `/etc/os-release` (`ID` e `ID_LIKE`): é ela que decide o
 * gerenciador de pacotes dos comandos de instalação.
 */
export function detectOs(platform: NodeJS.Platform, osRelease: string | null): EnvOs {
  if (platform === 'win32') return { platform, family: 'windows', label: 'Windows' };
  if (platform === 'darwin') return { platform, family: 'macos', label: 'macOS' };
  const field = (name: string) => new RegExp(`^${name}="?([^"\\n]*)"?`, 'm').exec(osRelease ?? '')?.[1] ?? '';
  const ids = `${field('ID')} ${field('ID_LIKE')}`.toLowerCase().split(/\s+/);
  const family = ids.some((i) => i === 'debian' || i === 'ubuntu')
    ? 'debian'
    : ids.some((i) => i === 'fedora' || i === 'rhel' || i === 'centos')
      ? 'fedora'
      : ids.some((i) => i === 'arch')
        ? 'arch'
        : 'linux';
  return { platform, family, label: field('PRETTY_NAME') || 'Linux' };
}

type Installable = 'node' | 'git' | 'gh' | 'uv';

/** Os pacotes nos gerenciadores do Linux (sem `sudo apt update` o apt de uma máquina nova pode não achar). */
const LINUX: Record<'git' | 'gh', Record<'debian' | 'fedora' | 'arch', string[]>> = {
  git: {
    debian: ['sudo apt update', 'sudo apt install -y git'],
    fedora: ['sudo dnf install -y git'],
    arch: ['sudo pacman -S --needed git'],
  },
  gh: {
    debian: ['sudo apt update', 'sudo apt install -y gh'],
    fedora: ['sudo dnf install -y gh'],
    arch: ['sudo pacman -S --needed github-cli'],
  },
};

/**
 * Como instalar cada programa no sistema da pessoa; null quando não há um comando confiável (aí fica
 * o link de download). No Windows, o PATH novo só vale num terminal aberto depois da instalação.
 */
export function installFix(what: Installable, os: EnvOs): EnvFix | null {
  const commands = (list: string[], extra: { reopenTerminal?: true; brew?: true } = {}): EnvFix => ({
    kind: 'commands',
    commands: list,
    ...extra,
  });
  if (os.family === 'windows') {
    const winget: Record<Installable, string> = {
      node: 'winget install --id OpenJS.NodeJS.LTS -e',
      git: 'winget install --id Git.Git -e',
      gh: 'winget install --id GitHub.cli -e',
      uv: 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
    };
    return commands([winget[what]], { reopenTerminal: true });
  }
  // o instalador do uv põe o programa em ~/.local/bin, que o terminal já aberto ainda não enxerga (o
  // comando seguinte daria "uv: command not found"). O `export` e não o `source ~/.local/bin/env`: esse
  // arquivo só existe quando o instalador precisou mexer no PATH, e com a pasta já no PATH o source falha
  if (what === 'uv') return commands(['curl -LsSf https://astral.sh/uv/install.sh | sh', 'export PATH="$HOME/.local/bin:$PATH"']);
  if (os.family === 'macos') {
    if (what === 'git') return commands(['xcode-select --install']);
    return commands([what === 'node' ? 'brew install node' : 'brew install gh'], { brew: true });
  }
  // no Linux, o Node das distribuições costuma ser antigo: o nvm instala a versão LTS na pasta da
  // pessoa, sem sudo, em qualquer distribuição
  if (what === 'node')
    return commands([
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash',
      '. "$HOME/.nvm/nvm.sh"',
      'nvm install --lts',
    ]);
  if (os.family === 'linux') return null;
  return commands(LINUX[what as 'git' | 'gh'][os.family]);
}
