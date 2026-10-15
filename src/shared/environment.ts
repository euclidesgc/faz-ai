import type { AiTool } from './harness';
import type { HarnessIssue } from './harnessStatus';
import type { BoardRequirement } from './requirements';

/**
 * Os itens do Diagnóstico do ambiente. `tool` é o bloco de uma ferramenta de IA, com a CLI, o login,
 * o MCP do board, a skill do fluxo, a definição do harness (com o que falta nela) e o nível de
 * permissão dentro dele.
 */
export type EnvCheckId =
  | 'node'
  | 'tool'
  | 'cli'
  | 'signin'
  | 'mcp'
  | 'skill'
  | 'harness'
  | `harness-${HarnessIssue}`
  | 'permission'
  | 'git'
  | 'repo'
  | 'gh'
  | 'gh-auth'
  | 'branch-name'
  | 'crg'
  | 'uv'
  | 'crg-graph'
  | 'crg-mcp'
  | 'crg-embeddings';

/**
 * `ok`: pronto. `missing`: falta. `skipped`: não dá para conferir enquanto falta o item de que ele
 * depende (o login sem a CLI, o grafo sem o Code Review Graph).
 */
export type EnvStatus = 'ok' | 'missing' | 'skipped';

/**
 * Um item da lista. O board só resolve o que é dele (o MCP, a skill e a permissão da ferramenta do
 * projeto, pelo `requirement`); o resto ele só confere, com o site de onde instalar e os comandos para
 * copiar.
 */
export interface EnvCheck {
  id: EnvCheckId;
  status: EnvStatus;
  /** a ferramenta de IA do item: o bloco `tool` e os itens dentro dele */
  tool?: AiTool;
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
  /** a ferramenta de IA do projeto quando o diagnóstico rodou */
  tool: AiTool;
  /** sem eles o board não trabalha com a IA: o Node.js e a ferramenta do projeto */
  required: EnvCheck[];
  /** a outra ferramenta de IA, quando encontrada na máquina */
  optional: EnvCheck[];
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
 * Os itens que faltam na árvore, sem contar o bloco da ferramenta (que só resume os de dentro) nem o
 * do harness (que só resume o que falta nele: cada falta é um filho).
 */
export function missingCount(checks: EnvCheck[]): number {
  return checks.reduce(
    (n, c) => n + (c.id !== 'tool' && c.id !== 'harness' && c.status === 'missing' ? 1 : 0) + missingCount(c.children ?? []),
    0,
  );
}
