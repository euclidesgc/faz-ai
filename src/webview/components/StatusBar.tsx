import { useState } from 'react';
import { badgeStyle } from '../../shared/color';
import type { Card } from '../../shared/model';
import { CARD_STATUSES, OWNER_LABEL, statusInfo, type CardStatus } from '../../shared/status';
import { columnOf } from '../../shared/selectors';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { ai, cards } from '../commands';
import { useAction } from '../useAction';
import { usePending } from '../usePending';
import { renderMarkdown } from './MarkdownEditor';
import { TextArea } from '@radix-ui/themes';
import { Button, Hint, IconAi, IconHuman, IconRun, IconSuggest, SelectField } from './ui';
import { aiBlockedReason, cardToolLabel } from './RequirementsBanner';
import { refineHint, workHint } from './aiHints';

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
  const owner = t('Pendência {owner}', { owner: t(OWNER_LABEL[info.owner]) });
  return (
    <span
      className="status-badge"
      style={badgeStyle(style.color)}
      title={[`${t(info.hint)}. ${owner}.`, reason].filter(Boolean).join('\n')}
    >
      <Owner />
      <span className="sr-only">{owner}: </span>
      {t(style.label)}
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
  const toolLabel = cardToolLabel(state, card);
  const blocked = aiBlockedReason(state, card);
  // o status novo mostra a espera no botão clicado; a nota só fecha quando o host confirma
  const change = useAction((status: CardStatus | null, text?: string) => cards.setStatus(card.id, status, text));
  // "Trabalhar na fase" e "Refinar" travam logo após o clique, até aiRuns refletir a execução (ou o tempo esgotar)
  const [, starting, markStarting] = usePending(running);
  const [startMode, setStartMode] = useState<'phase' | 'refine'>('phase');
  const launch = (mode: 'phase' | 'refine') => {
    setStartMode(mode);
    markStarting(true);
    void (mode === 'refine' ? ai.refine(card.id) : ai.run(card.id));
  };
  // "Parar a IA" trava até aiRuns deixar de listar o card
  const [, stopping, markStopping] = usePending(running);

  const set = (status: CardStatus | null, text?: string) => void change.run(status, text);
  const start = (p: Pending) => {
    setNote('');
    setPending(p);
  };
  const confirm = async () => {
    if (!pending || (pending.required && !note.trim())) return;
    if (await change.run(pending.status, note.trim() || undefined)) setPending(null);
  };

  return (
    <section className="status-bar">
      <div className="row">
        {card.status ? (
          <StatusBadge status={card.status} />
        ) : (
          <span className="muted small">{column?.aiActive ? t('Sem status') : t('A IA não atua nesta coluna')}</span>
        )}
        <span className="spacer" />
        {card.status === 'waiting_review' && (
          <>
            <Button
              variant="primary"
              title={t('A IA move o card para a próxima coluna na próxima vez que trabalhar')}
              loading={change.busy && !pending}
              onClick={() => set('approved')}
            >
              {t('Aprovar')}
            </Button>
            <Hint content={t('Você diz o que precisa mudar; o card volta para "Pronto" e a IA refaz a fase com o seu pedido na conversa')}>
              <Button
                onClick={() =>
                  start({ status: 'ready', title: t('O que precisa ser ajustado?'), confirm: t('Pedir ajustes'), required: true })
                }
              >
                {t('Pedir ajustes')}
              </Button>
            </Hint>
          </>
        )}
        {card.status === 'blocked' && (
          <Button variant="primary" loading={change.busy && !pending} onClick={() => set('ready')}>
            {t('Desbloquear')}
          </Button>
        )}
        {running ? (
          <Button
            title={t('Interrompe o {tool}; o status volta ao que era', { tool: toolLabel })}
            loading={stopping}
            onClick={() => {
              markStopping(false);
              void ai.stop(card.id);
            }}
          >
            {!stopping && <span className="spinner" />} {t('Parar a IA')}
          </Button>
        ) : (
          <>
            <Hint content={workHint(toolLabel)} disabledReason={blocked}>
              <Button disabled={!!blocked || starting} loading={starting && startMode === 'phase'} onClick={() => launch('phase')}>
                <IconRun /> {t('Trabalhar na fase')}
              </Button>
            </Hint>
            <Hint content={refineHint(toolLabel)} disabledReason={blocked}>
              <Button
                variant="ghost"
                disabled={!!blocked || starting}
                loading={starting && startMode === 'refine'}
                onClick={() => launch('refine')}
              >
                <IconSuggest /> {t('Refinar com IA')}
              </Button>
            </Hint>
          </>
        )}
        {card.status !== 'blocked' && (
          <Button
            variant="ghost"
            size="small"
            onClick={() =>
              start({ status: 'blocked', title: t('O que está impedindo o trabalho?'), confirm: t('Bloquear'), required: true })
            }
          >
            {t('Bloquear')}
          </Button>
        )}
        <SelectField
          className="status-select"
          aria-label={t('Status')}
          title={t('Mudar o status manualmente')}
          options={[
            { value: NO_STATUS, label: t('Sem status') },
            ...CARD_STATUSES.map((st) => ({ value: st.id, label: t(styles[st.id].label) })),
          ]}
          value={card.status ?? NO_STATUS}
          onChange={(value) => {
            const next = value === NO_STATUS ? null : value;
            if (next === 'blocked')
              start({ status: 'blocked', title: t('O que está impedindo o trabalho?'), confirm: t('Bloquear'), required: true });
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
            placeholder={`${pending.title} ${t('O texto vai para a conversa do card.')}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row end">
            <Button onClick={() => setPending(null)}>{t('Cancelar')}</Button>
            <Button variant="primary" disabled={pending.required && !note.trim()} loading={change.busy} onClick={() => void confirm()}>
              {pending.confirm}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
