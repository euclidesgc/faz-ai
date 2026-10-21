// Handlers das 3 mensagens "Many" (card.archiveMany, card.trashMany, card.moveMany), direto no
// router — sem MCP nem UI, no padrão de test/delivery.test.ts. Cobre o que a Spec pede: ignorar
// sub-tarefa e card já arquivado/na lixeira da lista, e o moveMany pulando quem o `moveInner`
// recusa (ou cancelando as sub-tarefas do lote) sem interromper os demais.
import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
let events: CardEventRepo;

const card = (id: string) => router.snapshot().cards.find((c) => c.id === id)!;
/** A coluna do workflow de Histórias com este nome (Backlog, Concluído e Cancelado existem nos dois workflows). */
const columnByName = (name: string) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  return s.columns.find((c) => c.name === name && c.workflowId === wf.id)!;
};
const columnNameOf = (id: string) => router.snapshot().columns.find((c) => c.id === card(id).columnId)!.name;

/** Cria uma história viva na coluna informada (padrão: Implementação). */
function createStory(title: string, columnName = 'Implementação'): string {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.name === columnName && c.workflowId === wf.id)!.id,
    parentId: null,
    title,
  });
}

/** Cria uma sub-tarefa aberta ("A fazer") da história informada. */
function createSub(title: string, parentId: string): string {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'child')!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.name === 'A fazer' && c.workflowId === wf.id)!.id,
    parentId,
    title,
  });
}

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  events = new CardEventRepo(db);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-cardsMany'),
  });
});

describe('card.archiveMany', () => {
  it('arquiva as histórias vivas da lista e ignora sub-tarefa, card já arquivado e card na lixeira', () => {
    const h1 = createStory('Uma');
    const h2 = createStory('Duas');
    const h3 = createStory('Três');
    const h4 = createStory('Quatro');
    const h5 = createStory('Cinco'); // fora do lote: só para ver se a sub-tarefa dela escapa do filtro
    const sub = createSub('Passo', h5);
    router.handle({ type: 'card.archive', cardId: h2 }); // já arquivada antes do lote
    router.handle({ type: 'card.trash', cardId: h3 }); // já na lixeira antes do lote

    router.handle({ type: 'card.archiveMany', cardIds: [h1, h2, h3, h4, sub] });

    expect(card(h1).archivedAt).not.toBeNull();
    expect(card(h4).archivedAt).not.toBeNull();
    // é sub-tarefa (tem parentId): o lote ignora, mesmo listada
    expect(card(sub).archivedAt).toBeNull();
    // já estava na lixeira: o lote não a arquiva por cima
    expect(card(h3).archivedAt).toBeNull();
  });

  it('id inexistente na lista não interrompe o lote', () => {
    const h1 = createStory('Uma');
    router.handle({ type: 'card.archiveMany', cardIds: ['nao-existe', h1] });
    expect(card(h1).archivedAt).not.toBeNull();
  });
});

describe('card.trashMany', () => {
  it('manda para a lixeira as histórias vivas da lista e ignora sub-tarefa, card já arquivado e card já na lixeira', () => {
    const h1 = createStory('Uma');
    const h2 = createStory('Duas');
    const h3 = createStory('Três');
    const h4 = createStory('Quatro');
    const h5 = createStory('Cinco'); // fora do lote: só para ver se a sub-tarefa dela escapa do filtro
    const sub = createSub('Passo', h5);
    router.handle({ type: 'card.archive', cardId: h2 });
    router.handle({ type: 'card.trash', cardId: h3 });

    router.handle({ type: 'card.trashMany', cardIds: [h1, h2, h3, h4, sub] });

    expect(card(h1).deletedAt).not.toBeNull();
    expect(card(h4).deletedAt).not.toBeNull();
    // é sub-tarefa (tem parentId): o lote ignora, mesmo listada
    expect(card(sub).deletedAt).toBeNull();
    // já estava arquivada: o lote não manda para a lixeira por cima
    expect(card(h2).deletedAt).toBeNull();
  });
});

describe('card.unarchiveMany', () => {
  it('restaurar a história traz as sub-tarefas arquivadas e deixa as da lixeira', () => {
    const h = createStory('Uma');
    const aberta = createSub('Aberta', h);
    const lixo = createSub('Lixo', h);
    router.handle({ type: 'card.trash', cardId: lixo });
    router.handle({ type: 'card.archive', cardId: h });

    router.handle({ type: 'card.unarchiveMany', cardIds: [h] });

    expect(card(h).archivedAt).toBeNull();
    expect(card(aberta).archivedAt).toBeNull();
    expect(card(lixo).deletedAt).not.toBeNull();
  });

  it('restaurar a sub-tarefa de uma história arquivada traz a história inteira', () => {
    const h = createStory('Uma');
    const s1 = createSub('Um', h);
    const s2 = createSub('Dois', h);
    router.handle({ type: 'card.archive', cardId: h });

    router.handle({ type: 'card.unarchiveMany', cardIds: [s1] });

    expect(card(h).archivedAt).toBeNull();
    expect(card(s1).archivedAt).toBeNull();
    expect(card(s2).archivedAt).toBeNull();
  });

  it('lote misto: ignora duplicados, inexistentes, não arquivados e na lixeira, sem interromper o resto', () => {
    const h1 = createStory('Uma');
    const sub1 = createSub('Passo', h1);
    const h2 = createStory('Duas');
    const viva = createStory('Viva');
    const lixo = createStory('Lixo');
    router.handle({ type: 'card.archive', cardId: h1 });
    router.handle({ type: 'card.archive', cardId: h2 });
    router.handle({ type: 'card.archive', cardId: lixo });
    router.handle({ type: 'card.trash', cardId: lixo });

    router.handle({ type: 'card.unarchiveMany', cardIds: ['nao-existe', h1, sub1, h1, viva, lixo, h2] });

    expect(card(h1).archivedAt).toBeNull();
    expect(card(sub1).archivedAt).toBeNull();
    expect(card(h2).archivedAt).toBeNull();
    expect(card(viva).archivedAt).toBeNull();
    expect(card(lixo).deletedAt).not.toBeNull();
  });

  it('lote vazio não faz nada', () => {
    const h = createStory('Uma');
    router.handle({ type: 'card.archive', cardId: h });
    router.handle({ type: 'card.unarchiveMany', cardIds: [] });
    expect(card(h).archivedAt).not.toBeNull();
  });
});

describe('card.trashArchivedMany', () => {
  it('a história arquivada vai para a lixeira com as sub-tarefas arquivadas', () => {
    const h = createStory('Uma');
    const sub = createSub('Passo', h);
    router.handle({ type: 'card.archive', cardId: h });

    router.handle({ type: 'card.trashArchivedMany', cardIds: [h, sub] });

    expect(card(h).deletedAt).not.toBeNull();
    expect(card(sub).deletedAt).not.toBeNull();
  });

  it('sub-tarefa arquivada sozinha vai para a lixeira sem levar a história', () => {
    const h = createStory('Uma');
    const sub = createSub('Passo', h);
    router.handle({ type: 'card.archive', cardId: sub });

    router.handle({ type: 'card.trashArchivedMany', cardIds: [sub] });

    expect(card(sub).deletedAt).not.toBeNull();
    expect(card(h).deletedAt).toBeNull();
  });

  it('lote misto: ignora não arquivados, inexistentes e duplicados', () => {
    const arq = createStory('Arquivada');
    const viva = createStory('Viva');
    router.handle({ type: 'card.archive', cardId: arq });

    router.handle({ type: 'card.trashArchivedMany', cardIds: [viva, 'nao-existe', arq, arq] });

    expect(card(arq).deletedAt).not.toBeNull();
    expect(card(viva).deletedAt).toBeNull();
  });
});

describe('card.moveMany', () => {
  it('move as histórias válidas e pula, sem interromper o lote, a que o moveInner recusa', () => {
    const a = createStory('A');
    const b = createStory('B');
    createSub('Passo em aberto', b); // deixa B com sub-tarefa aberta: concluir B deve ser recusado
    const c = createStory('C');
    const concluido = columnByName('Concluído');

    router.handle({ type: 'card.moveMany', cardIds: [a, b, c], columnId: concluido.id });

    expect(columnNameOf(a)).toBe('Concluído');
    expect(columnNameOf(c)).toBe('Concluído');
    // continua em Implementação: moveInner recusou por ter sub-tarefa aberta
    expect(columnNameOf(b)).toBe('Implementação');
  });

  it('não repete o movimento de quem já está na coluna de destino', () => {
    const a = createStory('A', 'Backlog');
    const backlog = columnByName('Backlog');
    router.handle({ type: 'card.moveMany', cardIds: [a], columnId: backlog.id });
    expect(columnNameOf(a)).toBe('Backlog');
  });

  it('para coluna de cancelamento, cancela as sub-tarefas em aberto de todo o lote', () => {
    const d = createStory('D');
    const e = createStory('E');
    const d1 = createSub('Passo de D', d);
    const e1 = createSub('Passo de E', e);
    const cancelado = columnByName('Cancelado');

    router.handle({ type: 'card.moveMany', cardIds: [d, e], columnId: cancelado.id });

    expect(columnNameOf(d)).toBe('Cancelado');
    expect(columnNameOf(e)).toBe('Cancelado');
    const columnsById = new Map(router.snapshot().columns.map((c) => [c.id, c]));
    expect(columnsById.get(card(d1).columnId)?.category).toBe('cancelled');
    expect(columnsById.get(card(e1).columnId)?.category).toBe('cancelled');
  });

  it('id inexistente ou sub-tarefa na lista não interrompe o lote', () => {
    const a = createStory('A');
    const outra = createStory('Outra'); // só para a sub-tarefa listada não bloquear "a"
    const sub = createSub('Passo', outra);
    const concluido = columnByName('Concluído');
    router.handle({ type: 'card.moveMany', cardIds: ['nao-existe', sub, a], columnId: concluido.id });
    expect(columnNameOf(a)).toBe('Concluído');
    // listar a sub-tarefa não a move: ela segue com a própria história, sem workflow compatível aqui
    expect(columnNameOf(sub)).toBe('A fazer');
  });
});

describe('card.status.setMany', () => {
  it('aprova só quem ainda espera revisão, avança uma única fase e ignora ids repetidos', () => {
    const review = createStory('Revisar', 'PRD');
    const ready = createStory('Ainda trabalhando', 'PRD');
    router.handle({ type: 'card.status.set', cardId: review, status: 'waiting_review' });
    router.handle({ type: 'card.status.setMany', cardIds: [review, ready, review, 'inexistente'], status: 'approved' });
    expect(columnNameOf(review)).toBe('Spec');
    expect(events.byCard(card(review).number).filter((e) => e.kind === 'status_changed' && e.toValue === 'approved')).toHaveLength(1);
    expect(columnNameOf(ready)).toBe('PRD');
    // Uma seleção antiga não pode aprovar novamente a fase seguinte.
    router.handle({ type: 'card.status.setMany', cardIds: [review], status: 'approved' });
    expect(columnNameOf(review)).toBe('Spec');
  });

  it('bloqueia só histórias vivas ainda não bloqueadas e registra um motivo por card', () => {
    const live = createStory('Viva');
    const blocked = createStory('Já bloqueada');
    const archived = createStory('Arquivada');
    const deleted = createStory('Excluída');
    const sub = createSub('Sub-tarefa', live);
    router.handle({ type: 'card.status.set', cardId: blocked, status: 'blocked', note: 'Anterior' });
    router.handle({ type: 'card.archive', cardId: archived });
    router.handle({ type: 'card.trash', cardId: deleted });
    router.handle({
      type: 'card.status.setMany',
      cardIds: [live, live, blocked, archived, deleted, sub],
      status: 'blocked',
      note: '  Dependência externa  ',
    });
    expect(card(live)).toMatchObject({ status: 'blocked', statusReason: 'Dependência externa' });
    expect(card(blocked).statusReason).toBe('Anterior');
    expect(events.byCard(card(live).number).filter((e) => e.kind === 'blocked')).toHaveLength(1);
    expect(events.byCard(card(blocked).number).filter((e) => e.kind === 'blocked')).toHaveLength(1);
    for (const id of [archived, deleted, sub]) expect(card(id).status).not.toBe('blocked');
    expect(router.snapshot().comments.filter((c) => c.body === 'Dependência externa')).toMatchObject([
      { cardId: live, author: 'Pessoa', source: 'human' },
    ]);
  });

  it('recusa o lote inteiro sem motivo, sem alterar nenhum card', () => {
    const a = createStory('A');
    const b = createStory('B');
    const before = router.snapshot();
    expect(() => router.handle({ type: 'card.status.setMany', cardIds: [a, b], status: 'blocked', note: '  ' })).toThrow(
      'Informe o motivo',
    );
    expect(router.snapshot().cards).toEqual(before.cards);
    expect(router.snapshot().comments).toEqual(before.comments);
  });

  it('desbloqueia só os bloqueados, preservando quem aguarda revisão', () => {
    const blocked = createStory('Bloqueada');
    const review = createStory('Revisão');
    router.handle({ type: 'card.status.set', cardId: blocked, status: 'blocked', note: 'Espera' });
    router.handle({ type: 'card.status.set', cardId: review, status: 'waiting_review' });
    router.handle({ type: 'card.status.setMany', cardIds: [blocked, review], status: 'ready' });
    expect(card(blocked)).toMatchObject({ status: 'ready', statusReason: '' });
    expect(card(review).status).toBe('waiting_review');
  });

  it('a IA não pode mudar o status em lote', () => {
    const a = createStory('A');
    expect(() => router.handle({ type: 'card.status.setMany', cardIds: [a], status: 'blocked', note: 'Espera' }, { source: 'ai' })).toThrow(
      'Só uma pessoa',
    );
    expect(card(a).status).not.toBe('blocked');
  });
});
