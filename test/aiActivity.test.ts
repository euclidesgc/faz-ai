// Projeção das execuções em curso no estado do board: `AiRunner` publica `aiActivity` pelo router, e
// `aiRuns` sai derivado dela. Ver SPEC "Barra de status no pé do board".
import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunner } from '../src/extension/runner';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { monthOf } from '../src/shared/log';
import { gatewayFor } from './helpers/gateway';
import type { Database } from 'sql.js';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let router: MessageRouter;
let runner: AiRunner;
/** termina a execução aberta mais recentemente (uma por chamada a `spawn`), na ordem em que abriram */
let exits: ((code: number | null) => void)[];

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-activity'),
  });
  exits = [];
  runner = new AiRunner(router, {
    cwd: '/tmp',
    log: () => {},
    gateway: gatewayFor(router, db, () => {
      let exit: (code: number | null) => void = () => {};
      exits.push((code) => exit(code));
      return { kill: () => {}, onExit: (fn) => (exit = (code) => fn(code)) };
    }),
  });
  cardId = createCard('Primeiro');
});

const createCard = (title: string): string => {
  const s = router.snapshot();
  return router.createCard({ typeId: s.cardTypes[0]!.id, columnId: s.columns[0]!.id, parentId: null, title });
};
const card = () => router.snapshot().cards.find((c) => c.id === cardId)!;
const columnName = (c: { columnId: string }) => router.snapshot().columns.find((col) => col.id === c.columnId)!.name;
let cardId: string;

describe('aiActivity (projeção das execuções em curso)', () => {
  it('uma execução aparece em aiActivity, com os mesmos dados do log, e aiRuns deriva os ids', () => {
    const c = card();
    runner.start(c.id, 'heartbeat', 'refine');
    const state = router.snapshot();
    expect(state.aiActivity).toHaveLength(1);
    const activity = state.aiActivity[0]!;
    expect(activity.cardId).toBe(c.id);
    expect(activity.mode).toBe('refine');
    expect(activity.origin).toBe('heartbeat');
    expect(activity.phase).toBe(columnName(c));
    expect(state.aiRuns).toEqual([c.id]);

    const row = new AiRunRepo(db).byMonth(monthOf(Date.now()))[0]!;
    expect(activity.startedAt).toBe(row.startedAt);
    expect(activity.runId).toBe(row.id);
  });

  it('duas execuções ficam ordenadas por startedAt, a mais antiga primeiro', () => {
    const cardId2 = createCard('Segundo');
    const first = card();
    runner.start(first.id);
    // garante startedAt estritamente maior no segundo, mesmo que o relógio não avance no mesmo ms
    const originalNow = Date.now;
    Date.now = () => originalNow() + 10;
    try {
      runner.start(cardId2);
    } finally {
      Date.now = originalNow;
    }
    const activity = router.snapshot().aiActivity;
    expect(activity.map((a) => a.cardId)).toEqual([first.id, cardId2]);
    expect(activity[0]!.startedAt).toBeLessThanOrEqual(activity[1]!.startedAt);
  });

  it('ao terminar a execução, aiActivity e aiRuns ficam vazios', () => {
    const c = card();
    runner.start(c.id);
    expect(router.snapshot().aiActivity).toHaveLength(1);
    exits[0]!(0);
    const state = router.snapshot();
    expect(state.aiActivity).toEqual([]);
    expect(state.aiRuns).toEqual([]);
  });

  it('setHeartbeat só notifica quando o valor muda', () => {
    let notified = 0;
    router.onDidChange(() => notified++);
    router.setHeartbeat({ nextRoundAt: 1_000 });
    expect(notified).toBe(1);
    router.setHeartbeat({ nextRoundAt: 1_000 });
    expect(notified).toBe(1);
    router.setHeartbeat({ nextRoundAt: 2_000 });
    expect(notified).toBe(2);
    expect(router.snapshot().heartbeatNextAt).toBe(2_000);
  });
});
