import { describe, expect, it } from 'vitest';
import type { WebviewToHost } from '../src/shared/messages';
import type { CardFacts } from '../src/extension/log/facts';
import { eventsFor, type EventExtra, type NewCardEvent } from '../src/extension/log/eventsFor';

// `eventsFor` é puro: os fatos "antes" e "depois" são montados à mão, sem banco e sem router. Cada
// linha da tabela "De qual mensagem vem cada evento" do Spec tem um caso aqui, mais as combinações
// que o router dificilmente produz (nota sem mudança de status, campo que volta ao valor anterior,
// mensagem sem evento, cascata de cancelamento).

const facts = (over: Partial<CardFacts> & { id: string; number: number }): CardFacts => ({
  title: `Card ${over.number}`,
  cardType: 'História',
  workflow: 'Histórias',
  columnName: 'Backlog',
  columnCategory: 'open',
  status: null,
  archived: false,
  trashed: false,
  parentId: null,
  prUrl: '',
  branch: '',
  ...over,
});

const mapOf = (...cards: CardFacts[]): Map<string, CardFacts> => new Map(cards.map((c) => [c.id, c]));

const actor = { author: 'Ana', byAi: false };
const extra: EventExtra = { boardId: 'board-1', at: 1_700_000_000_000, runId: null };

const kinds = (events: NewCardEvent[]): string[] => events.map((e) => e.kind).sort();
const only = (events: NewCardEvent[], kind: NewCardEvent['kind']): NewCardEvent => {
  const found = events.filter((e) => e.kind === kind);
  expect(found).toHaveLength(1);
  return found[0]!;
};

const story = facts({ id: 'h', number: 1, columnName: 'Discovery' });
const sub = (id: string, number: number, over: Partial<CardFacts> = {}): CardFacts =>
  facts({ id, number, cardType: 'Sub-tarefa', workflow: 'Sub-tarefas', columnName: 'A fazer', parentId: 'h', ...over });

describe('eventsFor: criação', () => {
  it('card.create gera created com a coluna inicial em to_value e os dados do card', () => {
    const msg: WebviewToHost = { type: 'card.create', typeId: 't', columnId: 'c', parentId: null, title: 'Nova' };
    const after = facts({ id: 'n', number: 7, title: 'Nova', columnName: 'Backlog' });

    const events = eventsFor(msg, actor, mapOf(), mapOf(after), extra);

    expect(events).toEqual([
      {
        boardId: 'board-1',
        at: extra.at,
        kind: 'created',
        cardId: 'n',
        cardNumber: 7,
        cardTitle: 'Nova',
        cardType: 'História',
        workflow: 'Histórias',
        columnName: 'Backlog',
        fromValue: '',
        toValue: 'Backlog',
        subject: '',
        author: 'Ana',
        source: 'human',
        runId: null,
      },
    ]);
  });

  it('card.create de uma sub-tarefa gera também subtask_created no pai, com #n da filha em subject', () => {
    const msg: WebviewToHost = { type: 'card.create', typeId: 't', columnId: 'c', parentId: 'h', title: 'Passo 1' };
    const child = sub('s1', 2, { title: 'Passo 1' });

    const events = eventsFor(msg, actor, mapOf(story), mapOf(story, child), extra);

    expect(kinds(events)).toEqual(['created', 'subtask_created']);
    const parentEvent = only(events, 'subtask_created');
    expect(parentEvent.cardId).toBe('h');
    expect(parentEvent.cardNumber).toBe(1);
    expect(parentEvent.columnName).toBe('Discovery');
    expect(parentEvent.subject).toBe('#2');
  });

  it('o pai da sub-tarefa criada pode vir em extra.parent quando não está no conjunto', () => {
    const msg: WebviewToHost = { type: 'card.create', typeId: 't', columnId: 'c', parentId: 'h', title: 'Passo 1' };
    const child = sub('s1', 2);

    const events = eventsFor(msg, actor, mapOf(), mapOf(child), { ...extra, parent: story });

    expect(only(events, 'subtask_created').cardId).toBe('h');
  });
});

describe('eventsFor: movimentação (diff de coluna)', () => {
  const move: WebviewToHost = { type: 'card.move', cardId: 'h', columnId: 'c2', position: 0 };

  it('card.move gera column_changed com from/to e a coluna de origem em column_name', () => {
    const before = facts({ id: 'h', number: 1, columnName: 'Discovery' });
    const after = { ...before, columnName: 'Spec' };

    const events = eventsFor(move, actor, mapOf(before), mapOf(after), extra);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'column_changed', fromValue: 'Discovery', toValue: 'Spec', columnName: 'Discovery' });
  });

  it('entrar numa coluna de categoria done gera column_changed e done', () => {
    const before = facts({ id: 'h', number: 1, columnName: 'Entrega' });
    const after = { ...before, columnName: 'Concluído', columnCategory: 'done' };

    const events = eventsFor(move, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['column_changed', 'done']);
    expect(only(events, 'done')).toMatchObject({ fromValue: 'Entrega', toValue: 'Concluído' });
  });

  it('entrar numa coluna de categoria cancelled gera column_changed e cancelled', () => {
    const before = facts({ id: 'h', number: 1, columnName: 'Discovery' });
    const after = { ...before, columnName: 'Cancelado', columnCategory: 'cancelled' };

    const events = eventsFor(move, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['cancelled', 'column_changed']);
  });

  it('mover entre duas colunas done gera só column_changed (a categoria não mudou)', () => {
    const before = facts({ id: 'h', number: 1, columnName: 'Concluído', columnCategory: 'done' });
    const after = { ...before, columnName: 'Publicado', columnCategory: 'done' };

    const events = eventsFor(move, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['column_changed']);
  });

  it('mover para trás gera só column_changed, sem done', () => {
    const before = facts({ id: 'h', number: 1, columnName: 'Concluído', columnCategory: 'done' });
    const after = { ...before, columnName: 'Entrega', columnCategory: 'open' };

    const events = eventsFor(move, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['column_changed']);
  });

  it('mover que também muda o status gera status_changed', () => {
    const before = facts({ id: 'h', number: 1, columnName: 'Discovery', status: 'approved' });
    const after = { ...before, columnName: 'Spec', status: 'ready' as const };

    const events = eventsFor(move, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['column_changed', 'status_changed']);
    expect(only(events, 'status_changed')).toMatchObject({ fromValue: 'approved', toValue: 'ready' });
  });

  it('cancelar a história cancela as sub-tarefas em cascata: eventos para o pai e para cada filha', () => {
    const msg: WebviewToHost = { type: 'card.move', cardId: 'h', columnId: 'c2', position: 0, cancelChildren: true };
    const s1 = sub('s1', 2, { status: 'ready' });
    const s2 = sub('s2', 3);
    const before = mapOf(story, s1, s2);
    const after = mapOf(
      { ...story, columnName: 'Cancelado', columnCategory: 'cancelled' },
      { ...s1, columnName: 'Cancelada', columnCategory: 'cancelled', status: null },
      { ...s2, columnName: 'Cancelada', columnCategory: 'cancelled' },
    );

    const events = eventsFor(msg, actor, before, after, extra);

    expect(kinds(events)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
      'column_changed',
      'column_changed',
      'column_changed',
      'status_changed',
    ]);
    const cancelled = events.filter((e) => e.kind === 'cancelled').map((e) => e.cardNumber);
    expect(cancelled.sort()).toEqual([1, 2, 3]);
    expect(events.find((e) => e.kind === 'status_changed')!.cardId).toBe('s1');
  });

  it('sub-tarefa que entra em done gera subtask_done no pai, com #n da filha', () => {
    const msg: WebviewToHost = { type: 'card.move', cardId: 's1', columnId: 'c2', position: 0 };
    const before = sub('s1', 2, { columnName: 'Fazendo' });
    const after = { ...before, columnName: 'Feita', columnCategory: 'done' };

    const events = eventsFor(msg, actor, mapOf(before), mapOf(after), { ...extra, parent: story });

    expect(kinds(events)).toEqual(['column_changed', 'done', 'subtask_done']);
    expect(only(events, 'subtask_done')).toMatchObject({ cardId: 'h', cardNumber: 1, columnName: 'Discovery', subject: '#2' });
  });

  it('sub-tarefa que entra em done sem o pai disponível não gera subtask_done', () => {
    const msg: WebviewToHost = { type: 'card.move', cardId: 's1', columnId: 'c2', position: 0 };
    const before = sub('s1', 2);
    const after = { ...before, columnName: 'Feita', columnCategory: 'done' };

    const events = eventsFor(msg, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['column_changed', 'done']);
  });

  it('card.unarchive com coluna gera unarchived e column_changed', () => {
    const msg: WebviewToHost = { type: 'card.unarchive', cardId: 'h', columnId: 'c2', position: 0 };
    const before = facts({ id: 'h', number: 1, columnName: 'Concluído', columnCategory: 'done', archived: true });
    const after = { ...before, archived: false, columnName: 'Entrega', columnCategory: 'open' };

    const events = eventsFor(msg, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['column_changed', 'unarchived']);
  });
});

describe('eventsFor: status (RF-04)', () => {
  const status = (
    status: 'ready' | 'running' | 'waiting_answer' | 'waiting_review' | 'approved' | 'blocked',
    note?: string,
  ): WebviewToHost =>
    note === undefined ? { type: 'card.status.set', cardId: 'h', status } : { type: 'card.status.set', cardId: 'h', status, note };

  it('waiting_answer com nota gera question e status_changed', () => {
    const before = facts({ id: 'h', number: 1, status: 'running' });
    const after = { ...before, status: 'waiting_answer' as const };

    const events = eventsFor(status('waiting_answer', 'Qual banco?'), actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['question', 'status_changed']);
    expect(only(events, 'status_changed')).toMatchObject({ fromValue: 'running', toValue: 'waiting_answer' });
  });

  it('waiting_review com nota gera review_requested', () => {
    const before = facts({ id: 'h', number: 1, status: 'running' });
    const after = { ...before, status: 'waiting_review' as const };

    const events = eventsFor(status('waiting_review', 'Pronto para revisar'), actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['review_requested', 'status_changed']);
  });

  it('blocked com nota gera blocked', () => {
    const before = facts({ id: 'h', number: 1, status: 'running' });
    const after = { ...before, status: 'blocked' as const };

    const events = eventsFor(status('blocked', 'Falta acesso'), actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['blocked', 'status_changed']);
  });

  it('sem nota (start_work) gera só o status_changed do diff', () => {
    const before = facts({ id: 'h', number: 1, status: 'ready' });
    const after = { ...before, status: 'running' as const };

    const events = eventsFor(status('running'), actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['status_changed']);
  });

  it('nota sem mudança de status gera só o evento da mensagem', () => {
    const before = facts({ id: 'h', number: 1, status: 'waiting_answer' });

    const events = eventsFor(status('waiting_answer', 'Outra pergunta'), actor, mapOf(before), mapOf({ ...before }), extra);

    expect(kinds(events)).toEqual(['question']);
  });

  it('nota com status que não é pergunta, revisão nem bloqueio gera comment (o handler escreve a nota na conversa)', () => {
    const before = facts({ id: 'h', number: 1, status: 'waiting_review' });
    const after = { ...before, status: 'ready' as const };

    const events = eventsFor(status('ready', 'Ajuste o título'), actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['comment', 'status_changed']);
  });

  it('pedido de revisão em modo autônomo: review_requested pela mensagem e status_changed para approved pelo diff', () => {
    const before = facts({ id: 'h', number: 1, status: 'running' });
    const after = { ...before, status: 'approved' as const };

    const events = eventsFor(status('waiting_review', 'Feito'), { author: 'IA', byAi: true }, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['review_requested', 'status_changed']);
    expect(only(events, 'status_changed').toValue).toBe('approved');
  });
});

describe('eventsFor: conversa e anexos', () => {
  it('comment.add gera comment, sem o corpo', () => {
    const msg: WebviewToHost = { type: 'comment.add', cardId: 'h', body: 'Texto longo' };
    const before = facts({ id: 'h', number: 1 });

    const events = eventsFor(msg, actor, mapOf(before), mapOf({ ...before }), extra);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'comment', subject: '', fromValue: '', toValue: '' });
  });

  it('comment.add que libera o card gera também status_changed', () => {
    const msg: WebviewToHost = { type: 'comment.add', cardId: 'h', body: 'Postgres' };
    const before = facts({ id: 'h', number: 1, status: 'waiting_answer' });
    const after = { ...before, status: 'ready' as const };

    const events = eventsFor(msg, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['comment', 'status_changed']);
  });

  it('attachment.addData com artifact gera artifact_saved com o nome do arquivo e a fase', () => {
    const msg: WebviewToHost = { type: 'attachment.addData', cardId: 'h', filename: 'SPEC.md', base64: '', artifact: true };
    const before = facts({ id: 'h', number: 1, columnName: 'Spec' });

    const events = eventsFor(msg, actor, mapOf(before), mapOf({ ...before }), extra);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'artifact_saved', subject: 'SPEC.md', columnName: 'Spec', cardId: 'h' });
  });

  it('artefato enviado de uma sub-tarefa é registrado na história, com a fase dela', () => {
    const msg: WebviewToHost = { type: 'attachment.addData', cardId: 's1', filename: 'PLAN.md', base64: '', artifact: true };
    const before = sub('s1', 2);

    const events = eventsFor(msg, actor, mapOf(before), mapOf({ ...before }), { ...extra, parent: story });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'artifact_saved', cardId: 'h', cardNumber: 1, columnName: 'Discovery', subject: 'PLAN.md' });
  });

  it('attachment.addData sem artifact gera attachment_added', () => {
    const msg: WebviewToHost = { type: 'attachment.addData', cardId: 'h', filename: 'print.png', base64: '' };
    const before = facts({ id: 'h', number: 1 });

    const events = eventsFor(msg, actor, mapOf(before), mapOf({ ...before }), extra);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'attachment_added', subject: 'print.png' });
  });
});

describe('eventsFor: vínculos', () => {
  const a = facts({ id: 'a', number: 1 });
  const b = facts({ id: 'b', number: 2 });

  it('link.add gera link_added em cada ponta, com #n do outro card em subject', () => {
    const msg: WebviewToHost = { type: 'link.add', fromId: 'a', toId: 'b', kind: 'related' };

    const events = eventsFor(msg, actor, mapOf(a, b), mapOf(a, b), extra);

    expect(kinds(events)).toEqual(['link_added', 'link_added']);
    expect(events.find((e) => e.cardId === 'a')).toMatchObject({ subject: '#2', toValue: 'related' });
    expect(events.find((e) => e.cardId === 'b')).toMatchObject({ subject: '#1', toValue: 'related' });
  });

  it('link.remove gera link_removed em cada ponta, com as pontas vindas de extra.link', () => {
    const msg: WebviewToHost = { type: 'link.remove', linkId: 'l1' };

    const events = eventsFor(msg, actor, mapOf(a, b), mapOf(a, b), { ...extra, link: { fromId: 'a', toId: 'b', kind: 'child' } });

    expect(kinds(events)).toEqual(['link_removed', 'link_removed']);
    expect(events.find((e) => e.cardId === 'a')).toMatchObject({ subject: '#2', toValue: 'child' });
    expect(events.find((e) => e.cardId === 'b')).toMatchObject({ subject: '#1' });
  });

  it('link.remove sem as pontas em extra não gera evento', () => {
    const msg: WebviewToHost = { type: 'link.remove', linkId: 'l1' };

    expect(eventsFor(msg, actor, mapOf(a, b), mapOf(a, b), extra)).toEqual([]);
  });
});

describe('eventsFor: pull request, workspace e modo autônomo', () => {
  it('card.pr.set gera pull_request_set com a URL em subject', () => {
    const msg: WebviewToHost = { type: 'card.pr.set', cardId: 'h', url: 'https://example.com/pr/9' };
    const before = facts({ id: 'h', number: 1 });
    const after = { ...before, prUrl: 'https://example.com/pr/9' };

    const events = eventsFor(msg, actor, mapOf(before), mapOf(after), extra);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'pull_request_set', subject: 'https://example.com/pr/9' });
  });

  it('card.pr.set que entrega a história gera também status_changed', () => {
    const msg: WebviewToHost = { type: 'card.pr.set', cardId: 'h', url: 'https://example.com/pr/9' };
    const before = facts({ id: 'h', number: 1, status: 'running' });
    const after = { ...before, prUrl: 'https://example.com/pr/9', status: 'waiting_review' as const };

    const events = eventsFor(msg, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['pull_request_set', 'status_changed']);
  });

  it('card.workspace.prepare gera workspace_prepared com a branch em subject', () => {
    const msg: WebviewToHost = { type: 'card.workspace.prepare', cardId: 'h' };
    const before = facts({ id: 'h', number: 1 });

    const events = eventsFor(msg, actor, mapOf(before), mapOf({ ...before }), { ...extra, branch: 'feat/1-nova' });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'workspace_prepared', subject: 'feat/1-nova' });
  });

  it('card.yolo.set ligando gera yolo_changed e o comment que o handler escreve', () => {
    const msg: WebviewToHost = { type: 'card.yolo.set', cardId: 'h', enabled: true };
    const before = facts({ id: 'h', number: 1 });

    const events = eventsFor(msg, actor, mapOf(before), mapOf({ ...before }), extra);

    expect(kinds(events)).toEqual(['comment', 'yolo_changed']);
    expect(only(events, 'yolo_changed')).toMatchObject({ fromValue: 'off', toValue: 'on' });
  });

  it('card.yolo.set desligando gera só yolo_changed (o handler não comenta)', () => {
    const msg: WebviewToHost = { type: 'card.yolo.set', cardId: 'h', enabled: false };
    const before = facts({ id: 'h', number: 1 });

    const events = eventsFor(msg, actor, mapOf(before), mapOf({ ...before }), extra);

    expect(kinds(events)).toEqual(['yolo_changed']);
    expect(events[0]).toMatchObject({ fromValue: 'on', toValue: 'off' });
  });

  it('card.yolo.set ligando com liberação do status gera também status_changed', () => {
    const msg: WebviewToHost = { type: 'card.yolo.set', cardId: 'h', enabled: true };
    const before = facts({ id: 'h', number: 1, status: 'waiting_review' });
    const after = { ...before, status: 'approved' as const };

    const events = eventsFor(msg, actor, mapOf(before), mapOf(after), extra);

    expect(kinds(events)).toEqual(['comment', 'status_changed', 'yolo_changed']);
  });

  it('card.yolo.inherit gera yolo_changed e comment no card novo, com #n da origem em subject', () => {
    const msg: WebviewToHost = { type: 'card.yolo.inherit', cardId: 'n', fromId: 'h' };
    const novo = facts({ id: 'n', number: 5 });

    const events = eventsFor(msg, { author: 'IA', byAi: true }, mapOf(story, novo), mapOf(story, novo), extra);

    expect(kinds(events)).toEqual(['comment', 'yolo_changed']);
    expect(events.every((e) => e.cardId === 'n')).toBe(true);
    expect(only(events, 'yolo_changed')).toMatchObject({ toValue: 'on', subject: '#1' });
  });
});

describe('eventsFor: arquivo, lixeira e exclusão', () => {
  it('card.archive gera archived para o card e os filhos marcados junto', () => {
    const msg: WebviewToHost = { type: 'card.archive', cardId: 'h' };
    const s1 = sub('s1', 2);
    const after = mapOf({ ...story, archived: true }, { ...s1, archived: true });

    const events = eventsFor(msg, actor, mapOf(story, s1), after, extra);

    expect(kinds(events)).toEqual(['archived', 'archived']);
  });

  it('card.trash gera trashed para o card e os filhos; card.restore gera restored', () => {
    const s1 = sub('s1', 2);
    const trashed = mapOf({ ...story, trashed: true }, { ...s1, trashed: true });

    const toTrash = eventsFor({ type: 'card.trash', cardId: 'h' }, actor, mapOf(story, s1), trashed, extra);
    const toRestore = eventsFor({ type: 'card.restore', cardId: 'h' }, actor, trashed, mapOf(story, s1), extra);

    expect(kinds(toTrash)).toEqual(['trashed', 'trashed']);
    expect(kinds(toRestore)).toEqual(['restored', 'restored']);
  });

  it('card.unarchive sem coluna gera só unarchived', () => {
    const before = facts({ id: 'h', number: 1, archived: true });

    const events = eventsFor({ type: 'card.unarchive', cardId: 'h' }, actor, mapOf(before), mapOf({ ...before, archived: false }), extra);

    expect(kinds(events)).toEqual(['unarchived']);
  });

  it('card.deletePermanent gera deleted para cada card removido, com os fatos de antes', () => {
    const s1 = sub('s1', 2, { trashed: true });
    const before = mapOf({ ...story, trashed: true }, s1);

    const events = eventsFor({ type: 'card.deletePermanent', cardId: 'h' }, actor, before, mapOf(), extra);

    expect(kinds(events)).toEqual(['deleted', 'deleted']);
    expect(events.find((e) => e.cardId === 'h')).toMatchObject({ cardNumber: 1, cardTitle: 'Card 1', columnName: 'Discovery' });
  });

  it('trash.empty gera deleted por card removido', () => {
    const a = facts({ id: 'a', number: 1, trashed: true });
    const b = facts({ id: 'b', number: 2, trashed: true });

    const events = eventsFor({ type: 'trash.empty' }, actor, mapOf(a, b), mapOf(), extra);

    expect(kinds(events)).toEqual(['deleted', 'deleted']);
  });
});

describe('eventsFor: campos de triagem (RF-09)', () => {
  const setValue = (value: string | string[] | null): WebviewToHost => ({ type: 'field.setValue', cardId: 'h', fieldId: 'f', value });
  const before = facts({ id: 'h', number: 1 });

  it('field.setValue em Tags gera field_changed com o nome do campo e os valores', () => {
    const events = eventsFor(setValue(['frontend', 'docs']), actor, mapOf(before), mapOf(before), {
      ...extra,
      field: { name: 'Tags', previous: ['frontend'] },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'field_changed', subject: 'Tags', fromValue: 'frontend', toValue: 'frontend, docs' });
  });

  it.each(['Esforço da atividade', 'Modelo', 'Skills'])('field.setValue em %s gera field_changed', (name) => {
    const events = eventsFor(setValue('x'), actor, mapOf(before), mapOf(before), { ...extra, field: { name, previous: null } });

    expect(kinds(events)).toEqual(['field_changed']);
    expect(events[0]).toMatchObject({ subject: name, fromValue: '', toValue: 'x' });
  });

  it('field.setValue num campo fora da triagem não gera evento', () => {
    const events = eventsFor(setValue('x'), actor, mapOf(before), mapOf(before), {
      ...extra,
      field: { name: 'Prioridade', previous: null },
    });

    expect(events).toEqual([]);
  });

  it('campo que volta ao valor anterior não gera evento', () => {
    const events = eventsFor(setValue(['a', 'b']), actor, mapOf(before), mapOf(before), {
      ...extra,
      field: { name: 'Tags', previous: ['a', 'b'] },
    });

    expect(events).toEqual([]);
  });

  it('field.setValue sem o campo em extra não gera evento', () => {
    expect(eventsFor(setValue('x'), actor, mapOf(before), mapOf(before), extra)).toEqual([]);
  });
});

describe('eventsFor: mensagens sem evento', () => {
  const before = facts({ id: 'h', number: 1 });

  it.each<WebviewToHost>([
    { type: 'ready' },
    { type: 'settings.column.update', columnId: 'c', patch: { name: 'Nova' } },
    { type: 'settings.board.update', patch: { name: 'Board' } },
    { type: 'comment.update', commentId: 'k', body: 'editado' },
    { type: 'comment.delete', commentId: 'k' },
    { type: 'attachment.delete', attachmentId: 'a' },
    { type: 'checklist.add', cardId: 'h', text: 'item' },
    { type: 'checklist.update', itemId: 'i', patch: { done: true } },
    { type: 'checklist.delete', itemId: 'i' },
    { type: 'card.workspace.clear', cardId: 'h' },
    { type: 'card.update', cardId: 'h', patch: { title: 'Outro' } },
  ])('$type não gera evento', (msg) => {
    expect(eventsFor(msg, actor, mapOf(before), mapOf({ ...before }), extra)).toEqual([]);
  });

  it('mensagem que não muda nada nos fatos e não tem evento próprio devolve lista vazia', () => {
    expect(
      eventsFor({ type: 'card.move', cardId: 'h', columnId: 'c', position: 1 }, actor, mapOf(before), mapOf({ ...before }), extra),
    ).toEqual([]);
  });
});

describe('eventsFor: autor, origem e execução', () => {
  it('source é ai e author é o do actor quando a mensagem vem da IA, com o run_id de extra', () => {
    const before = facts({ id: 'h', number: 1 });
    const msg: WebviewToHost = { type: 'comment.add', cardId: 'h', body: 'oi' };

    const events = eventsFor(msg, { author: 'Claude', byAi: true }, mapOf(before), mapOf(before), { ...extra, runId: 'run-1' });

    expect(events[0]).toMatchObject({ author: 'Claude', source: 'ai', runId: 'run-1', at: extra.at, boardId: 'board-1' });
  });
});
