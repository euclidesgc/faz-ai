/** Onde a IA mexe no código de cada história: uma branch própria, por padrão numa worktree separada. */

export type WorkspaceMode = 'worktree' | 'branch' | 'off';

export interface GitConfig {
  mode: WorkspaceMode;
  /** nome da branch; aceita {tipo}, {numero} e {titulo} */
  branchPattern: string;
  /** pasta onde ficam as worktrees, relativa à pasta do projeto; aceita {repo} */
  worktreeDir: string;
  /** ao aprovar a história na última coluna antes da conclusão, faz o merge do PR dela e conclui o card */
  autoMerge: boolean;
  mergeMethod: MergeMethod;
}

export type MergeMethod = 'squash' | 'merge' | 'rebase';
export const MERGE_METHODS: { value: MergeMethod; label: string }[] = [
  { value: 'squash', label: 'Squash (um commit só)' },
  { value: 'merge', label: 'Merge commit' },
  { value: 'rebase', label: 'Rebase' },
];

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

export const DEFAULT_GIT: GitConfig = {
  mode: 'worktree',
  branchPattern: '{tipo}/{numero}-{titulo}',
  worktreeDir: '../{repo}.worktrees',
  autoMerge: false,
  mergeMethod: 'squash',
};

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
  const pattern = text(raw.branchPattern, DEFAULT_GIT.branchPattern);
  return {
    mode: WORKSPACE_MODES.some((m) => m.value === raw.mode) ? (raw.mode as WorkspaceMode) : DEFAULT_GIT.mode,
    // sem o número, duas histórias de mesmo título disputariam a mesma branch
    branchPattern: pattern.includes('{numero}') ? pattern : DEFAULT_GIT.branchPattern,
    worktreeDir: text(raw.worktreeDir, DEFAULT_GIT.worktreeDir),
    autoMerge: raw.autoMerge === true,
    mergeMethod: MERGE_METHODS.some((m) => m.value === raw.mergeMethod) ? (raw.mergeMethod as MergeMethod) : DEFAULT_GIT.mergeMethod,
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

export function branchName(pattern: string, card: { type: string; number: number; title: string }): string {
  const name = pattern
    .replace(/\{tipo\}/g, slug(card.type) || 'card')
    .replace(/\{numero\}/g, String(card.number))
    .replace(/\{titulo\}/g, slug(card.title) || 'sem-titulo');
  // o que sobrar fora do que o git aceita em nomes de branch vira hífen
  return name
    .replace(/[^A-Za-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[/.-]+|[/.-]+$/g, '');
}
