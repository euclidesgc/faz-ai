// Cenário de ponta a ponta da subida de modelo quando a checagem falha (#1108): o card real num mundo de cenário
// (`cardWorld`), o portão de verdade (`GateExecutor` rodando um `node -e` numa pasta git de verdade) e o router de
// verdade. Só o processo da CLI do Claude Code é falso: a cada execução ele guarda o comando montado e, como a IA,
// tenta mover o card para a coluna seguinte. A 1ª falha sobe o Modelo um nível e comenta; a 2ª passa o card para a
// pessoa; o modelo escolhido à mão não muda; e a correção criada por `create_card` já nasce no nível acima.
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { GateExecutor } from '../../src/extension/gate';
import { createMcpServer } from '../../src/extension/mcp/server';
import { shellQuote } from '../../src/shared/gate';
import { valueOf } from '../../src/shared/selectors';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' }).trim();

const OK = '{"type":"result","subtype":"success","is_error":false,"result":"Pronto","session_id":"s1"}\n';

/** `node -e` que sempre falha, com um motivo na saída. */
const failing = `${shellQuote(process.execPath)} -e ${shellQuote(`console.error('esperado 2, recebeu 3');process.exit(1)`)}`;

interface Scenario {
  w: CardWorld;
  executor: GateExecutor;
  /** o portão aberto em cada tentativa de mover, na ordem */
  opened: string[];
  /** o `--model` de cada execução da CLI */
  models: () => (string | null)[];
  /** executa o card (a CLI falsa tenta mover para a coluna seguinte) e roda o portão que ela abriu */
  attempt: () => Promise<void>;
  modelField: () => string | null;
  /** o Modelo escolhido à mão pela pessoa */
  handPick: (value: string) => void;
  status: () => string | null;
  columnName: () => string;
}

/** O modelo e o esforço que o comando montado pede (`--model <x> --effort <y>`), como `modelo@esforço`. */
const modelOf = (args: readonly string[]): string | null => {
  const at = args.indexOf('--model');
  if (at < 0) return null;
  const effort = args.indexOf('--effort');
  return `${args[at + 1]}${effort < 0 ? '' : `@${args[effort + 1]}`}`;
};

let current: { w: CardWorld; executor: GateExecutor } | undefined;
afterEach(() => {
  current?.executor.dispose();
  current?.w.dispose();
  current = undefined;
});

async function scenario(): Promise<Scenario> {
  const opened: string[] = [];
  const held: { w?: CardWorld } = {};
  const ai = { author: 'Claude Code', source: 'ai' as const };
  const nextColumn = () => {
    const s = held.w!.router.snapshot();
    const card = s.cards.find((c) => c.id === held.w!.cardId)!;
    const here = s.columns.find((c) => c.id === card.columnId)!;
    return s.columns.filter((c) => c.workflowId === here.workflowId).sort((a, b) => a.position - b.position)[here.position + 1]!;
  };
  // a CLI falsa: a IA termina o trabalho e tenta mover o card para a coluna seguinte (o portão abre e a execução acaba)
  const spawn: SpawnFn = (_command, _cwd, out) => {
    let exit: (code: number | null) => void = () => {};
    queueMicrotask(() => {
      held.w!.router.handle({ type: 'card.move', cardId: held.w!.cardId, columnId: nextColumn().id, position: 0 }, ai);
      out(OK, 'stdout');
      exit(0);
    });
    return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
  };
  held.w = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, permission: 'board', spawn });
  const world = held.w;
  // o Modelo do card vem da regra de sugestão do board (Esforço Médio → Sonnet · medium), sem escolha à mão
  const effort = world.router.snapshot().fieldDefs.find((f) => f.name === 'Esforço da atividade')!;
  world.router.handle({ type: 'field.setValue', cardId: world.cardId, fieldId: effort.id, value: 'Médio' });
  git(world.project, 'init', '-q', '-b', 'main');
  git(world.project, 'config', 'user.email', 't@t');
  git(world.project, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(world.project, 'base.txt'), 'x');
  git(world.project, 'add', '.');
  git(world.project, 'commit', '-qm', 'base');
  git(world.project, 'checkout', '-qb', 'feature/h1');
  fs.writeFileSync(path.join(world.project, 'mudanca.txt'), 'x');
  git(world.project, 'add', '.');
  git(world.project, 'commit', '-qm', 'mudança');

  // a principal vem do cenário: o router nasceu antes de a pasta virar um repositório
  world.router.handle({ type: 'settings.board.update', patch: { git: { mainBranch: 'main' } } } as never);
  const s0 = world.router.snapshot();
  const here = s0.columns.find((c) => c.id === s0.cards.find((c2) => c2.id === world.cardId)!.columnId)!;
  world.router.handle({
    type: 'settings.column.update',
    columnId: here.id,
    patch: { checks: [{ name: 'Testes', command: failing, timeoutSec: 30 }] },
  });
  world.router.onGate((id) => opened.push(id));
  const executor = new GateExecutor({
    repo: new (await import('../../src/extension/repositories/gateRepo')).GateRepo(world.db),
    router: world.router,
    runner: { isRunning: () => false, onDidFinish: () => () => {} },
    state: () => world.router.snapshot(),
    ownsBoard: () => true,
    workspaceOf: () => world.project,
    instance: 'cenario',
    log: () => {},
    git: (args, cwd) =>
      new Promise((resolve, reject) => execFile('git', args, { cwd }, (e, out) => (e ? reject(e) : resolve(String(out))))),
    shellPath: async () => undefined,
    coordinationDir: path.join(world.root, 'locks'),
    acquireTries: 2,
    acquireDelayMs: 10,
  });
  current = { w: world, executor };

  const card = () => world.router.snapshot().cards.find((c) => c.id === world.cardId)!;
  return {
    w: world,
    executor,
    opened,
    models: () => world.cliCommands.map((c) => modelOf(c.args)),
    attempt: async () => {
      const before = opened.length;
      await world.run();
      expect(opened).toHaveLength(before + 1);
      await executor.run(opened[before]!);
    },
    modelField: () => {
      const s = world.router.snapshot();
      return valueOf(s, world.cardId, s.fieldDefs.find((f) => f.kind === 'model')!.id) as string | null;
    },
    handPick: (value: string) => {
      const field = world.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
      world.router.handle({ type: 'field.setValue', cardId: world.cardId, fieldId: field.id, value });
    },
    status: () => card().status,
    columnName: () => {
      const s = world.router.snapshot();
      return s.columns.find((c) => c.id === card().columnId)!.name;
    },
  };
}

describe('cenário: a checagem falha e o modelo da correção sobe', () => {
  it('a 1ª falha sobe um nível e comenta; a reexecução recebe o modelo acima; a 2ª falha passa o card para a pessoa', async () => {
    const sc = await scenario();
    await sc.attempt();
    expect(sc.models()).toEqual(['sonnet@medium']);
    expect(sc.status()).toBe('ready');
    expect(sc.columnName()).not.toBe('Revisão');
    expect(sc.modelField()).toBe('claude:sonnet@high');
    expect(sc.w.comments()).toContain('Modelo subiu de Sonnet 5.5 · medium para Sonnet 5.5 · high porque a checagem "Testes" falhou.');

    // a reexecução recebe o modelo acima
    await sc.attempt();
    expect(sc.models()).toEqual(['sonnet@medium', 'sonnet@high']);
    // a mesma unidade falhou de novo depois da subida: o card passa para a pessoa, sem subir outra vez
    expect(sc.status()).toBe('blocked');
    expect(sc.modelField()).toBe('claude:sonnet@high');
    expect(sc.w.comments()).toContain('A checagem "Testes" falhou de novo depois de subir o modelo; o card passou para a pessoa.');
    expect(sc.w.comments().filter((b) => b.startsWith('Modelo subiu'))).toHaveLength(1);
  });

  it('o modelo escolhido à mão não sobe: o card segue ready e a execução seguinte usa o mesmo modelo', async () => {
    const sc = await scenario();
    sc.handPick('claude:opus@low');
    await sc.attempt();
    expect(sc.status()).toBe('ready');
    expect(sc.modelField()).toBe('claude:opus@low');
    expect(sc.w.comments()).toContain(
      `O modelo de #${sc.w.router.snapshot().cards.find((c) => c.id === sc.w.cardId)!.number} não subiu: foi escolhido à mão.`,
    );
    await sc.attempt();
    expect(sc.models()).toEqual(['opus@low', 'opus@low']);
    expect(sc.status()).toBe('ready');
  });

  it('história com sub-tarefa na fase: a falha deixa a subida pendente e a correção criada por create_card já nasce no nível acima', async () => {
    const sc = await scenario();
    const { w } = sc;
    const s = w.router.snapshot();
    const story = s.cards.find((c) => c.id === w.cardId)!;
    const phase = s.columns.find((c) => c.id === story.columnId)!.name;
    const child = s.workflows.find((x) => x.kind === 'child')!;
    const field = (name: string) => w.router.snapshot().fieldDefs.find((f) => f.name === name)!;
    // o passo já concluído da fase, com o modelo que "errou" (Sonnet · medium pela regra do Esforço Médio)
    const done = w.router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === child.id)!.id,
      columnId: s.columns.find((c) => c.workflowId === child.id && c.name === 'Concluído')!.id,
      parentId: story.id,
      title: 'Passo',
    });
    w.router.handle(
      { type: 'field.setValue', cardId: done, fieldId: field('Fase').id, value: phase },
      { author: 'Claude Code', source: 'ai' },
    );
    w.router.handle({ type: 'field.setValue', cardId: done, fieldId: field('Esforço da atividade').id, value: 'Médio' });

    await sc.attempt();
    expect(sc.status()).toBe('ready');
    expect(sc.modelField()).toBe('claude:sonnet@medium');
    expect(w.comments()).toContain('A correção subirá de Sonnet 5.5 · medium para Sonnet 5.5 · high porque a checagem "Testes" falhou.');

    // a IA cria a sub-tarefa de correção pelo MCP, sem escolher modelo
    const server = createMcpServer({
      getRouter: async () => w.router,
      getRunner: async () => undefined,
      workspaceDir: w.project,
      version: 'test',
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 'claude-code', version: '1' });
    await client.connect(b);
    const res = await client.callTool({
      name: 'create_card',
      arguments: { title: 'Corrigir os testes', parent: story.number, fields: { Fase: phase } },
    });
    expect(res.isError).not.toBe(true);
    const fix = w.router.snapshot().cards.find((c) => c.title === 'Corrigir os testes')!;
    const model = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
    expect(valueOf(w.router.snapshot(), fix.id, model.id)).toBe('claude:sonnet@high');
    const text = (id: string) =>
      w.router
        .snapshot()
        .comments.filter((c) => c.cardId === id)
        .map((c) => c.body);
    expect(text(fix.id)).toContain('Modelo subiu de Sonnet 5.5 · medium para Sonnet 5.5 · high porque a checagem "Testes" falhou.');
    await client.close();
  });
});
