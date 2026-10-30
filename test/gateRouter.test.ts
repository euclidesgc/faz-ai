import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { GateRepo } from '../src/extension/repositories/gateRepo';
import type { WebviewToHost } from '../src/shared/messages';

// O gatilho do portão no host: a IA saindo para a frente de uma coluna com checagens (card.move) ou pedindo a
// revisão (card.status.set waiting_review) não move nem entrega o card; o router avisa o executor, e o desfecho
// (completeGate/failGate) é um método interno que revalida o card.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
let repo: GateRepo;
let fired: string[];
const snap = () => router.snapshot();
const card = (n: number) => snap().cards.find((c) => c.number === n)!;
const column = (name: string, kind: 'parent' | 'child' = 'parent') => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === kind)!;
  return s.columns.find((c) => c.workflowId === wf.id && c.name === name)!;
};
const colName = (n: number) => snap().columns.find((c) => c.id === card(n).columnId)!.name;
const ai = (msg: WebviewToHost) => router.handle(msg, { author: 'Claude Code', source: 'ai' });
const human = (msg: WebviewToHost) => router.handle(msg);
const create = (title: string, columnName: string, parent?: number) => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === columnName)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
const withChecks = (name: string) =>
  human({
    type: 'settings.column.update',
    columnId: column(name).id,
    patch: { checks: [{ name: 'Typecheck', command: 'true', timeoutSec: 30 }] },
  });
const comments = (n: number) =>
  snap()
    .comments.filter((c) => c.cardId === card(n).id)
    .map((c) => c.body);
const move = (n: number, to: string) => ai({ type: 'card.move', cardId: card(n).id, columnId: column(to).id, position: 0 });
const gateOf = (n: number) => repo.listFor(card(n).id);

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-gate-router'),
  });
  repo = new GateRepo(db);
  fired = [];
  router.onGate((id) => fired.push(id));
});

describe('gatilho do portão: card.move da IA', () => {
  it('em coluna com checagens o card vira "Verificando" sem se mover, e o ouvinte é chamado uma vez', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'running' });
    move(1, 'Revisão');
    expect(colName(1)).toBe('Implementação');
    expect(card(1).status).toBe('verifying');
    const runs = gateOf(1);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ result: 'running', kind: 'move', targetColumnId: column('Revisão').id });
    expect(fired).toEqual([runs[0]!.id]);
    // ctx.gates foi esvaziado: outra mudança do board não avisa o executor de novo
    human({ type: 'comment.add', cardId: card(1).id, body: 'oi' });
    expect(fired).toHaveLength(1);
  });

  it('sem byAi (a pessoa arrasta) o card move mesmo com checagens', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    human({ type: 'card.move', cardId: card(1).id, columnId: column('Revisão').id, position: 0 });
    expect(colName(1)).toBe('Revisão');
    expect(gateOf(1)).toHaveLength(0);
    expect(fired).toEqual([]);
  });

  it('coluna sem checagens: a IA move como sempre', () => {
    create('H', 'Implementação');
    move(1, 'Revisão');
    expect(colName(1)).toBe('Revisão');
    expect(fired).toEqual([]);
  });

  it('mover para trás não passa pelo portão', () => {
    withChecks('Revisão');
    create('H', 'Revisão');
    move(1, 'Implementação');
    expect(colName(1)).toBe('Implementação');
    expect(gateOf(1)).toHaveLength(0);
  });

  it('pedido repetido durante a verificação é recusado e não abre outro gate_runs', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    move(1, 'Revisão');
    expect(() => move(1, 'Revisão')).toThrow('O card já está sendo verificado.');
    expect(() => ai({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_review' })).toThrow('O card já está sendo verificado.');
    expect(gateOf(1)).toHaveLength(1);
    expect(fired).toHaveLength(1);
  });
});

describe('gatilho do portão: request_review', () => {
  it('grava o resumo na conversa antes do portão e não entrega o card', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_review', note: 'Resumo do trabalho' });
    expect(card(1).status).toBe('verifying');
    expect(comments(1)).toContain('Resumo do trabalho');
    expect(gateOf(1)).toMatchObject([{ kind: 'review', targetColumnId: null, result: 'running' }]);
    expect(fired).toHaveLength(1);
  });

  it('o restore do runner devolve o status sem passar pelo portão', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    human({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_review', restore: true });
    expect(card(1).status).toBe('waiting_review');
    expect(gateOf(1)).toHaveLength(0);
    expect(fired).toEqual([]);
  });

  it('sem checagens na coluna a IA entrega a revisão direto', () => {
    create('H', 'Implementação');
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_review', note: 'Pronto' });
    expect(card(1).status).toBe('waiting_review');
    expect(comments(1)).toContain('Pronto');
    expect(fired).toEqual([]);
  });
});

describe('completeGate', () => {
  it('movimento: registra o sha, passa o card para o destino e fecha o gate_runs', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    move(1, 'Revisão');
    const id = fired[0]!;
    router.completeGate(id, 'abc123');
    expect(colName(1)).toBe('Revisão');
    expect(card(1).status).not.toBe('verifying');
    expect(repo.get(id)!.result).toBe('passed');
    expect(comments(1)).toContain('Checagens passaram em `abc123`.');
  });

  it('revisão: o card fica aguardando a revisão da pessoa', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_review', note: 'Resumo' });
    router.completeGate(fired[0]!, 'abc123');
    expect(card(1).status).toBe('waiting_review');
    expect(colName(1)).toBe('Implementação');
    expect(repo.get(fired[0]!)!.result).toBe('passed');
  });

  it('card movido à mão durante o portão: não move e o gate_runs fica interrompido', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    move(1, 'Revisão');
    human({ type: 'card.move', cardId: card(1).id, columnId: column('Spec').id, position: 0 });
    router.completeGate(fired[0]!, 'abc123');
    expect(colName(1)).toBe('Spec');
    expect(repo.get(fired[0]!)!.result).toBe('interrupted');
    expect(comments(1).some((b) => b.includes('Checagens passaram'))).toBe(false);
  });

  it('respeita a aprovação: coluna que exige a pessoa recusa o movimento, com o motivo e o card em "ready"', () => {
    withChecks('Homologação');
    create('H', 'Homologação');
    move(1, 'Concluído');
    expect(card(1).status).toBe('verifying');
    router.completeGate(fired[0]!, 'abc123');
    expect(colName(1)).toBe('Homologação');
    expect(card(1).status).toBe('ready');
    expect(comments(1).some((b) => b.includes('abc123') && b.includes('foi recusado'))).toBe(true);
  });

  it('respeita as sub-tarefas em aberto: não conclui a história', () => {
    withChecks('Revisão');
    create('H', 'Revisão');
    create('Passo', 'A fazer', 1);
    move(1, 'Concluído');
    router.completeGate(fired[0]!, 'abc123');
    expect(colName(1)).toBe('Revisão');
    expect(card(1).status).toBe('ready');
    expect(comments(1).some((b) => b.includes('sub-tarefa'))).toBe(true);
  });

  it('um gate_runs já encerrado não é aplicado duas vezes', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    move(1, 'Revisão');
    router.completeGate(fired[0]!, 'abc123');
    router.completeGate(fired[0]!, 'abc123');
    expect(comments(1).filter((b) => b.includes('Checagens passaram'))).toHaveLength(1);
  });
});

describe('failGate', () => {
  it('falha: o corpo vai para a conversa e o card volta para "ready" na coluna de origem', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    move(1, 'Revisão');
    router.failGate(fired[0]!, 'failed', '**Typecheck** falhou (código 2)\n```\nerro de tipo\n```');
    expect(colName(1)).toBe('Implementação');
    expect(card(1).status).toBe('ready');
    expect(comments(1).some((b) => b.includes('erro de tipo'))).toBe(true);
    expect(repo.get(fired[0]!)!.result).toBe('failed');
  });

  it('card que já saiu de "Verificando": só fecha o registro', () => {
    withChecks('Implementação');
    create('H', 'Implementação');
    move(1, 'Revisão');
    human({ type: 'card.move', cardId: card(1).id, columnId: column('Spec').id, position: 0 });
    router.failGate(fired[0]!, 'interrupted', 'A verificação foi cancelada.');
    expect(repo.get(fired[0]!)!.result).toBe('interrupted');
    expect(comments(1)).not.toContain('A verificação foi cancelada.');
  });
});

describe('o desfecho não é alcançável de fora do host', () => {
  it('completeGate e failGate não são mensagens do WebviewToHost', () => {
    create('H', 'Implementação');
    for (const type of ['gate.complete', 'gate.fail', 'card.completeGate'])
      expect(() => router.handle({ type, cardId: card(1).id } as never)).toThrow();
  });
});
