import { useEffect, useState } from 'react';
import { EMPTY_PROFILE, type ProjectProfile } from '../../../../shared/projectProfile';
import { onHostMessage, postToHost } from '../../../vscode';

/** Quanto o assistente espera o perfil do projeto antes de seguir sem ele. */
export const PROFILE_TIMEOUT_MS = 6000;

/**
 * Pede ao host o perfil do projeto (linguagens, comandos, ferramentas e pastas) quando o assistente abre. Enquanto
 * não chega, ou se o host não responder, vale o perfil vazio: os assistentes funcionam sem ele, só sugerem menos.
 */
export function useProjectProfile(): { profile: ProjectProfile; loading: boolean } {
  const [profile, setProfile] = useState<ProjectProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const requestId = crypto.randomUUID();
    const off = onHostMessage((msg) => {
      if (msg.type !== 'harness.project.profileResult' || msg.requestId !== requestId) return;
      off();
      window.clearTimeout(timer);
      if (msg.profile) setProfile(msg.profile);
      setLoading(false);
    });
    const timer = window.setTimeout(() => {
      off();
      setLoading(false);
    }, PROFILE_TIMEOUT_MS);
    postToHost({ type: 'harness.project.profile', requestId });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);
  return { profile, loading };
}
