// Cenário de ponta a ponta do disjuntor por assinatura de falha (história #1097), pelo caminho das checagens da
// coluna: o router de verdade (banco em memória), `gate_runs` e `ai_runs` de verdade, o executor de verdade rodando
// um `node -e` numa pasta git de verdade e o `FailureBreaker` ligado como o host liga (`onFailed` do executor).
// Só o runner da IA é falso (nenhuma sessão em curso). (A falha de execução da IA não serve de cenário: o runner já
// bloqueia o card na primeira, e o disjuntor ignora história que está com a pessoa.)
// A mesma checagem falhando 3 vezes com o mesmo erro, mesmo com um sucesso no meio, bloqueia a história com a nota
// e o histórico; erros diferentes não somam; destravar recomeça a contagem.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../../src/extension/db/database';
import { FailureBreaker } from '../../src/extension/failureBreaker';
import { GateExecutor } from '../../src/extension/gate';
import { AiRunRepo } from '../../src/extension/log/aiRunRepo';
import { MessageRouter } from '../../src/extension/panel/messageRouter';
import { GateRepo } from '../../src/extension/repositories/gateRepo';
import { BREAKER_MARK } from '../../src/shared/failureSignature';
import { shellQuote } from '../../src/shared/gate';

const WASM_DIR = path.resolve(__dirname, '../../node_modules/sql.js/dist');
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' }).trim();

interface World {
  root: string;
  router: MessageRouter;
  executor: GateExecutor;
  opened: string[];
  /** o que a checagem imprime ao falhar; `null` = passa */
  setOutput: (message: string | null) => void;
  /** a IA tenta mover o card para a Revisão, a checagem roda até o fim */
  attempt: () => Promise<void>;
  unblock: () => void;
  card: () => ReturnType<MessageRouter['snapshot']>['cards'][number];
  /** a pessoa devolve o card à Implementação (depois de uma checagem que passou) */
  back: () => void;
  notes: () => string[];
  logs: string[];
}

async function build(): Promise<World> {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-cenario-disjuntor-')));
  const project = path.join(root, 'projeto');
  fs.mkdirSync(project);
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'config', 'user.email', 't@t');
  git(project, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(project, 'base.txt'), 'x');
  git(project, 'add', '.');
  git(project, 'commit', '-qm', 'base');
  git(project, 'checkout', '-qb', 'feature/h1');
  fs.writeFileSync(path.join(project, 'mudanca.txt'), 'x');
  git(project, 'add', '.');
  git(project, 'commit', '-qm', 'mudança');

  const db = await openInMemory(WASM_DIR);
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'anexos'),
    workspaceDir: project,
  });
  const snap = () => router.snapshot();
  const column = (name: string) => {
    const s = snap();
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    return s.columns.find((c) => c.workflowId === wf.id && c.name === name)!;
  };

  const modeFile = path.join(root, 'modo');
  const command = `${shellQuote(process.execPath)} -e ${shellQuote(
    `const fs=require('fs');const m=fs.readFileSync(${JSON.stringify(modeFile)},'utf8');if(m==='ok')process.exit(0);console.error(m);process.exit(1)`,
  )}`;
  router.handle({
    type: 'settings.column.update',
    columnId: column('Implementação').id,
    patch: { checks: [{ name: 'Testes', command, timeoutSec: 30 }] },
  });
  const s = snap();
  const story = s.workflows.find((w) => w.kind === 'parent')!;
  const cardId = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === story.id)!.id,
    columnId: column('Implementação').id,
    parentId: null,
    title: 'Card do cenário',
  });
  const card = () => snap().cards.find((c) => c.id === cardId)!;

  const logs: string[] = [];
  const breaker = new FailureBreaker({
    router,
    runs: new AiRunRepo(db),
    gates: new GateRepo(db),
    limit: () => snap().board.runner.failureLimit,
    log: (line) => logs.push(line),
  });
  const executor = new GateExecutor({
    repo: new GateRepo(db),
    router,
    runner: { isRunning: () => false, onDidFinish: () => () => {} },
    state: () => snap(),
    ownsBoard: () => true,
    workspaceOf: () => project,
    instance: 'cenario',
    log: () => {},
    git: (args, cwd) =>
      new Promise((resolve, reject) => execFile('git', args, { cwd }, (e, out) => (e ? reject(e) : resolve(String(out))))),
    shellPath: async () => undefined,
    coordinationDir: path.join(root, 'locks'),
    acquireTries: 2,
    acquireDelayMs: 10,
    onFailed: (id) => breaker.check(id),
  });
  const opened: string[] = [];
  router.onGate((id) => opened.push(id));
  const ai = (msg: Parameters<MessageRouter['handle']>[0]) => router.handle(msg, { author: 'Claude Code', source: 'ai' });

  return {
    root,
    router,
    executor,
    opened,
    logs,
    card,
    setOutput: (message) => fs.writeFileSync(modeFile, message ?? 'ok'),
    attempt: async () => {
      ai({ type: 'card.status.set', cardId, status: 'running' });
      ai({ type: 'card.move', cardId, columnId: column('Revisão').id, position: 0 });
      await executor.run(opened.at(-1)!);
    },
    back: () => router.handle({ type: 'card.move', cardId, columnId: column('Implementação').id, position: 0 }),
    unblock: () => router.handle({ type: 'card.status.set', cardId, status: 'ready' }),
    notes: () =>
      snap()
        .comments.filter((c) => c.cardId === cardId && c.body.includes(BREAKER_MARK))
        .map((c) => c.body),
  };
}

let w: World;
beforeEach(async () => {
  w = await build();
});
afterEach(() => {
  w.executor.dispose();
  fs.rmSync(w.root, { recursive: true, force: true });
});

describe('cenário: o disjuntor por assinatura de falha', () => {
  it('a mesma falha 3 vezes, com um sucesso no meio, bloqueia a história com a nota e o histórico', async () => {
    w.setOutput('esperado 2 testes, recebeu 3');
    await w.attempt();
    expect(w.notes()).toHaveLength(0);

    w.setOutput(null); // sucesso de outra etapa: o card sai da coluna e volta, a contagem não zera
    await w.attempt();
    expect(w.card().status).not.toBe('blocked');
    w.back();

    w.setOutput('esperado 5 testes, recebeu 6'); // números diferentes, mesma assinatura
    await w.attempt();
    expect(w.notes()).toHaveLength(0);
    await w.attempt();

    expect(w.card().status).toBe('blocked');
    const [note] = w.notes();
    expect(note).toContain('3 vezes');
    expect(note).toContain('Assinatura:');
    expect(note).toContain('testes: esperado');
    expect(note).toContain('Ocorrências:');
    expect(w.logs.join('\n')).toContain('Disjuntor de falhas');
  });

  it('falhas diferentes não somam', async () => {
    for (const message of ['erro de tipo', 'arquivo não encontrado', 'tempo esgotado', 'permissão negada']) {
      w.setOutput(message);
      await w.attempt();
    }
    expect(w.notes()).toHaveLength(0);
    expect(w.card().status).not.toBe('blocked');
  });

  it('destravar recomeça a contagem: são precisas 3 novas falhas para bloquear de novo', async () => {
    w.setOutput('jest: testes falharam');
    for (let i = 0; i < 3; i++) await w.attempt();
    expect(w.notes()).toHaveLength(1);
    expect(w.card().status).toBe('blocked');

    w.unblock();
    await w.attempt();
    await w.attempt();
    expect(w.notes()).toHaveLength(1);
    expect(w.card().status).not.toBe('blocked');
    await w.attempt();
    expect(w.notes()).toHaveLength(2);
    expect(w.card().status).toBe('blocked');
  });
});
