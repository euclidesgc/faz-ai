import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { confirmLast, posted, requestIds, lastSent } from './setup';
import {
  REQUEST_TIMEOUT_MESSAGE,
  REQUEST_TIMEOUT_MS,
  request,
  requestExecutionPolicy,
  cancelPendingRequests,
} from '../../src/webview/request';
import { useAction } from '../../src/webview/useAction';

// `request()` manda a mensagem com requestId e espera o `done` do host; `useAction` liga `busy` enquanto isso.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

const settle = () => act(async () => {});

describe('request', () => {
  it('envia a mensagem com um requestId e resolve quando o done ok chega', async () => {
    const p = request({ type: 'harness.refresh' });
    expect(posted).toHaveBeenCalledWith({ type: 'harness.refresh' });
    expect(requestIds).toHaveLength(1);
    confirmLast();
    await expect(p).resolves.toBeUndefined();
  });

  it('rejeita com o erro do host quando o done vem com ok:false', async () => {
    const p = request({ type: 'trash.empty' });
    confirmLast(false, 'Sem permissão.');
    await expect(p).rejects.toThrow('Sem permissão.');
  });

  it('ignora o done de outro pedido', async () => {
    const seen: string[] = [];
    const a = request({ type: 'harness.refresh' }).then(() => seen.push('a'));
    const b = request({ type: 'trash.empty' }).then(() => seen.push('b'));
    confirmLast();
    await b;
    expect(seen).toEqual(['b']);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'done', requestId: requestIds[0], ok: true } }));
    });
    await a;
    expect(seen).toEqual(['b', 'a']);
  });

  it(`sem resposta em ${REQUEST_TIMEOUT_MS} ms, rejeita e avisa no toast`, async () => {
    const errors: string[] = [];
    window.addEventListener('message', (e: MessageEvent<{ type: string; message?: string }>) => {
      if (e.data.type === 'error') errors.push(e.data.message ?? '');
    });
    const p = request({ type: 'harness.refresh' });
    act(() => {
      vi.advanceTimersByTime(REQUEST_TIMEOUT_MS + 1);
    });
    await expect(p).rejects.toThrow(REQUEST_TIMEOUT_MESSAGE);
    expect(errors).toEqual([REQUEST_TIMEOUT_MESSAGE]);
  });
});

describe('useAction', () => {
  it('fica ocupado do disparo até o done, e devolve true quando deu certo', async () => {
    const h = renderHook(() => useAction(() => request({ type: 'harness.refresh' })));
    expect(h.result.current.busy).toBe(false);
    let result: Promise<boolean>;
    act(() => {
      result = h.result.current.run();
    });
    expect(h.result.current.busy).toBe(true);
    confirmLast();
    await settle();
    expect(h.result.current.busy).toBe(false);
    expect(await result!).toBe(true);
    expect(h.result.current.error).toBeNull();
  });

  it('com ok:false, destrava, guarda o erro e devolve false', async () => {
    const h = renderHook(() => useAction(() => request({ type: 'harness.refresh' })));
    let result: Promise<boolean>;
    act(() => {
      result = h.result.current.run();
    });
    confirmLast(false, 'Deu ruim.');
    await settle();
    expect(await result!).toBe(false);
    expect(h.result.current.busy).toBe(false);
    expect(h.result.current.error).toBe('Deu ruim.');
    act(() => h.result.current.reset());
    expect(h.result.current.error).toBeNull();
  });

  it('um segundo disparo enquanto ocupado é ignorado', async () => {
    const h = renderHook(() => useAction(() => request({ type: 'harness.refresh' })));
    let second: Promise<boolean>;
    act(() => {
      void h.result.current.run();
      second = h.result.current.run();
    });
    expect(await second!).toBe(false);
    expect(posted).toHaveBeenCalledTimes(1);
    confirmLast();
    await settle();
  });

  it('não mexe no estado depois de desmontar', async () => {
    const h = renderHook(() => useAction(() => request({ type: 'harness.refresh' })));
    act(() => {
      void h.result.current.run();
    });
    h.unmount();
    confirmLast();
    await settle();
    expect(h.result.current.busy).toBe(true); // o último valor renderizado; nenhum setState depois do unmount
  });
});

describe('pedidos de políticas', () => {
  it('correlaciona respostas e ignora pedidos alheios', async () => {
    const first = requestExecutionPolicy({ type: 'executionPolicy.read' });
    const firstId = lastSent('executionPolicy.read').requestId;
    const second = requestExecutionPolicy({ type: 'executionPolicy.read' });
    const secondId = lastSent('executionPolicy.read').requestId;
    const done = vi.fn();
    first.then(done);
    act(() =>
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'executionPolicy.result', requestId: secondId, history: [] } })),
    );
    await expect(second).resolves.toMatchObject({ history: [] });
    expect(done).not.toHaveBeenCalled();
    act(() =>
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'executionPolicy.result', requestId: firstId, history: [] } })),
    );
    await first;
  });
  it('falha do transporte, cancelamento e timeout encerram a espera', async () => {
    const transport = requestExecutionPolicy({ type: 'executionPolicy.read' });
    const transportResult = expect(transport).rejects.toThrow('Transporte indisponível');
    const requestId = lastSent('executionPolicy.read').requestId;
    act(() =>
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'done', requestId, ok: false, error: 'Transporte indisponível' } })),
    );
    await transportResult;
    const cancelled = requestExecutionPolicy({ type: 'executionPolicy.read' });
    const cancelledResult = expect(cancelled).rejects.toThrow('Pedido cancelado.');
    cancelPendingRequests();
    await cancelledResult;
    const timeout = requestExecutionPolicy({ type: 'executionPolicy.read' });
    const timeoutResult = expect(timeout).rejects.toThrow(REQUEST_TIMEOUT_MESSAGE);
    vi.advanceTimersByTime(REQUEST_TIMEOUT_MS);
    await timeoutResult;
  });
});
