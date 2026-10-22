import type { ContextDraftResolution } from '../src/shared/contextDraftResolution';
import type { AiBase } from '../src/shared/aiProfiles';
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
import { AiGateway, NO_CARD, missingProfileCommand, type AiCall, type AiRunEnd } from '../src/extension/ai/gateway';
import { commandNotFound } from '../src/extension/cliResolve';
import { SpawnNotStartedError } from '../src/extension/processIdentity';
import { MeasureEndedError } from '../src/extension/aiOutput/errors';
import type { SpawnFn } from '../src/extension/aiOutput/measured';
import { ChatSession } from '../src/extension/chat';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { createRunLog } from '../src/extension/log/runLog';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunner } from '../src/extension/runner';
import { providerFor } from '../src/extension/ai/providers';
import { ExecutionAdmission, AdmissionBlockedError } from '../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
import { CAPABILITY_CHECKS, EXECUTOR_CAPABILITIES, type StrictExecutionRequest } from '../src/shared/executionAdmission';
import { ALL_AI_BASES } from '../src/shared/harness';
import { monthOf, type AiRunOrigin } from '../src/shared/log';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const CLAUDE_OUTPUT = fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-stream-json.jsonl'), 'utf8');

it('comando ausente de perfil personalizado mostra só o link público de instalação revisado', () => {
  const profile: import('../src/shared/aiProfiles').AiProfile = {
    id: 'personalizado',
    name: 'Minha CLI',
    kind: 'custom',
    base: 'generic',
    enabled: true,
    position: 3,
    config: { command: 'missing-custom', installUrl: 'https://example.com/install' },
    credentials: { secretRef: 'b'.repeat(64), review: 'reviewed', available: true },
  };
  const missing = () => new SpawnNotStartedError(commandNotFound('missing-custom'));
  expect(missingProfileCommand(missing(), profile).message).toContain('Instalação do perfil: https://example.com/install');
  expect(
    missingProfileCommand(missing(), { ...profile, config: { ...profile.config, installUrl: 'https://example.com/?token=private' } })
      .message,
  ).not.toContain('https://');
  expect(missingProfileCommand(missing(), { ...profile, kind: 'builtin' }).message).not.toContain('https://example.com/install');
  expect(missingProfileCommand(new SpawnNotStartedError('Outra falha'), profile).message).toBe('Outra falha');
});

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

  it('a conferência é calculada pelo gateway e gravada junto do consumo: subagente fora do card é desvio', () => {
    const conference = {
      manifest: { skills: [], mcpServers: [], tools: [], deniedTools: [], agent: '' },
      boardServer: 'faz-ai',
    };
    const prepare = () => ({ ...call().prepare(), conference });
    const run = gateway().run(call({ prepare }));
    let end: AiRunEnd | undefined;
    run.onExit((e) => (end = e));
    procs[0]!.write(CLAUDE_OUTPUT);
    procs[0]!.exit(0);
    expect(end!.check).toEqual({ status: 'deviation', deviations: [{ kind: 'agent', name: 'Explore', calls: 1 }] });
    expect(rows()[0]!.check).toEqual(end!.check);
  });

  it('o card que libera o subagente grava "sem desvio"; sem manifesto (chat) a execução fica não conferida', () => {
    const liberado = {
      manifest: { skills: [], mcpServers: [], tools: [], deniedTools: [], agent: 'Explore' },
      boardServer: 'faz-ai',
    };
    gateway().run(call({ prepare: () => ({ ...call().prepare(), conference: liberado }) }));
    procs[0]!.write(CLAUDE_OUTPUT);
    procs[0]!.exit(0);
    gateway().run(call());
    procs[1]!.write(CLAUDE_OUTPUT);
    procs[1]!.exit(0);
    const [conferida, semManifesto] = rows();
    expect(conferida!.check).toEqual({ status: 'ok' });
    expect(semManifesto!.check.status).not.toBe('ok');
  });

  it('Cursor: o manifesto leva o servidor do board, nomes do Cursor e nenhum subagente; ferramenta sem equivalente deixa `tools` vazio', async () => {
    const { manifestPath } = await import('../src/extension/ai/cursorManifest');
    const mdir = path.join(dir, 'manifestos');
    const lines: string[] = [];
    const g = new AiGateway({
      boardId: router.boardId,
      runLog: createRunLog(db),
      spawn,
      cursorHook: { dir: mdir, status: () => null },
    });
    const run = (tools: string[]) =>
      g.run(
        call({
          tool: 'cursor',
          log: (l) => lines.push(l),
          prepare: () => ({
            ...call().prepare(),
            conference: {
              manifest: { skills: [], mcpServers: ['github'], tools, deniedTools: ['Edit', 'Glob'], agent: 'condutor' },
              boardServer: 'faz-ai',
            },
          }),
        }),
      );
    run(['Read', 'Bash', 'Agent']);
    let m = JSON.parse(fs.readFileSync(manifestPath(mdir, dir), 'utf8'));
    expect(m).toMatchObject({ mcpServers: ['faz-ai', 'github'], subagents: [], tools: ['Read', 'Shell', 'Task'], deniedTools: ['Write'] });
    procs[0]!.exit(0);
    run(['Read', 'Glob']);
    m = JSON.parse(fs.readFileSync(manifestPath(mdir, dir), 'utf8'));
    expect(m.tools).toEqual([]);
    expect(lines.some((l) => l.includes('parcial'))).toBe(true);
    procs[1]!.exit(0);
  });

  it('Cursor sem hook pronto: nada de manifesto e a linha "parcial" no log', () => {
    const lines: string[] = [];
    const g = new AiGateway({
      boardId: router.boardId,
      runLog: createRunLog(db),
      spawn,
      cursorHook: { dir: path.join(dir, 'm2'), status: () => 'o hook está desatualizado' },
    });
    expect(g.cursorHookReady()).toBe(false);
    g.run(
      call({
        tool: 'cursor',
        log: (l) => lines.push(l),
        prepare: () => ({
          ...call().prepare(),
          conference: { manifest: { skills: [], mcpServers: [], tools: [], deniedTools: [], agent: '' }, boardServer: 'faz-ai' },
        }),
      }),
    );
    expect(fs.existsSync(path.join(dir, 'm2'))).toBe(false);
    expect(lines.some((l) => l.includes('Garantia do Cursor parcial'))).toBe(true);
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

  it('o empréstimo do arquivo MCP do projeto usa a raiz do gateway e volta no tempo limite (relógio falso)', () => {
    vi.useFakeTimers();
    const coordination = path.join(dir, 'coordenacao');
    const file = path.join(dir, '.cursor/mcp.json');
    // o processo falso confirma o fim da árvore: só então o arquivo pode voltar
    const confirmingSpawn: SpawnFn = (command, cwd, out) => {
      const proc = spawn(command, cwd, out);
      let ended = false;
      const kill = proc.kill;
      return { ...proc, onExit: proc.onExit, kill: () => ((ended = true), kill()), terminationConfirmed: () => ended };
    };
    const g = new AiGateway({
      boardId: router.boardId,
      runLog: createRunLog(db),
      spawn: confirmingSpawn,
      leaseCoordinationDir: coordination,
    });
    g.run(
      call({
        tool: 'cursor',
        timeoutMinutes: 1,
        prepare: () => ({
          input: { prompt: 'oi', permission: 'board', boardServer: { command: '/usr/bin/node', args: ['/dados/bridge.js', dir] } },
          config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: false, skills: [], mcp: null },
        }),
      }),
    );
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readdirSync(coordination)).toHaveLength(1);
    vi.advanceTimersByTime(61_000);
    expect(rows()[0]!.outcome).toBe('timeout');
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(coordination)).toEqual([]);
  });

  it('a falha antes do primeiro evento não é repetida e fica com o consumo desconhecido, não zero (#739)', () => {
    const logged: string[] = [];
    const run = gateway().run(call({ log: (l) => logged.push(l) }));
    const ends: AiRunEnd[] = [];
    run.onExit((e) => ends.push(e));

    procs[0]!.write('{"type":"assi');
    procs[0]!.exit(1);

    expect(procs).toHaveLength(1);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ attempts: 1, outcome: 'failed', code: 1 });
    expect(ends[0]!.measureError).toBeInstanceOf(MeasureEndedError);
    expect(rows()[0]).toMatchObject({ outcome: 'failed', measure: 'none', inputTokens: null, outputTokens: null });
    // o canal identifica a execução e a tentativa
    expect(logged[0]).toContain(`(tentativa 1 da execução ${run.runId})`);
  });

  it('a execução medida chega a quem chamou sem motivo de falha da medição', () => {
    const run = gateway().run(call());
    const ends: AiRunEnd[] = [];
    run.onExit((e) => ends.push(e));
    procs[0]!.write(CLAUDE_OUTPUT);
    procs[0]!.exit(0);
    expect(ends[0]!.measureError).toBeNull();
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

  it('configuração v1 com recurso obrigatório inválido não inicia e mostra o motivo (E5.1)', () => {
    const context = {
      diagnostics: [{ code: 'admission-unavailable' }, { code: 'missing-artifact', artifactId: 'skill-x' }],
    } as unknown as ContextDraftResolution;
    expect(() =>
      gateway().run(
        call({
          prepare: () => ({
            context,
            input: { prompt: 'oi', permission: 'board' },
            config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: false, skills: [], mcp: null },
          }),
        }),
      ),
    ).toThrow('missing-artifact:skill-x');
    expect(procs).toHaveLength(0);
  });

  it('MCP fora da configuração resolvida da atividade é recusado antes do spawn (E5.2)', () => {
    const context = {
      diagnostics: [],
      items: [{ artifactId: 'planejado', kind: 'mcp', name: 'p', origins: [] }],
    } as unknown as ContextDraftResolution;
    const request = {
      version: 1,
      regime: 'exclusive',
      activeMcpIds: ['planejado', 'extra'],
      mcpServers: [],
    } as unknown as StrictExecutionRequest;
    expect(() =>
      gateway().run(
        call({
          prepare: () => ({
            context,
            strict: { profileId: 'claude', request },
            input: { prompt: 'oi', permission: 'board' },
            config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: false, skills: [], mcp: null },
          }),
        }),
      ),
    ).toThrow('MCP fora da configuração da atividade: extra');
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
  it('o Claude Code é medido com custo; Cursor e Kimi Code, só com tokens', () => {
    expect(Object.fromEntries(ALL_AI_BASES.map((t) => [t, providerFor(t).measure]))).toEqual({
      claude: 'cost',
      cursor: 'tokens',
      kimi: 'tokens',
    });
  });

  it('o formato que o comando anuncia é o que o leitor do mesmo provider entende', () => {
    // a primeira linha válida de cada formato de stream
    const hello: Record<AiBase, string> = {
      claude: JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
      cursor: JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }),
      kimi: JSON.stringify({ role: 'meta', type: 'system.version', version: '2.1.1' }),
    };
    for (const tool of ALL_AI_BASES) {
      const command = providerFor(tool).command({ prompt: 'p', permission: 'full', structured: true })!;
      expect(command.format, tool).not.toBe('text');
      const reader = providerFor(tool).reader(command.format, { model: null });
      reader.push(hello[tool], 'stdout');
      expect(reader.sawEvent, tool).toBe(true);
    }
  });
});

describe('as origens passam pelo mesmo gateway', () => {
  /** Uma entrada por origem: se o tipo ganhar uma origem nova, este objeto deixa de compilar até ela ser coberta. */
  const ORIGINS: Record<AiRunOrigin, true> = { manual: true, heartbeat: true, autopilot: true, chat: true, test: true };

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

    g.run(call({ origin: 'test' }));
    expect(procs).toHaveLength(5);
    expect(rows().map((r) => r.origin)).toEqual(['manual', 'heartbeat', 'autopilot', 'chat', 'test']);
    expect(new Set(rows().map((r) => r.origin))).toEqual(new Set(Object.keys(ORIGINS)));
    for (const p of procs) p.exit(0);
    expect(rows().map((r) => r.outcome)).toEqual(['done', 'done', 'done', 'done', 'done']);

    // "Sugerir agentes com IA" é uma execução do chat sem pergunta da pessoa: entra pela mesma porta, como origem `chat`
    router.chatCommand({ type: 'ai.suggestAgents' });
    expect(procs).toHaveLength(6);
    procs[5]!.exit(0);
    expect(rows()[5]).toMatchObject({ origin: 'chat', outcome: 'done', cardId: null });
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

  it('o transporte ACP (spawnAcp, ainda protótipo) também só pode ser chamado pelo gateway', () => {
    expect(offenders(/\bspawnAcp\b/, ['extension/ai/gateway.ts', 'extension/ai/acp/run.ts'])).toEqual([]);
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

describe('o contrato v1 não contorna a admissão no gateway', () => {
  function fixture() {
    const executable = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
    fs.writeFileSync(executable, 'binário de teste; não executar', { mode: 0o755 });
    const store = new CapabilityEvidenceStore(path.join(dir, 'evidence'));
    const admission = new ExecutionAdmission({
      pathEnv: () => dir,
      homeDir: dir,
      evidence: store,
      environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
    });
    const request: StrictExecutionRequest = {
      version: 1,
      mcpLevel: { permission: 'board', tools: [] },
      regime: 'exclusive',
      boardTools: { mode: 'inherit' },
      agentTools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
      activeMcpIds: [],
      allowedMcpIds: [],
      boardMcpIds: [],
      mcpServers: [],
      mcpTools: [],
      boardMcpTools: [],
    };
    const base = call();
    const strict: AiCall = { ...base, prepare: () => ({ ...base.prepare(), strict: { profileId: 'claude', request } }) };
    function authorizeFixture() {
      let binding = '';
      try {
        admission.prepare('claude', 'claude', base.prepare().input, dir, request);
      } catch (e) {
        if (!(e instanceof AdmissionBlockedError)) throw e;
        binding = e.decision.binding;
      }
      const now = Date.now();
      for (const capability of EXECUTOR_CAPABILITIES)
        store.record({
          version: 1,
          capability,
          binding,
          source: 'host-probe',
          checkedAt: now - 1,
          expiresAt: now + 60000,
          checks: CAPABILITY_CHECKS[capability].map((id) => ({ id, outcome: 'passed', receipt: 'a'.repeat(64) })),
        });
    }
    const run = (customSpawn = spawn, runLog = createRunLog(db)) =>
      new AiGateway({ boardId: router.boardId, runLog, spawn: customSpawn, admission });
    return { executable, admission, strict, run, authorizeFixture };
  }
  it('sem serviço de admissão, bloqueia sem começar a inferência', () => {
    const { strict } = fixture();
    expect(() => gateway().run(strict)).toThrow('Admissão por capacidades indisponível');
    expect(procs).toHaveLength(0);
    expect(rows()[0]?.outcome).toBe('unsupported');
  });
  it('sem prova local, grava o motivo de bloqueio e não chama beforeSpawn nem spawn', () => {
    const { strict, run } = fixture();
    strict.beforeSpawn = vi.fn();
    expect(() => run().run(strict)).toThrow(AdmissionBlockedError);
    expect(strict.beforeSpawn).not.toHaveBeenCalled();
    expect(procs).toHaveLength(0);
    expect(rows()[0]).toMatchObject({ outcome: 'unsupported', admission: { state: 'blocked', regime: 'exclusive' } });
  });
  it('a cópia não herda recibos; prova própria fica vinculada ao ambiente/configuração', () => {
    const { strict, run, authorizeFixture, executable, admission } = fixture();
    authorizeFixture();
    const profile: import('../src/shared/aiProfiles').AiProfile = {
      id: 'claude-work',
      name: 'Claude Work',
      kind: 'copy',
      base: 'claude',
      enabled: true,
      position: 3,
      config: { command: executable, env: { ACCOUNT: 'work' }, authPatterns: ['private-auth expired'] },
      credentials: { secretRef: 'b'.repeat(64), review: 'reviewed', available: true },
    };
    const copy: AiCall = {
      ...strict,
      tool: profile.id,
      profile,
      prepare: () => {
        const prepared = strict.prepare();
        return { ...prepared, strict: { ...prepared.strict!, profileId: profile.id } };
      },
    };
    expect(() => run().run(copy)).toThrow(AdmissionBlockedError);
    expect(procs).toHaveLength(0);
    let binding = '';
    try {
      admission.prepare(profile, profile.id, copy.prepare().input, dir, copy.prepare().strict!.request);
    } catch (e) {
      if (!(e instanceof AdmissionBlockedError)) throw e;
      binding = e.decision.binding;
    }
    const store = new CapabilityEvidenceStore(path.join(dir, 'evidence')),
      now = Date.now();
    for (const capability of EXECUTOR_CAPABILITIES)
      store.record({
        version: 1,
        capability,
        binding,
        source: 'host-probe',
        checkedAt: now - 1,
        expiresAt: now + 60000,
        checks: CAPABILITY_CHECKS[capability].map((id) => ({ id, outcome: 'passed', receipt: 'a'.repeat(64) })),
      });
    // Recibos sintéticos apenas neste teste; não representam verificação de CLI real.
    const logs: string[] = [];
    const started = run().run({ ...copy, log: (line) => logs.push(line) });
    let authExpired = false;
    started.onExit((end) => {
      authExpired = !!end.authExpired;
    });
    expect(procs).toHaveLength(1);
    procs[0]!.write('private-auth ex');
    procs[0]!.write('pired\n');
    procs[0]!.write(CLAUDE_OUTPUT);
    procs[0]!.exit(0);
    expect(rows().find((r) => r.outcome === 'done')?.tool).toBe(profile.id);
    expect(authExpired).toBe(true);
    expect(logs.join('\n')).not.toContain('private-auth expired');
    profile.config.env = { ACCOUNT: 'personal' };
    expect(() => run().run(copy)).toThrow(AdmissionBlockedError);
    expect(procs).toHaveLength(1);
  });
  it('aplica o conjunto admitido e persiste a decisão antes de chamar o transporte', () => {
    const { strict, run, authorizeFixture } = fixture();
    authorizeFixture(); // Recibos sintéticos do verificador de teste, não validação de CLI real.
    let args: string[] = [];
    const execution = run((command, cwd, out) => {
      expect(rows()[0]?.admission?.state).toBe('admitted');
      args = command.args;
      return spawn(command, cwd, out);
    }).run(strict);
    execution.onExit(() => {});
    expect(args).toContain('dontAsk');
    expect(args).not.toContain('bypassPermissions');
    expect(args.join(' ')).not.toContain('mcp__faz-ai__*');
    procs[0]!.exit(0);
  });
  it('alterar binário na fronteira do launcher bloqueia antes de liberar a ferramenta', () => {
    const { strict, run, authorizeFixture, executable } = fixture();
    authorizeFixture();
    let released = false;
    expect(() =>
      run((_command, _cwd, _out, control) => {
        control!.beforePreparation();
        fs.writeFileSync(executable, 'alterado depois da admissão');
        control!.beforeStart({ pid: process.pid, birth: null, platform: process.platform, groupId: null, generation: 'teste' });
        released = true;
        return { onExit: () => {}, kill: () => {} };
      }).run(strict),
    ).toThrow('mudou');
    expect(released).toBe(false);
    expect(procs).toHaveLength(0);
  });
  it('falha no registro obrigatório não inicia execução mesmo com recibos de teste válidos', () => {
    const { strict, run, authorizeFixture } = fixture();
    authorizeFixture();
    const runLog = createRunLog(db);
    runLog.describeRequired = () => {
      throw new Error('disco cheio');
    };
    expect(() => run(spawn, runLog).run(strict)).toThrow('disco cheio');
    expect(procs).toHaveLength(0);
  });
});
it('o host recusa perfil desligado ou importado antes de preparar arquivos ou iniciar a CLI', () => {
  for (const profile of [null, { id: 'claude', enabled: false }, { id: 'claude', enabled: true, credentials: { review: 'pending' } }]) {
    const prepare = vi.fn(call().prepare);
    const guarded = new AiGateway({ boardId: router.boardId, runLog: createRunLog(db), spawn, profile: () => profile as never });
    expect(() => guarded.run(call({ prepare }))).toThrow('Perfil desativado ou pendente');
    expect(prepare).not.toHaveBeenCalled();
  }
  expect(procs).toHaveLength(0);
  expect(() => providerFor('perfil-customizado')).toThrow('Perfil de CLI ainda não disponível');
});

it('perfil configurável sem contrato não inicia CLI nem assume o provider base', () => {
  const profile: import('../src/shared/aiProfiles').AiProfile = {
    id: 'personalizado',
    name: 'Personalizado',
    kind: 'custom',
    base: 'generic',
    enabled: true,
    position: 3,
    config: { command: 'private-command', env: { TOKEN: 'private-secret' } },
    credentials: { secretRef: 'b'.repeat(64), review: 'reviewed', available: true },
  };
  expect(() => gateway().run(call({ tool: profile.id, profile, origin: 'test' }))).toThrow('contrato e admissão');
  expect(procs).toHaveLength(0);
  expect(rows()[0]).toMatchObject({
    tool: profile.id,
    origin: 'test',
    outcome: 'unsupported',
    measure: 'none',
    inputTokens: null,
    costUsd: null,
  });
});
