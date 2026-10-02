import { useState } from 'react';
import type { Card } from '../../shared/model';
import { CARD_STATUSES, OWNER_LABEL, statusInfo, type CardStatus } from '../../shared/status';
import { useBoardStore } from '../store/boardStore';

/** Selo do status de trabalho, com quem está a pendência. */
export function StatusBadge({ status, short = false }: { status: CardStatus; short?: boolean }) {
  const style = useBoardStore((s) => s.state)!.board.appearance.statuses[status];
  const info = statusInfo(status);
  return (
    <span className="status-badge" style={{ background: style.color }} title={`${info.hint} — ${OWNER_LABEL[info.owner]}`}>
      {style.label}{!short && ` · ${OWNER_LABEL[info.owner]}`}
    </span>
  );
}

type Pending = { status: CardStatus; title: string; confirm: string; required: boolean };

/** Status do card no drawer: o selo, as ações de revisão e a troca manual. */
export function StatusBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const send = useBoardStore((s) => s.send);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const column = state.columns.find((c) => c.id === card.columnId);
  const styles = state.board.appearance.statuses;

  const set = (status: CardStatus | null, text?: string) => send({ type: 'card.status.set', cardId: card.id, status, note: text });
  const start = (p: Pending) => {
    setNote('');
    setPending(p);
  };
  const confirm = () => {
    if (!pending || (pending.required && !note.trim())) return;
    set(pending.status, note.trim() || undefined);
    setPending(null);
  };

  return (
    <section className="status-bar">
      <div className="row">
        {card.status ? <StatusBadge status={card.status} /> : <span className="muted small">{column?.aiActive ? 'Sem status' : 'A IA não atua nesta coluna'}</span>}
        <span className="spacer" />
        {card.status === 'waiting_review' && (
          <>
            <button className="primary" title="A IA move o card para a próxima coluna na próxima vez que trabalhar" onClick={() => set('approved')}>Aprovar</button>
            <button onClick={() => start({ status: 'ready', title: 'O que precisa ser ajustado?', confirm: 'Pedir ajustes', required: true })}>Pedir ajustes</button>
          </>
        )}
        {card.status === 'blocked' && <button className="primary" onClick={() => set('ready')}>Desbloquear</button>}
        {card.status !== 'blocked' && <button className="ghost small" onClick={() => start({ status: 'blocked', title: 'O que está impedindo o trabalho?', confirm: 'Bloquear', required: true })}>Bloquear</button>}
        <select
          className="status-select"
          title="Mudar o status manualmente"
          value={card.status ?? ''}
          onChange={(e) => {
            const next = (e.target.value || null) as CardStatus | null;
            if (next === 'blocked') start({ status: 'blocked', title: 'O que está impedindo o trabalho?', confirm: 'Bloquear', required: true });
            else set(next);
          }}
        >
          <option value="">Sem status</option>
          {CARD_STATUSES.map((s) => <option key={s.id} value={s.id}>{styles[s.id].label}</option>)}
        </select>
      </div>
      {card.status === 'blocked' && card.statusReason && <div className="banner warn">{card.statusReason}</div>}
      {pending && (
        <div className="status-note">
          <textarea autoFocus rows={3} placeholder={`${pending.title} O texto vai para a conversa do card.`} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row end">
            <button onClick={() => setPending(null)}>Cancelar</button>
            <button className="primary" disabled={pending.required && !note.trim()} onClick={confirm}>{pending.confirm}</button>
          </div>
        </div>
      )}
    </section>
  );
}
