import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PENDING_TIMEOUT_MS, usePending } from '../../src/webview/usePending';

// Estado pendente de um controle até o boardState confirmar: usado pela caixa "Modo autônomo" (YoloBar),
// pelo "Aplicando…" da barra de seleção e por "Resumir a conversa".

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('usePending', () => {
  it('mostra o valor marcado na hora e fica ocupado até o confirmado chegar lá', () => {
    const h = renderHook((p: { confirmed: boolean }) => usePending(p.confirmed), { initialProps: { confirmed: false } });
    expect(h.result.current[0]).toBe(false);
    expect(h.result.current[1]).toBe(false);

    act(() => h.result.current[2](true));
    expect(h.result.current[0]).toBe(true);
    expect(h.result.current[1]).toBe(true);

    h.rerender({ confirmed: true });
    expect(h.result.current[0]).toBe(true);
    expect(h.result.current[1]).toBe(false);
  });

  it(`sem confirmação em ${PENDING_TIMEOUT_MS} ms, volta ao valor confirmado e destrava`, () => {
    const h = renderHook((p: { confirmed: boolean }) => usePending(p.confirmed), { initialProps: { confirmed: false } });
    act(() => h.result.current[2](true));
    act(() => {
      vi.advanceTimersByTime(PENDING_TIMEOUT_MS - 10);
    });
    expect(h.result.current[0]).toBe(true);
    expect(h.result.current[1]).toBe(true);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(h.result.current[0]).toBe(false);
    expect(h.result.current[1]).toBe(false);
  });
});
