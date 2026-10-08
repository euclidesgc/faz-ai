import './setup';
import { describe, expect, it } from 'vitest';
import { useBoardStore } from '../../src/webview/store/boardStore';

describe('setManyCollapsed', () => {
  it('grava a mesma marca para vários ids numa única chamada', () => {
    useBoardStore.getState().setManyCollapsed(['a', 'b'], true);
    expect(useBoardStore.getState().collapsed).toMatchObject({ 'card:a': true, 'card:b': true });
  });

  it('chamar depois com outro id não mexe no que já estava gravado', () => {
    useBoardStore.getState().setManyCollapsed(['a', 'b'], true);
    useBoardStore.getState().setManyCollapsed(['a'], false);
    expect(useBoardStore.getState().collapsed).toMatchObject({ 'card:a': false, 'card:b': true });
  });

  it('não mexe na chave de um card fora da lista', () => {
    useBoardStore.getState().setCollapsed('card:c', true);
    useBoardStore.getState().setManyCollapsed(['a', 'b'], true);
    expect(useBoardStore.getState().collapsed['card:c']).toBe(true);
    useBoardStore.getState().setManyCollapsed(['a', 'b'], false);
    expect(useBoardStore.getState().collapsed['card:c']).toBe(true);
  });
});
