import { useEffect, useRef, useState } from 'react';
import type { StoryCommit } from '../../../shared/commits';
import { onHostMessage, postToHost } from '../../vscode';
import { QUERY_TIMEOUT_MS } from '../metrics/useMetricsQuery';

/**
 * Consulta os commits da branch da história (`card.commits.query`), um `requestId` por pedido; só a
 * resposta do último vale. Pergunta ao abrir e quando `branch` muda, sem polling. Sem branch, sem
 * pedido; erro ou demora devolvem lista vazia (a seção some).
 */
export function useCardCommits(cardId: string, branch: string | null | undefined): StoryCommit[] {
  const [commits, setCommits] = useState<StoryCommit[]>([]);
  const sent = useRef<string | null>(null);

  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type !== 'card.commits.result' || msg.requestId !== sent.current) return;
        sent.current = null;
        setCommits(msg.commits && !msg.error ? msg.commits : []);
      }),
    [],
  );

  useEffect(() => {
    setCommits([]);
    if (!branch) {
      sent.current = null;
      return;
    }
    const requestId = crypto.randomUUID();
    sent.current = requestId;
    postToHost({ type: 'card.commits.query', requestId, cardId });
    const timer = setTimeout(() => {
      if (sent.current === requestId) sent.current = null;
    }, QUERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [cardId, branch]);

  return commits;
}
