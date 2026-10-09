import { useEffect, useState } from 'react';
import type { ActivityItem } from '../activity';
import { activityMessage } from '../activity';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';

// Barra de status no pé do board: o que a IA está fazendo agora. Ver SPEC da #239, seção "Webview".

/** Dispara um re-render a cada `ms`, mas só enquanto `active` (uma execução em curso): sem execução, não há nada para envelhecer. */
function useNow(ms: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms, active]);
  return now;
}

const MARKER = '\u0000REF\u0000';
const SINCE = '\u0000SINCE\u0000';

/**
 * Texto com uma referência de card clicável no meio, preservando a ordem das palavras do idioma. O "há N min"
 * (`since`) muda a cada minuto e fica fora da região viva: só a parte até ele é anunciada pelo leitor de tela.
 */
function RefSentence({ item, onOpen }: { item: ActivityItem; onOpen: (id: ActivityItem['cardId']) => void }) {
  const text = t('IA em {ref} ({what}, {since})', { ref: MARKER, what: item.what, since: SINCE });
  const [head = '', tail = ''] = text.split(SINCE);
  const [before, after] = head.split(MARKER);
  return (
    <>
      <span role="status" aria-live="polite">
        {before}
        <RefButton item={item} onOpen={onOpen} />
        {after}
      </span>
      {item.since}
      {tail}
    </>
  );
}

function RefButton({ item, onOpen }: { item: ActivityItem; onOpen: (id: ActivityItem['cardId']) => void }) {
  return (
    <button
      type="button"
      className="activity-ref"
      aria-label={t('Abrir o card {ref}', { ref: item.ref })}
      onClick={() => onOpen(item.cardId)}
    >
      {item.ref}
    </button>
  );
}

export function ActivityBar({ offline }: { offline: boolean }) {
  const state = useBoardStore((s) => s.state);
  const openCard = useBoardStore((s) => s.openCard);
  const now = useNow(60_000, (state?.aiActivity.length ?? 0) > 0);
  if (!state) return null;
  const msg = activityMessage(state, { offline, now });

  // a região viva cobre só o que muda quando o conjunto de execuções muda; o "há N min" (atualizado a
  // cada minuto) fica fora dela, para não anunciar a barra toda a cada minuto
  return (
    <div className="activity-bar" title={msg.title}>
      {msg.kind === 'running' && <span className="spinner" />}
      <span className="list">
        {msg.kind === 'idle' && (
          <span role="status" aria-live="polite">
            {msg.text}
          </span>
        )}
        {msg.kind === 'running' && msg.count === 1 && <RefSentence item={msg.items[0]!} onOpen={openCard} />}
        {msg.kind === 'running' && msg.count > 1 && (
          <span role="status" aria-live="polite">
            {t('IA em {n} cards: ', { n: msg.count })}
            {msg.items.map((item, i) => (
              <span key={item.cardId}>
                {i > 0 && ' · '}
                <RefButton item={item} onOpen={openCard} /> {item.what}
              </span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}
