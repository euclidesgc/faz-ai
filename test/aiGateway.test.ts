// A garantia de que nenhuma chamada à IA escapa do log de uso: toda execução passa por `AiGateway`, e
// o gateway grava a linha de `ai_runs` sozinho. Três camadas:
//   1. o gateway, sozinho: o que ele grava em cada desfecho;
//   2. as quatro origens (manual, heartbeat, autopiloto e chat) pelos executores de verdade;
//   3. um teste estrutural: nenhum arquivo fora do gateway chama o transporte medido nem escreve no log.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { AiGateway, NO_CARD, type AiCall } from '../src/extension/ai/gateway';
import type { SpawnFn } from '../src/extension/aiOutput/measured';
import { ChatSession } from '../src/extension/chat';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { createRunLog } from '../src/extension/log/runLog';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunner } from '../src/extension/runner';
import { providerFor } from '../src/extension/ai/providers';
import { ALL_AI_TOOLS } from '../src/shared/harness';
import { monthOf, type AiRunOrigin } from '../src/shared/log';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const CLAUDE_OUTPUT = fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-stream-json.jsonl'), 'utf8');

let dir: string;
let db: Database;
let router: MessageRouter;
let runs: AiRunRepo;
/** os processos falsos iniciados, na ordem; o teste escreve a saída e encerra */
let procs: { command: { format: string }; write(text: string): void; exit(code: number | null, error?: Error): void }[];

const spawn: SpawnFn = (command, _cwd, out) => {
  let listener: (code: number | null, error?: Error) => void = () => {};
  const proc = {
    command,
    write: (text: string) => out(text, 'stdout'),
    exit: (code: number | null, error?: Error) => listener(code, error),
  };
  procs.push(proc);
  return { onExit: (fn) => (listener = fn), kill: () => proc.exit(143) };
};

const rows = () => runs.byMonth(monthOf(Date.now()));

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-gateway-'));
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
  });
  runs = new AiRunRepo(db);
  procs = [];
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(`${dir}.worktrees`, { recursive: true, force: true });
});

const gateway = () => new AiGateway({ boardId: router.boardId, runLog: createRunLog(db), spawn });

/** Uma chamada mínima: o que cada teste precisa trocar vem em `over`. */
const call = (over: Partial<AiCall> = {}): AiCall => ({
  origin: 'manual',
  tool: 'claude',
  context: NO_CARD,
  cwd: dir,
  timeoutMinutes: 30,
  prepare: () => ({
    input: { prompt: 'oi', permission: 'board' },
    config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: false, skills: [], mcp: null },
  }),
  log: () => {},
  ...over,
});

describe('o gateway grava a execução, qualquer que seja o fim', () => {
  it('a linha abre antes de a IA rodar e fecha com o desfecho e o consumo que a CLI informou', () => {
    const run = gateway().run(call());
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ id: run.runId, outcome: null, origin: 'manual', tool: 'claude', permission: 'board' });

    let ended = false;
    run.onExit(() => (ended = true));
    procs[0]!.write(CLAUDE_OUTPUT);
    procs[0]!.exit(0);

    expect(ended).toBe(true);
    expect(rows()[0]).toMatchObject({ outcome: 'done', exitCode: 0, measure: 'full', inputTokens: 54, outputTokens: 1221 });
    // o custo é o `total_cost_usd` que a CLI escreveu, não um cálculo do board
    expect(rows()[0]!.costUsd).toBeCloseTo(0.06478465, 8);
    expect(rows()[0]!.costEstimated).toBe(false);
  });

  it('o consumo e o desfecho já estão gravados quando quem chamou é avisado', () => {
    const run = gateway().run(call());
    let seen: unknown;
    run.onExit(() => (seen = { ...rows()[0]! }));
    procs[0]!.write(CLAUDE_OUTPUT);
    procs[0]!.exit(0);
    expect(seen).toMatchObject({ outcome: 'done', measure: 'full' });
  });

  it('falha, interrupção e tempo limite ficam registrados com o desfecho certo', () => {
    vi.useFakeTimers();
    const g = gateway();
    g.run(call());
    // com um evento já lido a CLI aceitou o formato: o erro é dela, e o board não repete (cobraria duas vezes)
    procs[0]!.write(`${JSON.stringify({ type: 'system', subtype: 'init' })}\n`);
    procs[0]!.exit(1);
    g.run(call()).stop();
    g.run(call({ timeoutMinutes: 1 }));
    vi.advanceTimersByTime(61_000);

    expect(rows().map((r) => r.outcome)).toEqual(['failed', 'stopped', 'timeout']);
  });

  it('o Cursor grava os tokens que informou e nenhum custo: o board não calcula dinheiro', () => {
    gateway().run(call({ tool: 'cursor' }));
    const result = {
      type: 'result',
      subtype: 'success',
      result: 'ok',
      usage: { inputTokens: 1000, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5 },
    };
    procs[0]!.write(`${JSON.stringify(result)}\n`);
    procs[0]!.exit(0);

    expect(rows()[0]).toMatchObject({ tool: 'cursor', measure: 'full', inputTokens: 1000, outputTokens: 50, costUsd: null });
  });

  it('uma execução que nem começou também é registrada: o plano que lança fecha a linha como não suportada', () => {
    expect(() =>
      gateway().run(
        call({
          prepare: () => {
            throw new Error('plano impossível');
          },
        }),
      ),
    ).toThrow('plano impossível');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ outcome: 'unsupported', endedAt: expect.any(Number) });
    expect(procs).toHaveLength(0);
  });

  it('a ferramenta que não roda com a permissão pedida não abre processo e fica registrada', () => {
    // o Claude Code recusa "Sem restrições" quando roda como root (contêiner, WSL como root)
    const getuid = vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(0);
    try {
      expect(() =>
        gateway().run(
          call({
            tool: 'claude',
            prepare: () => ({
              input: { prompt: 'oi', permission: 'full' },
              config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: false, skills: [], mcp: null },
            }),
          }),
        ),
      ).toThrow(/root/);
    } finally {
      getuid.mockRestore();
    }
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ tool: 'claude', outcome: 'unsupported' });
    expect(procs).toHaveLength(0);
  });
});

describe('um provider por ferramenta', () => {
  it('o Claude Code é medido com custo e o Cursor só com tokens', () => {
    expect(Object.fromEntries(ALL_AI_TOOLS.map((t) => [t, providerFor(t).measure]))).toEqual({
      claude: 'cost',
      cursor: 'tokens',
    });
  });

  it('o formato que o comando anuncia é o que o leitor do mesmo provider entende', () => {
    for (const tool of ['claude', 'cursor'] as const) {
      const command = providerFor(tool).command({ prompt: 'p', permission: 'full', structured: true })!;
      expect(command.format, tool).not.toBe('text');
      const reader = providerFor(tool).reader(command.format, { model: null });
      reader.push(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }), 'stdout');
      expect(reader.sawEvent, tool).toBe(true);
    }
  });
});

describe('as quatro origens passam pelo mesmo gateway', () => {
  /** Uma entrada por origem: se o tipo ganhar uma origem nova, este objeto deixa de compilar até ela ser coberta. */
  const ORIGINS: Record<AiRunOrigin, true> = { manual: true, heartbeat: true, autopilot: true, chat: true };

  it('manual, heartbeat e autopiloto (executor de cards) e chat deixam uma linha cada um', () => {
    const g = gateway();
    const runner = new AiRunner(router, { cwd: dir, log: () => {}, gateway: g });
    new ChatSession(router, { cwd: dir, log: () => {}, file: path.join(dir, 'chat.json'), gateway: g });
    const s = router.snapshot();
    const type = s.cardTypes[0]!;
    const card = (title: string) =>
      router.createCard({
        typeId: type.id,
        columnId: s.columns.find((c) => c.workflowId === type.defaultWorkflowId)!.id,
        parentId: null,
        title,
      });

    runner.start(card('A'), 'manual');
    runner.start(card('B'), 'heartbeat');
    runner.start(card('C'), 'autopilot');
    router.chatCommand({ type: 'chat.send', text: 'oi', model: null });

    expect(procs).toHaveLength(4);
    expect(rows().map((r) => r.origin)).toEqual(['manual', 'heartbeat', 'autopilot', 'chat']);
    expect(new Set(rows().map((r) => r.origin))).toEqual(new Set(Object.keys(ORIGINS)));
    for (const p of procs) p.exit(0);
    expect(rows().map((r) => r.outcome)).toEqual(['done', 'done', 'done', 'done']);

    // "Sugerir agentes com IA" é uma execução do chat sem pergunta da pessoa: entra pela mesma porta, como origem `chat`
    router.chatCommand({ type: 'ai.suggestAgents' });
    expect(procs).toHaveLength(5);
    procs[4]!.exit(0);
    expect(rows()[4]).toMatchObject({ origin: 'chat', outcome: 'done', cardId: null });
  });
});

describe('estrutura: só o gateway chama a IA e escreve o log de uso', () => {
  const SRC = path.resolve(__dirname, '../src');
  const files = (d: string): string[] =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  const all = files(SRC).map((f) => ({ rel: path.relative(SRC, f).replace(/\\/g, '/'), text: fs.readFileSync(f, 'utf8') }));
  /** os arquivos (fora o dono) cujo código casa com `pattern`; comentários não contam */
  const offenders = (pattern: RegExp, owners: string[]) =>
    all
      .filter((f) => !owners.includes(f.rel))
      .filter((f) => pattern.test(f.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))
      .map((f) => f.rel);

  it('o transporte medido (spawnMeasured) só é chamado pelo gateway', () => {
    expect(offenders(/\bspawnMeasured\b/, ['extension/ai/gateway.ts', 'extension/aiOutput/measured.ts'])).toEqual([]);
  });

  it('o processo da CLI só é iniciado pelo host, e só para entregá-lo ao gateway', () => {
    expect(offenders(/\bspawnHeadless\b/, ['extension/spawn.ts', 'extension/host/boardHost.ts'])).toEqual([]);
  });

  it('só o gateway escreve no log de uso (start, describe, finish, measure)', () => {
    expect(offenders(/\brunLog\??\.(start|describe|finish|measure)\(/, ['extension/ai/gateway.ts'])).toEqual([]);
  });

  it('o log de uso não é opcional em nenhuma das dependências do executor', () => {
    expect(offenders(/\brunLog\?\s*:/, [])).toEqual([]);
  });
});
