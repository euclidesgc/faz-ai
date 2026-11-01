import { useEffect, useState } from 'react';
import { useInFlight } from '../inFlight';
import { t } from '../i18n';

/** Quanto tempo a barra fica depois do último pedido: um pedido rápido ainda é visto, e dois seguidos não piscam. */
export const SYNC_BAR_LINGER_MS = 400;

/**
 * Barra de progresso fina no topo do board, para qualquer pedido que esteja esperando o host (`request()`).
 * É a espera de fundo de toda ação: não bloqueia nada, só diz que o board está gravando. O botão ou a seção de onde
 * a ação saiu mostram a espera no lugar (ver DESIGN.md, "Estados de espera"); esta barra garante que nenhuma
 * ação passe em silêncio.
 */
export function SyncBar() {
  const inFlight = useInFlight();
  const [shown, setShown] = useState(inFlight);
  useEffect(() => {
    if (inFlight) return setShown(true);
    const timer = setTimeout(() => setShown(false), SYNC_BAR_LINGER_MS);
    return () => clearTimeout(timer);
  }, [inFlight]);
  if (!shown) return null;
  return (
    <div className="sync-bar" role="progressbar" aria-label={t('Salvando no board…')} aria-busy="true">
      <span className="sync-bar-fill" />
    </div>
  );
}
