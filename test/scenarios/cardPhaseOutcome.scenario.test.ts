// Cenário de ponta a ponta do bloco final da resposta (#1098): um card no perfil `claude` (modo CLI) cuja CLI termina
// bem sem chamar nenhuma ferramenta do board. Do `runner.start` até a conversa: o bloco JSON que fecha a resposta é
// aplicado (DONE, BLOCKED), o bloco quebrado ou ausente é pedido de novo na mesma sessão (`--resume`), a CLI sem
// retomada bloqueia direto e a ferramenta chamada vence o bloco. Só o processo da CLI é falso (ver cardWorld.ts).
import { afterEach, describe, expect, it } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

const SESSION = '5b0f7a52-3c1d-4c1e-8f7e-0a1b2c3d4e5f';
const block = (b: Record<string, unknown>) => JSON.stringify(b);
const DONE = block({ outcome: 'DONE', summary: 'Fase concluída.', failure_reason: null, pending: null });

/** O processo do Claude Code: a cada execução emite o `stream-json` com a resposta da vez (e a sessão) e sai com 0. */
const answering =
  (answers: string[], during?: (call: number) => void): SpawnFn =>
  (_command, _cwd, out) => {
    const call = calls++;
    let exit: (code: number | null) => void = () => {};
    setTimeout(() => {
      during?.(call);
      const text = answers[Math.min(call, answers.length - 1)]!;
      out(JSON.stringify({ type: 'system', subtype: 'init', session_id: SESSION }) + '\n', 'stdout');
      out(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: text,
          session_id: SESSION,
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 5 },
          modelUsage: { 'claude-sonnet': { inputTokens: 10, outputTokens: 5 } },
        }) + '\n',
        'stdout',
      );
      exit(0);
    }, 5);
    return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
  };

let calls = 0;
let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

const setup = async (spawn: SpawnFn, yolo = false) => {
  calls = 0;
  world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, permission: 'board', spawn });
  if (yolo) world.router.handle({ type: 'card.yolo.set', cardId: world.cardId, enabled: true });
  return world;
};
const cardOf = (w: CardWorld) => w.router.snapshot().cards.find((c) => c.id === w.cardId)!;
const resumed = (w: CardWorld) => w.cliCommands.map((c) => c.args.includes('--resume'));

describe('cenário: a fase termina com o bloco final, sem chamar ferramenta', () => {
  it('DONE fora do modo autônomo passa a vez para a pessoa e comenta o resumo', async () => {
    const w = await setup(answering([`Trabalho feito.\n\n${DONE}`]));
    const end = await w.run();

    expect(end.code).toBe(0);
    expect(w.cliCommands).toHaveLength(1);
    expect(['waiting_review', 'waiting_answer']).toContain(cardOf(w).status);
    expect(w.comments().find((b) => b.startsWith('Desfecho informado no bloco final'))).toContain('Fase concluída.');
    expect(w.lines.some((l) => l.includes('Bloco final: válido; ferramenta chamada: não; aplicado: sim; reparos: 0'))).toBe(true);
  });

  it('DONE no modo autônomo devolve o card à IA (ready)', async () => {
    const w = await setup(answering([DONE]), true);
    await w.run();
    expect(cardOf(w).status).toBe('ready');
    expect(w.comments().some((b) => b.includes('Fase concluída.'))).toBe(true);
  });

  it('BLOCKED bloqueia o card com o motivo e o resumo', async () => {
    const w = await setup(
      answering([block({ outcome: 'BLOCKED', summary: 'Sem acesso ao repositório.', failure_reason: 'Falta a credencial do git.' })]),
    );
    await w.run();
    expect(cardOf(w).status).toBe('blocked');
    expect(cardOf(w).statusReason).toContain('Falta a credencial do git.');
    expect(cardOf(w).statusReason).toContain('Sem acesso ao repositório.');
  });
});

describe('cenário: o bloco final vem quebrado ou ausente', () => {
  it('quebrado: o board retoma a sessão (--resume) e o bloco válido do reparo é aplicado', async () => {
    const w = await setup(answering(['Feito.\n{"outcome":"DONE","summary":', DONE]));
    await w.run();

    expect(resumed(w)).toEqual([false, true]);
    const repair = w.cliCommands[1]!;
    expect(repair.args[repair.args.indexOf('--resume') + 1]).toBe(SESSION);
    expect(repair.stdin ?? repair.args.join(' ')).toContain('não terminou com o bloco final válido');
    expect(['waiting_review', 'waiting_answer']).toContain(cardOf(w).status);
    expect(w.comments().some((b) => b.includes('Fase concluída.'))).toBe(true);
    expect(w.lines.some((l) => l.includes('reparos: 1') && l.includes('aplicado: sim'))).toBe(true);
  });

  it('ausente nos 3 turnos: bloqueia depois de 2 pedidos de reparo', async () => {
    const w = await setup(answering(['Terminei, sem bloco.']));
    await w.run();

    expect(resumed(w)).toEqual([false, true, true]);
    expect(cardOf(w).status).toBe('blocked');
    expect(cardOf(w).statusReason).toContain('encerrou sem responder na conversa nem mudar o status do card');
    expect(cardOf(w).statusReason).toContain('estava ausente (após 2 pedidos de reparo)');
  });
});

describe('cenário: a CLI não retoma a sessão', () => {
  it('bloco ausente bloqueia direto, sem pedido de reparo', async () => {
    const w = await setup(answering(['Terminei, sem bloco.']));
    // o Claude Code retoma; o gateway do cenário passa a dizer que esta CLI não
    (w.runnerDeps.gateway as unknown as { canResume: () => boolean }).canResume = () => false;
    await w.run();

    expect(w.cliCommands).toHaveLength(1);
    expect(cardOf(w).status).toBe('blocked');
    expect(cardOf(w).statusReason).toContain('esta ferramenta não retoma a sessão');
  });
});

describe('cenário: a ferramenta do board vence o bloco', () => {
  it('a IA responde pelo MCP e o bloco BLOCKED da resposta é ignorado', async () => {
    const w = await setup(
      answering([block({ outcome: 'BLOCKED', summary: 'Ignorado.', failure_reason: 'Ignorado.' })], () =>
        w2().router.handle(
          { type: 'comment.add', cardId: w2().cardId, body: 'Pronto, pelo MCP.' },
          { author: 'Claude Code', source: 'ai' },
        ),
      ),
    );
    await w.run();

    expect(w.cliCommands).toHaveLength(1);
    expect(cardOf(w).status).toBe('waiting_answer');
    expect(w.comments()).toContain('Pronto, pelo MCP.');
    expect(w.comments().some((b) => b.startsWith('Desfecho informado no bloco final'))).toBe(false);
    expect(w.lines.some((l) => l.includes('ferramenta chamada: sim') && l.includes('aplicado: não'))).toBe(true);
  });
});

const w2 = (): CardWorld => world!;
