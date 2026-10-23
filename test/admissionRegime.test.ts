// Regime de admissão escolhido pela pessoa (#1091): a configuração, a revisão e o pedido que vai à admissão.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openInMemory, type DbHandle } from '../src/extension/db/database';
import { BoardContext } from '../src/extension/panel/handlers/context';
import { admissionRegimeOf, DEFAULT_RUNNER, parseRunner } from '../src/shared/runner';
import { admitExecution } from '../src/shared/executionAdmission';
import type { StrictExecutionRequest } from '../src/shared/executionAdmission';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

describe('configuração do regime', () => {
  it('nasce exclusivo, sem revisão; valor desconhecido volta ao padrão', () => {
    expect(DEFAULT_RUNNER.admissionRegime).toBe('exclusive');
    expect(parseRunner('{}')).toMatchObject({ admissionRegime: 'exclusive', compatibilityReviewRevision: 0 });
    expect(parseRunner('{"admissionRegime":"aberto","compatibilityReviewRevision":3}')).toMatchObject({
      admissionRegime: 'exclusive',
      compatibilityReviewRevision: 3,
    });
  });
  it('compatível gravado sem revisão vale como a primeira revisão: a admissão nunca recebe revisão zero', () => {
    expect(parseRunner('{"admissionRegime":"compatible"}')).toMatchObject({
      admissionRegime: 'compatible',
      compatibilityReviewRevision: 1,
    });
    expect(parseRunner('{"admissionRegime":"compatible","compatibilityReviewRevision":-2}').compatibilityReviewRevision).toBe(1);
    expect(parseRunner('{"admissionRegime":"compatible","compatibilityReviewRevision":4}').compatibilityReviewRevision).toBe(4);
  });
  it('o pedido leva o regime e, no compatível, a revisão da pessoa', () => {
    expect(admissionRegimeOf(DEFAULT_RUNNER)).toEqual({ regime: 'exclusive' });
    expect(admissionRegimeOf({ admissionRegime: 'compatible', compatibilityReviewRevision: 2 })).toEqual({
      regime: 'compatible',
      compatibilityReview: { actor: 'person', revision: 2 },
    });
  });
  it('a admissão aceita a revisão que a configuração produz e segue recusando sem ela', () => {
    const base: StrictExecutionRequest = {
      version: 1,
      regime: 'exclusive',
      agentTools: { categories: [], native: { tool: '', allow: [], deny: [] } },
      boardTools: { mode: 'explicit', value: [] },
      activeMcpIds: [],
      allowedMcpIds: [],
      boardMcpIds: [],
      mcpServers: [],
      mcpTools: [],
      boardMcpTools: [],
      mcpLevel: { permission: 'board', tools: [] },
    };
    const reviewed = { ...base, ...admissionRegimeOf({ admissionRegime: 'compatible', compatibilityReviewRevision: 1 }) };
    expect(admitExecution('claude', 'board', reviewed, 'a'.repeat(64), [], 1000).reasons).not.toContainEqual({
      code: 'compatibility-not-reviewed',
    });
    expect(admitExecution('claude', 'board', { ...base, regime: 'compatible' }, 'a'.repeat(64), [], 1000).reasons).toContainEqual({
      code: 'compatibility-not-reviewed',
    });
  });
});

describe('o repositório sobe a revisão quando a pessoa liga o compatível', () => {
  let root: string;
  let handle: DbHandle;
  let ctx: BoardContext;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-regime-'));
    for (const d of ['project', 'home', 'data/attachments']) fs.mkdirSync(path.join(root, d), { recursive: true });
    const db = await openInMemory(WASM_DIR);
    handle = { db, scheduleSave: () => {}, close: async () => db.close() } as DbHandle;
    ctx = new BoardContext(handle, {
      workspaceKey: 'regime-test',
      folderName: 'Projeto',
      author: 'Pessoa',
      attachmentsDir: path.join(root, 'data/attachments'),
      workspaceDir: path.join(root, 'project'),
      homeDir: path.join(root, 'home'),
    });
  });
  afterEach(async () => {
    await handle.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const runner = () => ctx.boards.snapshot(ctx.boardId).board.runner;

  it('ligar, desligar e ligar de novo conta duas revisões; a tela não dita o número', () => {
    ctx.boards.updateBoard(ctx.boardId, { runner: { admissionRegime: 'compatible', compatibilityReviewRevision: 40 } });
    expect(runner()).toMatchObject({ admissionRegime: 'compatible', compatibilityReviewRevision: 1 });
    // manter o compatível (outro ajuste do runner) não é uma revisão nova
    ctx.boards.updateBoard(ctx.boardId, { runner: { heartbeat: true } });
    expect(runner().compatibilityReviewRevision).toBe(1);
    ctx.boards.updateBoard(ctx.boardId, { runner: { admissionRegime: 'exclusive' } });
    expect(runner()).toMatchObject({ admissionRegime: 'exclusive', compatibilityReviewRevision: 1 });
    ctx.boards.updateBoard(ctx.boardId, { runner: { admissionRegime: 'compatible' } });
    expect(runner().compatibilityReviewRevision).toBe(2);
  });
});
