import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import initSqlJs from 'sql.js';
import { migrate } from '../src/extension/db/schema';
import { GateExecutor, type GateDeps, type GateRouter } from '../src/extension/gate';
import { GateRepo } from '../src/extension/repositories/gateRepo';
import { acquireWorkspace } from '../src/extension/workspaceLock';
import { shellQuote } from '../src/shared/gate';
import type { BoardState, ColumnCheck } from '../src/shared/model';
import { boardState, card as fakeCard } from './fakes/board';

// O executor do portão roda as checagens da coluna de verdade (sh -c numa pasta git temporária); só o router,
// o runner e o banco do gate_runs são falsos.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const node = shellQuote(process.execPath);
const js = (code: string) => `${node} -e ${shellQuote(code)}`;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const waitFor = async (cond: () => boolean, ms = 5000) => {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error('tempo esgotado esperando a condição');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const dead = (pid: number) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
};

let tmp: string;
let work: string;
let state: BoardState;
let repo: GateRepo;
let sessions: Set<string>;
let finishListeners: ((cardId: string) => void)[];
let calls: { complete: [string, string][]; fail: [string, string, string][]; handled: unknown[] };
let owns: boolean;
let deps: GateDeps;
let executor: GateExecutor;

const check = (name: string, command: string, timeoutSec = 30): ColumnCheck => ({ name, command, timeoutSec });
const setChecks = (...checks: ColumnCheck[]) => {
  state.columns.find((c) => c.id === 'doing')!.checks = checks;
};
const start = () => repo.start({ cardId: 'h1', columnId: 'doing', targetColumnId: 'done', kind: 'move' });

// o repositório git é o mesmo em todos os testes (eles só leem); marcadores e reservas ficam em `tmp`, por teste
let repoRoot: string;
beforeAll(() => {
  repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-gate-repo-')));
  work = path.join(repoRoot, 'projeto');
  fs.mkdirSync(work);
  const g = (...args: string[]) => git(work, '-c', 'core.hooksPath=/dev/null', ...args);
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  fs.writeFileSync(path.join(work, 'base.txt'), 'x');
  g('add', '.');
  g('commit', '-qm', 'base');
  g('checkout', '-qb', 'feature/h1');
  fs.writeFileSync(path.join(work, 'a b.txt'), 'x');
  fs.writeFileSync(path.join(work, "it's $x.txt"), 'x');
  g('add', '.');
  g('commit', '-qm', 'mudança');
});
afterAll(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-gate-')));

  const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
  const db = new SQL.Database();
  migrate(db);
  repo = new GateRepo(db);

  state = boardState({
    cards: [fakeCard('h1', { number: 1, columnId: 'doing', status: 'verifying', branch: 'feature/h1', baseBranch: 'main', statusAt: 0 })],
  });
  setChecks(check('Typecheck', js("console.log('ok')")));
  sessions = new Set();
  finishListeners = [];
  calls = { complete: [], fail: [], handled: [] };
  owns = true;
  const router: GateRouter = {
    snapshot: () => state,
    completeGate: (id, sha) => void calls.complete.push([id, sha]),
    failGate: (id, result, body) => void calls.fail.push([id, result, body]),
    handle: (msg) => void calls.handled.push(msg),
  };
  deps = {
    repo,
    router,
    runner: {
      isRunning: (id) => sessions.has(id),
      onDidFinish: (l) => {
        finishListeners.push(l as (cardId: string) => void);
        return () => void (finishListeners = finishListeners.filter((x) => x !== l));
      },
    },
    state: () => state,
    ownsBoard: () => owns,
    workspaceOf: () => work,
    instance: 'teste',
    log: () => {},
    git: (args, cwd) =>
      new Promise((resolve, reject) => execFile('git', args, { cwd }, (e, out) => (e ? reject(e) : resolve(String(out))))),
    shellPath: async () => undefined,
    coordinationDir: path.join(tmp, 'locks'),
    acquireTries: 2,
    acquireDelayMs: 10,
  };
  executor = new GateExecutor(deps);
});

afterEach(() => {
  executor.dispose();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('GateExecutor.run', () => {
  it('passa: grava o sha do HEAD no gate_runs e entrega ao router o desfecho "passou"', async () => {
    const g = start();
    await executor.run(g.id);
    const head = git(work, 'rev-parse', 'HEAD');
    expect(calls.complete).toEqual([[g.id, head]]);
    expect(calls.fail).toEqual([]);
    expect(repo.get(g.id)!.sha).toBe(head);
  });

  it('falha: o código ≠ 0 entrega o fim da saída e a segunda checagem não roda', async () => {
    const marker = path.join(tmp, 'segunda');
    setChecks(
      check('Lint', js("console.log('linha-um'); console.error('explodiu aqui'); process.exit(3)")),
      check('Testes', `touch ${shellQuote(marker)}`),
    );
    const g = start();
    await executor.run(g.id);
    expect(calls.complete).toEqual([]);
    expect(calls.fail).toHaveLength(1);
    const [id, result, body] = calls.fail[0]!;
    expect(id).toBe(g.id);
    expect(result).toBe('failed');
    expect(body).toContain('**Lint** falhou (código 3)');
    expect(body).toContain('linha-um');
    expect(body).toContain('explodiu aqui');
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('as checagens rodam em sequência, na ordem da coluna, na pasta da história', async () => {
    const out = path.join(tmp, 'ordem');
    setChecks(check('Um', `pwd >> ${shellQuote(out)}; echo um >> ${shellQuote(out)}`), check('Dois', `echo dois >> ${shellQuote(out)}`));
    const g = start();
    await executor.run(g.id);
    expect(fs.readFileSync(out, 'utf8').trim().split('\n')).toEqual([work, 'um', 'dois']);
    expect(calls.complete).toHaveLength(1);
  });

  it('timeout: encerra a árvore do processo e falha com "tempo esgotado"', async () => {
    const pidFile = path.join(tmp, 'pid');
    setChecks(
      check('Lenta', js(`require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)`), 1),
    );
    const g = start();
    await executor.run(g.id);
    expect(calls.complete).toEqual([]);
    expect(calls.fail[0]![1]).toBe('failed');
    expect(calls.fail[0]![2]).toContain('**Lenta** falhou (tempo esgotado em 1s)');
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    await waitFor(() => dead(pid));
  });

  it('pasta ausente: interrompe sem rodar nada', async () => {
    deps.workspaceOf = () => path.join(tmp, 'nao-existe');
    const marker = path.join(tmp, 'rodou');
    setChecks(check('X', `touch ${shellQuote(marker)}`));
    const g = start();
    await executor.run(g.id);
    expect(calls.fail).toEqual([[g.id, 'interrupted', 'Pasta de trabalho indisponível.']]);
    expect(calls.complete).toEqual([]);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('falha do git: falha fechada, sem checagem sem arquivos', async () => {
    deps.git = async () => {
      throw new Error('fatal: não é um repositório git');
    };
    const marker = path.join(tmp, 'rodou');
    setChecks(check('X', `touch ${shellQuote(marker)}`));
    const g = start();
    await executor.run(g.id);
    expect(calls.complete).toEqual([]);
    expect(calls.fail).toEqual([[g.id, 'interrupted', 'fatal: não é um repositório git']]);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('pasta em uso por outra execução: interrompe depois das tentativas e não rodou nada', async () => {
    const other = acquireWorkspace(work, 'outra', 1, 'outra-janela', path.join(tmp, 'locks'));
    expect(other).not.toBeNull();
    const marker = path.join(tmp, 'rodou');
    setChecks(check('X', `touch ${shellQuote(marker)}`));
    const g = start();
    await executor.run(g.id);
    expect(calls.fail).toEqual([[g.id, 'interrupted', 'A pasta ainda está em uso por outra execução.']]);
    expect(fs.existsSync(marker)).toBe(false);
    other!.release();
  });

  it('libera a reserva da pasta ao terminar', async () => {
    const g = start();
    await executor.run(g.id);
    const again = acquireWorkspace(work, 'depois', 1, 'teste', path.join(tmp, 'locks'));
    expect(again).not.toBeNull();
    again!.release();
  });

  it('sessão em execução: o comando só começa depois do onDidFinish do card', async () => {
    const marker = path.join(tmp, 'rodou');
    setChecks(check('X', `touch ${shellQuote(marker)}`));
    sessions.add('h1');
    const g = start();
    const done = executor.run(g.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(fs.existsSync(marker)).toBe(false);
    expect(calls.complete).toEqual([]);
    // o fim de outro card não libera
    sessions.delete('h1');
    finishListeners.forEach((l) => l('outro'));
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(marker)).toBe(false);
    finishListeners.forEach((l) => l('h1'));
    await done;
    expect(fs.existsSync(marker)).toBe(true);
    expect(calls.complete).toHaveLength(1);
    expect(finishListeners).toEqual([]);
  });

  it('a sessão da história também segura a verificação da sub-tarefa', async () => {
    state.cards.push(fakeCard('s1', { number: 2, workflowId: 'wc', columnId: 'todo', parentId: 'h1', status: 'verifying' }));
    state.columns.find((c) => c.id === 'todo')!.checks = [check('X', js("console.log('ok')"))];
    sessions.add('h1');
    const g = repo.start({ cardId: 's1', columnId: 'todo', targetColumnId: 'finished', kind: 'move' });
    const done = executor.run(g.id);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls.complete).toEqual([]);
    sessions.delete('h1');
    finishListeners.forEach((l) => l('h1'));
    await done;
    expect(calls.complete).toHaveLength(1);
  });

  it('a sessão que não termina até o teto de espera interrompe o portão', async () => {
    deps.waitCapMs = 50;
    sessions.add('h1');
    const g = start();
    await executor.run(g.id);
    expect(calls.fail[0]![1]).toBe('interrupted');
    expect(calls.fail[0]![2]).toContain('sessão da IA');
    expect(finishListeners).toEqual([]);
  });

  it('cancelamento: encerra o processo e interrompe, sem passar', async () => {
    const pidFile = path.join(tmp, 'pid');
    setChecks(
      check('Lenta', js(`require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)`)),
    );
    const g = start();
    const done = executor.run(g.id);
    await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8') !== '');
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    executor.cancel('h1');
    await done;
    expect(calls.complete).toEqual([]);
    expect(calls.fail).toEqual([[g.id, 'interrupted', 'A verificação foi cancelada.']]);
    await waitFor(() => dead(pid));
  });

  it('janela que não é a dona não executa e deixa o gate_runs running', async () => {
    owns = false;
    const marker = path.join(tmp, 'rodou');
    setChecks(check('X', `touch ${shellQuote(marker)}`));
    const g = start();
    await executor.run(g.id);
    expect(calls.complete).toEqual([]);
    expect(calls.fail).toEqual([]);
    expect(fs.existsSync(marker)).toBe(false);
    expect(repo.get(g.id)!.result).toBe('running');
  });

  it('execução inexistente ou já encerrada não faz nada', async () => {
    await executor.run('nada');
    const g = start();
    repo.finish(g.id, 'passed', '');
    await executor.run(g.id);
    expect(calls.complete).toEqual([]);
    expect(calls.fail).toEqual([]);
  });

  it('{base} e {changed_files} chegam como argumentos, mesmo com espaço, aspas e $ no nome', async () => {
    const out = path.join(tmp, 'args.json');
    setChecks(
      check(
        'Args',
        `${js('require("fs").writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))')} ${shellQuote(out)} {base} {changed_files}`,
      ),
    );
    const g = start();
    await executor.run(g.id);
    expect(calls.fail).toEqual([]);
    expect((JSON.parse(fs.readFileSync(out, 'utf8')) as string[]).sort()).toEqual(['a b.txt', "it's $x.txt", 'main']);
  });

  it('o PATH do shell de login vale para o comando', async () => {
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'minha-ferramenta'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    deps.shellPath = async () => `${bin}:${process.env.PATH}`;
    setChecks(check('Ferramenta', 'minha-ferramenta'));
    const g = start();
    await executor.run(g.id);
    expect(calls.complete).toHaveLength(1);
  });

  it('comando que não existe falha com o código do shell', async () => {
    setChecks(check('Inexistente', 'comando-que-nao-existe-xyz'));
    const g = start();
    await executor.run(g.id);
    expect(calls.fail[0]![1]).toBe('failed');
    expect(calls.fail[0]![2]).toContain('código 127');
  });

  it('o router que lança no desfecho não derruba o executor', async () => {
    deps.router.completeGate = () => {
      throw new Error('banco fechado');
    };
    const g = start();
    await expect(executor.run(g.id)).resolves.toBeUndefined();
    expect(calls.fail).toEqual([[g.id, 'interrupted', 'banco fechado']]);
  });
});

describe('GateExecutor.recoverAfterRestart', () => {
  it('running → interrupted e o card verifying volta para ready com a explicação', () => {
    const g = start();
    state.cards.push(fakeCard('h2', { number: 2, columnId: 'doing', status: 'ready' }));
    expect(executor.recoverAfterRestart()).toBe(1);
    expect(repo.get(g.id)!.result).toBe('interrupted');
    expect(calls.handled).toMatchObject([
      { type: 'card.status.set', cardId: 'h1', status: 'ready' },
      { type: 'comment.add', cardId: 'h1', body: expect.stringContaining('interrompida') },
    ]);
  });

  it('só a janela dona recupera', () => {
    owns = false;
    const g = start();
    expect(executor.recoverAfterRestart()).toBe(0);
    expect(repo.get(g.id)!.result).toBe('running');
    expect(calls.handled).toEqual([]);
  });
});

describe('GateExecutor.sweep', () => {
  const LIMIT = 30_000 + 15 * 60_000; // um tempo de checagem (30 s) + 15 min

  it('card verifying preso há mais que as checagens + 15 min volta para ready e encerra o gate_runs', () => {
    const g = start();
    expect(executor.sweep(LIMIT - 1)).toBe(0);
    expect(calls.handled).toEqual([]);
    expect(executor.sweep(LIMIT)).toBe(1);
    expect(repo.get(g.id)!.result).toBe('interrupted');
    expect(calls.handled).toMatchObject([{ type: 'card.status.set', cardId: 'h1', status: 'ready' }, { type: 'comment.add' }]);
  });

  it('card com execução viva nesta janela não é varrido', async () => {
    const pidFile = path.join(tmp, 'pid');
    setChecks(check('Lenta', js(`require('fs').writeFileSync(${JSON.stringify(pidFile)}, 'x'); setInterval(() => {}, 1000)`)));
    const g = start();
    const done = executor.run(g.id);
    await waitFor(() => fs.existsSync(pidFile));
    expect(executor.sweep(LIMIT * 10)).toBe(0);
    executor.cancel('h1');
    await done;
  });

  it('só a janela dona varre', () => {
    owns = false;
    start();
    expect(executor.sweep(LIMIT * 10)).toBe(0);
  });

  it('card que não está verifying ou está arquivado não entra', () => {
    state.cards[0]!.status = 'ready';
    expect(executor.sweep(LIMIT * 10)).toBe(0);
    state.cards[0]!.status = 'verifying';
    state.cards[0]!.archivedAt = 1;
    expect(executor.sweep(LIMIT * 10)).toBe(0);
  });
});

vi.setConfig({ testTimeout: 20_000 });
