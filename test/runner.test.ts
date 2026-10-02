import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { headlessCommand, headlessUnsupported } from '../src/extension/headless';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunner, cardPrompt } from '../src/extension/runner';

it('o prompt da execução leva as skills do card pelo caminho', () => {
  expect(cardPrompt('#1')).not.toContain('skills, obrigatórias');
  expect(cardPrompt('#1', [{ name: 'commit', path: '/home/.claude/skills/commit/SKILL.md' }, { name: 'sumida' }])).toContain('leia estas skills, obrigatórias para este card: commit (/home/.claude/skills/commit/SKILL.md).');
});
import type { HeadlessCommand } from '../src/extension/headless';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let router: MessageRouter;
let runner: AiRunner;
let log: string[];
/** processos iniciados pelo executor, na ordem; `exit` simula o fim do processo */
let procs: { command: HeadlessCommand; cwd: string; killed: boolean; exit(code: number | null, error?: Error): void }[];
let storyId: string;

const card = () => router.snapshot().cards.find((c) => c.id === storyId)!;
const lastMessage = () => router.snapshot().comments.filter((c) => c.cardId === storyId).at(-1);
/** o que a IA faria pelo MCP durante a execução */
const ai = (msg: Parameters<MessageRouter['handle']>[0]) => router.handle(msg, { author: 'Claude Code', source: 'ai' });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-runner-'));
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws', folderName: 'Projeto', author: 'Pessoa', attachmentsDir: path.join(dir, 'attachments'), workspaceDir: dir,
  });
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  storyId = router.createCard({ typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id, columnId: s.columns.find((c) => c.name === 'Discovery')!.id, parentId: null, title: 'Login' });
  log = [];
  procs = [];
  runner = new AiRunner(router, {
    cwd: dir,
    log: (line) => log.push(line),
    spawn: (command, cwd, out) => {
      let listener: (code: number | null, error?: Error) => void = () => {};
      const proc = {
        command, cwd, killed: false,
        exit: (code: number | null, error?: Error) => listener(code, error),
      };
      procs.push(proc);
      out('saída da ferramenta\n');
      return { onExit: (fn) => (listener = fn), kill: () => { proc.killed = true; proc.exit(null); } };
    },
  });
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
    expect(procs[0]!.command).toEqual(headlessCommand('claude', { prompt: cardPrompt('#1'), permission: 'board', addDirs: [`${dir}.worktrees`] }));
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

  it('falha, saída sem resposta e tempo limite bloqueiam o card com o motivo na conversa', () => {
    runner.start(storyId);
    procs[0]!.exit(2);
    expect(card()).toMatchObject({ status: 'blocked' });
    expect(card().statusReason).toContain('código 2');
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
    expect(procs[0]!.command).toEqual({ command: 'kimi', args: ['-p', cardPrompt('#1'), '--add-dir', `${dir}.worktrees`] });
  });

  it('monta o comando de cada ferramenta conforme a permissão', () => {
    const cmd = (tool: Parameters<typeof headlessCommand>[0], permission: 'board' | 'edits' | 'full') => headlessCommand(tool, { prompt: 'P', permission });
    expect(cmd('claude', 'board')).toEqual({ command: 'claude', args: ['-p', '--permission-mode', 'dontAsk', '--allowedTools', 'mcp__faz-ai__*', 'Read', 'Glob', 'Grep'], stdin: 'P' });
    expect(cmd('claude', 'edits')).toMatchObject({ args: ['-p', '--permission-mode', 'acceptEdits', '--allowedTools', 'mcp__faz-ai__*'] });
    expect(cmd('claude', 'full')).toMatchObject({ args: ['-p', '--permission-mode', 'bypassPermissions'] });
    expect(cmd('codex', 'edits')).toEqual({ command: 'codex', args: ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-c', 'mcp_servers.faz-ai.default_tools_approval_mode="approve"', '-'], stdin: 'P' });
    expect(cmd('copilot', 'board')).toEqual({ command: 'copilot', args: ['-p', 'P', '--allow-tool=faz-ai', '--allow-tool=read', '--no-ask-user'], env: { GITHUB_COPILOT_PROMPT_MODE_WORKSPACE_MCP: 'true' } });
    expect(cmd('cursor', 'full')).toEqual({ command: 'agent', args: ['-p', '--force', '--approve-mcps', '--trust', 'P'] });
    expect(headlessUnsupported('claude', 'board')).toBeNull();
    expect(headlessUnsupported('cursor', 'board')).toContain('Cursor');
  });

  it('guarda permissão e tempo limite, recusando valores inválidos', () => {
    expect(router.snapshot().board.runner).toEqual({ permission: 'board', timeoutMinutes: 30, heartbeat: false, heartbeatMinutes: 60 });
    router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'edits', timeoutMinutes: 999 } } });
    expect(router.snapshot().board.runner).toMatchObject({ permission: 'edits', timeoutMinutes: 240 });
    router.handle({ type: 'settings.board.update', patch: { runner: { heartbeat: true, heartbeatMinutes: 1 } } });
    expect(router.snapshot().board.runner).toMatchObject({ heartbeat: true, heartbeatMinutes: 5 });
    router.handle({ type: 'settings.board.update', patch: { runner: { permission: 'tudo' as never } } });
    expect(router.snapshot().board.runner.permission).toBe('board'); // valor desconhecido volta ao mais restrito
  });
});
