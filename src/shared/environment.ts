import type { AiTool } from './harness';
import type { BoardRequirement } from './requirements';

/**
 * Os itens do Diagnóstico do ambiente, na ordem da tela: primeiro o que o board precisa para
 * trabalhar com a IA, depois o que ele usa quando existe.
 */
export type EnvCheckId =
  | 'node'
  | 'cli'
  | 'signin'
  | 'mcp'
  | 'permission'
  | 'skill'
  | 'git'
  | 'repo'
  | 'gh'
  | 'gh-auth'
  | 'crg'
  | 'uv'
  | 'python'
  | 'crg-graph'
  | 'crg-embeddings';

/**
 * `ok`: pronto. `missing`: falta, e há como resolver. `skipped`: não dá para conferir enquanto falta o
 * item de que ele depende (o login sem a CLI, a busca semântica sem o Code Review Graph).
 */
export type EnvStatus = 'ok' | 'missing' | 'skipped';

/** Como resolver um item, quando não é uma das ações do aviso de requisitos. */
export type EnvFix =
  /**
   * comandos para rodar no terminal, em ordem, cada um com botão de copiar. `reopenTerminal`: o
   * programa só aparece num terminal aberto depois (o PATH do Windows); `brew`: precisa do Homebrew
   */
  | { kind: 'commands'; commands: string[]; reopenTerminal?: true; brew?: true }
  /** instalar a skill do fluxo na ferramenta do projeto, no escopo global */
  | { kind: 'installSkill' };

export interface EnvCheck {
  id: EnvCheckId;
  /** obrigatório para o board trabalhar com a IA, ou só recomendado */
  level: 'required' | 'recommended';
  status: EnvStatus;
  /** o item de que este é pré-requisito: a tela o mostra dentro dele (o uv e o Python do Code Review Graph) */
  parent?: EnvCheckId;
  /** a versão encontrada, quando o comando diz */
  version?: string;
  /** o requisito do aviso no topo do board, com o texto e a ação dele (itens obrigatórios) */
  requirement?: BoardRequirement;
  fix?: EnvFix;
}

/** O sistema da máquina, para os comandos de instalação saírem do gerenciador certo. */
export interface EnvOs {
  platform: string;
  /** `linux`: uma distribuição sem gerenciador conhecido (sobra o link de download) */
  family: 'windows' | 'macos' | 'debian' | 'fedora' | 'arch' | 'linux';
  /** o nome para mostrar ("Ubuntu 24.04.3 LTS", "macOS") */
  label: string;
}

export interface EnvironmentReport {
  /** para qual sistema os comandos foram montados */
  os: EnvOs;
  /** a ferramenta de IA do projeto quando o diagnóstico rodou */
  tool: AiTool;
  checks: EnvCheck[];
  /** quando terminou (ms) */
  checkedAt: number;
}

/** A documentação de cada item, para o "Saiba mais". */
export const ENV_DOCS: Partial<Record<EnvCheckId, string>> = {
  node: 'https://nodejs.org/en/download',
  git: 'https://git-scm.com/downloads',
  repo: 'https://git-scm.com/docs/git-init',
  gh: 'https://cli.github.com',
  'gh-auth': 'https://cli.github.com/manual/gh_auth_login',
  crg: 'https://github.com/tirth8205/code-review-graph',
  uv: 'https://docs.astral.sh/uv/getting-started/installation/',
  python: 'https://docs.astral.sh/uv/guides/install-python/',
  'crg-graph': 'https://github.com/tirth8205/code-review-graph#quick-start',
  'crg-embeddings': 'https://github.com/tirth8205/code-review-graph#usage',
};
