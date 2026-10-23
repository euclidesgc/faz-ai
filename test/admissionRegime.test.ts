// Regime de admissão escolhido pela pessoa (#1091): a configuração, a revisão e o pedido que vai à admissão.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openInMemory, type DbHandle } from '../src/extension/db/database';
import { BoardContext } from '../src/extension/panel/handlers/context';
import { admissionRegimeOf, DEFAULT_RUNNER, parseRunner } from '../src/shared/runner';
import { admitExecution } from '../src/shared/executionAdmission';
import { legacyStrictRequest } from '../src/extension/ai/v1Prepare';
import { aiProfileHandlers } from '../src/extension/panel/handlers/aiProfiles';
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

  it('a ciência por perfil do Conectar: só o host grava, e a tela não a escreve (história 7)', () => {
    expect(ctx.boards.recordCompatibilityReview(ctx.boardId, 'gemini')).toBe(1);
    expect(ctx.boards.recordCompatibilityReview(ctx.boardId, 'gemini')).toBe(2);
    expect(runner().compatibilityReviews).toEqual({ gemini: 2 });
    // o mesmo pedido de atualização que a tela manda não muda a ciência de ninguém
    ctx.boards.updateBoard(ctx.boardId, { runner: { compatibilityReviews: { gemini: 99, claude: 1 }, heartbeat: true } });
    expect(runner().compatibilityReviews).toEqual({ gemini: 2 });
    // e o regime do board segue o que era
    expect(runner().admissionRegime).toBe('exclusive');
  });

  it('a pessoa dá e revoga a ciência de um perfil (a ação de quem não passa pelo Conectar)', () => {
    const review = aiProfileHandlers['settings.aiProfiles.review'];
    const person = { byAi: false } as Parameters<typeof review>[2];
    expect(review({ type: 'settings.aiProfiles.review', id: 'claude', accept: true }, ctx, person)).toBe(true);
    expect(runner().compatibilityReviews).toEqual({ claude: 1 });
    expect(admissionRegimeOf(runner(), 'claude')).toMatchObject({ regime: 'compatible' });
    expect(review({ type: 'settings.aiProfiles.review', id: 'claude', accept: false }, ctx, person)).toBe(true);
    expect(runner().compatibilityReviews).toEqual({});
    expect(admissionRegimeOf(runner(), 'claude')).toEqual({ regime: 'exclusive' });
    // revogar o que não há não muda o board
    expect(review({ type: 'settings.aiProfiles.review', id: 'claude', accept: false }, ctx, person)).toBe(false);
    // a IA não dá ciência, e perfil desconhecido é recusado
    expect(() => review({ type: 'settings.aiProfiles.review', id: 'claude', accept: true }, ctx, { byAi: true } as typeof person)).toThrow(
      /ato da pessoa/,
    );
    expect(() => review({ type: 'settings.aiProfiles.review', id: 'nada', accept: true }, ctx, person)).toThrow(/indisponível/);
  });
});

describe('regime por perfil (história 7)', () => {
  it('a ciência do perfil vale para ele; os outros seguem o regime do board', () => {
    const runner = { ...DEFAULT_RUNNER, compatibilityReviews: { gemini: 3 } };
    expect(admissionRegimeOf(runner, 'gemini')).toEqual({ regime: 'compatible', compatibilityReview: { actor: 'person', revision: 3 } });
    expect(admissionRegimeOf(runner, 'claude')).toEqual({ regime: 'exclusive' });
    expect(admissionRegimeOf(runner)).toEqual({ regime: 'exclusive' });
    // quem ligou o compatível do board antes da história 7 continua com ele em todo perfil
    const legacy = { ...runner, admissionRegime: 'compatible' as const, compatibilityReviewRevision: 2 };
    expect(admissionRegimeOf(legacy, 'claude')).toEqual({ regime: 'compatible', compatibilityReview: { actor: 'person', revision: 2 } });
  });
  it('a leitura descarta id inválido e revisão que não é inteiro positivo', () => {
    expect(
      parseRunner('{"compatibilityReviews":{"gemini":2,"Nome Ruim":1,"claude":0,"kimi":1.5,"codex-acp":"3"}}').compatibilityReviews,
    ).toEqual({
      gemini: 2,
    });
    expect(parseRunner('{"compatibilityReviews":[1]}').compatibilityReviews).toEqual({});
  });
});

describe('pedido de admissão do runtime legado para um perfil personalizado', () => {
  it('leva o regime do board, as categorias do nível e os MCPs do plano pelo nome; a admissão o aceita', () => {
    const runner = { ...DEFAULT_RUNNER, admissionRegime: 'compatible' as const, compatibilityReviewRevision: 1 };
    const request = legacyStrictRequest(runner, 'edits', ['memoria', 'memoria']);
    expect(request).toMatchObject({
      regime: 'compatible',
      compatibilityReview: { actor: 'person', revision: 1 },
      agentTools: { categories: ['read', 'edit'] },
      activeMcpIds: ['memoria'],
      mcpServers: [{ artifactId: 'memoria', name: 'memoria' }],
      mcpLevel: { permission: 'edits' },
    });
    const decision = admitExecution('generic', 'edits', request, 'a'.repeat(64), [], 1000, 'acp');
    expect(decision.reasons.map((r) => r.code)).not.toContain('invalid-request');
    expect(decision.reasons.map((r) => r.code)).not.toContain('mcp-outside-boundary');
    expect(legacyStrictRequest(DEFAULT_RUNNER, 'full', []).agentTools.categories).toEqual(['read', 'edit', 'run', 'net']);
  });
});
