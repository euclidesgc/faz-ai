import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { HostBridge, type HostEnv } from '../src/extension/host/hostBridge';
import { createTrace, pruneTrace, tracedRunLog, type Trace } from '../src/extension/log/trace';
import type { RunLog } from '../src/extension/log/runLog';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { formatTrace, messageData, summarize, type TraceEntry } from '../src/shared/trace';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-trace-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Espera a fila do rastreio gravar no disco. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
}

function readLines(file: string): TraceEntry[] {
  return fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as TraceEntry);
}

describe('summarize: o conteúdo que entra no rastreio', () => {
  it('esconde segredos em qualquer nível e troca conteúdo bruto pelo tamanho', () => {
    expect(summarize({ apiKey: 'sk-123', nested: { token: 'x', name: 'ok' }, base64: 'AAAA', text: 'olá' })).toEqual({
      apiKey: '[oculto]',
      nested: { token: '[oculto]', name: 'ok' },
      base64: '[4 caracteres]',
      text: '[3 caracteres]',
    });
  });

  it('consumo em tokens não é segredo; o token de acesso é', () => {
    expect(summarize({ tokens: 10, inputTokens: 5, token: 'x', accessToken: 'y', authToken: 'z' })).toEqual({
      tokens: 10,
      inputTokens: 5,
      token: '[oculto]',
      accessToken: '[oculto]',
      authToken: '[oculto]',
    });
  });

  it('corta textos longos, listas grandes e objetos fundos', () => {
    const long = 'a'.repeat(200);
    expect(summarize(long)).toBe(`${'a'.repeat(160)}…(+40)`);
    expect(summarize(Array.from({ length: 10 }, (_, i) => i))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, '…(+2)']);
    expect(summarize({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({ a: { b: { c: { d: '[objeto]' } } } });
  });

  it('messageData tira o tipo e o requestId, que já vão na linha', () => {
    expect(messageData({ type: 'card.update', requestId: 'r1', cardId: 'c1' } as never)).toEqual({ cardId: 'c1' });
    expect(messageData({ type: 'ready' })).toBeUndefined();
  });

  it('formatTrace deixa a linha legível para o canal de log', () => {
    expect(formatTrace({ at: 0, src: 'bridge', ev: 'done', type: 'card.move', ms: 12, ok: false, err: 'Coluna cheia' })).toBe(
      '[rastreio] bridge done card.move 12ms FALHOU — Coluna cheia',
    );
  });
});

describe('createTrace: o arquivo do dia', () => {
  it('grava uma linha JSON por evento, em ordem', async () => {
    const trace = createTrace(dir, () => {});
    trace.write({ src: 'ui', ev: 'click', data: { label: 'Salvar' } });
    trace.write({ src: 'bridge', ev: 'recv', type: 'card.update' });
    await settle();
    const lines = readLines(trace.file());
    expect(lines.map((l) => `${l.src}:${l.ev}`)).toEqual(['ui:click', 'bridge:recv']);
    expect(typeof lines[0]!.at).toBe('number');
  });

  it('com o espelho ligado, repete cada linha no canal de log', () => {
    const log: string[] = [];
    createTrace(dir, (l) => log.push(l), true).write({ src: 'mcp', ev: 'tool', type: 'move_card', ok: true });
    expect(log).toEqual(['[rastreio] mcp tool move_card']);
  });

  it('apaga os arquivos com mais de sete dias e deixa os recentes', () => {
    const now = new Date(2026, 9, 23).getTime();
    for (const name of ['trace-2026-10-10.jsonl', 'trace-2026-10-20.jsonl', 'outro.txt']) fs.writeFileSync(path.join(dir, name), '');
    pruneTrace(dir, now);
    expect(fs.readdirSync(dir).sort()).toEqual(['outro.txt', 'trace-2026-10-20.jsonl']);
  });
});

describe('tracedRunLog: começo e fim das execuções de IA', () => {
  it('rastreia o início, a configuração e o desfecho com a duração, sem mudar o que o log grava', () => {
    const entries: TraceEntry[] = [];
    const trace: Trace = { write: (e) => void entries.push({ at: 0, ...e } as TraceEntry), file: () => '' };
    const calls: string[] = [];
    const inner = {
      start: () => (calls.push('start'), 'run-1'),
      describe: () => void calls.push('describe'),
      finish: () => void calls.push('finish'),
      measure: () => {},
      closeOpen: () => [],
    } as RunLog;
    const log = tracedRunLog(inner, trace);
    const id = log.start({ cardNumber: 7, origin: 'manual', phase: 'Implementação', tool: 'claude' } as never);
    log.describe(id, { model: 'opus' } as never);
    log.finish(id, 'failed', 1);
    expect(calls).toEqual(['start', 'describe', 'finish']);
    expect(entries.map((e) => e.ev)).toEqual(['run.start', 'run.describe', 'run.finish']);
    expect(entries[0]).toMatchObject({ type: 'claude', rid: 'run-1', data: { card: 7, origin: 'manual', phase: 'Implementação' } });
    expect(entries[2]).toMatchObject({ rid: 'run-1', ok: false, data: { outcome: 'failed', exitCode: 1 } });
    expect(typeof entries[2]!.ms).toBe('number');
  });
});

describe('HostBridge e router: a ação da tela no rastreio', () => {
  let router: MessageRouter;
  let bridge: HostBridge;
  let entries: TraceEntry[];

  beforeEach(async () => {
    entries = [];
    const trace: Trace = { write: (e) => void entries.push({ at: 0, ...e } as TraceEntry), file: () => '' };
    const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
    router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
      workspaceKey: 'ws',
      folderName: 'P',
      author: 'Pessoa',
      attachmentsDir: path.join(dir, 'a'),
      workspaceDir: dir,
      homeDir: path.join(dir, 'h'),
      trace,
    });
    bridge = new HostBridge(
      () => {},
      router,
      { get: () => ({}), onDidChange: () => () => {}, update: () => {} } as never,
      { get: () => ({}), onDidChange: () => () => {}, update: () => {} } as never,
      { attachmentsBaseUri: () => '' } as unknown as HostEnv,
    );
  });

  afterEach(() => bridge.dispose());

  it('rastreia o recebimento, a mudança aplicada, o estado enviado e o done de uma ação', async () => {
    const state = router.snapshot();
    const typeId = state.cardTypes[0]!.id;
    const columnId = state.columns[0]!.id;
    await bridge.handle({ type: 'card.create', typeId, columnId, parentId: null, title: 'Primeiro', requestId: 'r1' });
    const evs = entries.map((e) => `${e.src}:${e.ev}`);
    expect(evs).toEqual(['bridge:recv', 'router:apply', 'bridge:done', 'bridge:state']);
    expect(entries[0]).toMatchObject({ type: 'card.create', rid: 'r1', data: { title: 'Primeiro', typeId, columnId } });
    expect(entries[1]).toMatchObject({ type: 'card.create', ok: true, data: { changed: true, by: 'Pessoa', ai: false } });
    expect(entries[2]).toMatchObject({ type: 'card.create', rid: 'r1', ok: true });
    expect(entries[3]).toMatchObject({ data: { cards: 1 } });
  });

  it('a ação que falha fica com o erro no done e na mensagem de erro enviada à tela', async () => {
    vi.spyOn(router, 'handle').mockImplementation(() => {
      throw new Error('Coluna cheia');
    });
    await bridge.handle({ type: 'card.update', cardId: 'c1', patch: { title: 'x' }, requestId: 'r3' });
    expect(entries.find((e) => e.ev === 'done')).toMatchObject({ ok: false, rid: 'r3', err: 'Coluna cheia' });
    expect(entries.find((e) => e.ev === 'send')).toMatchObject({ type: 'error', ok: false, err: 'Coluna cheia' });
  });

  it('as linhas da tela vão para o rastreio com a origem ui, sem virar uma ação', async () => {
    await bridge.handle({
      type: 'ui.trace',
      entries: [
        { at: 5, src: 'ui', ev: 'click', data: { label: 'Salvar', apiKey: 'sk' } },
        { at: 6, src: 'ui', ev: 'js.error', ok: false, err: 'x is undefined' },
      ],
    });
    expect(entries).toEqual([
      { at: 5, src: 'ui', ev: 'click', data: { label: 'Salvar', apiKey: '[oculto]' } },
      { at: 6, src: 'ui', ev: 'js.error', ok: false, err: 'x is undefined' },
    ]);
  });
});
