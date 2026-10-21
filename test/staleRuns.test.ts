import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { recoverAfterRestart, staleRunning, sweepStaleRuns } from '../src/extension/staleRuns';
import { DEFAULT_RUNNER } from '../src/shared/runner';

// Cards presos em "Em execução" sem nenhuma sessão de IA em curso voltam para a IA.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const MINUTE = 60_000;
const LIMIT = DEFAULT_RUNNER.timeoutMinutes * MINUTE;

let router: MessageRouter;
let log: string[];
const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const ai = (msg: Parameters<MessageRouter['handle']>[0]) => router.handle(msg, { author: 'Claude Code', source: 'ai' });
const running = (n: number) => ai({ type: 'card.status.set', cardId: card(n).id, status: 'running' });
const create = (title: string, column: string, parent?: number) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === column)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
const stale = (tracked: string[], now: number) => staleRunning(router.snapshot(), tracked, now).map((c) => c.number);

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-stale'),
  });
  log = [];
});

describe('staleRunning', () => {
  it('só o card "Em execução" sem execução do board há mais tempo que o limite de uma execução', () => {
    create('Presa', 'PRD'); // #1
    create('Recente', 'PRD'); // #2
    create('Pronta', 'PRD'); // #3
    running(1);
    running(2);
    const at = Math.max(card(1).statusAt!, card(2).statusAt!);
    // antes do limite, qualquer das duas pode ser uma sessão viva fora do board
    expect(stale([], at + LIMIT - MINUTE)).toEqual([]);
    expect(stale([], at + LIMIT)).toEqual([1, 2]);
  });

  it('a execução registrada pelo board (aiRuns ou o executor) não é presa, nem a sub-tarefa de uma história em execução', () => {
    create('H', 'Implementação'); // #1
    create('Passo', 'A fazer', 1); // #2
    create('Solta', 'PRD'); // #3
    running(1);
    running(2);
    running(3);
    const later = card(3).statusAt! + LIMIT;
    // a história roda pelo executor: ela e a sub-tarefa que a sessão marcou estão em execução de verdade
    expect(stale([card(1).id], later)).toEqual([3]);
    router.setAiRuns([
      {
        cardId: card(1).id,
        runId: 'r',
        mode: 'phase',
        origin: 'manual',
        phase: 'Implementação',
        model: null,
        tool: 'claude',
        startedAt: 1,
      },
    ]);
    expect(stale([], later)).toEqual([3]);
  });
});

describe('sweepStaleRuns', () => {
  it('devolve o card para Pronto, com a explicação na conversa e no log', () => {
    create('Presa', 'PRD'); // #1
    running(1);
    expect(sweepStaleRuns(router, [], card(1).statusAt! + LIMIT, (l) => log.push(l))).toBe(1);
    expect(card(1).status).toBe('ready');
    expect(
      router
        .snapshot()
        .comments.filter((c) => c.cardId === card(1).id)
        .at(-1)!.body,
    ).toContain('Em execução');
    expect(log.join('\n')).toContain('#1');
    // já liberado: a próxima varredura não repete
    expect(sweepStaleRuns(router, [], card(1).statusAt! + LIMIT, (l) => log.push(l))).toBe(0);
  });
});

describe('recoverAfterRestart', () => {
  it('os cards das execuções que a sessão anterior deixou abertas voltam na hora, com as sub-tarefas que ela marcou', () => {
    create('H', 'Implementação'); // #1, a execução da sessão anterior
    create('Passo', 'A fazer', 1); // #2, marcado pela sessão
    create('Outra', 'PRD'); // #3, marcado por uma sessão fora do board: não é desta
    running(1);
    running(2);
    running(3);
    expect(recoverAfterRestart(router, [card(1).id], (l) => log.push(l))).toBe(2);
    expect(card(1).status).toBe('ready');
    expect(card(2).status).toBe('ready');
    expect(card(3).status).toBe('running');
  });
});
