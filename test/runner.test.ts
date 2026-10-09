import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { CURSOR_TOOLS, headlessCommand, headlessUnsupported } from '../src/extension/headless';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunner, AUTONOMOUS_ADVICE, PERMISSION_ADVICE, cardPrompt, consumptionLine, summarizePrompt } from '../src/extension/runner';
import type { RunnerDeps } from '../src/extension/runner';
import type { SpawnFn } from '../src/extension/aiOutput/measured';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { createRunLog } from '../src/extension/log/runLog';
import { gatewayFor } from './helpers/gateway';
import { executionPlan } from '../src/extension/execution';
import { monthOf, type RunReport } from '../src/shared/log';
import { parseRunner } from '../src/shared/runner';
import { TYPE_CONDITION, modelValue } from '../src/shared/models';
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
  // o agente é um arquivo na pasta global da ferramenta, marcado como disponível e padrão do board
  router.handle({
    type: 'harness.agent.create',
    input: {
      name: 'restrito',
      description: 'Restrito',
      body: 'Siga.',
      model: '',
      tools: [],
      deniedTools: ['WebFetch'],
      skills: [],
      mcp: ['github'],
    },
  });
  router.handle({ type: 'settings.board.update', patch: { runner: { defaultAgent: 'restrito' } } });
  const s0 = router.snapshot();
  const cardId = router.createCard({ typeId: s0.cardTypes[0]!.id, columnId: s0.columns[0]!.id, parentId: null, title: 'x' });
  const card = () => router.snapshot().cards.find((c) => c.id === cardId)!;

  const plan = executionPlan(router.snapshot(), card(), project, home);
  expect(JSON.parse(plan.input.mcpConfig!)).toEqual({
    mcpServers: { 'faz-ai': { command: 'node' }, github: { command: 'gh-mcp', env: { TOKEN: 'segredo' } } },
  });
  expect(plan.input.mcpBlocked).toEqual(['slack']);
  expect(plan.advice).toEqual([]); // no Claude Code tudo isso vai por parâmetro, inclusive o agente (inline)
  expect(plan.input.agentDefinition).toEqual({ name: 'restrito', description: 'Restrito', prompt: 'Siga.' });
  expect(plan.summary.join(' | ')).toContain('Servidores MCP: faz-ai, github (imposto)');
  expect(plan.summary.join(' | ')).not.toContain('segredo');

  // o arquivo temporário existe enquanto o processo roda, só para o dono, e some ao terminar
  let exit: (code: number | null) => void = () => {};
  let seen: { file: string; mode: number; content: string } | undefined;
  const runner = new AiRunner(router, {
    cwd: project,
    homeDir: home,
    log: () => {},
    gateway: gatewayFor(router, db, (command) => {
      const file = command.args[command.args.indexOf('--mcp-config') + 1]!;
      seen = { file, mode: fs.statSync(file).mode & 0o777, content: fs.readFileSync(file, 'utf8') };
      return {
        kill: () => {},
        onExit: (fn) => {
          exit = (code) => fn(code);
        },
      };
    }),
  });
  runner.start(cardId);
  expect(seen!.mode).toBe(0o600);
  expect(JSON.parse(seen!.content).mcpServers.slack).toBeUndefined();
  exit(0);
  expect(fs.existsSync(seen!.file)).toBe(false);

  // noutra ferramenta, o que não vai por parâmetro vira instrução no prompt
  router.handle({ type: 'settings.board.update', patch: { aiTool: 'cursor' } });
  expect(executionPlan(router.snapshot(), card(), project, home).advice).toEqual([
    'De servidores MCP, use só o do board.',
    'Use só as rules, as skills e as instruções indicadas neste pedido; ignore instruções, skills e agentes carregados por conta própria.',
  ]);

  // sem o servidor do board registrado, a execução restrita não começa
  router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude' } });
  fs.writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } } }));
  router.refreshHarness();
  expect(() => executionPlan(router.snapshot(), card(), project, home)).toThrow('servidor do board não está registrado');
  // com o servidor da execução, o registro em arquivo não é preciso, e o de arquivo (de outra pasta) não vale
  const server = { command: '/usr/bin/node', args: ['/dados/bridge.js', project] };
  expect(JSON.parse(executionPlan(router.snapshot(), card(), project, home, server).input.mcpConfig!).mcpServers['faz-ai']).toEqual({
    type: 'stdio',
    ...server,
  });
  // os servidores da pasta no ~/.claude.json valem com o caminho escrito de outro jeito (o Claude Code grava com /)
  fs.writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: {} }));
  fs.writeFileSync(
    path.join(home, '.claude.json'),
    JSON.stringify({ projects: { [`${project}/`]: { mcpServers: { github: { command: 'gh-mcp' } } } } }),
  );
  expect(JSON.parse(executionPlan(router.snapshot(), card(), project, home, server).input.mcpConfig!).mcpServers.github).toEqual({
    command: 'gh-mcp',
  });
  fs.rmSync(root, { recursive: true, force: true });
});

it('a história leva os outros agentes do board como subagentes, e o agente dela ganha a ferramenta de delegar; a sub-tarefa roda só com o dela', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { executionPlan } = await import('../src/extension/execution');
  const { openInMemory } = await import('../src/extension/db/database');
  const { MessageRouter } = await import('../src/extension/panel/messageRouter');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-deleg-')));
  const project = path.join(root, 'p');
  const home = path.join(root, 'h');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  const db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'P',
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'a'),
    workspaceDir: project,
    homeDir: home,
  });
  const option = router.snapshot().board.modelCatalog.find((o) => o.tool === 'claude')!;
  const agent = (name: string, tools: string[], model = '') =>
    router.handle({
      type: 'harness.agent.create',
      input: { name, description: `Agente ${name}`, body: `Instruções de ${name}.`, model, tools, deniedTools: [], skills: [], mcp: [] },
    });
  agent('condutor', ['Read', 'Grep', 'Glob']);
  agent('backend-node', ['Read', 'Edit', 'Bash'], `${option.id}@${option.efforts[0]}`);
  router.handle({ type: 'settings.board.update', patch: { runner: { defaultAgent: 'condutor' } } });
  const s0 = router.snapshot();
  const parent = s0.workflows.find((w) => w.kind === 'parent')!;
  const child = s0.workflows.find((w) => w.kind === 'child')!;
  const storyId = router.createCard({
    typeId: s0.cardTypes.find((t) => t.defaultWorkflowId === parent.id)!.id,
    columnId: s0.columns.find((c) => c.workflowId === parent.id)!.id,
    parentId: null,
    title: 'História',
  });
  const taskId = router.createCard({
    typeId: s0.cardTypes.find((t) => t.defaultWorkflowId === child.id)!.id,
    columnId: s0.columns.find((c) => c.workflowId === child.id)!.id,
    parentId: storyId,
    title: 'Passo',
  });
  const backend = router.snapshot().board.execProfiles.find((p) => p.id === 'backend-node')!;
  router.handle({ type: 'card.execProfile.set', cardId: taskId, profileId: backend.id });
  const server = { command: 'node', args: ['b.js'] };
  const of = (id: string) =>
    executionPlan(
      router.snapshot(),
      router.snapshot().cards.find((c) => c.id === id)!,
      project,
      home,
      server,
    );

  // a história: a sessão fica com todas as ferramentas (sem `--tools`), o condutor leva as dele mais a de
  // lançar subagentes, e o especialista vai inline com as ferramentas e o modelo do arquivo dele
  const story = of(storyId);
  expect(story.input.tools).toEqual([]);
  // toda lista de ferramentas num agente é fechada e deixaria o servidor do board de fora: ele vai junto
  expect(story.input.agentDefinition).toMatchObject({ name: 'condutor', tools: ['Read', 'Grep', 'Glob', 'Agent', 'mcp__faz-ai__*'] });
  expect(story.input.delegates).toEqual([
    {
      name: 'backend-node',
      description: 'Agente backend-node',
      prompt: 'Instruções de backend-node.',
      tools: ['Read', 'Edit', 'Bash', 'mcp__faz-ai__*'],
      model: option.model,
    },
  ]);
  expect(story.advice).toEqual([]);
  expect(story.summary.join(' | ')).toContain('Subagentes: backend-node (inline)');
  expect(story.summary.join(' | ')).toContain('Ferramentas do agente: Read, Grep, Glob, Agent, mcp__faz-ai__* (no agente)');
  expect(story.summary.join(' | ')).not.toContain('Ferramentas: ');

  // a sub-tarefa roda com o agente dela, com as ferramentas impostas, e sem subagentes
  const task = of(taskId);
  expect(task.input.agentDefinition).toEqual({
    name: 'backend-node',
    description: 'Agente backend-node',
    prompt: 'Instruções de backend-node.',
  });
  expect(task.input.delegates).toEqual([]);
  expect(task.input.tools).toEqual(['Read', 'Edit', 'Bash']);
  fs.rmSync(root, { recursive: true, force: true });
});

it('o prompt da execução leva o contexto fixo do board e o do card pelo caminho, e não cita mais a skill do fluxo por nome', () => {
  expect(cardPrompt('#1')).not.toContain('Contexto fixo');
  expect(cardPrompt('#1')).not.toContain('faz-ai-fluxo');
  const prompt = cardPrompt('#1', {
    always: ['Contexto fixo deste board. Antes de começar, leia e siga: skill faz-ai-fluxo (/home/.claude/skills/faz-ai-fluxo/SKILL.md).'],
    card: ['Este card exige também: rule CLAUDE.md (/p/CLAUDE.md); skill commit (/home/.claude/skills/commit/SKILL.md).'],
  });
  expect(prompt.indexOf('Contexto fixo')).toBeLessThan(prompt.indexOf('Este card exige também'));
  expect(prompt.indexOf('Este card exige também')).toBeLessThan(prompt.indexOf('Leia o card com get_card'));
});

it('com triage=true, o bloco de triagem entra antes do trabalho da fase; sem triage, o prompt não muda', () => {
  const semTriage = cardPrompt('#1', undefined, [], false);
  expect(semTriage).toBe(cardPrompt('#1')); // default (omitido) é idêntico, byte a byte, ao atual
  expect(semTriage).not.toContain('Tags, Esforço da atividade, Modelo e Skills');

  const comTriage = cardPrompt('#1', undefined, [], false, true);
  expect(comTriage).toContain('Tags, Esforço da atividade, Modelo e Skills');
  expect(comTriage.indexOf('Tags, Esforço da atividade, Modelo e Skills')).toBeLessThan(comTriage.indexOf('Faça o trabalho da fase'));
});

it('summarizePrompt pede um resumo nas três seções e leva o contexto fixo e o do card', () => {
  expect(summarizePrompt('#1')).toContain('Decisões');
  expect(summarizePrompt('#1')).toContain('Observações');
  expect(summarizePrompt('#1')).toContain('Pendências');
  expect(summarizePrompt('#1')).toContain('add_comment');
  expect(summarizePrompt('#1')).toContain('kind: "summary"');
  const prompt = summarizePrompt('#1', {
    always: ['Contexto fixo deste board. Antes de começar, leia e siga: skill faz-ai-fluxo (/home/.claude/skills/faz-ai-fluxo/SKILL.md).'],
    card: ['Este card exige também: rule CLAUDE.md (/p/CLAUDE.md).'],
  });
  expect(prompt).toContain('Contexto fixo deste board');
  expect(prompt).toContain('Este card exige também');
  expect(prompt.indexOf('Pendências')).toBeLessThan(prompt.indexOf('Contexto fixo deste board'));
  expect(prompt.indexOf('Contexto fixo deste board')).toBeLessThan(prompt.indexOf('Este card exige também'));
});
import type { HeadlessCommand } from '../src/extension/headless';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
/** a saída real do Claude Code no modo estruturado, capturada no probe da #70 */
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-stream-json.jsonl'), 'utf8');
/** o mesmo fluxo cortado antes dos eventos finais: a execução que morre no meio */
const HALF = FIXTURE.slice(0, FIXTURE.indexOf('{"duration_api_ms"'));

let dir: string;
let db: Database;
let router: MessageRouter;
let runner: AiRunner;
/** as dependências do executor, para montar um segundo executor (com log) sobre o mesmo board */
let deps: RunnerDeps;
let log: string[];
/** processos iniciados pelo executor, na ordem; `exit` simula o fim do processo */
let procs: {
  command: HeadlessCommand;
  cwd: string;
  killed: boolean;
  /** um pedaço de saída do processo, como a CLI escreveria */
  emit(text: string, stream?: 'stdout' | 'stderr'): void;
  exit(code: number | null, error?: Error): void;
}[];
/** false = o processo falso não escreve nada ao começar (a recusa de argumento sai com o `stdout` vazio) */
let speaks: boolean;
let storyId: string;

const card = () => router.snapshot().cards.find((c) => c.id === storyId)!;
/** um evento de texto do assistente, como o `stream-json` do Claude Code escreve */
const assistant = (text: string) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
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
  speaks = true;
  // o log de uso é obrigatório: o executor dos testes grava no mesmo banco em memória do board
  const spawn: SpawnFn = (command, cwd, out) => {
    let listener: (code: number | null, error?: Error) => void = () => {};
    const proc = {
      command,
      cwd,
      killed: false,
      emit: (text: string, stream: 'stdout' | 'stderr' = 'stdout') => out(text, stream),
      exit: (code: number | null, error?: Error) => listener(code, error),
    };
    procs.push(proc);
    // no modo estruturado a ferramenta escreve eventos; o texto vem dentro de um evento do assistente
    if (speaks) out(command.format === 'text' ? 'saída da ferramenta\n' : `${assistant('saída da ferramenta')}\n`, 'stdout');
    return {
      onExit: (fn) => (listener = fn),
      kill: () => {
        proc.killed = true;
        proc.exit(null);
      },
    };
  };
  deps = { cwd: dir, log: (line) => log.push(line), gateway: gatewayFor(router, db, spawn, (line) => log.push(line)) };
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
        prompt: cardPrompt('#1', undefined, [PERMISSION_ADVICE.board!], false, true),
        permission: 'board',
        addDirs: [`${dir}.worktrees`],
        structured: true,
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

  it('com o login da ferramenta vencido (requisito "signin"), não inicia e não gasta uma execução', () => {
    router.setRequirements([{ id: 'signin', tool: 'claude', cli: 'claude', action: { kind: 'command', command: 'claude login' } }]);
    expect(() => runner.start(storyId)).toThrow(/login/i);
    expect(procs).toHaveLength(0);
    expect(card().status).not.toBe('running');
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
          prompt: cardPrompt('#1', undefined, [], true, true),
          permission: 'full',
          addDirs: [`${dir}.worktrees`],
          structured: true,
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

    it('RF4: PR registrado antes da história chegar na última coluna entrega ao fim da execução, em vez de voltar para "ready"', () => {
      yolo();
      const ctx = (router as any).ctx;
      const homologacao = router.snapshot().columns.find((c) => c.name === 'Homologação')!.id;
      runner.start(storyId);
      // registra o PR e move a história direto no repositório, como se a sessão tivesse feito os dois
      // sem passar pelos handlers (que já reavaliariam a entrega): é a ordem que o bug deixava escapar
      ctx.cards.move(storyId, homologacao, 0, { byAi: true });
      ctx.cards.setPullRequest(storyId, 'https://github.com/acme/app/pull/7');
      procs[0]!.exit(0);
      expect(card().status).toBe('waiting_review');
    });
  });

  describe('história #407: re-execução de uma história YOLO já entregue', () => {
    const PR = 'https://github.com/acme/app/pull/7';

    const deliver = () => {
      router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });
      const homologacao = router.snapshot().columns.find((c) => c.name === 'Homologação')!.id;
      router.handle({ type: 'card.pr.set', cardId: storyId, url: PR });
      router.handle({ type: 'card.move', cardId: storyId, columnId: homologacao, position: 0 });
      expect(card().status).toBe('waiting_review'); // já entregue, a vez é da pessoa
    };

    it('a sub-tarefa que termina sem responder nem mudar status não bloqueia: a história já está com a pessoa', () => {
      deliver();
      const s = router.snapshot();
      const wf = s.workflows.find((w) => w.kind === 'child')!;
      const subId = router.createCard({
        typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
        columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
        parentId: storyId,
        title: 'Passo',
      });
      runner.start(subId);
      procs[0]!.exit(0); // sem comentário, sem mudar o status: exatamente o caso que o bug autobloqueava
      const sub = router.snapshot().cards.find((c) => c.id === subId)!;
      expect(sub.status).not.toBe('blocked');
      expect(card().status).toBe('waiting_review'); // a história continua entregue, intocada
    });

    it('regressão: sem modo autônomo, continua bloqueando com "encerrou sem responder" mesmo com a história já entregue', () => {
      // entrega "manual" (sem YOLO): fixa o status diretamente, já que settleDelivery exige YOLO
      const ctx = (router as any).ctx;
      const homologacao = router.snapshot().columns.find((c) => c.name === 'Homologação')!.id;
      ctx.cards.move(storyId, homologacao, 0);
      ctx.cards.setPullRequest(storyId, PR);
      ctx.cards.setStatus(storyId, 'waiting_review', '', 'Pessoa');
      const s = router.snapshot();
      const wf = s.workflows.find((w) => w.kind === 'child')!;
      const subId = router.createCard({
        typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
        columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
        parentId: storyId,
        title: 'Passo',
      });
      runner.start(subId);
      procs[0]!.exit(0);
      const sub = router.snapshot().cards.find((c) => c.id === subId)!;
      expect(sub.status).toBe('blocked');
      expect(sub.statusReason).toContain('sem responder');
    });

    it('regressão: história YOLO ainda não entregue continua bloqueando', () => {
      router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });
      const s = router.snapshot();
      const wf = s.workflows.find((w) => w.kind === 'child')!;
      const subId = router.createCard({
        typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
        columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
        parentId: storyId,
        title: 'Passo',
      });
      runner.start(subId);
      procs[0]!.exit(0);
      const sub = router.snapshot().cards.find((c) => c.id === subId)!;
      expect(sub.status).toBe('blocked');
      expect(sub.statusReason).toContain('sem responder');
    });
  });

  it('falha de autenticação não bloqueia o card: ele volta ao status anterior, avisa na conversa e liga o sinal reativo', () => {
    const before = card().status;
    runner.start(storyId);
    procs[0]!.emit('Error: OAuth session expired and could not be refreshed\n', 'stderr');
    procs[0]!.exit(1);
    expect(card().status).toBe(before);
    expect(card().status).not.toBe('blocked');
    expect(lastMessage()).toMatchObject({ author: 'Faz AI', source: 'ai' });
    expect(lastMessage()!.body).toContain('login do Claude Code venceu');
    expect(router.snapshot().authExpired).toBe('claude');
    expect(log.some((l) => l.includes('Login do Claude Code vencido'))).toBe(true);

    // uma segunda falha igual, com o sinal já ligado, não duplica o log de suspensão
    const logCountBefore = log.filter((l) => l.includes('Login do Claude Code vencido')).length;
    runner.start(storyId);
    procs[1]!.emit('Error: OAuth session expired and could not be refreshed\n', 'stderr');
    procs[1]!.exit(1);
    expect(log.filter((l) => l.includes('Login do Claude Code vencido')).length).toBe(logCountBefore);

    // uma execução que termina sem falha de autenticação limpa o sinal e avisa a retomada
    runner.start(storyId);
    ai({ type: 'comment.add', cardId: storyId, body: 'Entendi. Qual o provedor de login?' });
    procs[2]!.exit(0);
    expect(router.snapshot().authExpired).toBeNull();
    expect(log.some((l) => l.includes('Login do Claude Code de volta'))).toBe(true);
  });

  it('falha sem nenhum padrão de autenticação continua bloqueando o card como antes (regressão)', () => {
    runner.start(storyId);
    procs[0]!.emit('algum outro erro qualquer\n', 'stderr');
    procs[0]!.exit(1);
    expect(card().status).toBe('blocked');
    expect(router.snapshot().authExpired).toBeNull();
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

  it('Refinar com IA: outro pedido, só com o board, sem modo autônomo, e o card volta ao status que tinha', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'full' } } });
    router.handle({ type: 'card.status.set', cardId: storyId, status: 'waiting_review' });
    runner.start(storyId, 'manual', 'refine');
    const command = procs[0]!.command;
    expect(command.stdin).toContain('Refine o card #1');
    expect(command.stdin).toContain('NÃO é fazer o trabalho da fase');
    expect(command.stdin).not.toContain('Faça o trabalho da fase');
    // mesmo com o board em "Sem restrições", refinar não mexe em arquivos
    expect(command.args).toContain('dontAsk');
    expect(card().status).toBe('running');
    procs[0]!.exit(0);
    // não passa a vez: sem resposta na conversa não é bloqueio, e o status volta ao de antes
    expect(card().status).toBe('waiting_review');
  });

  describe('Resumir a conversa', () => {
    it('permissão sempre "board" e nunca autônomo, mesmo com o board em "Sem restrições" e o card em YOLO', () => {
      router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'full' } } });
      router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });
      runner.start(storyId, 'manual', 'summarize');
      const command = procs[0]!.command;
      expect(command.args).toContain('dontAsk');
      expect(command.args).not.toContain('bypassPermissions');
      expect(command.stdin).not.toContain('MODO AUTÔNOMO');
      expect(command.stdin).toContain('Leia toda a conversa do card #1');
    });

    it('sucesso não muda o status do card, mesmo quando a IA gravou o resumo na conversa', () => {
      router.handle({ type: 'card.status.set', cardId: storyId, status: 'waiting_review' });
      runner.start(storyId, 'manual', 'summarize');
      ai({ type: 'comment.add', cardId: storyId, body: 'Resumo da conversa.', kind: 'summary' });
      procs[0]!.exit(0);
      expect(card().status).toBe('waiting_review');
      expect(lastMessage()).toMatchObject({ body: 'Resumo da conversa.', kind: 'summary' });
    });

    it('falha de processo grava o comentário de falha específico do resumo, e o status volta ao anterior', () => {
      router.handle({ type: 'card.status.set', cardId: storyId, status: 'approved' });
      runner.start(storyId, 'manual', 'summarize');
      procs[0]!.exit(1);
      expect(card().status).toBe('approved');
      expect(lastMessage()).toMatchObject({ author: 'Faz AI', source: 'ai' });
      expect(lastMessage()!.body).toContain('O resumo da conversa não foi gerado.');
      expect(lastMessage()!.body).toContain('código 1');

      runner.start(storyId, 'manual', 'summarize');
      procs[1]!.exit(null, new Error('comando "claude" não encontrado.'));
      expect(card().status).toBe('approved');
      expect(lastMessage()!.body).toContain('O resumo da conversa não foi gerado.');
      expect(lastMessage()!.body).toContain('não encontrado');
    });

    it('sem falha de processo e sem nova mensagem de IA, grava o aviso de "terminou sem escrever a mensagem"', () => {
      router.handle({ type: 'card.status.set', cardId: storyId, status: 'waiting_review' });
      runner.start(storyId, 'manual', 'summarize');
      procs[0]!.exit(0); // a IA não chamou add_comment
      expect(card().status).toBe('waiting_review');
      expect(lastMessage()).toMatchObject({ author: 'Faz AI', source: 'ai' });
      expect(lastMessage()!.body).toBe('O resumo não foi gerado: a execução terminou sem escrever a mensagem.');
    });
  });

  it('a recusa do plano gratuito do Cursor vem com a saída: escolher Auto', () => {
    router.handle({ type: 'settings.board.update', patch: { aiTool: 'cursor', runner: { permission: 'board' } } });
    runner.start(storyId);
    procs[0]!.emit('Named models unavailable Free plans can only use Auto\n', 'stderr');
    procs[0]!.exit(1);
    expect(card().status).toBe('blocked');
    expect(card().statusReason).toContain('plano gratuito do Cursor só roda o modelo Auto');
  });

  it('Refinar com IA que falha não bloqueia o card: o status volta e a falha fica na conversa', () => {
    router.handle({ type: 'card.status.set', cardId: storyId, status: 'approved' });
    runner.start(storyId, 'manual', 'refine');
    procs[0]!.exit(1);
    expect(card().status).toBe('approved');
    expect(lastMessage()).toMatchObject({ author: 'Faz AI', source: 'ai' });
    expect(lastMessage()!.body).toContain('O refinamento do card não terminou');
    expect(lastMessage()!.body).toContain('código 1');

    runner.start(storyId, 'manual', 'refine');
    procs[1]!.exit(null, new Error('comando "claude" não encontrado.'));
    expect(card().status).toBe('approved');
    expect(lastMessage()!.body).toContain('não encontrado');
  });

  it('o fim da execução diz aos ouvintes se era refinar, resumir ou trabalhar na fase', () => {
    const finished: [string, string][] = [];
    runner.onDidFinish((id, mode) => finished.push([id, mode]));
    runner.start(storyId, 'manual', 'refine');
    procs[0]!.exit(0);
    runner.start(storyId, 'manual', 'summarize');
    procs[1]!.exit(0);
    runner.start(storyId);
    procs[2]!.exit(0);
    expect(finished).toEqual([
      [storyId, 'refine'],
      [storyId, 'summarize'],
      [storyId, 'phase'],
    ]);
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

  it('ferramenta que não roda com a permissão pedida: avisa em vez de rodar com permissão menor', () => {
    // o Claude Code recusa "Sem restrições" quando roda como root (contêiner, WSL como root)
    const getuid = vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(0);
    try {
      router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude', runner: { permission: 'full' } } });
      expect(router.snapshot().aiRunUnsupported).toContain('root');
      expect(() => runner.start(storyId)).toThrow('root');
      expect(procs).toHaveLength(0);
      router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'board' } } });
      expect(router.snapshot().aiRunUnsupported).toBeNull();
      runner.start(storyId);
      expect(procs).toHaveLength(1);
      expect(procs[0]!.command.command).toBe('claude');
    } finally {
      getuid.mockRestore();
    }
  });

  it('monta o comando de cada ferramenta conforme a permissão', () => {
    const cmd = (tool: Parameters<typeof headlessCommand>[0], permission: 'board' | 'edits' | 'full') =>
      headlessCommand(tool, { prompt: 'P', permission });
    // o contexto vazio vai sempre: nenhuma fonte de configuração e nenhuma skill invocável
    const empty = ['--setting-sources', '', '--disable-slash-commands'];
    expect(cmd('claude', 'board')).toEqual({
      command: 'claude',
      args: ['-p', '--permission-mode', 'dontAsk', '--allowedTools', 'mcp__faz-ai__*', 'Read', 'Glob', 'Grep', ...empty],
      stdin: 'P',
      format: 'text',
    });
    expect(cmd('claude', 'edits')).toMatchObject({
      args: ['-p', '--permission-mode', 'acceptEdits', '--allowedTools', 'mcp__faz-ai__*', 'Read', 'Glob', 'Grep', ...empty],
    });
    expect(cmd('claude', 'full')).toMatchObject({ args: ['-p', '--permission-mode', 'bypassPermissions', ...empty] });
    // o pedido do Cursor vai pela entrada padrão, nunca na linha de comando
    expect(cmd('cursor', 'full')).toEqual({
      command: 'cursor-agent',
      args: ['-p', '--force', '--approve-mcps', '--trust'],
      stdin: 'P',
      format: 'text',
    });
    // nos níveis menores, a sessão do Cursor só recebe as ferramentas do nível
    expect(cmd('cursor', 'board')).toMatchObject({
      args: ['-p', '--force', '--approve-mcps', '--trust', '--allowed-tools', CURSOR_TOOLS.board.join(',')],
    });
    const edits = (cmd('cursor', 'edits') as HeadlessCommand).args;
    expect(edits[edits.indexOf('--allowed-tools') + 1]!.split(',')).toEqual([...CURSOR_TOOLS.board, ...CURSOR_TOOLS.edits]);
    expect(CURSOR_TOOLS.board).toContain('mcp_tool_call');
    expect([...CURSOR_TOOLS.board, ...CURSOR_TOOLS.edits]).not.toContain('shell_tool_call');
    expect(headlessUnsupported('claude', 'board')).toBeNull();
    expect(headlessUnsupported('cursor', 'board')).toBeNull();
    // o Claude Code recusa pular as permissões como root
    expect(headlessUnsupported('claude', 'full', 0)).toContain('root');
    expect(headlessUnsupported('claude', 'full', 1000)).toBeNull();
  });

  it('o Cursor recebe as worktrees por --add-dir e o servidor do board pelo .cursor/mcp.json', () => {
    const boardServer = { command: '/usr/bin/node', args: ['/dados/mcp/bridge.js', '/projeto'] };
    const built = headlessCommand('cursor', { prompt: 'P', permission: 'full', boardServer, addDirs: ['/w/a', '/w/b'] }) as HeadlessCommand;
    expect(built.args).toEqual(['-p', '--force', '--approve-mcps', '--trust', '--add-dir', '/w/a', '--add-dir', '/w/b']);
    expect(built.projectMcp).toEqual({ file: '.cursor/mcp.json', entry: boardServer });
  });

  it('o Claude Code recebe o servidor do board na linha de comando, sem depender do registro no projeto', () => {
    const boardServer = { command: 'node', args: ['/dados/mcp/bridge.js', '/projeto'] };
    const built = headlessCommand('claude', { prompt: 'P', permission: 'board', boardServer }) as HeadlessCommand;
    // estrito: nenhum outro servidor (do usuário ou do projeto) entra na sessão
    expect(built.args.slice(-6)).toEqual([
      '--strict-mcp-config',
      '--mcp-config',
      '{tmp:mcp.json}',
      '--setting-sources',
      '',
      '--disable-slash-commands',
    ]);
    expect(JSON.parse(built.tempFiles!['mcp.json']!)).toEqual({ mcpServers: { 'faz-ai': { type: 'stdio', ...boardServer } } });
    // o Cursor não recebe o servidor pela linha de comando: ele lê o registro do projeto
    expect(headlessCommand('cursor', { prompt: 'P', permission: 'board', boardServer })).not.toHaveProperty('tempFiles');
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
      defaultAgent: '',
      permission: 'board',
      timeoutMinutes: 30,
      heartbeat: false,
      heartbeatMinutes: 60,
      parallel: false,
      parallelStories: 2,
      autopilotPaused: false,
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
    logged = runner;
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
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { 'faz-ai': { command: 'node' } } }));
    router.refreshHarness();
    const o = router.snapshot().board.modelCatalog.find((m) => m.tool === 'claude' && m.efforts.length > 0)!;
    router.handle({
      type: 'harness.agent.create',
      scope: 'project',
      input: {
        name: 'restrito',
        description: 'Restrito',
        body: 'Siga.',
        model: `${o.id}@${o.efforts[0]}`,
        tools: [],
        deniedTools: ['WebFetch'],
        skills: ['sql-queries'],
        mcp: [],
      },
    });
    router.handle({ type: 'settings.board.update', patch: { runner: { defaultAgent: 'restrito' } } });
    const summary = executionPlan(router.snapshot(), card(), dir, '').summary.join(' | ');
    logged.start(storyId);

    const row = only();
    expect(row).toMatchObject({
      model: o.model,
      effort: o.efforts[0],
      profile: 'restrito',
      agent: 'restrito',
      permission: 'board',
      autonomous: false,
      clean: true,
      skills: ['sql-queries'],
      mcp: [],
    });
    // o que foi gravado tem de aparecer no resumo que a pessoa lê no canal de log: uma verdade só
    expect(summary).toContain(`Agente do board: ${row.profile}`);
    expect(summary).toContain(`Skills: ${row.skills.join(', ')}`);
    expect(summary).toContain(`Modelo: ${row.model} · ${row.effort}`);
    expect(summary).toContain('Contexto vazio (imposto)');
    expect(log.join('\n')).toContain(summary);
  });

  it('RF-15: sem perfil e sem modelo, o não definido fica NULL — nunca string vazia nem zero', () => {
    logged.start(storyId);
    // sem modelo escolhido a execução usa o padrão da ferramenta, que o board não conhece: não definido
    expect(only()).toMatchObject({ model: null, effort: null, skills: [], mcp: [] });
    // o agente embutido não tem arquivo: definido e vazio, não "não se aplica"
    expect(only().agent).toBe('');
    // o perfil, ao contrário, existe sempre num card: sem agente marcado vale o embutido
    expect(only().profile).toBe('Agente padrão');
    expect(raw('model')).toEqual([null]);
    expect(raw('effort')).toEqual([null]);
    // toda execução parte de contexto vazio: só o servidor do board
    expect(raw('mcp_json')).toEqual(['[]']);
  });

  it('RF-15: em modo autônomo grava permissão sem restrições e autonomous', () => {
    router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });
    logged.start(storyId);
    expect(only()).toMatchObject({ permission: 'full', autonomous: true });
  });

  it('Resumir a conversa: usa sempre o modelo da faixa "Alto" do catálogo, mesmo com o card no Modelo da faixa Média, e nunca autônomo', () => {
    // o card está com o modelo da faixa "Média" (sonnet, esforço medium): é o que a fase comum usaria
    const sonnet = router.snapshot().board.modelCatalog.find((o) => o.tool === 'claude' && o.model === 'sonnet')!;
    const modeloField = router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
    router.handle({ type: 'field.setValue', cardId: storyId, fieldId: modeloField.id, value: modelValue(sonnet.id, 'medium') });
    router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'full' } } });
    router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });
    expect(executionPlan(router.snapshot(), card(), dir, '').manifest.model).toMatchObject({ name: 'sonnet', effort: 'medium' });

    logged.start(storyId, 'manual', 'summarize');
    // a faixa "Alto" do catálogo embutido do Claude Code é opus/high, independente do Modelo do card
    expect(only()).toMatchObject({ model: 'opus', effort: 'high', permission: 'board', autonomous: false });
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
    // o Claude Code recusa "Sem restrições" como root: a execução não roda
    const getuid = vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(0);
    try {
      router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude', runner: { permission: 'full' } } });
      expect(() => logged.start(storyId)).toThrow('root');
    } finally {
      getuid.mockRestore();
    }
    expect(procs).toHaveLength(0);
    // a tentativa também é informação: a linha existe, fechada, com a ferramenta que não deu
    expect(only()).toMatchObject({ outcome: 'unsupported', tool: 'claude' });
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

  it('toda execução é registrada: não existe executor sem log', () => {
    runner.start(storyId);
    expect(runner.runIdOf(storyId)).toBe(only().id);
    procs[0]!.exit(0);
    expect(only()).toMatchObject({ outcome: 'done', origin: 'manual', tool: 'claude' });
  });

  /** A medição de consumo pela porta do executor (#70): do processo ao banco, passando pelo canal e pela conversa do card. */
  describe('consumo medido', () => {
    const channel = () => log.filter((l) => l.startsWith('[#1] '));

    it('a jornada do card: chamada estruturada, linhas legíveis, consumo e inventário gravados e o resumo no canal', () => {
      logged.start(storyId);
      const args = procs[0]!.command.args;
      expect(args).toContain('--verbose');
      expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
      expect(procs[0]!.command.format).toBe('claude-stream-json');

      procs[0]!.emit(FIXTURE);
      ai({ type: 'comment.add', cardId: storyId, body: 'Feito.' });
      procs[0]!.exit(0);

      expect(channel()).toContain('[#1] Read(a.txt)');
      expect(channel()).toContain('[#1] Agent(Explore)');
      expect(channel()).toContain('[#1] Subagente Explore concluído');
      for (const line of log) expect(line).not.toContain('{"');
      expect(only()).toMatchObject({
        outcome: 'done',
        measure: 'full',
        inputTokens: 54,
        outputTokens: 1221,
        cacheReadTokens: 106009,
        cacheWriteTokens: 28908,
        turns: 5,
        sessionId: '11111111-2222-3333-4444-555555555555',
        costEstimated: false,
      });
      expect(only().costUsd).toBeCloseTo(0.06478465, 8);
      expect(runs.usage(only().id)).toEqual([
        { kind: 'agent', name: 'Explore', calls: 1 },
        { kind: 'tool', name: 'Bash', calls: 1 },
        { kind: 'tool', name: 'Read', calls: 2 },
      ]);
      expect(log).toContain(
        '[#1] Consumo: 54 entrada · 1.221 saída · 106.009 leitura de cache · 28.908 criação de cache · 5 turnos · US$ 0,0648',
      );
      expect(card().status).toBe('waiting_answer');
    });

    it('RF-07: a CLI recusa a saída estruturada (código 1, nada no stdout): uma segunda chamada em texto, e a execução segue', () => {
      speaks = false;
      logged.start(storyId);
      procs[0]!.emit('error: unknown option --output-format\n', 'stderr');
      procs[0]!.exit(1);

      expect(procs).toHaveLength(2);
      expect(procs[1]!.command.format).toBe('text');
      expect(procs[1]!.command.args).not.toContain('--output-format');
      expect(card().status).toBe('running');

      procs[1]!.emit('trabalho feito\n');
      ai({ type: 'comment.add', cardId: storyId, body: 'Feito.' });
      procs[1]!.exit(0);

      expect(card().status).toBe('waiting_answer');
      expect(only()).toMatchObject({ outcome: 'done', exitCode: 0, measure: 'none', outputTokens: null, costUsd: null });
      expect(log.join('\n')).toContain('não aceita a saída estruturada');
      // o motivo já está no canal: o resumo não o repete
      expect(log).toContain('[#1] Consumo não medido.');
    });

    it('RF-07: a falha DEPOIS de eventos não repete a chamada, e o fim da saída no card é texto legível', () => {
      logged.start(storyId);
      procs[0]!.emit(FIXTURE);
      procs[0]!.exit(1);

      expect(procs).toHaveLength(1);
      expect(card().status).toBe('blocked');
      expect(card().statusReason).toContain('código 1');
      expect(card().statusReason).toContain('Subagente Explore concluído');
      expect(card().statusReason).not.toContain('{"');
      // a linha da chamada é do board, não da ferramenta: não explica a falha
      expect(card().statusReason).not.toContain('Chamando');
      expect(only()).toMatchObject({ outcome: 'failed', exitCode: 1, measure: 'full', outputTokens: 1221 });
    });

    it('os avisos de regra de permissão do Claude Code ficam no canal, mas não na falha do card', () => {
      logged.start(storyId);
      for (let i = 0; i < 15; i++) procs[0]!.emit(`Permission allow rule (Bash(cmd${i}:*)) in userSettings is unreachable\n`, 'stderr');
      procs[0]!.emit('Your session has expired. Please run /login.\n', 'stderr');
      procs[0]!.emit('Permission ask rule (WebFetch) will be ignored\n', 'stderr');
      procs[0]!.exit(1);

      expect(card().status).toBe('blocked');
      expect(card().statusReason).toContain('Please run /login');
      expect(card().statusReason).not.toContain('Permission');
      expect(channel()).toContain('[#1] Permission ask rule (WebFetch) will be ignored');
    });

    it('interromper no meio grava o consumo parcial, e o desfecho continua stopped', () => {
      logged.start(storyId);
      procs[0]!.emit(HALF);
      logged.stop(storyId);

      expect(procs).toHaveLength(1);
      expect(only()).toMatchObject({ outcome: 'stopped', measure: 'partial', costUsd: null });
      expect(only().inputTokens).toBeGreaterThan(0);
      expect(log.some((l) => l.startsWith('[#1] Consumo parcial: '))).toBe(true);
    });

    it('interromper antes de qualquer evento grava "não medido", com o motivo no canal', () => {
      speaks = false;
      logged.start(storyId);
      logged.stop(storyId);

      expect(procs).toHaveLength(1);
      expect(only()).toMatchObject({ outcome: 'stopped', measure: 'none', inputTokens: null });
      expect(log).toContain('[#1] Consumo não medido: a execução terminou antes de informar o consumo.');
    });

    it('o tempo limite no meio grava o consumo parcial, e o desfecho continua timeout', () => {
      vi.useFakeTimers();
      router.handle({ type: 'settings.board.update', patch: { runner: { timeoutMinutes: 5 } } });
      logged.start(storyId);
      procs[0]!.emit(HALF);
      vi.advanceTimersByTime(5 * 60_000);

      expect(procs).toHaveLength(1);
      expect(only()).toMatchObject({ outcome: 'timeout', measure: 'partial' });
      expect(card().statusReason).toContain('tempo limite');
    });
  });
});

/**
 * Retentativa com o modelo reserva da regra de sugestão quando o modelo principal esgota o limite de
 * uso do plano (história #257). O leitor do Claude Code (`claude.ts`) só liga `usageLimitReached` com
 * um `result` de erro cujo texto bate com os termos conhecidos de limite esgotado (ver
 * `USAGE_LIMIT_TEXT`); é assim que estes testes simulam o esgotamento, sem depender de um exemplo real.
 */
describe('reserva de modelo quando o limite esgota (história #257)', () => {
  const sonnet = () => router.snapshot().board.modelCatalog.find((o) => o.tool === 'claude' && o.model === 'sonnet')!;
  const fable = () => router.snapshot().board.modelCatalog.find((o) => o.tool === 'claude' && o.model === 'fable')!;
  const modeloField = () => router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  const setModelo = (value: string) => router.handle({ type: 'field.setValue', cardId: storyId, fieldId: modeloField().id, value });
  const useSonnetMedium = () => setModelo(modelValue(sonnet().id, 'medium'));
  const ruleWithFallback = (fallback: string | null) =>
    router.handle({
      type: 'settings.modelRules.set',
      rules: [
        {
          id: 'r1',
          name: 'Regra',
          enabled: true,
          groups: [[{ fieldId: TYPE_CONDITION, op: 'is', value: 'História' }]],
          model: modelValue(sonnet().id, 'medium'),
          fallback,
        },
      ],
    });
  // uma linha `result` que o leitor do Claude Code reconhece como limite de uso esgotado (RF-03: só este sinal estrutural liga a flag)
  const usageLimitResult = () => JSON.stringify({ type: 'result', is_error: true, result: 'usage limit reached' });

  it('regra com reserva + limite esgotado: segunda chamada ao gateway com o modelo reserva, comentário na conversa, sem bloqueio', () => {
    useSonnetMedium();
    ruleWithFallback(modelValue(fable().id, 'low'));
    runner.start(storyId);
    expect(procs).toHaveLength(1);
    procs[0]!.emit(usageLimitResult());
    procs[0]!.exit(1);

    expect(procs).toHaveLength(2);
    const args = procs[1]!.command.args;
    expect(args[args.indexOf('--model') + 1]).toBe('fable');
    expect(args[args.indexOf('--effort') + 1]).toBe('low');
    expect(card().status).toBe('running'); // não bloqueou nem esperou resposta: a reserva está em curso
    expect(lastMessage()).toMatchObject({ author: 'Faz AI', source: 'ai' });
    expect(lastMessage()!.body).toBe('O `Sonnet 5.5 - médio` esgotou o limite; a execução segue com `Fable 5.1 - baixo`.');

    // a retentativa termina bem: segue como qualquer execução normal (aqui, a IA só respondeu na conversa)
    ai({ type: 'comment.add', cardId: storyId, body: 'Feito.' });
    procs[1]!.exit(0);
    expect(card().status).toBe('waiting_answer');
  });

  it('a reserva também esgota o limite (ou falha por qualquer motivo): bloqueio final, sem uma terceira tentativa', () => {
    useSonnetMedium();
    ruleWithFallback(modelValue(fable().id, 'low'));
    runner.start(storyId);
    procs[0]!.emit(usageLimitResult());
    procs[0]!.exit(1);
    expect(procs).toHaveLength(2);

    procs[1]!.emit(usageLimitResult());
    procs[1]!.exit(1);
    expect(procs).toHaveLength(2); // nenhuma terceira chamada: a retentativa não recebe fallbackPending
    expect(card().status).toBe('blocked');
  });

  it('card sem reserva (regra sem fallback) + limite esgotado: bloqueio imediato, sem segunda chamada', () => {
    useSonnetMedium();
    ruleWithFallback(null);
    runner.start(storyId);
    procs[0]!.emit(usageLimitResult());
    procs[0]!.exit(1);
    expect(procs).toHaveLength(1);
    expect(card().status).toBe('blocked');
  });

  it('modelo escolhido à mão sem bater com a regra + limite esgotado: bloqueio imediato, sem segunda chamada', () => {
    // a regra sugeriria sonnet@medium, mas o campo Modelo do card foi trocado à mão para fable@high
    ruleWithFallback(modelValue(fable().id, 'low'));
    setModelo(modelValue(fable().id, 'high'));
    runner.start(storyId);
    procs[0]!.emit(usageLimitResult());
    procs[0]!.exit(1);
    expect(procs).toHaveLength(1);
    expect(card().status).toBe('blocked');
  });

  it('falha comum (sem limite esgotado), mesmo com reserva disponível: bloqueio imediato, sem segunda chamada', () => {
    useSonnetMedium();
    ruleWithFallback(modelValue(fable().id, 'low'));
    runner.start(storyId);
    procs[0]!.exit(2); // erro comum, sem nenhum evento de limite esgotado: a reserva não mascara outros erros
    expect(procs).toHaveLength(1);
    expect(card().status).toBe('blocked');
  });

  it('execução que terminou bem (código 0) com a flag ligada: não repete a fase com a reserva', () => {
    useSonnetMedium();
    ruleWithFallback(modelValue(fable().id, 'low'));
    runner.start(storyId);
    procs[0]!.emit(usageLimitResult());
    ai({ type: 'comment.add', cardId: storyId, body: 'Feito.' });
    procs[0]!.exit(0);
    expect(procs).toHaveLength(1);
    expect(card().status).toBe('waiting_answer');
  });

  it('a retentativa não consegue começar (card arquivado no meio): o card é bloqueado com o motivo e o fim é avisado', () => {
    useSonnetMedium();
    ruleWithFallback(modelValue(fable().id, 'low'));
    const finished: string[] = [];
    runner.onDidFinish((id) => finished.push(id));
    runner.start(storyId);
    procs[0]!.emit(usageLimitResult());
    router.handle({ type: 'card.archive', cardId: storyId });
    procs[0]!.exit(1);
    expect(procs).toHaveLength(1);
    expect(finished).toEqual([storyId]);
    expect(runner.running).not.toContain(storyId);
    expect(router.snapshot().aiActivity.some((a) => a.cardId === storyId)).toBe(false);
  });

  it('modo autônomo (YOLO): a retentativa não deixa o card "waiting_answer" nem "blocked" só por causa da troca — a fila segue', () => {
    router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });
    useSonnetMedium();
    ruleWithFallback(modelValue(fable().id, 'low'));
    runner.start(storyId);
    procs[0]!.emit(usageLimitResult());
    procs[0]!.exit(1);

    expect(procs).toHaveLength(2);
    expect(card().status).toBe('running');
  });
});

describe('parseRunner', () => {
  it('autopilotPaused ausente ou inválido vira false', () => {
    expect(parseRunner(null).autopilotPaused).toBe(false);
    expect(parseRunner('{}').autopilotPaused).toBe(false);
    expect(parseRunner(JSON.stringify({ autopilotPaused: 'sim' })).autopilotPaused).toBe(false);
  });

  it('autopilotPaused: true é lido', () => {
    expect(parseRunner(JSON.stringify({ autopilotPaused: true })).autopilotPaused).toBe(true);
  });
});

describe('consumptionLine', () => {
  const report = (patch: Partial<RunReport> = {}, consumption: Partial<NonNullable<RunReport['consumption']>> = {}): RunReport => ({
    measure: 'full',
    consumption: {
      inputTokens: 1234,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 1000000,
      turns: 1,
      sessionId: null,
      costUsd: 1.5,
      ...consumption,
    },
    inventory: [],
    answer: '',
    reason: null,
    usageLimitReached: false,
    ...patch,
  });

  it('números em português, "turno" no singular, custo com duas a quatro casas', () => {
    expect(consumptionLine(report())).toBe(
      'Consumo: 1.234 entrada · 5 saída · 0 leitura de cache · 1.000.000 criação de cache · 1 turno · US$ 1,50',
    );
  });

  it('turnos e custo que a ferramenta não informou ficam fora da linha, em vez de virarem zero', () => {
    expect(consumptionLine(report({ measure: 'partial' }, { turns: null, costUsd: null }))).toBe(
      'Consumo parcial: 1.234 entrada · 5 saída · 0 leitura de cache · 1.000.000 criação de cache',
    );
  });

  it('sem consumo: o motivo de quem chama, o do relatório, ou nada quando ele já está no canal', () => {
    const none = report({ measure: 'none', consumption: null, reason: 'A medição não foi possível nesta execução.' });
    expect(consumptionLine(none)).toBe('Consumo não medido. A medição não foi possível nesta execução.');
    expect(consumptionLine(none, { reason: 'a execução terminou antes de informar o consumo.' })).toBe(
      'Consumo não medido: a execução terminou antes de informar o consumo.',
    );
    expect(consumptionLine(none, { explained: true })).toBe('Consumo não medido.');
  });
});
