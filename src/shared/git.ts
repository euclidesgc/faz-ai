/** Onde a IA mexe no código de cada história: uma branch própria, por padrão numa worktree separada. */

export type WorkspaceMode = 'worktree' | 'branch' | 'off';

/** Tipo de branch do gitflow que um tipo de card gera. */
export type BranchKind = 'feature' | 'bugfix' | 'hotfix';
/** release só tem prefixo nesta entrega: nenhum tipo de card gera release (#462, RF08) */
export const BRANCH_KINDS: { value: BranchKind; label: string }[] = [
  { value: 'feature', label: 'Feature' },
  { value: 'bugfix', label: 'Bugfix' },
  { value: 'hotfix', label: 'Hotfix' },
];
/** nomes guardados (sempre em português) dos tipos do board padrão que não geram feature */
export const DEFAULT_BRANCH_KINDS: Record<string, BranchKind> = { Retrabalho: 'bugfix', Bug: 'hotfix' };

/** De onde veio a branch principal: o HEAD do origin, o nome (main/master), a branch atual ou o nome configurado (`mainBranch`). */
export type MainSource = 'origin' | 'name' | 'current' | 'config';
export interface MainBranch {
  name: string;
  source: MainSource;
}

export interface GitConfig {
  mode: WorkspaceMode;
  /** nome da branch; aceita {fluxo}, {tipo}, {numero} e {titulo} */
  branchPattern: string;
  /** pasta onde ficam as worktrees, relativa à pasta do projeto; aceita {repo} */
  worktreeDir: string;
  /** ao aprovar a história na última coluna antes da conclusão, faz o merge do PR dela e conclui o card */
  autoMerge: boolean;
  mergeMethod: MergeMethod;
  /**
   * pasta do repositório (relativa à do projeto) onde a Homologação grava o registro de decisão da
   * história, a partir da Spec aprovada, e o leva no pull request; '' = desligado
   */
  decisionRecords: string;
  /** gitflow: feature e bugfix partem da develop e voltam para ela; hotfix parte da principal */
  gitflow: boolean;
  /** a branch principal quando a pessoa a fixa; '' = detectada (origin/HEAD, main ou master, branch atual) */
  mainBranch: string;
  /** branch de integração do gitflow */
  developBranch: string;
  /** prefixos que entram em {fluxo}, com a barra (ou sem: `feat-` gera `feat-12-...`) */
  featurePrefix: string;
  bugfixPrefix: string;
  hotfixPrefix: string;
  /** só informativo nesta entrega: nenhum tipo de card gera release */
  releasePrefix: string;
}

export type MergeMethod = 'squash' | 'merge' | 'rebase';
export const MERGE_METHODS: { value: MergeMethod; label: string }[] = [
  { value: 'squash', label: 'Squash (um commit só)' },
  { value: 'merge', label: 'Merge commit' },
  { value: 'rebase', label: 'Rebase' },
];

/** `package.nls.json` e `package.nls.pt-br.json` repetem estas `hint`s nas chaves `config.git.mode.*`: mantenha em sincronia. */
export const WORKSPACE_MODES: { value: WorkspaceMode; label: string; hint: string }[] = [
  {
    value: 'worktree',
    label: 'Worktree por história',
    hint: 'Cada história ganha uma branch e uma pasta de trabalho própria. A IA mexe no código lá, sem tocar na sua pasta nem nas suas alterações em andamento.',
  },
  {
    value: 'branch',
    label: 'Branch na própria pasta',
    hint: 'Cada história ganha uma branch, mas o trabalho acontece na pasta do projeto: a IA troca de branch nela. Evite com o heartbeat ligado, porque isso pode atropelar o que você está fazendo.',
  },
  { value: 'off', label: 'Desligado', hint: 'O board não cria branches nem worktrees.' },
];

/** padrão de fábrica até a 0.37.0: convertido para o novo ao ler (#462, RF07) */
export const LEGACY_BRANCH_PATTERN = '{tipo}/{numero}-{titulo}';

export const DEFAULT_GIT: GitConfig = {
  mode: 'worktree',
  branchPattern: '{fluxo}{numero}-{titulo}',
  worktreeDir: '../{repo}.worktrees',
  autoMerge: false,
  mergeMethod: 'squash',
  decisionRecords: '',
  gitflow: true,
  mainBranch: '',
  developBranch: 'develop',
  featurePrefix: 'feature/',
  bugfixPrefix: 'bugfix/',
  hotfixPrefix: 'hotfix/',
  releasePrefix: 'release/',
};

/** O que o git aceita num nome de ref: só [A-Za-z0-9._/-], sem '..', '//', '@{', sem começar com '/', '.' ou '-'. */
const validRef = (v: string): boolean =>
  /^[A-Za-z0-9._/-]+$/.test(v) && !v.includes('..') && !v.includes('//') && !v.includes('@{') && !/^[/.-]/.test(v);

/** Prefixo de branch aceito pelo git, ou o padrão: vazio ou inválido volta ao padrão (RF04). */
export function cleanPrefix(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const p = v.trim();
  return p && validRef(p) ? p : fallback;
}

/** Nome de branch aceito pelo git (as regras do prefixo, e sem '/' no fim), ou o padrão. */
export function cleanBranchName(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const n = v.trim();
  return n && validRef(n) && !n.endsWith('/') ? n : fallback;
}

/** A pasta dos registros de decisão, limpa: relativa, com barras normais e sem barra nas pontas; '' quando não vale. */
export function cleanDecisionDir(v: unknown): string {
  if (typeof v !== 'string') return '';
  const dir = v
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+|\/+$/g, '');
  // fora do repositório não é registro do projeto
  if (!dir || dir.split('/').includes('..') || /^[a-zA-Z]:/.test(dir)) return '';
  return dir;
}

const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

/** Lê a configuração salva, completando com os padrões o que faltar ou for inválido. */
export function parseGit(json: string | null | undefined): GitConfig {
  let raw: Partial<Record<keyof GitConfig, unknown>> = {};
  try {
    const v: unknown = JSON.parse(json ?? '');
    if (v && typeof v === 'object') raw = v as typeof raw;
  } catch {
    /* inválido: usa os padrões */
  }
  let pattern = text(raw.branchPattern, DEFAULT_GIT.branchPattern);
  // o padrão de fábrica antigo é indistinguível de uma escolha deliberada: vira o novo na leitura (RF07)
  if (pattern === LEGACY_BRANCH_PATTERN) pattern = DEFAULT_GIT.branchPattern;
  return {
    mode: WORKSPACE_MODES.some((m) => m.value === raw.mode) ? (raw.mode as WorkspaceMode) : DEFAULT_GIT.mode,
    // sem o número, duas histórias de mesmo título disputariam a mesma branch
    branchPattern: pattern.includes('{numero}') ? pattern : DEFAULT_GIT.branchPattern,
    worktreeDir: text(raw.worktreeDir, DEFAULT_GIT.worktreeDir),
    autoMerge: raw.autoMerge === true,
    mergeMethod: MERGE_METHODS.some((m) => m.value === raw.mergeMethod) ? (raw.mergeMethod as MergeMethod) : DEFAULT_GIT.mergeMethod,
    decisionRecords: cleanDecisionDir(raw.decisionRecords),
    // ausente vale ligado, também em board antigo (RF01)
    gitflow: raw.gitflow !== false,
    // vazio ou inválido volta a ser detectada
    mainBranch: cleanBranchName(raw.mainBranch, DEFAULT_GIT.mainBranch),
    developBranch: cleanBranchName(raw.developBranch, DEFAULT_GIT.developBranch),
    featurePrefix: cleanPrefix(raw.featurePrefix, DEFAULT_GIT.featurePrefix),
    bugfixPrefix: cleanPrefix(raw.bugfixPrefix, DEFAULT_GIT.bugfixPrefix),
    hotfixPrefix: cleanPrefix(raw.hotfixPrefix, DEFAULT_GIT.hotfixPrefix),
    releasePrefix: cleanPrefix(raw.releasePrefix, DEFAULT_GIT.releasePrefix),
  };
}

/** Texto seguro para nome de branch e de pasta: minúsculas, sem acentos, com hífens. */
export const slug = (s: string, max = 40): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');

/** {fluxo} recebe o prefixo como veio (com a barra); ver `flowPrefix` em gitflow.ts. */
export function branchName(pattern: string, card: { type: string; number: number; title: string; flow: string }): string {
  const name = pattern
    .replace(/\{fluxo\}/g, card.flow)
    .replace(/\{tipo\}/g, slug(card.type) || 'card')
    .replace(/\{numero\}/g, String(card.number))
    .replace(/\{titulo\}/g, slug(card.title) || 'sem-titulo');
  // o que sobrar fora do que o git aceita em nomes de branch vira hífen
  return name
    .replace(/[^A-Za-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[/.-]+|[/.-]+$/g, '');
}
