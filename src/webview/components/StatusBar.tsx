import { useState } from 'react';
import { badgeStyle } from '../../shared/color';
import type { Card } from '../../shared/model';
import { CARD_STATUSES, OWNER_LABEL, statusInfo, type CardStatus } from '../../shared/status';
import { aiToolInfo } from '../../shared/harness';
import { columnOf } from '../../shared/selectors';
import { useBoardStore } from '../store/boardStore';
import { ai, cards } from '../commands';
import { renderMarkdown } from './MarkdownEditor';
import { TextArea } from '@radix-ui/themes';
import { Button, IconAi, IconHuman, IconRun, SelectField } from './ui';

/** O Select do Radix não aceita valor vazio: "sem status" usa este. */
const NO_STATUS = '__none';

/**
 * Selo do status de trabalho: ícone de com quem está a pendência (IA ou você) e o rótulo. O dono vai
 * também em texto para leitor de tela; `reason` (motivo do bloqueio) entra no tooltip.
 */
export function StatusBadge({ status, reason }: { status: CardStatus; reason?: string }) {
  const style = useBoardStore((s) => s.state)!.board.appearance.statuses[status];
  const info = statusInfo(status);
  const Owner = info.owner === 'ai' ? IconAi : IconHuman;
  const owner = `Pendência ${OWNER_LABEL[info.owner]}`;
  return (
    <span className="status-badge" style={badgeStyle(style.color)} title={[`${info.hint}. ${owner}.`, reason].filter(Boolean).join('\n')}>
      <Owner />
      <span className="sr-only">{owner}: </span>
      {style.label}
    </span>
  );
}

type Pending = { status: CardStatus; title: string; confirm: string; required: boolean };

/** Status do card no drawer: o selo, as ações de revisão e a troca manual. */
export function StatusBar({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const column = columnOf(state, card);
  const styles = state.board.appearance.statuses;
  const running = state.aiRuns.includes(card.id);
  const toolLabel = aiToolInfo(state.board.aiTool).label;

  const set = (status: CardStatus | null, text?: string) => cards.setStatus(card.id, status, text);
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
        {card.status ? (
          <StatusBadge status={card.status} />
        ) : (
          <span className="muted small">{column?.aiActive ? 'Sem status' : 'A IA não atua nesta coluna'}</span>
        )}
        <span className="spacer" />
        {card.status === 'waiting_review' && (
          <>
            <Button
              variant="primary"
              title="A IA move o card para a próxima coluna na próxima vez que trabalhar"
              onClick={() => set('approved')}
            >
              Aprovar
            </Button>
            <Button
              onClick={() => start({ status: 'ready', title: 'O que precisa ser ajustado?', confirm: 'Pedir ajustes', required: true })}
            >
              Pedir ajustes
            </Button>
          </>
        )}
        {card.status === 'blocked' && (
          <Button variant="primary" onClick={() => set('ready')}>
            Desbloquear
          </Button>
        )}
        {running ? (
          <Button title={`Interrompe o ${toolLabel}; o status volta ao que era`} onClick={() => ai.stop(card.id)}>
            <span className="spinner" /> Parar a IA
          </Button>
        ) : (
          <Button
            disabled={!!state.aiRunUnsupported}
            title={
              state.aiRunUnsupported ?? `Roda o ${toolLabel} em segundo plano para trabalhar neste card. A resposta chega na conversa.`
            }
            onClick={() => ai.run(card.id)}
          >
            <IconRun /> Chamar IA
          </Button>
        )}
        {card.status !== 'blocked' && (
          <Button
            variant="ghost"
            size="small"
            onClick={() => start({ status: 'blocked', title: 'O que está impedindo o trabalho?', confirm: 'Bloquear', required: true })}
          >
            Bloquear
          </Button>
        )}
        <SelectField
          className="status-select"
          aria-label="Status"
          title="Mudar o status manualmente"
          options={[
            { value: NO_STATUS, label: 'Sem status' },
            ...CARD_STATUSES.map((st) => ({ value: st.id, label: styles[st.id].label })),
          ]}
          value={card.status ?? NO_STATUS}
          onChange={(value) => {
            const next = value === NO_STATUS ? null : value;
            if (next === 'blocked')
              start({ status: 'blocked', title: 'O que está impedindo o trabalho?', confirm: 'Bloquear', required: true });
            else set(next);
          }}
        />
      </div>
      {card.status === 'blocked' && card.statusReason && (
        <div className="banner warn status-reason markdown plain" dangerouslySetInnerHTML={{ __html: renderMarkdown(card.statusReason) }} />
      )}
      {pending && (
        <div className="status-note">
          <TextArea
            autoFocus
            rows={3}
            placeholder={`${pending.title} O texto vai para a conversa do card.`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row end">
            <Button onClick={() => setPending(null)}>Cancelar</Button>
            <Button variant="primary" disabled={pending.required && !note.trim()} onClick={confirm}>
              {pending.confirm}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
