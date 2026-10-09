// Que eventos do log uma mensagem gera. Módulo puro: sem banco, sem VSCode, sem repositório — recebe
// a mensagem, quem agiu e os fatos dos cards antes e depois do handler, e devolve os eventos a gravar
// (quem grava é o `EventLog`). Duas fontes de verdade, combinadas:
//   1. transições de estado (coluna, status, arquivo, lixeira, criação, exclusão) saem do diff
//      `before` → `after`, para todos os cards do conjunto — as cascatas silenciosas dos handlers
//      (cancelar as sub-tarefas com a história, levar os filhos para a lixeira) ficam cobertas de graça;
//   2. o que não é transição (comentário, anexo, vínculo, pull request, campo, branch, modo autônomo)
//      vem do tipo da mensagem, que já diz o que aconteceu.
import type { CardEvent, CardEventKind } from '../../shared/log';
import type { WebviewToHost } from '../../shared/messages';
import type { FieldValue, LinkKind } from '../../shared/model';
import type { CardFacts } from './facts';

/** Um evento pronto para `CardEventRepo.add`: `id` e `month` nascem na gravação. */
export type NewCardEvent = Omit<CardEvent, 'id' | 'month'>;

/** Quem agiu: o autor que assina e se é a IA (via MCP) ou uma pessoa. */
export interface EventActor {
  author: string;
  byAi: boolean;
}

/** O que nem a mensagem nem os fatos do card carregam; a sonda do log preenche o que a mensagem pede. */
export interface EventExtra {
  boardId: string;
  at: number;
  /** a execução de IA em curso no card; `null` quando não há (ou a sessão não foi aberta pelo board) */
  runId: string | null;
  /** fatos do pai do card da mensagem, quando ele tem pai e o pai não está no conjunto (subtask_*, artefato da história) */
  parent?: CardFacts | null;
  /** `field.setValue`: nome do campo e o valor que ele tinha antes */
  field?: { name: string; previous: FieldValue };
  /** `link.remove`: as pontas do vínculo, lidas antes de apagar (a mensagem só traz o id do vínculo) */
  link?: { fromId: string; toId: string; kind: LinkKind };
  /** `card.workspace.prepare`: a branch registrada */
  branch?: string;
}

/** Os campos de triagem cuja mudança entra no log (RF-09). */
const TRIAGE_FIELDS = ['Tags', 'Esforço da atividade', 'Modelo', 'Skills'];

const fieldText = (v: FieldValue): string => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));

/** Monta um evento com os dados do card e do ator; o que varia por evento vem em `over`. */
function eventOf(
  card: CardFacts,
  kind: CardEventKind,
  actor: EventActor,
  extra: EventExtra,
  over: Partial<Pick<NewCardEvent, 'columnName' | 'fromValue' | 'toValue' | 'subject'>> = {},
): NewCardEvent {
  return {
    boardId: extra.boardId,
    at: extra.at,
    kind,
    cardId: card.id,
    cardNumber: card.number,
    cardTitle: card.title,
    cardType: card.cardType,
    workflow: card.workflow,
    columnName: card.columnName,
    fromValue: '',
    toValue: '',
    subject: '',
    author: actor.author,
    source: actor.byAi ? 'ai' : 'human',
    runId: extra.runId,
    ...over,
  };
}

/** O status de destino de `card.status.set` com nota diz qual mensagem da conversa foi (RF-04). */
const STATUS_EVENT: Partial<Record<string, CardEventKind>> = {
  waiting_answer: 'question',
  waiting_review: 'review_requested',
  blocked: 'blocked',
};

export function eventsFor(
  msg: WebviewToHost,
  actor: EventActor,
  before: Map<string, CardFacts>,
  after: Map<string, CardFacts>,
  extra: EventExtra,
): NewCardEvent[] {
  const events: NewCardEvent[] = [];
  const add = (card: CardFacts | undefined, kind: CardEventKind, over?: Parameters<typeof eventOf>[4]) => {
    if (card) events.push(eventOf(card, kind, actor, extra, over));
  };
  /** os fatos do card como estavam na chegada da mensagem; os de depois só para um card que nasceu nela */
  const factsOf = (id: string): CardFacts | undefined => before.get(id) ?? after.get(id);
  const parentOf = (card: CardFacts): CardFacts | undefined =>
    card.parentId ? (factsOf(card.parentId) ?? (extra.parent?.id === card.parentId ? extra.parent : undefined)) : undefined;

  // 1. transições de estado, pelo diff, para todos os cards do conjunto
  for (const [id, b] of before) {
    const a = after.get(id);
    if (!a) {
      add(b, 'deleted');
      continue;
    }
    if (a.columnName !== b.columnName) {
      const move = { fromValue: b.columnName, toValue: a.columnName };
      add(b, 'column_changed', move);
      if (a.columnCategory !== b.columnCategory && (a.columnCategory === 'done' || a.columnCategory === 'cancelled')) {
        add(b, a.columnCategory, move);
        if (a.columnCategory === 'done') add(parentOf(a), 'subtask_done', { subject: `#${a.number}` });
      }
    }
    if ((a.status ?? '') !== (b.status ?? '')) add(b, 'status_changed', { fromValue: b.status ?? '', toValue: a.status ?? '' });
    if (a.archived !== b.archived) add(b, a.archived ? 'archived' : 'unarchived');
    if (a.trashed !== b.trashed) add(b, a.trashed ? 'trashed' : 'restored');
  }
  for (const [id, a] of after) {
    if (before.has(id)) continue;
    add(a, 'created', { toValue: a.columnName });
    add(parentOf(a), 'subtask_created', { subject: `#${a.number}` });
  }

  // 2. o que a mensagem diz que aconteceu
  switch (msg.type) {
    case 'card.status.set': {
      if (!msg.note?.trim()) break;
      // sem evento próprio, a nota ainda vai para a conversa: é um comentário
      add(factsOf(msg.cardId), (msg.status && STATUS_EVENT[msg.status]) ?? 'comment');
      break;
    }
    case 'comment.add':
      add(factsOf(msg.cardId), 'comment');
      break;
    case 'attachment.addData': {
      const card = factsOf(msg.cardId);
      // o artefato de fase fica na história, mesmo enviado de uma sub-tarefa
      const target = msg.artifact && card ? (parentOf(card) ?? card) : card;
      add(target, msg.artifact ? 'artifact_saved' : 'attachment_added', { subject: msg.filename });
      break;
    }
    case 'link.add':
      addLink('link_added', msg.fromId, msg.toId, msg.kind);
      break;
    case 'link.remove':
      if (extra.link) addLink('link_removed', extra.link.fromId, extra.link.toId, extra.link.kind);
      break;
    case 'card.pr.set':
      add(factsOf(msg.cardId), 'pull_request_set', { subject: msg.url });
      break;
    case 'field.setValue': {
      const field = extra.field;
      if (!field || !TRIAGE_FIELDS.includes(field.name)) break;
      const fromValue = fieldText(field.previous);
      const toValue = fieldText(msg.value);
      if (fromValue !== toValue) add(factsOf(msg.cardId), 'field_changed', { subject: field.name, fromValue, toValue });
      break;
    }
    case 'card.workspace.prepare':
      add(factsOf(msg.cardId), 'workspace_prepared', { subject: extra.branch ?? '' });
      break;
    case 'card.yolo.set': {
      const card = factsOf(msg.cardId);
      add(card, 'yolo_changed', { fromValue: msg.enabled ? 'off' : 'on', toValue: msg.enabled ? 'on' : 'off' });
      // o handler só escreve na conversa ao ligar
      if (msg.enabled) add(card, 'comment');
      break;
    }
    case 'card.yolo.setMany': {
      for (const id of msg.cardIds) {
        const card = factsOf(id);
        if (!card || card.parentId || card.archived || card.trashed) continue;
        add(card, 'yolo_changed', { fromValue: msg.enabled ? 'off' : 'on', toValue: msg.enabled ? 'on' : 'off' });
        if (msg.enabled) add(card, 'comment');
      }
      break;
    }
    case 'card.yolo.inherit': {
      const card = factsOf(msg.cardId);
      const from = factsOf(msg.fromId);
      add(card, 'yolo_changed', { fromValue: 'off', toValue: 'on', subject: from ? `#${from.number}` : '' });
      add(card, 'comment');
      break;
    }
    default:
      break;
  }
  return events;

  function addLink(kind: 'link_added' | 'link_removed', fromId: string, toId: string, linkKind: LinkKind): void {
    const from = factsOf(fromId);
    const to = factsOf(toId);
    if (from && to) {
      add(from, kind, { subject: `#${to.number}`, toValue: linkKind });
      add(to, kind, { subject: `#${from.number}`, toValue: linkKind });
    }
  }
}
