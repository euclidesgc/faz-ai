import type { HarnessIssue } from './harnessStatus';
import type { BoardAvailability, ProfileHealth } from './profileHealth';
import type { BoardRequirement } from './requirements';

/**
 * Os itens do Diagnóstico do ambiente. `harness` é o banco de artefatos do board (com o que falta
 * nele). A CLI, o login e o resto de cada perfil não são itens da lista: vêm no `ProfileHealth`.
 */
export type EnvCheckId =
  | 'node'
  | 'harness'
  | `harness-${HarnessIssue}`
  | 'git'
  | 'repo'
  | 'gh'
  | 'gh-auth'
  | 'branch-name'
  | 'crg'
  | 'uv'
  | 'crg-graph'
  | 'crg-embeddings';

/**
 * `ok`: pronto. `missing`: falta. `skipped`: não dá para conferir enquanto falta o item de que ele
 * depende (o login sem a CLI, o grafo sem o Code Review Graph).
 */
export type EnvStatus = 'ok' | 'missing' | 'skipped';

/**
 * Um item da lista. O board só confere, com o site de onde instalar e os comandos para copiar; o
 * `requirement` do banco de artefatos leva ao atalho do Harness.
 */
export interface EnvCheck {
  id: EnvCheckId;
  status: EnvStatus;
  /** a versão encontrada, quando o comando diz */
  version?: string;
  /** os comandos que instalam o programa, em ordem, quando falta (os instaladores oficiais neutros: curl, PowerShell) */
  install?: InstallStep[];
  /** no Windows, o programa só aparece num terminal aberto depois da instalação */
  reopenTerminal?: true;
  /** o comando que resolve, com botão de copiar (os logins e as ações na pasta do projeto) */
  command?: string;
  /** o comando roda na pasta do projeto */
  inProject?: true;
  /** onde a pessoa vê como instalar ou configurar */
  docs?: string;
  /** o requisito do aviso no topo do board, com o texto e o botão que o resolvem */
  requirement?: BoardRequirement;
  /** o que depende deste item, mostrado dentro dele */
  children?: EnvCheck[];
}

/**
 * O que um passo da instalação faz, quando não é óbvio pelo comando: o Node.js se instala pelo nvm,
 * que vem antes dele, e o que cai em `~/.local/bin` precisa dessa pasta no PATH.
 */
export type InstallStepKind = 'nvm' | 'nvm-load' | 'node' | 'path-save' | 'path-load' | 'apt-update' | 'brew';

/** Um comando da instalação, com botão de copiar. */
export interface InstallStep {
  command: string;
  step?: InstallStepKind;
}

export interface EnvironmentReport {
  /** sem eles o board não trabalha com a IA: o Node.js */
  required: EnvCheck[];
  /** um bloco por perfil de CLI: os ligados (o padrão primeiro), depois os desligados e os pendentes de revisão */
  profiles: ProfileHealth[];
  /** o que o aviso do topo mostra: bloqueia só quando nenhum perfil ligado está disponível */
  availability: BoardAvailability;
  /** o banco de artefatos do board: o que falta nele, um filho por falta (recomendação) */
  harness: EnvCheck;
  /** o que o board aproveita quando existe: git, GitHub CLI, Code Review Graph */
  recommended: EnvCheck[];
  /** os comandos de instalação do Linux e do macOS usam o curl, e ele não está nesta máquina */
  curlMissing?: true;
  /** quando terminou (ms) */
  checkedAt: number;
}

/** A versão mínima do Node.js (a que o Claude Code pede e a LTS mais antiga ainda com suporte). */
export const NODE_MIN_MAJOR = 22;

/**
 * Os itens que faltam na árvore, sem contar o do banco de artefatos (que só resume o que falta nele:
 * cada falta é um filho).
 */
export function missingCount(checks: EnvCheck[]): number {
  return checks.reduce((n, c) => n + (c.id !== 'harness' && c.status === 'missing' ? 1 : 0) + missingCount(c.children ?? []), 0);
}
