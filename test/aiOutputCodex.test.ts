// Os eventos destes dois leitores (`codex.ts` e `stream.ts`, passo 5) são montados aqui à mão com
// `JSON.stringify`, a partir da DOCUMENTAÇÃO de referência (learn.chatgpt.com/docs/non-interactive-mode
// para o Codex; a documentação de Cursor e Kimi para o genérico) — ao contrário do teste do Claude
// Code (`aiOutputClaude.test.ts`), que roda contra um fixture de saída REAL capturada de
// `claude 2.1.278`. Nenhuma das quatro CLIs está instalada nesta máquina: não há como capturar saída
// real para comparar. Isto não é uma lacuna a esconder — é a honestidade que o PRD pede.
import { describe, expect, it } from 'vitest';
import { codexReader } from '../src/extension/aiOutput/codex';
import { streamReader } from '../src/extension/aiOutput/stream';
import type { OutputReader, ReaderDeps } from '../src/extension/aiOutput/reader';
import type { ModelOption } from '../src/shared/models';

/** Passa linhas pelo leitor do Codex e devolve o leitor e as linhas legíveis que saíram. */
function readCodex(lines: string[], deps: Partial<ReaderDeps> = {}): { reader: OutputReader; shown: string[] } {
  const reader = codexReader({ catalog: [], model: null, ...deps });
  const shown = lines.flatMap((line) => reader.push(line, 'stdout'));
  return { reader, shown };
}

/** Passa linhas pelo leitor genérico e devolve o leitor e as linhas legíveis que saíram. */
function readStream(lines: string[], deps: Partial<ReaderDeps> = {}): { reader: OutputReader; shown: string[] } {
  const reader = streamReader({ catalog: [], model: null, ...deps });
  const shown = lines.flatMap((line) => reader.push(line, 'stdout'));
  return { reader, shown };
}

const codexModel = (price?: ModelOption['price']): ModelOption => ({
  id: 'codex:gpt-5-codex',
  tool: 'codex',
  model: 'codex',
  label: 'GPT-5 Codex',
  efforts: [],
  defaultEffort: null,
  ...(price ? { price } : {}),
});

describe('leitor do codex exec --json, pela documentação (sem CLI instalada para conferir)', () => {
  // dois turnos: o primeiro soma raciocínio ao `output_tokens` real se o leitor errar por simetria
  // com o Claude; o segundo prova que `turns` soma (1 + 1 = 2), o oposto do Claude
  const EVENTS = [
    JSON.stringify({ type: 'thread.started', thread_id: 'abcdefgh-1111-2222-3333-444444444444' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'ls -la', status: 'in_progress' } }),
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item_1', type: 'command_execution', command: 'ls -la', aggregated_output: 'ok', exit_code: 0, status: 'completed' },
    }),
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item_2', type: 'file_change', changes: [{ path: '/repo/src/foo.ts', kind: 'update' }], status: 'completed' },
    }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_3', type: 'web_search', query: 'vitest docs' } }),
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'item_4', type: 'mcp_tool_call', server: 'faz-ai', tool: 'add_comment', arguments: {}, status: 'completed' },
    }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_5', type: 'reasoning', text: 'pensando...' } }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_6', type: 'todo_list', items: [] } }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_7', type: 'tipo_futuro_desconhecido', foo: 'bar' } }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_8', type: 'agent_message', text: 'Primeira resposta.' } }),
    // se `reasoning_output_tokens` (40) fosse somado, este turno daria 90 de saída, não 50
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 50, reasoning_output_tokens: 40 },
    }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_9', type: 'agent_message', text: 'Resposta final.' } }),
    // se somado, este turno daria 20 de saída, não 15
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 20, cached_input_tokens: 5, output_tokens: 15, reasoning_output_tokens: 5 },
    }),
  ];

  it('os quatro tokens de `turn.completed.usage`, somados entre os dois turnos (o oposto do Claude)', () => {
    const c = readCodex(EVENTS).reader.report().consumption!;
    expect(c.inputTokens).toBe(120);
    expect(c.cacheReadTokens).toBe(15);
    expect(c.outputTokens).toBe(65);
  });

  it('`reasoning_output_tokens` NÃO entra na soma: somado, a saída daria 110, não 65', () => {
    const c = readCodex(EVENTS).reader.report().consumption!;
    expect(c.outputTokens).toBe(65);
    expect(c.outputTokens).not.toBe(110);
  });

  it('dois `turn.completed` SOMAM e `turns` dá 2 (no Claude, `num_turns` também soma, mas o consumo é o último, não a soma)', () => {
    expect(readCodex(EVENTS).reader.report().consumption!.turns).toBe(2);
  });

  it('`cacheWriteTokens` é 0: o Codex não informa criação de cache, e isso não é "mediu e deu zero"', () => {
    expect(readCodex(EVENTS).reader.report().consumption!.cacheWriteTokens).toBe(0);
  });

  it('o id da sessão vem de `thread.started.thread_id`, cortado em 8 caracteres', () => {
    expect(readCodex(EVENTS).reader.report().consumption!.sessionId).toBe('abcdefgh-1111-2222-3333-444444444444');
  });

  it('sem custo informado e com preço no catálogo, o custo é estimado e marcado como tal', () => {
    const preco = { input: 2, output: 10, cacheRead: 0.5, cacheWrite: 1 };
    const { reader } = readCodex(EVENTS, { model: 'codex', catalog: [codexModel(preco)] });
    const c = reader.report().consumption!;
    const esperado = (120 * preco.input + 65 * preco.output + 15 * preco.cacheRead + 0 * preco.cacheWrite) / 1e6;
    expect(c.costUsd).toBeCloseTo(esperado, 10);
    expect(c.costEstimated).toBe(true);
  });

  it('com `deps.model` nulo, não há de onde estimar: `costUsd` fica nulo e os tokens continuam gravados', () => {
    const preco = { input: 2, output: 10, cacheRead: 0.5, cacheWrite: 1 };
    const { reader } = readCodex(EVENTS, { model: null, catalog: [codexModel(preco)] });
    const c = reader.report().consumption!;
    expect(c.costUsd).toBeNull();
    expect(c.costEstimated).toBe(false);
    expect(c.inputTokens).toBe(120);
    expect(c.outputTokens).toBe(65);
  });

  it('a medição é completa: houve `turn.completed` com `usage` legível', () => {
    expect(readCodex(EVENTS).reader.report().measure).toBe('full');
  });

  it('o inventário sai dos tipos de item documentados, incluindo `mcp_tool_call` como `servidor/ferramenta`', () => {
    const inventory = readCodex(EVENTS).reader.report().inventory;
    expect([...inventory].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { kind: 'tool', name: 'Edit', calls: 1 },
      { kind: 'mcp_tool', name: 'faz-ai/add_comment', calls: 1 },
      { kind: 'tool', name: 'Shell', calls: 1 },
      { kind: 'tool', name: 'WebSearch', calls: 1 },
    ]);
  });

  it('tipo de item desconhecido não entra no inventário', () => {
    const nomes = readCodex(EVENTS)
      .reader.report()
      .inventory.map((i) => i.name);
    expect(nomes).not.toContain('tipo_futuro_desconhecido');
  });

  it('`reasoning` e `todo_list` também não entram no inventário', () => {
    const inventory = readCodex(EVENTS).reader.report().inventory;
    expect(inventory.some((i) => i.name === 'reasoning' || i.name === 'todo_list')).toBe(false);
  });

  it('a resposta é o texto do ÚLTIMO `agent_message`', () => {
    const answer = readCodex(EVENTS).reader.report().answer;
    expect(answer).toBe('Resposta final.');
    expect(answer).not.toContain('Primeira resposta');
  });

  it('nenhuma linha mostrada à pessoa é um objeto JSON', () => {
    const { shown } = readCodex(EVENTS);
    expect(shown.length).toBeGreaterThan(0);
    for (const line of shown) expect(line).not.toContain('{"type"');
  });
});

describe('leitor genérico de stream-json (Cursor/Kimi), pela documentação, sem bloco de uso garantido', () => {
  it('bloco de uso presente: medição completa, com os tokens dele', () => {
    const events = [
      JSON.stringify({ type: 'system', session_id: 'sess-1' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Olá' }] } }),
      JSON.stringify({ type: 'tool_call', name: 'Read' }),
      JSON.stringify({
        type: 'result',
        result: 'Tudo certo.',
        usage: { input_tokens: 30, output_tokens: 12, cache_read_input_tokens: 4, cache_creation_input_tokens: 2 },
      }),
    ];
    const { reader } = readStream(events);
    const report = reader.report();
    expect(report.measure).toBe('full');
    expect(report.consumption).toEqual({
      inputTokens: 30,
      outputTokens: 12,
      cacheReadTokens: 4,
      cacheWriteTokens: 2,
      turns: null,
      sessionId: 'sess-1',
      costUsd: null,
      costEstimated: false,
    });
    expect(report.answer).toBe('Tudo certo.');
  });

  it('o caso central: sem bloco de uso mas com `tool_call`, a medição é parcial, o consumo fica nulo e o inventário intacto', () => {
    const events = [
      JSON.stringify({ type: 'system', session_id: 'sess-2' }),
      JSON.stringify({ type: 'tool_call', name: 'Write' }),
      JSON.stringify({ type: 'result', result: 'Feito' }),
    ];
    const { reader } = readStream(events);
    const report = reader.report();
    expect(report.measure).toBe('partial');
    expect(report.consumption).toBeNull();
    expect(report.inventory).toEqual([{ kind: 'tool', name: 'Write', calls: 1 }]);
    expect(report.answer).toBe('Feito');
  });

  it('`mcp__a_b__c` entra como ferramenta MCP `a_b/c`: o corte é no primeiro `__` depois do prefixo', () => {
    const { reader } = readStream([JSON.stringify({ type: 'tool_call', name: 'mcp__a_b__c' })]);
    expect(reader.report().inventory).toEqual([{ kind: 'mcp_tool', name: 'a_b/c', calls: 1 }]);
  });

  it('aceita as duas formas de texto do assistente: lista de blocos e string solta', () => {
    const events = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Bloco 1' }] } }),
      JSON.stringify({ type: 'assistant', message: { text: 'Bloco 2 via message.text' } }),
      JSON.stringify({ type: 'assistant', text: 'Bloco 3 via text' }),
    ];
    const { reader, shown } = readStream(events);
    expect(shown).toContain('Bloco 1');
    expect(shown).toContain('Bloco 2 via message.text');
    expect(shown).toContain('Bloco 3 via text');
    // sem nenhum `result`, a resposta cai para o texto do assistente (a reserva)
    const answer = reader.report().answer;
    expect(answer).toContain('Bloco 1');
    expect(answer).toContain('Bloco 3 via text');
  });

  it('a resposta é o campo `result` do ÚLTIMO evento `result`', () => {
    const events = [JSON.stringify({ type: 'result', result: 'Primeiro' }), JSON.stringify({ type: 'result', result: 'Segundo' })];
    expect(readStream(events).reader.report().answer).toBe('Segundo');
  });

  it('nada legível: medição `none`, consumo nulo e inventário vazio', () => {
    const { reader } = readStream(['', '   ']);
    const report = reader.report();
    expect(report.measure).toBe('none');
    expect(report.consumption).toBeNull();
    expect(report.inventory).toEqual([]);
    expect(reader.sawEvent).toBe(false);
  });
});
