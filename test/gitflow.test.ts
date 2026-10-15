import { describe, expect, it } from 'vitest';
import { DEFAULT_GIT } from '../src/shared/git';
import type { GitConfig } from '../src/shared/git';
import { BOARD_AUTHOR, branchKindOf, flowBaseOf, flowPrefix, flowRows, gitNoticeText, prBaseOf } from '../src/shared/gitflow';
import type { CardType } from '../src/shared/model';
import { card } from './fakes/board';

// Regras puras do gitflow (#462), sem banco nem git: o mesmo que o handler, o get_card e a tela Git usam.

const type = (id: string, name: string, branchKind: CardType['branchKind']): CardType => ({
  id,
  boardId: 'b',
  name,
  color: '#000000',
  defaultWorkflowId: 'wp',
  defaults: {},
  branchKind,
});
const types = [type('story', 'História', 'feature'), type('bug', 'Bug', 'hotfix'), type('rework', 'Retrabalho', 'bugfix')];
const off: GitConfig = { ...DEFAULT_GIT, gitflow: false };
const main = { name: 'main', source: 'origin' as const };

describe('branchKindOf', () => {
  it('é o tipo de branch do tipo de card; tipo apagado vale feature', () => {
    expect(branchKindOf({ cardTypes: types }, card('a', { typeId: 'bug' }))).toBe('hotfix');
    expect(branchKindOf({ cardTypes: types }, card('a', { typeId: 'rework' }))).toBe('bugfix');
    expect(branchKindOf({ cardTypes: types }, card('a', { typeId: 'story' }))).toBe('feature');
    expect(branchKindOf({ cardTypes: types }, card('a', { typeId: 'sumiu' }))).toBe('feature');
  });
});

describe('flowPrefix', () => {
  it('com o gitflow ligado é o prefixo configurado do tipo de branch, como veio', () => {
    expect(flowPrefix(DEFAULT_GIT, 'feature', 'História')).toBe('feature/');
    expect(flowPrefix(DEFAULT_GIT, 'bugfix', 'Retrabalho')).toBe('bugfix/');
    expect(flowPrefix(DEFAULT_GIT, 'hotfix', 'Bug')).toBe('hotfix/');
    expect(flowPrefix({ ...DEFAULT_GIT, featurePrefix: 'feat-' }, 'feature', 'História')).toBe('feat-');
  });

  it('com o gitflow desligado é o tipo de card com a barra, o nome de antes do gitflow', () => {
    expect(flowPrefix(off, 'feature', 'História')).toBe('historia/');
    expect(flowPrefix(off, 'hotfix', 'Bug')).toBe('bug/');
    expect(flowPrefix(off, 'feature', '???')).toBe('card/');
  });
});

describe('flowBaseOf', () => {
  it('feature e bugfix partem da develop; hotfix e gitflow desligado partem da principal', () => {
    expect(flowBaseOf(DEFAULT_GIT, 'feature', 'main')).toEqual({ base: 'develop', isDevelop: true });
    expect(flowBaseOf(DEFAULT_GIT, 'bugfix', 'main')).toEqual({ base: 'develop', isDevelop: true });
    expect(flowBaseOf(DEFAULT_GIT, 'hotfix', 'main')).toEqual({ base: 'main', isDevelop: false });
    expect(flowBaseOf(off, 'feature', 'master')).toEqual({ base: 'master', isDevelop: false });
    expect(flowBaseOf({ ...DEFAULT_GIT, developBranch: 'dev' }, 'feature', 'main')).toEqual({ base: 'dev', isDevelop: true });
  });

  it('develop com o mesmo nome da principal: parte da principal e não há develop a criar', () => {
    expect(flowBaseOf({ ...DEFAULT_GIT, developBranch: 'main' }, 'feature', 'main')).toEqual({ base: 'main', isDevelop: false });
  });
});

describe('prBaseOf', () => {
  it('sem branch não há base de PR', () => {
    expect(prBaseOf({ cards: [], mainBranch: main }, card('a'))).toBeNull();
  });

  it('história anterior ao gitflow (base vazia): a principal detectada; sem repositório, vazio', () => {
    const old = card('a', { branch: 'historia/1-x' });
    expect(prBaseOf({ cards: [old], mainBranch: main }, old)).toEqual({ baseBranch: 'main', prBase: 'main', stacked: false });
    expect(prBaseOf({ cards: [old], mainBranch: null }, old)).toEqual({ baseBranch: '', prBase: '', stacked: false });
  });

  it('pilha: a base é a branch de outra história', () => {
    const first = card('a', { number: 1, branch: 'feature/1-a', baseBranch: 'develop', yolo: true });
    const second = card('b', { number: 2, branch: 'feature/2-b', baseBranch: 'feature/1-a', yolo: true });
    expect(prBaseOf({ cards: [first, second], mainBranch: main }, second)).toEqual({
      baseBranch: 'feature/1-a',
      prBase: 'feature/1-a',
      stacked: true,
    });
    // a branch de uma sub-tarefa não conta como pilha
    const sub = card('s', { parentId: 'a', branch: 'feature/1-a' });
    const other = card('c', { branch: 'feature/3-c', baseBranch: 'feature/1-a' });
    expect(prBaseOf({ cards: [sub, other], mainBranch: main }, other)?.stacked).toBe(false);
  });

  it('develop e hotfix: a base gravada, que é a mesma do PR nesta entrega', () => {
    const feature = card('a', { branch: 'feature/1-a', baseBranch: 'develop' });
    expect(prBaseOf({ cards: [feature], mainBranch: main }, feature)).toEqual({ baseBranch: 'develop', prBase: 'develop', stacked: false });
    const hotfix = card('b', { branch: 'hotfix/2-b', baseBranch: 'main' });
    expect(prBaseOf({ cards: [hotfix], mainBranch: main }, hotfix)).toEqual({ baseBranch: 'main', prBase: 'main', stacked: false });
  });

  it('gitflow desligado: a base gravada é a principal, e a principal detectada não interfere', () => {
    const story = card('a', { branch: 'historia/1-a', baseBranch: 'master' });
    expect(prBaseOf({ cards: [story], mainBranch: { name: 'main', source: 'current' } }, story)).toEqual({
      baseBranch: 'master',
      prBase: 'master',
      stacked: false,
    });
  });
});

describe('flowRows', () => {
  it('monta as seis linhas com os nomes configurados e os tipos de card de cada branch', () => {
    const git = { ...DEFAULT_GIT, developBranch: 'dev', featurePrefix: 'feat/' };
    expect(flowRows(git, types, 'main')).toEqual([
      { kind: 'main', branch: 'main', types: [], from: '', prTo: '' },
      { kind: 'develop', branch: 'dev', types: [], from: 'main', prTo: '' },
      { kind: 'feature', branch: 'feat/', types: ['História'], from: 'dev', prTo: 'dev' },
      { kind: 'bugfix', branch: 'bugfix/', types: ['Retrabalho'], from: 'dev', prTo: 'dev' },
      { kind: 'hotfix', branch: 'hotfix/', types: ['Bug'], from: 'main', prTo: 'main' },
      { kind: 'release', branch: 'release/', types: [], from: 'dev', prTo: 'main' },
    ]);
  });

  it('a release nunca recebe tipo de card', () => {
    expect(flowRows(DEFAULT_GIT, types, 'main').find((r) => r.kind === 'release')?.types).toEqual([]);
  });
});

describe('gitNoticeText', () => {
  it('os avisos da conversa, em português, com os nomes preenchidos', () => {
    expect(BOARD_AUTHOR).toBe('Faz AI');
    expect(gitNoticeText({ kind: 'noOrigin', branch: 'feature/1-a', base: 'develop' })).toBe(
      'O repositório não tem origin: a branch feature/1-a partiu de develop como está nesta máquina.',
    );
    expect(gitNoticeText({ kind: 'fetchFailed', branch: 'feature/1-a', base: 'develop', error: 'sem rede' })).toBe(
      'Não foi possível atualizar as refs do origin antes de criar a branch feature/1-a (sem rede). Ela partiu de develop como está nesta máquina, que pode estar desatualizada.',
    );
    expect(gitNoticeText({ kind: 'developCreated', develop: 'develop', main: 'main' })).toBe(
      'A branch develop não existia: o board a criou a partir de main e a enviou ao origin.',
    );
    expect(gitNoticeText({ kind: 'developLocalOnly', develop: 'develop', main: 'main', error: 'recusado' })).toBe(
      'A branch develop não existia: o board a criou a partir de main, mas não conseguiu enviá-la ao origin (recusado). Envie à mão: git push -u origin develop',
    );
    expect(gitNoticeText({ kind: 'developNotPushed', develop: 'dev' })).toBe(
      'A branch dev existe só nesta máquina: o pull request para ela só abre depois de enviá-la ao origin (git push -u origin dev).',
    );
  });
});
