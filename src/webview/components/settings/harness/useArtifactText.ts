import { useEffect, useState } from 'react';
import type { ArtifactKind } from '../../../../shared/artifacts';
import type { McpServerView } from '../../../../shared/messages';
import { onHostMessage, postToHost } from '../../../vscode';
import { t } from '../../../i18n';

/** Quanto o editor espera o host devolver o texto de um artefato. */
export const ARTIFACT_READ_TIMEOUT_MS = 8000;

export interface ArtifactText {
  text: string | null;
  /** só no MCP: a definição com os valores secretos mascarados pelo host */
  server?: McpServerView | null;
  error: string | null;
  loading: boolean;
}

/**
 * Lê o texto de uma regra, skill (ou de um arquivo de apoio dela) do board com `harness.artifact.read` e espera o
 * `harness.artifact.readResult` de mesmo `requestId`. Sem `name` não lê nada (artefato novo).
 */
export function useArtifactText(kind: ArtifactKind, name: string | undefined, file?: string): ArtifactText {
  const [state, setState] = useState<ArtifactText>({ text: null, error: null, loading: !!name });
  useEffect(() => {
    if (!name) {
      setState({ text: null, error: null, loading: false });
      return;
    }
    setState({ text: null, error: null, loading: true });
    const requestId = crypto.randomUUID();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'harness.artifact.readResult' || msg.requestId !== requestId) return;
      off();
      window.clearTimeout(timer);
      setState(
        msg.error
          ? { text: null, error: msg.error, loading: false }
          : { text: msg.text ?? '', server: msg.server ?? null, error: null, loading: false },
      );
    });
    const timer = window.setTimeout(() => {
      off();
      setState({ text: null, error: t('O host não respondeu à leitura. Feche e abra o editor de novo.'), loading: false });
    }, ARTIFACT_READ_TIMEOUT_MS);
    postToHost({ type: 'harness.artifact.read', requestId, kind, name, ...(file ? { file } : {}) });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [kind, name, file]);
  return state;
}
