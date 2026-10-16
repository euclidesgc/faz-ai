import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { LIMIT_SLACK_MS, USAGE_LIMIT_META_KEY, canDispatch, limitHolds } from '../src/shared/usageLimit';

// A pausa por limite de uso fica gravada no banco do board (RF10, história #800): reabrir o editor não solta a fila
// antes da hora, e a execução de teste em curso não sobrevive a reabrir.

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
  it('gravada até 15:03 e reaberta às 14:10: continua segurando a fila', () => {
    const router = open();
    const pause = router.recordUsageLimit('claude', at(15, 0), at(13, 45));
    expect(pause.resumeAt).toBe(at(15, 0) + LIMIT_SLACK_MS);
    const reopened = open().snapshot();
    expect(reopened.usageLimit).toEqual({ tool: 'claude', resumeAt: at(15, 3), source: 'reset', attempts: 0, probe: null });
    expect(limitHolds(reopened, at(14, 10))).toBe(true);
    expect(canDispatch(reopened, at(14, 10))).toBe(false);
  });

  it('gravada até 14:00 e reaberta às 14:10: não segura, e a próxima execução é o teste', () => {
    open().recordUsageLimit('claude', at(13, 57), at(13, 45));
    const reopened = open().snapshot();
    expect(limitHolds(reopened, at(14, 10))).toBe(false);
    expect(canDispatch(reopened, at(14, 10))).toBe(true);
  });

  it('a execução de teste fica só em memória: não sobrevive a reabrir', () => {
    const router = open();
    router.recordUsageLimit('claude', at(13, 50), at(13, 45));
    router.setLimitProbe('card-1');
    expect(router.snapshot().usageLimit?.probe).toBe('card-1');
    expect(open().snapshot().usageLimit?.probe).toBeNull();
  });

  it('o fim bem-sucedido apaga só a pausa da mesma ferramenta', () => {
    const router = open();
    router.recordUsageLimit('claude', at(13, 50), at(13, 45));
    expect(router.clearUsageLimit('cursor')).toBe(false);
    expect(router.snapshot().usageLimit).not.toBeNull();
    expect(router.clearUsageLimit('claude')).toBe(true);
    expect(router.snapshot().usageLimit).toBeNull();
    expect(router.getMeta(USAGE_LIMIT_META_KEY)).toBe('');
    expect(open().snapshot().usageLimit).toBeNull();
  });

  it('chave vazia ou JSON inválido na meta viram "sem pausa"', () => {
    const router = open();
    router.setMeta(USAGE_LIMIT_META_KEY, '');
    expect(open().snapshot().usageLimit).toBeNull();
    router.setMeta(USAGE_LIMIT_META_KEY, '{quebrado');
    expect(open().snapshot().usageLimit).toBeNull();
  });

  it('avisa a tela ao gravar, apagar e marcar o teste', () => {
    const router = open();
    let calls = 0;
    router.onDidChange(() => calls++);
    router.recordUsageLimit('claude', null, at(13, 45));
    router.setLimitProbe('card-1');
    router.setLimitProbe('card-1');
    router.clearUsageLimit('claude');
    expect(calls).toBe(3);
  });
});
