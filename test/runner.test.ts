import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { headlessCommand, headlessUnsupported } from '../src/extension/headless';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunner, AUTONOMOUS_ADVICE, PERMISSION_ADVICE, cardPrompt } from '../src/extension/runner';
import type { RunnerDeps } from '../src/extension/runner';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { createRunLog } from '../src/extension/log/runLog';
import { executionPlan } from '../src/extension/execution';
import { monthOf } from '../src/shared/log';
import type { Database } from 'sql.js';

it('AUTONOMOUS_ADVICE manda registrar o pull request e parar na última coluna da IA, sem mover para a conclusão', () => {
  expect(AUTONOMOUS_ADVICE).not.toContain('coluna de conclusão');
  expect(AUTONOMOUS_ADVICE).toContain('set_pull_request');
  expect(AUTONOMOUS_ADVICE).toMatch(/pare/);
});

it('a execução aplica o perfil do card: modelo por parâmetro, servidores MCP num arquivo temporário e o resto no prompt', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { executionPlan } = await import('../src/extension/execution');
  const { openInMemory } = await import('../src/extension/db/database');
  const { MessageRouter } = await import('../src/extension/panel/messageRouter');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-exec-')));
  const project = path.join(root, 'p');
  const home = path.join(root, 'h');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  fs.writeFileSync(
    path.join(project, '.mcp.json'),
    JSON.stringify({
      mcpServers: { 'faz-ai': { command: 'node' }, github: { command: 'gh-mcp', env: { TOKEN: 'segredo' } }, slack: { command: 'slack' } },
    }),
  );
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'a'),
    workspaceDir: project,
    homeDir: home,
  });
  const base = { purpose: '', agent: '', skills: [], tools: [], deniedTools: [], model: '', clean: false, isDefault: true };
  router.handle({
    type: 'settings.execProfiles.set',
    profiles: [{ ...base, id: 'p', name: 'Restrito', mcpServers: ['github'], deniedTools: ['WebFetch'] }],
  });
  const s0 = router.snapshot();
  const cardId = router.createCard({ typeId: s0.cardTypes[0]!.id, columnId: s0.columns[0]!.id, parentId: null, title: 'x' });
  const card = () => router.snapshot().cards.find((c) => c.id === cardId)!;

  const plan = executionPlan(router.snapshot(), card(), project, home);
  expect(JSON.parse(plan.input.mcpConfig!)).toEqual({
    mcpServers: { 'faz-ai': { command: 'node' }, github: { command: 'gh-mcp', env: { TOKEN: 'segredo' } } },
  });
  expect(plan.input.mcpBlocked).toEqual(['slack']);
  expect(plan.advice).toEqual([]); // no Claude Code tudo isso vai por parâmetro
  expect(plan.summary.join(' | ')).toContain('Servidores MCP: faz-ai, github (imposto)');
  expect(plan.summary.join(' | ')).not.toContain('segredo');

  // o arquivo temporário existe enquanto o processo roda, só para o dono, e some ao terminar
  let exit: (code: number | null) => void = () => {};
  let seen: { file: string; mode: number; content: string } | undefined;
  const runner = new AiRunner(router, {
    cwd: project,
    homeDir: home,
    log: () => {},
    spawn: (command) => {
      const file = command.args[command.args.indexOf('--mcp-config') + 1]!;
      seen = { file, mode: fs.statSync(file).mode & 0o777, content: fs.readFileSync(file, 'utf8') };
      return {
        kill: () => {},
        onExit: (fn) => {
          exit = (code) => fn(code);
        },
      };
    },
  });
  runner.start(cardId);
  expect(seen!.mode).toBe(0o600);
  expect(JSON.parse(seen!.content).mcpServers.slack).toBeUndefined();
  exit(0);
  expect(fs.existsSync(seen!.file)).toBe(false);

  // noutra ferramenta, o que não vai por parâmetro vira instrução no prompt
  router.handle({ type: 'settings.board.update', patch: { aiTool: 'kimi' } });
  expect(executionPlan(router.snapshot(), card(), project, home).advice).toEqual([
    'De servidores MCP, use só o do board e: github.',
    'Não use estas ferramentas: WebFetch.',
  ]);

  // sem o servidor do board registrado, a execução restrita não começa
  router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude' } });
  fs.writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } } }));
  router.refreshHarness();
  expect(() => executionPlan(router.snapshot(), card(), project, home)).toThrow('servidor do board não está registrado');
  fs.rmSync(root, { recursive: true, force: true });
});

it('o prompt da execução leva as skills do card pelo caminho', () => {
  expect(cardPrompt('#1')).not.toContain('skills, obrigatórias');
  expect(cardPrompt('#1', [{ name: 'commit', path: '/home/.claude/skills/commit/SKILL.md' }, { name: 'sumida' }])).toContain(
    'leia estas skills, obrigatórias para este card: commit (/home/.claude/skills/commit/SKILL.md).',
  );
});

it('com triage=true, o bloco de triagem entra antes do trabalho da fase; sem triage, o prompt não muda', () => {
  const semTriage = cardPrompt('#1', [], [], false);
  expect(semTriage).toBe(cardPrompt('#1')); // default (omitido) é idêntico, byte a byte, ao atual
  expect(semTriage).not.toContain('Tags, Esforço da atividade, Modelo e Skills');

  const comTriage = cardPrompt('#1', [], [], false, true);
  expect(comTriage).toContain('Tags, Esforço da atividade, Modelo e Skills');
  expect(comTriage.indexOf('Tags, Esforço da atividade, Modelo e Skills')).toBeLessThan(comTriage.indexOf('Faça o trabalho da fase'));
});
import type { HeadlessCommand } from '../src/extension/headless';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let db: Database;
let router: MessageRouter;
let runner: AiRunner;
/** as dependências do executor, para montar um segundo executor (com log) sobre o mesmo board */
let deps: RunnerDeps;
let log: string[];
/** processos iniciados pelo executor, na ordem; `exit` simula o fim do processo */
let procs: { command: HeadlessCommand; cwd: string; killed: boolean; exit(code: number | null, error?: Error): void }[];
let storyId: string;

const card = () => router.snapshot().cards.find((c) => c.id === storyId)!;
const lastMessage = () =>
  router
    .snapshot()
    .comments.filter((c) => c.cardId === storyId)
    .at(-1);
/** o que a IA faria pelo MCP durante a execução */
const ai = (msg: Parameters<MessageRouter['handle']>[0]) => router.handle(msg, { author: 'Claude Code', source: 'ai' });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-runner-'));
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
  });
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  storyId = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.name === 'Discovery')!.id,
    parentId: null,
    title: 'Login',
  });
  log = [];
  procs = [];
  // sem `runLog`: o executor padrão dos testes é o de um board sem log, que tem de funcionar como antes
  deps = {
    cwd: dir,
    log: (line) => log.push(line),
    spawn: (command, cwd, out) => {
      let listener: (code: number | null, error?: Error) => void = () => {};
      const proc = {
        command,
        cwd,
        killed: false,
        exit: (code: number | null, error?: Error) => listener(code, error),
      };
      procs.push(proc);
      out('saída da ferramenta\n', 'stdout');
      return {
        onExit: (fn) => (listener = fn),
        kill: () => {
          proc.killed = true;
          proc.exit(null);
        },
      };
    },
  };
  runner = new AiRunner(router, deps);
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(`${dir}.worktrees`, { recursive: true, force: true });
});

describe('executor da IA', () => {
  it('roda a ferramenta do projeto para o card e marca "Em execução"', () => {
    runner.start(storyId);
    expect(procs).toHaveLength(1);
    expect(procs[0]!.cwd).toBe(dir);
    expect(procs[0]!.command).toEqual(
      headlessCommand('claude', {
        prompt: cardPrompt('#1', [], [PERMISSION_ADVICE.board!], false, true),
        permission: 'board',
        addDirs: [`${dir}.worktrees`],
      }),
    );
    expect(card()).toMatchObject({ status: 'running', statusBy: 'Claude Code' });
    expect(router.snapshot().aiRuns).toEqual([storyId]);
    expect(log.join('\n')).toContain('[#1] saída da ferramenta');
    expect(() => runner.start(storyId)).toThrow('já está trabalhando');

    // a IA passou a vez por conta própria: o status dela vale
    ai({ type: 'card.status.set', cardId: storyId, status: 'waiting_review', note: 'Discovery pronto' });
    procs[0]!.exit(0);
    expect(card().status).toBe('waiting_review');
    expect(router.snapshot().aiRuns).toEqual([]);
    expect(runner.isRunning(storyId)).toBe(false);
  });

  it('se a IA só respondeu na conversa, a vez passa para a pessoa', () => {
    runner.start(storyId);
    ai({ type: 'comment.add', cardId: storyId, body: 'Entendi. Qual o provedor de login?' });
    procs[0]!.exit(0);
    expect(card().status).toBe('waiting_answer');
  });

  describe('modo autônomo (YOLO)', () => {
    const yolo = () => router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });

    it('roda sem restrições, mesmo com a permissão do board mais baixa, e leva as regras do modo no prompt', () => {
      yolo();
      runner.start(storyId);
      expect(procs[0]!.command).toEqual(
        headlessCommand('claude', {
          prompt: cardPrompt('#1', [], [], true, true),
          permission: 'full',
          addDirs: [`${dir}.worktrees`],
        }),
      );
      expect(procs[0]!.command.args).toContain('bypassPermissions');
      expect(procs[0]!.command.stdin).toContain('MODO AUTÔNOMO');
      expect(procs[0]!.command.stdin).toContain('Não faça o merge');
      expect(log.join('\n')).toContain('Modo autônomo (YOLO)');
    });

    it('sem o modo, o prompt e a permissão seguem o board', () => {
      runner.start(storyId);
      expect(procs[0]!.command.stdin).not.toContain('MODO AUTÔNOMO');
      expect(procs[0]!.command.args).not.toContain('bypassPermissions');
    });

    it('a sub-tarefa roda no modo da história', () => {
      yolo();
      const s = router.snapshot();
      const wf = s.workflows.find((w) => w.kind === 'child')!;
      const subId = router.createCard({
        typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
        columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
        parentId: storyId,
        title: 'Passo',
      });
      runner.start(subId);
      expect(procs[0]!.command.stdin).toContain('MODO AUTÔNOMO');
    });

    it('se a IA só respondeu na conversa, o card volta para ela em vez de esperar uma pessoa', () => {
      yolo();
      runner.start(storyId);
      ai({ type: 'comment.add', cardId: storyId, body: 'Decidi usar Google.' });
      procs[0]!.exit(0);
      expect(card().status).toBe('ready');
    });
  });

  it('falha, saída sem resposta e tempo limite bloqueiam o card com o motivo na conversa', () => {
    runner.start(storyId);
    procs[0]!.exit(2);
    expect(card()).toMatchObject({ status: 'blocked' });
    expect(card().statusReason).toContain('código 2');
    // o fim da saída da ferramenta vai junto, para a falha ser entendida no próprio card
    expect(card().statusReason).toContain('saída da ferramenta');
    expect(lastMessage()).toMatchObject({ author: 'Faz AI', source: 'ai' });

    runner.start(storyId);
    procs[1]!.exit(null, new Error('comando "claude" não encontrado.'));
    expect(card().statusReason).toContain('não encontrado');

    runner.start(storyId);
    procs[2]!.exit(0);
    expect(card().statusReason).toContain('sem responder');

    vi.useFakeTimers();
    router.handle({ type: 'settings.board.update', patch: { runner: { timeoutMinutes: 5 } } });
    runner.start(storyId);
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(procs[3]!.killed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(procs[3]!.killed).toBe(true);
    expect(card().statusReason).toContain('tempo limite');
  });

  it('parar devolve o card ao status anterior', () => {
    router.handle({ type: 'card.status.set', cardId: storyId, status: 'waiting_review' });
    runner.start(storyId);
    expect(card().status).toBe('running');
    runner.stop(storyId);
    expect(procs[0]!.killed).toBe(true);
    expect(card().status).toBe('waiting_review');
    expect(router.snapshot().comments).toHaveLength(0);
  });

  it('ferramenta que só roda sem restrições: avisa em vez de rodar com permissão menor', () => {
    for (const tool of ['cursor', 'kimi'] as const) {
      router.handle({ type: 'settings.board.update', patch: { aiTool: tool, runner: { permission: 'edits' } } });
      expect(router.snapshot().aiRunUnsupported).toContain('Sem restrições');
      expect(() => runner.start(storyId)).toThrow('Sem restrições');
      expect(procs).toHaveLength(0);
    }
    router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'full' } } });
    expect(router.snapshot().aiRunUnsupported).toBeNull();
    runner.start(storyId);
    expect(procs[0]!.command).toEqual({
      command: 'kimi',
      args: ['-p', cardPrompt('#1', [], [], false, true), '--add-dir', `${dir}.worktrees`],
      format: 'text',
    });
  });

  it('monta o comando de cada ferramenta conforme a permissão', () => {
    const cmd = (tool: Parameters<typeof headlessCommand>[0], permission: 'board' | 'edits' | 'full') =>
      headlessCommand(tool, { prompt: 'P', permission });
    expect(cmd('claude', 'board')).toEqual({
      command: 'claude',
      args: ['-p', '--permission-mode', 'dontAsk', '--allowedTools', 'mcp__faz-ai__*', 'Read', 'Glob', 'Grep'],
      stdin: 'P',
      format: 'text',
    });
    expect(cmd('claude', 'edits')).toMatchObject({ args: ['-p', '--permission-mode', 'acceptEdits', '--allowedTools', 'mcp__faz-ai__*'] });
    expect(cmd('claude', 'full')).toMatchObject({ args: ['-p', '--permission-mode', 'bypassPermissions'] });
    expect(cmd('codex', 'edits')).toEqual({
      command: 'codex',
      args: [
        'exec',
        '--sandbox',
        'workspace-write',
        '--skip-git-repo-check',
        '-c',
        'mcp_servers.faz-ai.default_tools_approval_mode="approve"',
        '-',
      ],
      stdin: 'P',
      format: 'text',
    });
    expect(cmd('copilot', 'board')).toEqual({
      command: 'copilot',
      args: ['-p', 'P', '--allow-tool=faz-ai', '--allow-tool=read', '--no-ask-user'],
      env: { GITHUB_COPILOT_PROMPT_MODE_WORKSPACE_MCP: 'true' },
      format: 'text',
    });
    expect(cmd('cursor', 'full')).toEqual({ command: 'agent', args: ['-p', '--force', '--approve-mcps', '--trust', 'P'], format: 'text' });
    expect(headlessUnsupported('claude', 'board')).toBeNull();
    expect(headlessUnsupported('cursor', 'board')).toContain('Cursor');
  });

  it('o Claude Code recebe o servidor do board na linha de comando, sem depender do registro no projeto', () => {
    const boardServer = { command: 'node', args: ['/dados/mcp/bridge.js', '/projeto'] };
    const built = headlessCommand('claude', { prompt: 'P', permission: 'board', boardServer }) as HeadlessCommand;
    expect(built.args.slice(-2)).toEqual(['--mcp-config', '{tmp:mcp.json}']);
    expect(built.args).not.toContain('--strict-mcp-config');
    expect(JSON.parse(built.tempFiles!['mcp.json']!)).toEqual({ mcpServers: { 'faz-ai': { type: 'stdio', ...boardServer } } });
    // as outras ferramentas continuam lendo o registro feito por "Conectar ao board"
    expect(headlessCommand('codex', { prompt: 'P', permission: 'board', boardServer })).not.toHaveProperty('tempFiles');
  });

  it('avisa a IA do limite da execução, para ela explicar à pessoa onde mudar', () => {
    runner.start(storyId);
    expect(procs[0]!.command.stdin).toContain('alterar arquivos e rodar comandos está bloqueado');
    procs[0]!.exit(0);
    router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'full' } } });
    runner.start(storyId);
    expect(procs[1]!.command.stdin).not.toContain('block_card explicando');
  });

  it('guarda permissão e tempo limite, recusando valores inválidos', () => {
    expect(router.snapshot().board.runner).toEqual({
      permission: 'board',
      timeoutMinutes: 30,
      heartbeat: false,
      heartbeatMinutes: 60,
      parallel: false,
      parallelStories: 2,
    });
    router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'edits', timeoutMinutes: 999 } } });
    expect(router.snapshot().board.runner).toMatchObject({ permission: 'edits', timeoutMinutes: 240 });
    router.handle({ type: 'settings.board.update', patch: { runner: { heartbeat: true, heartbeatMinutes: 1 } } });
    expect(router.snapshot().board.runner).toMatchObject({ heartbeat: true, heartbeatMinutes: 5 });
    // histórias ao mesmo tempo: entre 2 e 6, e o paralelo nasce desligado
    router.handle({ type: 'settings.board.update', patch: { runner: { parallelStories: 99 } } });
    expect(router.snapshot().board.runner.parallelStories).toBe(6);
    router.handle({ type: 'settings.board.update', patch: { runner: { parallelStories: 1 } } });
    expect(router.snapshot().board.runner.parallelStories).toBe(2);
    router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'tudo' as never } } });
    expect(router.snapshot().board.runner.permission).toBe('board'); // valor desconhecido volta ao mais restrito
  });
});

/**
 * O log das execuções de IA (RF-13 a RF-20). O executor dos testes acima não tem `runLog`: aqui um
 * segundo executor, com log, roda sobre o mesmo board e o mesmo banco.
 */
describe('log das execuções de IA', () => {
  let logged: AiRunner;
  let runs: AiRunRepo;

  beforeEach(() => {
    runs = new AiRunRepo(db);
    logged = new AiRunner(router, { ...deps, runLog: createRunLog(db, (line) => log.push(line)) });
  });

  /** as execuções gravadas neste mês, da mais antiga para a mais recente */
  const rows = () => runs.byMonth(monthOf(Date.now()));
  const only = () => {
    expect(rows()).toHaveLength(1);
    return rows()[0]!;
  };
  /** uma coluna de `ai_runs` lida crua, para distinguir NULL de 0 */
  const raw = (column: string): unknown[] => db.exec(`SELECT ${column} FROM ai_runs`)[0]!.values.map((v) => v[0]);

  it('RF-13: a linha existe desde o começo da execução, aberta e sem desfecho', () => {
    logged.start(storyId);
    expect(only()).toMatchObject({ endedAt: null, durationMs: null, outcome: null, exitCode: null, origin: 'manual' });
    expect(only().startedAt).toBeGreaterThan(0);
  });

  it('RF-14: o contexto é o do momento da chamada e não segue o card que a IA move durante a execução', () => {
    const backlog = router.snapshot().columns.find((c) => c.name === 'Backlog')!.id;
    logged.start(storyId);
    ai({ type: 'card.move', cardId: storyId, columnId: backlog, position: 0 });
    procs[0]!.exit(0);
    expect(card().columnId).toBe(backlog);
    expect(only()).toMatchObject({
      cardNumber: 1,
      cardTitle: 'Login',
      cardType: 'História',
      workflow: 'Histórias',
      columnName: 'Discovery',
      phase: 'Discovery',
      tool: 'claude',
    });
  });

  it('RF-15: a configuração gravada é a mesma que o resumo manda para o canal de log', () => {
    // o perfil restringe os servidores MCP, e para isso o Claude Code precisa ver o do board na pasta
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { 'faz-ai': { command: 'node' } } }));
    router.refreshHarness();
    const o = router.snapshot().board.modelCatalog.find((m) => m.tool === 'claude' && m.efforts.length > 0)!;
    const base = { purpose: '', skills: ['sql-queries'], tools: [], deniedTools: ['WebFetch'], isDefault: true };
    router.handle({
      type: 'settings.execProfiles.set',
      profiles: [{ ...base, id: 'p', name: 'Restrito', agent: 'revisor', model: `${o.id}@${o.efforts[0]}`, clean: true, mcpServers: [] }],
    });
    const summary = executionPlan(router.snapshot(), card(), dir, '').summary.join(' | ');
    logged.start(storyId);

    const row = only();
    expect(row).toMatchObject({
      model: o.model,
      effort: o.efforts[0],
      profile: 'Restrito',
      agent: 'revisor',
      permission: 'board',
      autonomous: false,
      clean: true,
      skills: ['sql-queries'],
      mcp: [],
    });
    // o que foi gravado tem de aparecer no resumo que a pessoa lê no canal de log: uma verdade só
    expect(summary).toContain(`Agente do board: ${row.profile}`);
    expect(summary).toContain(`Subagente da ferramenta: ${row.agent}`);
    expect(summary).toContain(`Skills: ${row.skills.join(', ')}`);
    expect(summary).toContain(`Modelo: ${row.model} · ${row.effort}`);
    expect(summary).toContain('Sessão limpa');
    expect(log.join('\n')).toContain(summary);
  });

  it('RF-15: sem perfil e sem modelo, o não definido fica NULL — nunca string vazia nem zero', () => {
    logged.start(storyId);
    // sem modelo escolhido a execução usa o padrão da ferramenta, que o board não conhece: não definido
    expect(only()).toMatchObject({ model: null, effort: null, skills: [], mcp: null });
    // o subagente é dimensão desta execução e nenhum foi escolhido: definido e vazio, não "não se aplica"
    expect(only().agent).toBe('');
    // o perfil, ao contrário, existe sempre num card: o board tem um agente padrão
    expect(only().profile).toBe('Agente padrão');
    expect(raw('model')).toEqual([null]);
    expect(raw('effort')).toEqual([null]);
    expect(raw('mcp_json')).toEqual([null]);
  });

  it('RF-15: em modo autônomo grava permissão sem restrições e autonomous', () => {
    router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });
    logged.start(storyId);
    expect(only()).toMatchObject({ permission: 'full', autonomous: true });
  });

  it('RF-16: a origem é "manual" por padrão e a informada quando o heartbeat ou o autopiloto chamam', () => {
    logged.start(storyId, 'heartbeat');
    procs[0]!.exit(0);
    logged.start(storyId, 'autopilot');
    procs[1]!.exit(0);
    logged.start(storyId);
    expect(rows().map((r) => r.origin)).toEqual(['heartbeat', 'autopilot', 'manual']);
  });

  it('RF-17: terminar bem grava done, com ended_at, duração e o código de saída', () => {
    logged.start(storyId);
    procs[0]!.exit(0);
    const row = only();
    expect(row).toMatchObject({ outcome: 'done', exitCode: 0 });
    expect(row.endedAt).toBeGreaterThanOrEqual(row.startedAt);
    expect(row.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('RF-17: código diferente de zero e erro ao executar gravam failed, com o código quando houver', () => {
    logged.start(storyId);
    procs[0]!.exit(2);
    expect(rows()[0]).toMatchObject({ outcome: 'failed', exitCode: 2 });

    logged.start(storyId);
    procs[1]!.exit(null, new Error('comando "claude" não encontrado.'));
    expect(rows()[1]).toMatchObject({ outcome: 'failed', exitCode: null });
  });

  it('RF-17: interromper grava stopped, não failed, mesmo com o processo morrendo com código', () => {
    logged.start(storyId);
    logged.stop(storyId);
    expect(procs[0]!.killed).toBe(true);
    expect(only()).toMatchObject({ outcome: 'stopped' });
  });

  it('RF-17: o tempo limite grava timeout, não failed', () => {
    vi.useFakeTimers();
    router.handle({ type: 'settings.board.update', patch: { runner: { timeoutMinutes: 5 } } });
    logged.start(storyId);
    vi.advanceTimersByTime(5 * 60_000);
    expect(only()).toMatchObject({ outcome: 'timeout' });
  });

  it('RF-17: a ferramenta sem suporte fecha a linha com unsupported antes de o erro subir', () => {
    // o Cursor em segundo plano não aceita limite por linha de comando: com permissão menor, não roda
    router.handle({ type: 'settings.board.update', patch: { aiTool: 'cursor', runner: { permission: 'edits' } } });
    expect(() => logged.start(storyId)).toThrow('Sem restrições');
    expect(procs).toHaveLength(0);
    // a tentativa também é informação: a linha existe, fechada, com a ferramenta que não deu
    expect(only()).toMatchObject({ outcome: 'unsupported', tool: 'cursor' });
    // a duração existe e é curta (o tempo até descobrir que não dá); só 'unknown' fica sem duração
    expect(only().durationMs).toBeGreaterThanOrEqual(0);
  });

  it('RF-18: as execuções que a sessão anterior não fechou viram unknown, sem duração', () => {
    logged.start(storyId);
    createRunLog(db).closeOpen(Date.now());
    expect(only()).toMatchObject({ outcome: 'unknown', durationMs: null });
    expect(only().endedAt).toBeGreaterThan(0);
  });

  it('RF-19: consumo e custo ficam NULL, não zero — "não medido" é diferente de "custou nada"', () => {
    logged.start(storyId);
    procs[0]!.exit(0);
    for (const column of ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'cost_usd'])
      expect(raw(column)).toEqual([null]);
  });

  it('RF-20: com o resolvedor ligado, os eventos do card apontam para a execução em curso', () => {
    router.setRunResolver((cardId) => logged.runIdOf(cardId));
    const events = new CardEventRepo(db);
    logged.start(storyId);
    const runId = only().id;
    expect(logged.runIdOf(storyId)).toBe(runId);
    ai({ type: 'comment.add', cardId: storyId, body: 'Discovery pronto.' });
    procs[0]!.exit(0);

    const comment = events.byCard(1).find((e) => e.kind === 'comment')!;
    expect(comment.runId).toBe(runId);
    // a execução terminou: o que a pessoa fizer depois não é mais dela
    expect(logged.runIdOf(storyId)).toBeNull();
    router.handle({ type: 'comment.add', cardId: storyId, body: 'Obrigado.' });
    expect(
      events
        .byCard(1)
        .filter((e) => e.kind === 'comment')
        .at(-1)!.runId,
    ).toBeNull();
  });

  it('RF-20: o desfecho da execução ainda é dela: o bloqueio de uma falha fica ligado à execução', () => {
    router.setRunResolver((cardId) => logged.runIdOf(cardId));
    const events = new CardEventRepo(db);
    logged.start(storyId);
    const runId = only().id;
    procs[0]!.exit(2);
    expect(card().status).toBe('blocked');
    expect(
      events
        .byCard(1)
        .filter((e) => e.kind === 'status_changed')
        .at(-1)!.runId,
    ).toBe(runId);
  });

  it('falha no log não derruba a execução: vai para o canal de log e a IA roda igual', () => {
    db.run('DROP TABLE ai_runs');
    logged.start(storyId);
    expect(procs).toHaveLength(1);
    expect(card().status).toBe('running');
    procs[0]!.exit(0);
    expect(log.join('\n')).toContain('[fazai] falha ao registrar a execução de IA:');
  });

  it('sem runLog o executor não grava nada e funciona como antes', () => {
    runner.start(storyId);
    procs[0]!.exit(0);
    expect(rows()).toEqual([]);
    expect(runner.runIdOf(storyId)).toBeNull();
  });
});
