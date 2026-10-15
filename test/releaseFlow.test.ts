import { describe, expect, it } from 'vitest';
import { BRANCHES, finishPlan, releaseSource, wrongBranchMessage } from '../scripts/releaseFlow.mjs';

const PENDING = {
  prState: 'OPEN',
  tagOnOrigin: false,
  releaseExists: false,
  mainInDevelop: false,
  headExistsLocal: true,
  headExistsRemote: true,
};

describe('BRANCHES', () => {
  it('nomeia as branches do fluxo', () => {
    expect(BRANCHES).toEqual({ develop: 'develop', main: 'main', hotfix: 'hotfix/', release: 'release/' });
  });
});

describe('releaseSource', () => {
  it('develop vira develop', () => {
    expect(releaseSource('develop')).toBe('develop');
  });

  it('hotfix/x vira hotfix', () => {
    expect(releaseSource('hotfix/corrige-login')).toBe('hotfix');
  });

  it('main, feature, release e hotfix/ sem nome são recusadas', () => {
    expect(releaseSource('main')).toBeNull();
    expect(releaseSource('feat/algo')).toBeNull();
    expect(releaseSource('release/1.0.0')).toBeNull();
    expect(releaseSource('hotfix/')).toBeNull();
    expect(releaseSource('')).toBeNull();
  });
});

describe('wrongBranchMessage', () => {
  it('cita develop, hotfix/ e a branch atual', () => {
    const message = wrongBranchMessage('main');
    expect(message).toBe('Rode o release na develop (versão nova) ou numa branch hotfix/... (correção). Você está em "main".');
  });
});

describe('finishPlan', () => {
  it('estado inicial: todos os passos faltam', () => {
    expect(finishPlan(PENDING)).toEqual({
      mergePr: true,
      tag: true,
      release: true,
      backMerge: true,
      deleteLocal: true,
      deleteRemote: true,
    });
  });

  it('PR já mesclado: não mescla de novo', () => {
    expect(finishPlan({ ...PENDING, prState: 'MERGED' }).mergePr).toBe(false);
  });

  it('tag já no origin: não recria a tag e a volta segue', () => {
    const plan = finishPlan({ ...PENDING, tagOnOrigin: true });
    expect(plan.tag).toBe(false);
    expect(plan.backMerge).toBe(true);
  });

  it('release já publicada: não recria', () => {
    expect(finishPlan({ ...PENDING, releaseExists: true }).release).toBe(false);
  });

  it('main já contida na develop: sem volta', () => {
    expect(finishPlan({ ...PENDING, mainInDevelop: true }).backMerge).toBe(false);
  });

  it('branch local ou remota inexistente: não apaga', () => {
    const plan = finishPlan({ ...PENDING, headExistsLocal: false, headExistsRemote: false });
    expect(plan.deleteLocal).toBe(false);
    expect(plan.deleteRemote).toBe(false);
  });

  it('tudo feito: nada a fazer', () => {
    const plan = finishPlan({
      prState: 'MERGED',
      tagOnOrigin: true,
      releaseExists: true,
      mainInDevelop: true,
      headExistsLocal: false,
      headExistsRemote: false,
    });
    expect(Object.values(plan).every((step) => step === false)).toBe(true);
  });
});
