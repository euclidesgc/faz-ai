import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { FailureBreaker } from '../src/extension/failureBreaker';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BREAKER_MARK, type FailureOccurrence, type FailureOrigin } from '../src/shared/failureSignature';
import type { AiRunMode } from '../src/shared/runner';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let router: MessageRouter;
let log: string[];
/** o que os repositórios devolveriam: o filtro por cards e por `since` é o dos repositórios reais */
let stored: FailureOccurrence[];
let limit: number;
let throwing: boolean;
let breaker: FailureBreaker;
let clock: number;

const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const create = (title: string, parent?: number) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === (parent ? 'Em andamento' : 'Implementação'))!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
const comments = (n: number) => router.snapshot().comments.filter((c) => c.cardId === card(n).id);

/** Uma falha gravada para o card, com a assinatura dada (o `at` cresce a cada chamada) */
const fail = (n: number, signature: string, origin: FailureOrigin = 'run'): void => {
  stored.push({
    signature,
    origin,
    at: ++clock,
    cardId: card(n).id,
    cardNumber: n,
    detail: signature.split(' | ').slice(2).join(' | '),
  });
};

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-fb'),
  });
  log = [];
  stored = [];
  limit = 3;
  throwing = false;
  // o relógio das ocorrências parte do passado, para a nota (que usa o relógio real) ficar depois delas
  clock = Date.now() - 1_000_000;
  const select = (cardIds: readonly string[], since: number, origin: FailureOrigin): FailureOccurrence[] => {
    if (throwing) throw new Error('banco fechado');
    return stored.filter((o) => o.origin === origin && cardIds.includes(o.cardId) && o.at > since);
  };
  breaker = new FailureBreaker({
    router,
    runs: { failureOccurrences: (ids, since) => select(ids, since, 'run') },
    gates: { failedOccurrences: (ids, since) => select(ids, since, 'gate') },
    limit: () => limit,
    log: (l) => log.push(l),
  });
  create('História');
});

describe('FailureBreaker', () => {
  it('bloqueia a história no limite, com a nota, a assinatura e o histórico', () => {
    for (let i = 0; i < 3; i++) fail(1, 'Implementação | run | erro de tipo');
    breaker.check(card(1).id, 'phase');
    expect(card(1).status).toBe('blocked');
    const note = comments(1).find((c) => c.body.startsWith(BREAKER_MARK))!;
    expect(note.source).toBe('ai');
    expect(note.body).toContain('Assinatura: `Implementação | run | erro de tipo`');
    expect(note.body).toContain('3 vezes');
    expect(card(1).statusReason).toContain(BREAKER_MARK);
    expect(log.join('\n')).toContain('Disjuntor de falhas');
  });

  it('não bloqueia abaixo do limite', () => {
    fail(1, 'Implementação | run | erro');
    fail(1, 'Implementação | run | erro');
    breaker.check(card(1).id);
    expect(card(1).status).not.toBe('blocked');
  });

  it('falhas diferentes não somam', () => {
    fail(1, 'Implementação | run | erro a');
    fail(1, 'Implementação | run | erro b');
    fail(1, 'Implementação | gate | tsc: erro');
    fail(1, 'Revisão | run | erro a');
    breaker.check(card(1).id);
    expect(card(1).status).not.toBe('blocked');
    expect(comments(1)).toHaveLength(0);
  });

  it('intercalar outra falha ou um sucesso não zera a contagem', () => {
    fail(1, 'Implementação | run | erro');
    fail(1, 'Implementação | run | outra');
    fail(1, 'Implementação | run | erro');
    // o sucesso de uma etapa não grava nada em ai_runs com assinatura: não há o que zerar
    fail(1, 'Implementação | run | erro');
    breaker.check(card(1).id);
    expect(card(1).status).toBe('blocked');
  });

  it('soma execuções e checagens da mesma assinatura', () => {
    fail(1, 'Revisão | gate | tsc: erro', 'gate');
    fail(1, 'Revisão | gate | tsc: erro', 'gate');
    fail(1, 'Revisão | gate | tsc: erro', 'gate');
    breaker.check(card(1).id);
    expect(card(1).status).toBe('blocked');
    expect(comments(1)[0]!.body).toContain('checagem');
  });

  it('a sub-tarefa conta para a história, e o bloqueio vai para a história', () => {
    create('Sub A', 1);
    create('Sub B', 1);
    fail(2, 'Implementação | run | erro');
    fail(3, 'Implementação | run | erro');
    fail(1, 'Implementação | run | erro');
    breaker.check(card(2).id);
    expect(card(1).status).toBe('blocked');
    expect(card(2).status).not.toBe('blocked');
    expect(comments(1)).toHaveLength(1);
    expect(comments(2)).toHaveLength(0);
  });

  it('falhas de outra história não somam', () => {
    create('Outra');
    fail(1, 'Implementação | run | erro');
    fail(1, 'Implementação | run | erro');
    fail(2, 'Implementação | run | erro');
    breaker.check(card(1).id);
    expect(card(1).status).not.toBe('blocked');
  });

  it('história que já está com a pessoa não é bloqueada', () => {
    router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_answer' }, { author: 'IA', source: 'ai' });
    for (let i = 0; i < 4; i++) fail(1, 'Implementação | run | erro');
    breaker.check(card(1).id);
    expect(card(1).status).toBe('waiting_answer');
    expect(comments(1).some((c) => c.body.startsWith(BREAKER_MARK))).toBe(false);
  });

  it.each<AiRunMode>(['refine', 'summarize', 'conflict', 'reply', 'unblock'])('o modo %s não avalia', (mode) => {
    for (let i = 0; i < 3; i++) fail(1, 'Implementação | run | erro');
    breaker.check(card(1).id, mode);
    expect(card(1).status).not.toBe('blocked');
    // a falha fica gravada e conta na avaliação seguinte, de uma etapa
    breaker.check(card(1).id, 'phase');
    expect(card(1).status).toBe('blocked');
  });

  it('a contagem recomeça depois da nota', () => {
    for (let i = 0; i < 3; i++) fail(1, 'Implementação | run | erro');
    breaker.check(card(1).id);
    expect(card(1).status).toBe('blocked');

    // a pessoa destrava; a falha antiga não conta, as novas sim (o relógio das ocorrências passa da nota)
    router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'ready' }, { author: 'Pessoa', source: 'human' });
    clock = Date.now() + 10_000;
    fail(1, 'Implementação | run | erro');
    fail(1, 'Implementação | run | erro');
    breaker.check(card(1).id);
    expect(card(1).status).toBe('ready');

    fail(1, 'Implementação | run | erro');
    breaker.check(card(1).id);
    expect(card(1).status).toBe('blocked');
    expect(comments(1).filter((c) => c.body.startsWith(BREAKER_MARK))).toHaveLength(2);
  });

  it('lê o limite na hora', () => {
    fail(1, 'Implementação | run | erro');
    fail(1, 'Implementação | run | erro');
    limit = 2;
    breaker.check(card(1).id);
    expect(card(1).status).toBe('blocked');
  });

  it('a exceção do repositório não propaga e vira linha de log', () => {
    throwing = true;
    expect(() => breaker.check(card(1).id)).not.toThrow();
    expect(log.join('\n')).toContain('banco fechado');
  });

  it('card que não existe mais não faz nada', () => {
    expect(() => breaker.check('inexistente')).not.toThrow();
    expect(log).toEqual([]);
  });

  it('a falha do log não propaga', () => {
    const noisy = new FailureBreaker({
      router,
      runs: {
        failureOccurrences: () => {
          throw new Error('x');
        },
      },
      gates: { failedOccurrences: () => [] },
      limit: () => 3,
      log: () => {
        throw new Error('log quebrado');
      },
    });
    expect(() => noisy.check(card(1).id)).not.toThrow();
  });

  it('o autopiloto vê a história com a pessoa e não bloqueia de novo (sem bloqueio duplo)', () => {
    for (let i = 0; i < 3; i++) fail(1, 'Implementação | run | erro');
    breaker.check(card(1).id);
    breaker.check(card(1).id);
    expect(comments(1).filter((c) => c.body.startsWith(BREAKER_MARK))).toHaveLength(1);
  });
});
