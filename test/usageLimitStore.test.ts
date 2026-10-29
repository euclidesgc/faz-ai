import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import {
  LIMIT_SLACK_MS,
  USAGE_LIMIT_META_KEY,
  canDispatch,
  limitHolds,
  modelLimitHolds,
  nextModelLimit,
  parseModelLimits,
} from '../src/shared/usageLimit';

// A pausa por limite de uso fica gravada na `meta` do board, uma entrada por perfil de CLI (história #1047): reabrir o
// editor não solta a fila antes da hora, e a execução de teste em curso não sobrevive a reabrir.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const at = (h: number, m: number) => new Date(2026, 9, 16, h, m).getTime();

let db: Awaited<ReturnType<typeof openInMemory>>;
const open = () =>
  new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-usage-limit'),
  });

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
});

describe('pausa por limite de uso gravada no board', () => {
  it('gravada até 15:03 e reaberta às 14:10: continua segurando a fila daquele perfil', () => {
    const router = open();
    const pause = router.recordUsageLimit('claude', at(15, 0), at(13, 45));
    expect(pause.resumeAt).toBe(at(15, 0) + LIMIT_SLACK_MS);
    const reopened = open().snapshot();
    expect(reopened.usageLimit).toEqual([{ profileId: 'claude', resumeAt: at(15, 3), source: 'reset', attempts: 0, probe: null }]);
    expect(limitHolds(reopened, 'claude', at(14, 10))).toBe(true);
    expect(canDispatch(reopened, 'claude', at(14, 10))).toBe(false);
    expect(canDispatch(reopened, 'cursor', at(14, 10))).toBe(true);
  });

  it('gravada até 14:00 e reaberta às 14:10: não segura, e a próxima execução é o teste', () => {
    open().recordUsageLimit('claude', at(13, 57), at(13, 45));
    const reopened = open().snapshot();
    expect(limitHolds(reopened, 'claude', at(14, 10))).toBe(false);
    expect(canDispatch(reopened, 'claude', at(14, 10))).toBe(true);
  });

  it('guarda uma entrada por perfil e limpa só a do perfil que voltou a funcionar', () => {
    const router = open();
    router.recordUsageLimit('claude', at(15, 0), at(13, 45));
    router.recordUsageLimit('cursor', null, at(13, 45));
    expect(
      open()
        .snapshot()
        .usageLimit.map((p) => p.profileId),
    ).toEqual(['claude', 'cursor']);
    expect(router.clearUsageLimit('claude')).toBe(true);
    expect(router.clearUsageLimit('claude')).toBe(false);
    expect(
      open()
        .snapshot()
        .usageLimit.map((p) => p.profileId),
    ).toEqual(['cursor']);
  });

  it('a execução de teste fica só em memória: não sobrevive a reabrir', () => {
    const router = open();
    router.recordUsageLimit('claude', at(13, 50), at(13, 45));
    router.setLimitProbe('claude', 'card-1');
    expect(router.snapshot().usageLimit[0]?.probe).toBe('card-1');
    expect(open().snapshot().usageLimit[0]?.probe).toBeNull();
  });

  it('valor corrompido ou antigo na meta não segura a fila', () => {
    const router = open();
    router.setMeta(USAGE_LIMIT_META_KEY, '{"tool":"claude","resumeAt":9999999999999,"source":"reset","attempts":0}');
    expect(open().snapshot().usageLimit).toEqual([]);
    router.setMeta(USAGE_LIMIT_META_KEY, 'lixo');
    expect(open().snapshot().usageLimit).toEqual([]);
  });
});

describe('marca de modelo esgotado (#1100)', () => {
  it('nextModelLimit: renovação + folga, backoff e a mais tarde vence', () => {
    const a = nextModelLimit(null, 'claude', 'opus', at(15, 0), at(13, 45));
    expect(a).toEqual({ profileId: 'claude', model: 'opus', resumeAt: at(15, 3), source: 'reset', attempts: 0 });
    expect(nextModelLimit(a, 'claude', 'opus', at(14, 0), at(13, 50)).resumeAt).toBe(at(15, 3));
    expect(nextModelLimit(a, 'claude', 'opus', at(16, 0), at(13, 50)).resumeAt).toBe(at(16, 3));
    const b = nextModelLimit(null, 'claude', 'opus', null, at(13, 45));
    expect(b).toMatchObject({ source: 'backoff', attempts: 1, resumeAt: at(13, 45) + 5 * 60_000 });
    // marca de outro modelo não conta como anterior
    expect(nextModelLimit(a, 'claude', 'sonnet', null, at(13, 45)).attempts).toBe(1);
  });

  it('parseModelLimits: inválido, corrompido e par duplicado viram "sem marca"', () => {
    const ok = { profileId: 'claude', model: 'opus', resumeAt: 10, source: 'reset', attempts: 0 };
    expect(parseModelLimits(undefined)).toEqual([]);
    expect(parseModelLimits('lixo')).toEqual([]);
    expect(parseModelLimits('{}')).toEqual([]);
    expect(
      parseModelLimits(
        JSON.stringify([ok, { ...ok, model: '' }, { ...ok, resumeAt: 'x' }, { ...ok, resumeAt: 99 }, { ...ok, model: 'sonnet' }]),
      ),
    ).toEqual([ok, { ...ok, model: 'sonnet' }]);
  });

  it('modelLimitHolds: vencida, modelo null e outro modelo do mesmo perfil', () => {
    const list = [{ profileId: 'claude', model: 'opus', resumeAt: at(15, 3), source: 'reset' as const, attempts: 0 }];
    expect(modelLimitHolds(list, 'claude', 'opus', at(14, 0))).toBe(true);
    expect(modelLimitHolds(list, 'claude', 'opus', at(15, 3))).toBe(false);
    expect(modelLimitHolds(list, 'claude', null, at(14, 0))).toBe(false);
    expect(modelLimitHolds(list, 'claude', 'sonnet', at(14, 0))).toBe(false);
    expect(modelLimitHolds(list, 'cursor', 'opus', at(14, 0))).toBe(false);
  });

  it('record e clear gravam na meta e releem; vencidas saem na gravação; não entram no snapshot', () => {
    const router = open();
    router.recordModelLimit('claude', 'opus', at(15, 0), at(13, 45));
    router.recordModelLimit('claude', 'sonnet', at(14, 0), at(13, 45));
    expect(
      open()
        .modelLimitList()
        .map((l) => l.model),
    ).toEqual(['opus', 'sonnet']);
    expect('modelLimits' in router.snapshot()).toBe(false);
    // gravar às 14:30 descarta a do sonnet (vencida às 14:03)
    router.recordModelLimit('claude', 'opus', at(16, 0), at(14, 30));
    expect(
      open()
        .modelLimitList()
        .map((l) => [l.model, l.resumeAt]),
    ).toEqual([['opus', at(16, 3)]]);
    expect(router.clearModelLimit('claude', null, at(14, 30))).toBe(false);
    expect(router.clearModelLimit('claude', 'opus', at(14, 30))).toBe(true);
    expect(router.clearModelLimit('claude', 'opus', at(14, 30))).toBe(false);
    expect(open().modelLimitList()).toEqual([]);
  });
});
