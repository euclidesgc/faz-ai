import { beforeEach, describe, expect, it } from 'vitest';
import { Maintenance } from '../src/extension/maintenance';
import type { BoardState } from '../src/shared/model';

/** Uma promessa que o teste resolve quando quiser. */
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

let order: string[];
let log: string[];
let mode: 'off' | 'branch' | 'worktree';
/** o `git` falso: o que cada comando faz, por subcomando */
let gitFails: { revParse?: boolean; remote?: boolean; fetch?: string };
/** os passos que o teste segura: sem entrada, o passo resolve na hora */
let gates: Partial<Record<'merges' | 'sync' | 'orphans' | 'releases', Promise<void>>>;
let throws: Partial<Record<'merges' | 'sync' | 'orphans' | 'releases', boolean>>;
let maintenance: Maintenance;

const step = (name: 'merges' | 'sync' | 'orphans' | 'releases') => async () => {
  order.push(name);
  if (throws[name]) throw new Error(`${name} quebrou`);
  await gates[name];
  order.push(`${name} fim`);
};

beforeEach(() => {
  order = [];
  log = [];
  mode = 'branch';
  gitFails = {};
  gates = {};
  throws = {};
  maintenance = new Maintenance({
    cwd: '/projeto',
    log: (l) => log.push(l),
    snapshot: () => ({ board: { git: { mode } } }) as BoardState,
    git: async (args) => {
      if (args[0] === 'rev-parse' && gitFails.revParse) throw new Error('fatal: not a git repository');
      if (args[0] === 'remote' && gitFails.remote) throw new Error("error: No such remote 'origin'");
      if (args[0] === 'fetch') {
        order.push('fetch');
        if (gitFails.fetch) throw new Error(gitFails.fetch);
      }
      return '';
    },
    merges: step('merges'),
    sync: step('sync'),
    orphans: step('orphans'),
    releases: step('releases'),
  });
});

describe('Maintenance: a ordem da manutenção do heartbeat (#722)', () => {
  it('fetch → merges → sync → órfãs e versões; resolve depois da sync, com órfãs e versões ainda pendentes (RF1)', async () => {
    const orphans = deferred();
    const releases = deferred();
    gates.orphans = orphans.promise;
    gates.releases = releases.promise;
    await maintenance.run();
    expect(order).toEqual(['fetch', 'merges', 'merges fim', 'sync', 'sync fim', 'orphans', 'releases']);
    orphans.resolve();
    releases.resolve();
    await maintenance.idle();
    expect(order.slice(-2).sort()).toEqual(['orphans fim', 'releases fim']);
  });

  it('as versões publicadas rodam depois dos merges, na mesma rodada', async () => {
    await maintenance.run();
    await maintenance.idle();
    expect(order.indexOf('releases')).toBeGreaterThan(order.indexOf('merges fim'));
  });

  it('com uma manutenção em andamento, outra rodada não chama nada de novo e espera a mesma (RF3)', async () => {
    const merges = deferred();
    gates.merges = merges.promise;
    const first = maintenance.run();
    await flush();
    const second = maintenance.run();
    let secondDone = false;
    void second.then(() => (secondDone = true));
    await flush();
    expect(order).toEqual(['fetch', 'merges']);
    expect(secondDone).toBe(false);
    merges.resolve();
    await Promise.all([first, second]);
    expect(order.filter((o) => o === 'fetch')).toHaveLength(1);
    expect(order.filter((o) => o === 'merges')).toHaveLength(1);
    // terminada a manutenção, a próxima rodada começa outra
    await maintenance.idle();
    await maintenance.run();
    expect(order.filter((o) => o === 'fetch')).toHaveLength(2);
  });

  it('fetch falhando: sem sync, com merges, órfãs e versões; o motivo vai para o log uma vez (RF16)', async () => {
    gitFails.fetch = 'fatal: unable to access github.com\nmais detalhes';
    await maintenance.run();
    await maintenance.idle();
    expect(order).not.toContain('sync');
    expect(order).toEqual(expect.arrayContaining(['merges', 'orphans', 'releases']));
    expect(log).toEqual(['Branches: a sincronização ficou para a próxima rodada: fatal: unable to access github.com.']);
    // a mesma falha na rodada seguinte não repete a linha
    await maintenance.run();
    await maintenance.idle();
    expect(log).toHaveLength(1);
    // um fetch que dá certo limpa o motivo: a mesma falha depois volta ao log
    delete gitFails.fetch;
    await maintenance.run();
    await maintenance.idle();
    expect(order.filter((o) => o === 'sync')).toHaveLength(1);
    gitFails.fetch = 'fatal: unable to access github.com';
    await maintenance.run();
    expect(log).toHaveLength(2);
  });

  it('sem origin: sem fetch nem sync, com uma linha de log', async () => {
    gitFails.remote = true;
    await maintenance.run();
    await maintenance.idle();
    expect(order).not.toContain('fetch');
    expect(order).not.toContain('sync');
    expect(log).toEqual(['Branches: a sincronização ficou para a próxima rodada: o repositório não tem origin.']);
  });

  it("com o git do board desligado ('off') ou fora de um repositório: nada novo, nem no log (RF18)", async () => {
    for (const setup of [() => (mode = 'off'), () => (gitFails.revParse = true)]) {
      order = [];
      mode = 'branch';
      gitFails = {};
      setup();
      await maintenance.run();
      await maintenance.idle();
      expect(order.filter((o) => !o.endsWith(' fim'))).toEqual(['merges', 'orphans', 'releases']);
      expect(log).toEqual([]);
    }
  });

  it('um passo que rejeita não impede os seguintes, e a falha vai para o log', async () => {
    throws.merges = true;
    throws.sync = true;
    await maintenance.run();
    await maintenance.idle();
    expect(order.filter((o) => !o.endsWith(' fim'))).toEqual(['fetch', 'merges', 'sync', 'orphans', 'releases']);
    expect(log).toEqual([
      'Manutenção: falha inesperada em merges: merges quebrou',
      'Manutenção: falha inesperada em sincronização das branches: sync quebrou',
    ]);
  });
});
