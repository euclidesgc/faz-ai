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

/** Texto com uma referência de card clicável no meio, preservando a ordem das palavras do idioma. */
function RefSentence({ item, onOpen }: { item: ActivityItem; onOpen: (id: ActivityItem['cardId']) => void }) {
  const text = t('IA em {ref} ({what}, {since})', { ref: MARKER, what: item.what, since: item.since });
  const [before, after] = text.split(MARKER);
  return (
    <>
      {before}
      <RefButton item={item} onOpen={onOpen} />
      {after}
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

  return (
    <div className="activity-bar" role="status" aria-live="polite" title={msg.title}>
      {msg.kind === 'running' && <span className="spinner" />}
      <span className="list">
        {msg.kind === 'idle' && msg.text}
        {msg.kind === 'running' && msg.count === 1 && <RefSentence item={msg.items[0]!} onOpen={openCard} />}
        {msg.kind === 'running' && msg.count > 1 && (
          <>
            {t('IA em {n} cards: ', { n: msg.count })}
            {msg.items.map((item, i) => (
              <span key={item.cardId}>
                {i > 0 && ' · '}
                <RefButton item={item} onOpen={openCard} /> {item.what}
              </span>
            ))}
          </>
        )}
      </span>
    </div>
  );
}
