import type { AiActivity, BoardState, Card, Id } from '../shared/model';
import { cardRef } from '../shared/model';
import type { AiRunOrigin } from '../shared/log';
import { heartbeatState } from '../shared/runner';
import { storyOf } from '../shared/story';
import { getLocale, t } from './i18n';

// Mensagem calculada da barra de status (pé do board): o que a IA está fazendo agora. Função pura, sem
// React, para ser testada sem DOM (ver SPEC da #239, seção "Mensagem calculada").

/** Um item da barra, uma execução de IA já resolvida contra `state.cards` (card ausente não entra). */
export interface ActivityItem {
  cardId: Id;
  ref: string;
  what: string;
  since: string;
  storyRef: string | null;
}

export type ActivityMessage =
  { kind: 'running'; count: number; items: ActivityItem[]; title: string } | { kind: 'idle'; text: string; title?: string };

/** "agora" / "há N min" / "há N h", a partir do início da execução (ms) e da hora atual (ms). */
export function elapsedLabel(startedAt: number, now: number): string {
  const seconds = Math.max(0, now - startedAt) / 1000;
  if (seconds < 60) return t('agora');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('há {n} min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  return t('há {n} h', { n: hours });
}

const originLabel = (origin: AiRunOrigin): string =>
  t(origin === 'manual' ? 'manual' : origin === 'heartbeat' ? 'heartbeat' : origin === 'autopilot' ? 'modo autônomo' : 'chat');

/** `what` da execução: a fase (nome da coluna, sem tradução) ou o modo, traduzido. */
const whatOf = (activity: AiActivity): string =>
  activity.mode === 'phase' ? activity.phase : activity.mode === 'refine' ? t('refinando') : t('resumindo');

interface Entry {
  activity: AiActivity;
  card: Card;
  ref: string;
  what: string;
  since: string;
  storyRef: string | null;
}

function entriesOf(state: BoardState, now: number): Entry[] {
  const entries: Entry[] = [];
  for (const activity of state.aiActivity) {
    const card = state.cards.find((c) => c.id === activity.cardId);
    if (!card) continue;
    const story = card.parentId ? storyOf(state, card) : undefined;
    entries.push({
      activity,
      card,
      ref: cardRef(card),
      what: whatOf(activity),
      since: elapsedLabel(activity.startedAt, now),
      storyRef: card.parentId && story ? cardRef(story) : null,
    });
  }
  return entries;
}

/** A mensagem da barra de status agora: execuções em curso → nota do autopiloto → heartbeat → "IA parada". */
export function activityMessage(state: BoardState, ctx: { offline: boolean; now: number }): ActivityMessage {
  const entries = entriesOf(state, ctx.now);
  if (entries.length === 1) {
    const e = entries[0]!;
    let title = `${e.ref} ${e.card.title}`;
    title += ` · ${originLabel(e.activity.origin)}`;
    if (e.storyRef) title += ` · ${t('história {ref}', { ref: e.storyRef })}`;
    return {
      kind: 'running',
      count: 1,
      items: entries.map((e) => ({ cardId: e.card.id, ref: e.ref, what: e.what, since: e.since, storyRef: e.storyRef })),
      title,
    };
  }
  if (entries.length > 1) {
    const title = entries.map((e) => `${e.ref} ${e.what}, ${e.since} — ${e.card.title}`).join('\n');
    return {
      kind: 'running',
      count: entries.length,
      items: entries.map((e) => ({ cardId: e.card.id, ref: e.ref, what: e.what, since: e.since, storyRef: e.storyRef })),
      title,
    };
  }

  if (state.autopilot.note) return { kind: 'idle', text: t(state.autopilot.note) };

  const beat = heartbeatState(state.board.runner, { offline: ctx.offline, unsupported: state.aiRunUnsupported });
  if (beat.kind === 'off') return { kind: 'idle', text: t('Heartbeat desligado') };
  if (beat.kind === 'stopped') return { kind: 'idle', text: t('Heartbeat parado: {reason}', { reason: t(beat.reason) }) };
  if (state.heartbeatNextAt != null) {
    const locale = getLocale() === 'en' ? 'en-US' : 'pt-BR';
    const time = new Date(state.heartbeatNextAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return { kind: 'idle', text: t('Próxima rodada às {time}', { time }) };
  }
  return { kind: 'idle', text: t('IA parada') };
}
