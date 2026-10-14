import { useEffect, useState } from 'react';
import { t } from '../i18n';

/** Quanto tempo o véu espera antes de aparecer: uma ação que termina antes disso não pisca na tela. */
export const OVERLAY_DELAY_MS = 150;

/**
 * Véu sobre o board inteiro enquanto uma ação que troca todo o estado roda (recriar, atualizar, importar o board,
 * esvaziar a lixeira). É a intensidade mais alta da espera; para uma seção ou um botão, ver DESIGN.md.
 */
export function BusyOverlay({ label }: { label: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), OVERLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <div className="busy-overlay" role="status" aria-live="assertive">
      <div className="busy-overlay-card">
        <span className="spinner" aria-hidden />
        <p>{label}</p>
        <p className="muted small">{t('Isso leva alguns segundos.')}</p>
      </div>
    </div>
  );
}
