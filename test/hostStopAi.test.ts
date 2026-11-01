// O "Parar" e a resposta à pessoa pelo host de verdade (`createBoardHost`): o Parar do card interrompe a execução
// dele ou, numa história, a da sub-tarefa em curso, e libera o card preso em "Em execução" sem execução; a resposta
// nunca roda junto de outra execução da mesma história. Os processos da IA não rodam: o executor é observado.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBoardHost, type BoardHost } from '../src/extension/host/boardHost';
import { NOT_SERVING_BOARD, REPLY_BUSY } from '../src/extension/runner';

let root: string;
let host: BoardHost | undefined;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fz-stop-')));
  for (const d of ['home', 'projeto', 'dados']) fs.mkdirSync(path.join(root, d), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: path.join(root, 'projeto') });
  // nada do teste toca a home de verdade (os agentes de fábrica nascem na pasta global da ferramenta)
  vi.stubEnv('HOME', path.join(root, 'home'));
  vi.stubEnv('USERPROFILE', path.join(root, 'home'));
  vi.stubEnv('SHELL', '/bin/sh');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await host?.dispose();
  host = undefined;
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** Uma história na Implementação com uma sub-tarefa. */
async function board(ownsBoard?: () => boolean) {
  host = await createBoardHost({
    ownsBoard,
    storageDir: path.join(root, 'dados'),
    wasmDir: path.resolve(__dirname, '../node_modules/sql.js/dist'),
    folderPath: path.join(root, 'projeto'),
    folderName: 'projeto',
    bridgePath: path.join(root, 'bridge.js'),
    log: () => {},
  });
  const { router } = host;
  const s = router.snapshot();
  const parent = s.workflows.find((w) => w.kind === 'parent')!;
  const child = s.workflows.find((w) => w.kind === 'child')!;
  const impl = s.columns.find((c) => c.workflowId === parent.id && c.name === 'Implementação')!;
  const todo = s.columns.filter((c) => c.workflowId === child.id).sort((a, b) => a.position - b.position)[0]!;
  const type = (wf: string) => s.cardTypes.find((t) => t.defaultWorkflowId === wf)!.id;
  const story = router.createCard({ typeId: type(parent.id), columnId: impl.id, parentId: null, title: 'História' });
  const sub = router.createCard({ typeId: type(child.id), columnId: todo.id, parentId: story, title: 'Sub' });
  return { router, story, sub };
}

it('Parar libera o card preso em "Em execução" sem execução: passa para a pessoa, com o motivo', async () => {
  const { router, story } = await board();
  router.handle({ type: 'card.status.set', cardId: story, status: 'running' }, { author: 'Claude Code', source: 'ai' });
  host!.stopAi(story);
  const card = router.snapshot().cards.find((c) => c.id === story)!;
  expect(card.status).toBe('blocked');
  expect(card.statusReason).toContain('sem nenhuma execução da IA');
  expect(card.statusReason).toContain('Escreva na conversa');
});

it('Parar na história interrompe a sub-tarefa em execução, sem mexer no status', async () => {
  const { router, story, sub } = await board();
  vi.spyOn(host!.runner, 'running', 'get').mockReturnValue([sub]);
  const stop = vi.spyOn(host!.runner, 'stop').mockImplementation(() => {});
  host!.stopAi(story);
  expect(stop).toHaveBeenCalledWith(sub);
  expect(router.snapshot().cards.find((c) => c.id === story)!.status).not.toBe('blocked');
});

it('a resposta à pessoa recusa enquanto outra execução da mesma história está em curso', async () => {
  const { sub, story } = await board();
  vi.spyOn(host!.runner, 'running', 'get').mockReturnValue([sub]);
  const start = vi.spyOn(host!.runner, 'start').mockImplementation(() => {});
  await expect(Promise.resolve(host!.runAi(story, 'reply'))).rejects.toThrow(REPLY_BUSY);
  expect(start).not.toHaveBeenCalled();
});

it('a janela que não serve o board recusa chamar a IA, com o motivo, em vez de rodar uma execução sem o board', async () => {
  const { story, sub } = await board(() => false);
  const start = vi.spyOn(host!.runner, 'start').mockImplementation(() => {});
  await expect(Promise.resolve(host!.runAi(sub, 'summarize'))).rejects.toThrow(NOT_SERVING_BOARD);
  await expect(Promise.resolve(host!.runAi(story))).rejects.toThrow(NOT_SERVING_BOARD);
  expect(start).not.toHaveBeenCalled();
});
