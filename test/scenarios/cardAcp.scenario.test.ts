// Cenários de ponta a ponta do card com o agente da fase (épica "ferramenta por modo"): do
// `runner.start` (plano de execution.ts, gateway, admissão por capacidades, transporte ACP, leitor ACP,
// relatório, conferência) até a mensagem gravada na conversa do card. Só o processo da ferramenta é
// falso (ver cardWorld.ts). O cenário A é o print do usuário: o desvio falso "ferramenta think;
// ferramenta other" que os testes isolados não pegaram (#364).
import { afterEach, describe, expect, it } from 'vitest';
import { FakeAgent } from '../fakes/acpAgent';
import { cardWorld, CONDUTOR_TOOLS, GEMINI_MODEL, type CardWorld } from './cardWorld';

const DEVIATION = 'Conferência: a execução usou algo fora';

/**
 * O turno de um agente ACP que trabalha o card: pensa, chama uma ferramenta sem categoria, lê, roda um
 * comando (pedindo permissão ao board) e responde na conversa. A resposta na conversa é o efeito que o
 * `add_comment` do servidor do board teria: o servidor MCP não roda no cenário, então o efeito é
 * aplicado direto no router, como o servidor faria.
 */
const workingTurn = (world: () => CardWorld) => async (agent: FakeAgent) => {
  agent.update({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Pensando no card', kind: 'think', status: 'pending' });
  agent.update({ sessionUpdate: 'tool_call', toolCallId: 't2', title: 'activate_skill', kind: 'other', status: 'pending' });
  agent.update({ sessionUpdate: 'tool_call', toolCallId: 't3', title: 'Ler src/app.ts', kind: 'read', status: 'pending' });
  const execute = { toolCallId: 't4', title: 'npm test', kind: 'execute', status: 'pending' };
  agent.update({ sessionUpdate: 'tool_call', ...execute });
  await agent.ask(execute);
  agent.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Fase concluída.\n' } });
  const w = world();
  w.router.handle({ type: 'comment.add', cardId: w.cardId, body: 'Trabalho da fase feito.' }, { author: 'Gemini CLI', source: 'ai' });
  return { stopReason: 'end_turn', usage: { inputTokens: 1200, outputTokens: 300, cachedReadTokens: 200 } };
};

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

/** O texto que o board mandou no `session/prompt`. */
const promptOf = (agent: FakeAgent): string =>
  agent.received
    .find((m) => m.method === 'session/prompt')
    ?.params.prompt.map((p: { text: string }) => p.text)
    .join('\n') ?? '';

describe('cenário: card com agente da fase no perfil ACP do catálogo (Gemini), permissão full', () => {
  it('A: admitido, o agente vai pelo pedido e think/other/read/execute não viram desvio na conversa', async () => {
    const agent = new FakeAgent({ onPrompt: workingTurn(() => world!) });
    world = await cardWorld({ profile: 'gemini', tools: CONDUTOR_TOOLS, spawnAcp: agent.spawn });

    const end = await world.run();

    // admitido: o processo abriu (sem "Agente obrigatório precisa de definição do board") pelo binário vinculado
    expect(world.lines.join('\n')).not.toContain('Agente obrigatório precisa de definição do board');
    expect(world.lines.join('\n')).not.toContain('Não foi possível executar');
    // o modelo do card vai pela linha de comando do agente, como o catálogo do Gemini CLI manda
    expect(agent.command!.args).toEqual(['--acp', '--skip-trust', '--model', GEMINI_MODEL.model]);
    expect(agent.command!.command).toBe(`${world.root}/bin/gemini`);
    expect(world.aiRun()).toMatchObject({ tool: 'gemini', outcome: 'done' });
    // o agente da fase segue pelo pedido, que o ACP não tem descoberta nativa de agente
    expect(promptOf(agent)).toContain('Você atua como o agente "condutor-do-board"');
    // a permissão full liga o modo sem confirmação do agente, e o board respondeu o pedido do comando
    expect(agent.methods()).toContain('session/set_mode');
    expect(world.lines.some((l) => /pediu permissão para npm test: permitido/.test(l))).toBe(true);

    expect(end.outcome).toBe('done');
    expect(end.report.inventory.map((i) => i.name).sort()).toEqual(['execute', 'other', 'read', 'think']);
    expect(end.check).toEqual({ status: 'ok' });
    expect(world.lines.some((l) => l.endsWith('Conferência: sem desvio.'))).toBe(true);
    expect(world.comments().some((b) => b.startsWith(DEVIATION))).toBe(false);
    // terminou bem: respondeu na conversa e passou a vez à pessoa
    expect(world.router.snapshot().cards.find((c) => c.id === world!.cardId)?.status).toBe('waiting_answer');
  });

  it('B: o desvio real continua sendo pego: execute sem Bash liberado no card vira mensagem na conversa', async () => {
    const agent = new FakeAgent({ onPrompt: workingTurn(() => world!) });
    world = await cardWorld({
      profile: 'gemini',
      tools: CONDUTOR_TOOLS.filter((t) => t !== 'Bash'),
      spawnAcp: agent.spawn,
    });

    const end = await world.run();

    expect(end.outcome).toBe('done');
    expect(end.check).toEqual({ status: 'deviation', deviations: [{ kind: 'tool', name: 'execute', calls: 1 }] });
    expect(world.comments()).toContain(`${DEVIATION} do que o card liberou (ferramenta execute).`);
  });
});

describe('cenário: o mesmo card no perfil Claude CLI padrão', () => {
  it('C: o plano leva o agente inline e o comando do Claude Code tem --agents e --agent', async () => {
    world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS });

    const end = await world.run();

    // para no comando montado: o `spawn` falso guarda o comando e termina sem saída, sem Claude Code real
    const command = world.cliCommands[0]!;
    expect(command.command).toBe('claude');
    const agents = command.args[command.args.indexOf('--agents') + 1]!;
    expect(JSON.parse(agents)).toMatchObject({
      'condutor-do-board': { description: expect.stringContaining('Conduz os cards'), prompt: expect.stringContaining('Você conduz') },
    });
    expect(command.args[command.args.indexOf('--agent') + 1]).toBe('condutor-do-board');
    // o agente vai por parâmetro: o pedido não o repete como texto
    expect(command.stdin ?? command.args.join(' ')).not.toContain('Você atua como o agente');
    expect(world.lines.some((l) => l.includes('Agente do board: condutor-do-board (inline)'))).toBe(true);
    expect(world.aiRun()).toMatchObject({ tool: 'claude' });
    expect(end.code).toBe(0);
  });
});

describe('cenário: Gemini ACP como perfil padrão do board (o agente criado para o Claude)', () => {
  it('D: o desvio real (execute sem Bash) é pego e think/other/read continuam sem desvio', async () => {
    const agent = new FakeAgent({ onPrompt: workingTurn(() => world!) });
    world = await cardWorld({
      profile: 'gemini',
      boardDefault: true,
      tools: CONDUTOR_TOOLS.filter((t) => t !== 'Bash'),
      spawnAcp: agent.spawn,
    });
    expect(world.router.snapshot().board.aiTool).toBe('gemini');

    const end = await world.run();

    expect(world.aiRun()).toMatchObject({ tool: 'gemini', outcome: 'done' });
    // só o execute desvia; think, other e read não
    expect(end.check).toEqual({ status: 'deviation', deviations: [{ kind: 'tool', name: 'execute', calls: 1 }] });
    expect(world.comments()).toContain(`${DEVIATION} do que o card liberou (ferramenta execute).`);
  });

  it('E: com Bash liberado não há desvio, e a linha de log mostra gemini sem máscara', async () => {
    const agent = new FakeAgent({ onPrompt: workingTurn(() => world!) });
    world = await cardWorld({ profile: 'gemini', boardDefault: true, tools: CONDUTOR_TOOLS, spawnAcp: agent.spawn });

    const end = await world.run();

    expect(end.check).toEqual({ status: 'ok' });
    const call = world.lines.find((l) => l.includes('Chamando Gemini CLI (ACP)'))!;
    expect(call).toContain('gemini');
    expect(call).toBe('[#1] Chamando Gemini CLI (ACP): gemini --acp --skip-trust');
    expect(call).not.toContain('[credencial local]');
  });
});
