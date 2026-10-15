import { describe, expect, it } from 'vitest';
import { DEFAULT_GIT, PROTECTED_BRANCH, branchMatcher, branchName } from '../src/shared/git';
import { EMPTY_ORPHANS, candidateBranches, detectOrphans, ownerOf, type GitFacts, type OrphanItem } from '../src/shared/orphans';
import type { BoardState } from '../src/shared/model';
import { boardState, card, sub } from './fakes/board';

const ROOT = '/work/proj.worktrees';
const wt = (n: number, over: Partial<GitFacts['worktrees'][number]> = {}) => ({
  path: `${ROOT}/${n}-x`,
  branch: `feature/${n}-x`,
  exists: true,
  dirtyFiles: 0,
  ...over,
});
const br = (n: number, over: Partial<GitFacts['branches'][number]> = {}) => ({
  name: `feature/${n}-x`,
  uniqueCommits: 0,
  mergeProof: false,
  ...over,
});
const facts = (over: Partial<GitFacts> = {}): GitFacts => ({
  mode: 'worktree',
  base: 'main',
  worktrees: [],
  checkedOut: ['main'],
  branches: [],
  ...over,
});
/** história terminada (coluna `done`) de número n */
const finished = (n: number, over: Partial<Parameters<typeof card>[1]> = {}) =>
  card(`s${n}`, { number: n, columnId: 'done', branch: `feature/${n}-x`, ...over });
const only = (state: BoardState, f: GitFacts): OrphanItem => {
  const items = detectOrphans(state, f);
  expect(items).toHaveLength(1);
  return items[0]!;
};

describe('branchMatcher', () => {
  it('reconhece o padrão de fábrica com os prefixos do gitflow', () => {
    const match = branchMatcher(DEFAULT_GIT.branchPattern);
    expect(match('feature/12-adotar-gitflow')).toBe(12);
    expect(match('bugfix/7-conserta')).toBe(7);
    expect(match('hotfix/130-urgente')).toBe(130);
    expect(match('feat-5-x')).toBe(5);
  });

  it('o primeiro número depois do prefixo é o dono, mesmo com outros números no título', () => {
    expect(branchMatcher(DEFAULT_GIT.branchPattern)('feature/12-versao-3-beta')).toBe(12);
  });

  it('não casa o que não é do padrão', () => {
    const match = branchMatcher(DEFAULT_GIT.branchPattern);
    expect(match('main')).toBeNull();
    expect(match('develop')).toBeNull();
    expect(match('release/1.0')).toBeNull();
    expect(match('feature/sem-numero')).toBeNull();
  });

  it('é o inverso de branchName', () => {
    const name = branchName(DEFAULT_GIT.branchPattern, { type: 'História', number: 42, title: 'Limpar órfãs', flow: 'feature/' });
    expect(branchMatcher(DEFAULT_GIT.branchPattern)(name)).toBe(42);
  });

  it('aceita o padrão antigo e um personalizado', () => {
    expect(branchMatcher('{tipo}/{numero}-{titulo}')('historia/9-algo')).toBe(9);
    const custom = branchMatcher('card-{numero}/{titulo}');
    expect(custom('card-33/titulo')).toBe(33);
    expect(custom('feature/33-titulo')).toBeNull();
  });

  it('padrão sem {numero} não casa nada', () => {
    expect(branchMatcher('{titulo}')('qualquer')).toBeNull();
  });

  it('PROTECTED_BRANCH cobre main, master e develop', () => {
    expect(['main', 'master', 'develop'].every((b) => PROTECTED_BRANCH.test(b))).toBe(true);
    expect(PROTECTED_BRANCH.test('develop-2')).toBe(false);
  });
});

describe('ownerOf e candidateBranches', () => {
  const state = boardState({
    cards: [card('s1', { number: 1, branch: 'legado/uma-coisa' }), card('s2', { number: 2 }), sub('t3', 's2', 'todo', { number: 3 })],
  });

  it('a branch registrada no card vale, mesmo fora do padrão', () => {
    expect(ownerOf(state, 'legado/uma-coisa')?.id).toBe('s1');
  });

  it('senão vale o número do nome', () => {
    expect(ownerOf(state, 'feature/2-x')?.id).toBe('s2');
  });

  it('sub-tarefa não é dona: o número dela vira dono desconhecido', () => {
    expect(ownerOf(state, 'feature/3-x')).toBeNull();
  });

  it('só as candidatas por nome ou registro, sem as protegidas', () => {
    const all = ['main', 'develop', 'feature/2-x', 'legado/uma-coisa', 'minha-experiencia', 'wip'];
    expect(candidateBranches(state, all)).toEqual(['feature/2-x', 'legado/uma-coisa']);
  });
});

describe('detectOrphans: o dono', () => {
  it('história aberta nunca é órfã (worktree e branch)', () => {
    const s = boardState({ cards: [card('s1', { number: 1, columnId: 'doing', branch: 'feature/1-x' })] });
    expect(detectOrphans(s, facts({ worktrees: [wt(1)], checkedOut: ['main', 'feature/1-x'], branches: [br(1)] }))).toEqual([]);
  });

  it('IA rodando na história ou numa sub-tarefa a mantém ativa', () => {
    const running = boardState({
      cards: [finished(1, { status: 'running' })],
    });
    expect(detectOrphans(running, facts({ branches: [br(1)] }))).toEqual([]);
    const child = boardState({
      cards: [finished(1), sub('t', 's1', 'todo', { status: 'running' })],
    });
    expect(detectOrphans(child, facts({ branches: [br(1)] }))).toEqual([]);
    const run = boardState({ cards: [finished(1)], aiRuns: ['s1'] });
    expect(detectOrphans(run, facts({ branches: [br(1)] }))).toEqual([]);
  });

  it('a base de uma história ativa é preservada (pilha de PRs)', () => {
    const s = boardState({
      cards: [finished(1), card('s2', { number: 2, columnId: 'doing', branch: 'feature/2-x', baseBranch: 'feature/1-x' })],
    });
    expect(detectOrphans(s, facts({ branches: [br(1)] }))).toEqual([]);
  });

  it('a base de uma derivada em andamento também (stackBaseOf)', () => {
    const s = boardState({
      cards: [finished(1), card('s2', { number: 2, columnId: 'doing', branch: 'feature/2-x', derivedFrom: 's1' })],
    });
    expect(detectOrphans(s, facts({ branches: [br(1)] }))).toEqual([]);
  });

  it('main, develop e a principal do repositório nunca aparecem', () => {
    const s = boardState({ cards: [] });
    const f = facts({
      base: 'trunk',
      branches: [br(1, { name: 'main' }), br(1, { name: 'develop' }), br(1, { name: 'trunk' })],
    });
    expect(detectOrphans(s, f)).toEqual([]);
  });

  it('branch em uso fora da pasta do board (a principal, por exemplo) é protegida', () => {
    const s = boardState({ cards: [finished(1)] });
    expect(detectOrphans(s, facts({ checkedOut: ['main', 'feature/1-x'], branches: [br(1)] }))).toEqual([]);
  });
});

describe('detectOrphans: branches', () => {
  it('sem commits exclusivos é segura, qualquer que seja a situação da história', () => {
    const cases = [
      ['merged', { mergeCommit: 'abc' }],
      ['cancelled', { columnId: 'cancelled' }],
      ['done', {}],
      ['archived', { archivedAt: 5 }],
      ['deleted', { deletedAt: 5 }],
    ] as const;
    for (const [situation, over] of cases) {
      const s = boardState({ cards: [finished(7, over)] });
      expect(only(s, facts({ branches: [br(7)] }))).toMatchObject({
        id: 'branch:feature/7-x',
        kind: 'branch',
        cardNumber: 7,
        situation,
        verdict: 'safe',
        proof: 'no-unique-commits',
        blockers: [],
      });
    }
  });

  it('com commits exclusivos e sem prova de merge vai para a decisão', () => {
    const s = boardState({ cards: [finished(7)] });
    expect(only(s, facts({ branches: [br(7, { uniqueCommits: 3 })] }))).toMatchObject({
      verdict: 'decision',
      proof: null,
      blockers: ['unique'],
      uniqueCommits: 3,
    });
  });

  it('com commits exclusivos e o merge provado na base é segura (squash/rebase)', () => {
    const s = boardState({ cards: [finished(7, { mergeCommit: 'abc' })] });
    expect(only(s, facts({ branches: [br(7, { uniqueCommits: 2, mergeProof: true })] }))).toMatchObject({
      verdict: 'safe',
      proof: 'merge-commit',
      situation: 'merged',
      uniqueCommits: 2,
    });
  });

  it('dono desconhecido nunca é segura, nem sem commits exclusivos', () => {
    const s = boardState({ cards: [] });
    expect(only(s, facts({ branches: [br(99)] }))).toMatchObject({
      cardNumber: null,
      situation: 'unknown',
      verdict: 'decision',
      blockers: ['unknown-card'],
    });
  });

  it('em uso por uma worktree da pasta do board espera a worktree sair', () => {
    const s = boardState({ cards: [finished(7)] });
    const items = detectOrphans(s, facts({ worktrees: [wt(7)], checkedOut: ['main', 'feature/7-x'], branches: [br(7)] }));
    expect(items.map((i) => [i.kind, i.verdict, i.blockers])).toEqual([
      ['worktree', 'safe', []],
      ['branch', 'decision', ['in-use']],
    ]);
  });

  it('a branch registrada fora do padrão atual continua candidata e tem dono', () => {
    const s = boardState({ cards: [finished(7, { branch: 'legado/qualquer-nome' })] });
    expect(only(s, facts({ branches: [br(7, { name: 'legado/qualquer-nome' })] }))).toMatchObject({
      cardNumber: 7,
      verdict: 'safe',
    });
  });
});

describe('detectOrphans: worktrees', () => {
  it('limpa e de história terminada é segura, com prova "clean"', () => {
    const s = boardState({ cards: [finished(7, { mergeCommit: 'abc' })] });
    expect(only(s, facts({ worktrees: [wt(7)], checkedOut: ['main', 'feature/7-x'] }))).toMatchObject({
      id: `worktree:${ROOT}/7-x`,
      kind: 'worktree',
      branch: 'feature/7-x',
      situation: 'merged',
      verdict: 'safe',
      proof: 'clean',
    });
  });

  it('com arquivos não commitados vai para a decisão com a contagem', () => {
    const s = boardState({ cards: [finished(7)] });
    expect(only(s, facts({ worktrees: [wt(7, { dirtyFiles: 4 })], checkedOut: ['main', 'feature/7-x'] }))).toMatchObject({
      verdict: 'decision',
      blockers: ['dirty'],
      dirtyFiles: 4,
    });
  });

  it('pasta apagada à mão é um registro órfão seguro', () => {
    const s = boardState({ cards: [finished(7)] });
    expect(only(s, facts({ worktrees: [wt(7, { exists: false })], checkedOut: ['main', 'feature/7-x'] }))).toMatchObject({
      situation: 'missing',
      verdict: 'safe',
      proof: 'clean',
    });
  });

  it('dono desconhecido nunca é limpa sozinha, mesmo sem arquivos sujos', () => {
    const s = boardState({ cards: [] });
    expect(only(s, facts({ worktrees: [wt(9)], checkedOut: ['main', 'feature/9-x'] }))).toMatchObject({
      cardNumber: null,
      situation: 'unknown',
      verdict: 'decision',
      blockers: ['unknown-card'],
    });
  });

  it('dono desconhecido e sujo acumula os dois motivos', () => {
    const s = boardState({ cards: [] });
    expect(only(s, facts({ worktrees: [wt(9, { dirtyFiles: 1 })], checkedOut: ['main', 'feature/9-x'] })).blockers).toEqual([
      'dirty',
      'unknown-card',
    ]);
  });

  it('acha o dono pelo caminho gravado no card quando a branch está solta', () => {
    const s = boardState({ cards: [finished(7, { branch: '', worktreePath: `${ROOT}/7-x` })] });
    expect(only(s, facts({ worktrees: [wt(7, { branch: null })] }))).toMatchObject({ cardNumber: 7, verdict: 'safe' });
  });

  it('modo branch ignora as worktrees', () => {
    const s = boardState({ cards: [finished(7)] });
    const items = detectOrphans(s, facts({ mode: 'branch', worktrees: [wt(7)], branches: [br(7)] }));
    expect(items.map((i) => i.kind)).toEqual(['branch']);
  });
});

describe('detectOrphans: saída', () => {
  it('ordena por número do card, worktrees antes de branches, e deixa os sem card por último', () => {
    const s = boardState({ cards: [finished(3), finished(8)] });
    const items = detectOrphans(
      s,
      facts({
        worktrees: [wt(8), wt(3), wt(50)],
        checkedOut: ['main'],
        branches: [br(8), br(3), br(50)],
      }),
    );
    expect(items.map((i) => `${i.cardNumber ?? '-'}:${i.kind}`)).toEqual([
      '3:worktree',
      '3:branch',
      '8:worktree',
      '8:branch',
      '-:worktree',
      '-:branch',
    ]);
  });

  it('o relatório vazio é neutro', () => {
    expect(EMPTY_ORPHANS).toEqual({ items: [], failed: {}, scannedAt: null });
    expect(boardState().orphans).toEqual(EMPTY_ORPHANS);
  });
});
