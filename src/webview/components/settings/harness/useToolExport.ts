import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiTool } from '../../../../shared/harness';
import type { ExportPlan, ExportResult, ExportTarget } from '../../../../shared/toolExport';
import { onHostMessage, postToHost } from '../../../vscode';
import { REQUEST_TIMEOUT_MESSAGE, REQUEST_TIMEOUT_MS } from '../../../request';

type Answer<T> = { value?: T; error?: string };

/** Envia o pedido e espera a resposta com o mesmo `requestId`; desiste em `REQUEST_TIMEOUT_MS`. Devolve também o cancelamento. */
function ask<T>(
  send: (requestId: string) => void,
  replyType: 'harness.export.planResult' | 'harness.export.applyResult',
  pick: (m: never) => Answer<T>,
) {
  const requestId = crypto.randomUUID();
  let cancel = () => {};
  const promise = new Promise<Answer<T>>((resolve) => {
    const done = (answer: Answer<T>) => {
      off();
      window.clearTimeout(timer);
      resolve(answer);
    };
    const off = onHostMessage((msg) => {
      if (msg.type !== replyType || (msg as { requestId?: string }).requestId !== requestId) return;
      done(pick(msg as never));
    });
    const timer = window.setTimeout(() => done({ error: REQUEST_TIMEOUT_MESSAGE }), REQUEST_TIMEOUT_MS);
    cancel = () => {
      off();
      window.clearTimeout(timer);
    };
    send(requestId);
  });
  return { promise, cancel };
}

/**
 * "Exportar para a ferramenta": pede a prévia (`plan`) e a gravação (`apply`) ao host. Trocar a ferramenta ou o
 * destino gera um pedido novo e descarta a resposta do anterior; a gravação no host termina mesmo se a tela desistir.
 */
export function useToolExport(tool: AiTool, target: ExportTarget, enabled = true) {
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [applying, setApplying] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setPlan(null);
    const req = ask<ExportPlan>(
      (requestId) => postToHost({ type: 'harness.export.plan', requestId, tool, target }),
      'harness.export.planResult',
      (m: { plan?: ExportPlan; error?: string }) => ({ value: m.plan, error: m.error }),
    );
    let stale = false;
    void req.promise.then((a) => {
      if (stale) return;
      setLoading(false);
      if (a.value) setPlan(a.value);
      else setError(a.error ?? REQUEST_TIMEOUT_MESSAGE);
    });
    return () => {
      stale = true;
      req.cancel();
    };
  }, [tool, target, enabled]);

  const apply = useCallback(
    async (ids: string[], replace: boolean) => {
      setApplying(true);
      setError(null);
      const req = ask<ExportResult>(
        (requestId) => postToHost({ type: 'harness.export.apply', requestId, tool, target, ids, replace }),
        'harness.export.applyResult',
        (m: { result?: ExportResult; error?: string }) => ({ value: m.result, error: m.error }),
      );
      const a = await req.promise;
      if (!live.current) return;
      setApplying(false);
      if (a.value) setResult(a.value);
      else setError(a.error ?? REQUEST_TIMEOUT_MESSAGE);
    },
    [tool, target],
  );

  return { plan, loading, error, result, applying, apply };
}
