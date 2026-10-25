// Cenário de ponta a ponta da cota do Cursor esgotada: um card no perfil `cursor` (modo CLI) cuja CLI recusa na
// primeira resposta, como a 2026.10.22 numa conta Free ("ActionRequiredError: You've hit your usage limit ..."),
// e sai com 1. Do `runner.start` até o desfecho: o leitor liga o limite de uso, o card volta para a IA (não fica
// bloqueado), o perfil fica pausado e, com uma regra de fallback, a execução segue em outro agente. Só o processo
// da CLI é falso (ver cardWorld.ts).
import { afterEach, describe, expect, it } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { canDispatch, pauseOf } from '../../src/shared/usageLimit';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

const LIMIT = 'O limite de uso do plano do';
const SESSION = '9356450d-ec17-46dd-93d5-fc15f3bf4190';

/** O processo da CLI: o que o cursor-agent escreveu de verdade ao recusar por cota, saindo com 1. */
const refusing: SpawnFn = (_command, _cwd, out) => {
  let exit: (code: number | null) => void = () => {};
  setTimeout(() => {
    out(
      JSON.stringify({ type: 'system', subtype: 'init', apiKeySource: 'login', cwd: '/projeto', session_id: SESSION, model: 'Auto' }) +
        '\n',
      'stdout',
    );
    out(
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'oi' }] }, session_id: SESSION }) + '\n',
      'stdout',
    );
    out("ActionRequiredError: You've hit your usage limit Get Cursor Pro for more Agent usage, unlimited Tab, and more.\n", 'stdout');
    exit(1);
  }, 5);
  // a árvore de processos acaba junto com o processo: o empréstimo do .cursor/mcp.json é devolvido na hora
  return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
};

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

describe('cenário: o Cursor esgota a cota do agente', () => {
  it('sem regra: o card volta para a IA, o perfil Cursor pausa pelo backoff e os outros perfis seguem', async () => {
    world = await cardWorld({ profile: 'cursor', tools: CONDUTOR_TOOLS, permission: 'board', spawn: refusing });
    const before = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!.status;

    const end = await world.run();

    expect(end.code).toBe(1);
    expect(end.report.usageLimitReached).toBe(true);
    expect(world.aiRun()).toMatchObject({ tool: 'cursor', mode: 'cli' });
    const card = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!;
    // o limite renova sozinho: o card volta para a IA, sem bloqueio esperando a pessoa
    expect(card.status).toBe(before);
    const pause = pauseOf(world.router.snapshot(), 'cursor');
    expect(pause).toMatchObject({ profileId: 'cursor', source: 'backoff' });
    expect(world.comments().some((b) => b.startsWith(LIMIT))).toBe(true);
    expect(world.lines.some((l) => l.includes('Perfil Cursor') && l.includes('pausado pelo limite de uso'))).toBe(true);
    const state = world.router.snapshot();
    expect(canDispatch(state, 'cursor', Date.now())).toBe(false);
    expect(canDispatch(state, 'claude', Date.now())).toBe(true);
  });
});

describe('cenário: o Cursor esgota a cota com uma regra de fallback', () => {
  it('a execução segue no outro agente da regra, sem pausar o perfil Cursor', async () => {
    world = await cardWorld({ profile: 'cursor', tools: CONDUTOR_TOOLS, permission: 'board', spawn: refusing });
    world.router.handle({
      type: 'settings.executionPolicy.save',
      expectedRevision: 0,
      reviewed: true,
      policy: {
        version: 1,
        id: 'cursor-quota',
        name: 'Cursor esgota → Claude Code',
        enabled: true,
        priority: 10,
        conditions: {
          profileIds: ['cursor'],
          models: ['auto'],
          actions: [],
          agentIds: [],
          phaseIds: [],
          cardTypeIds: [],
          origins: [],
          failures: ['quota'],
          explicit: 'include',
        },
        action: 'auto',
        targets: [{ profileId: 'claude', model: null, effort: null }],
        limits: { maxAttempts: 2, maxElapsedMs: 60_000, backoffMs: 0, globalProcesses: 2, perProfile: { cursor: 1 } },
      },
    });

    await world.run();

    // a CLI do Cursor recusou e a mesma execução seguiu no Claude Code, o segundo comando montado
    expect(world.cliCommands.map((c) => c.command)).toEqual(['cursor-agent', 'claude']);
    expect(world.lines.some((l) => l.includes('Política de execução: fallback'))).toBe(true);
    expect(world.comments().find((b) => b.includes('esgotou o limite; a execução segue com'))).toContain('Claude Code');
    // a regra trocou o alvo: o perfil Cursor não fica pausado
    expect(pauseOf(world.router.snapshot(), 'cursor')).toBeNull();
  });
});
