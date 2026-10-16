import { describe, expect, it } from 'vitest';
import { PrefsStore } from '../src/extension/prefs';
import { EMPTY_PREFS } from '../src/shared/prefs';

const memory = () => {
  const data = new Map<string, unknown>();
  return { get: <T>(k: string) => data.get(k) as T | undefined, update: (k: string, v: unknown) => data.set(k, v), data };
};

describe('PrefsStore: preferências da pessoa guardadas no host', () => {
  it('começa vazio, grava cada mudança no memento e avisa quem escuta, sem o eco para quem pediu', () => {
    const m = memory();
    const store = new PrefsStore(m);
    expect(store.get()).toEqual(EMPTY_PREFS);
    const seen: unknown[] = [];
    store.onDidChange((prefs, origin) => seen.push([prefs.harnessIntroSeen, origin]));
    store.update({ harnessIntroSeen: true }, 'board');
    expect(seen).toEqual([[true, 'board']]);
    expect(m.data.get('fazai.prefs')).toEqual({ ...EMPTY_PREFS, harnessIntroSeen: true });
  });

  it('ao reabrir, lê o que foi gravado e completa o que uma versão antiga não conhecia', () => {
    const m = memory();
    m.update('fazai.prefs', { dontWarnYolo: true });
    expect(new PrefsStore(m).get()).toEqual({ ...EMPTY_PREFS, dontWarnYolo: true });
  });
});
