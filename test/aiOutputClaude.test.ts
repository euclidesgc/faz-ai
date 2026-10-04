// O leitor do `stream-json` do Claude Code contra a SAÍDA REAL de uma execução de prova, não contra
// exemplo escrito à mão: `test/fixtures/claude-stream-json.jsonl` é a saída de `claude 2.1.278`
// (quatro passos, um subagente, dois eventos `result`), enxugada e anonimizada. É a borda externa
// desta camada — a CLI —, simulada pelo que ela de fato escreveu.
//
// As variantes (truncada, com lixo no meio, com stderr entremeado) saem por corte do mesmo arquivo:
// um exemplo inventado provaria só que o leitor concorda consigo mesmo.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeReader } from '../src/extension/aiOutput/claude';
import { lineSplitter } from '../src/extension/aiOutput/lines';
import type { OutputReader } from '../src/extension/aiOutput/reader';
import type { ModelOption } from '../src/shared/models';

const FIXTURE = path.join(__dirname, 'fixtures', 'claude-stream-json.jsonl');
const EVENTS = fs.readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean);

const haiku = (price?: ModelOption['price']): ModelOption => ({
  id: 'claude:haiku',
  tool: 'claude',
  model: 'haiku',
  label: 'Haiku 4.5',
  efforts: [],
  defaultEffort: null,
  ...(price ? { price } : {}),
});

/** Passa linhas pelo leitor e devolve o leitor e as linhas legíveis que saíram. */
function read(lines: string[], catalog: ModelOption[] = []): { reader: OutputReader; shown: string[] } {
  const reader = claudeReader({ catalog, model: 'haiku' });
  const shown = lines.flatMap((line) => reader.push(line, 'stdout'));
  return { reader, shown };
}

describe('leitor do stream-json do Claude Code, contra a saída real', () => {
  it('o consumo é o de `modelUsage`, e não a soma dos `usage` dos dois eventos `result`', () => {
    const { reader } = read(EVENTS);
    const c = reader.report().consumption!;

    // os números do probe: `modelUsage` é cumulativo da sessão e inclui o subagente
    expect(c.inputTokens).toBe(54);
    expect(c.outputTokens).toBe(1221);
    expect(c.cacheReadTokens).toBe(106009);
    expect(c.cacheWriteTokens).toBe(28908);
    // somar os `usage` dos dois `result` daria 36/910/94571/15853: 25% a menos, e zero do subagente
    expect(c.outputTokens).not.toBe(910);
  });

  it('`num_turns` é do segmento e é o único campo que se soma: 4 + 1 = 5', () => {
    expect(read(EVENTS).reader.report().consumption!.turns).toBe(5);
  });

  it('guarda o id da sessão, que é a ponte para reabrir a execução na CLI', () => {
    expect(read(EVENTS).reader.report().consumption!.sessionId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('o custo informado pela ferramenta vale e não vai marcado como estimado', () => {
    const c = read(EVENTS).reader.report().consumption!;
    expect(c.costUsd).toBeCloseTo(0.06478465, 8);
    expect(c.costEstimated).toBe(false);
  });

  it('o custo informado é tomado uma vez, não somado: ele é igual nos dois eventos `result`', () => {
    // somar os dois daria o dobro; é o erro que mais parece certo quando há dois eventos finais
    expect(read(EVENTS).reader.report().consumption!.costUsd).not.toBeCloseTo(0.1295693, 6);
  });

  it('com custo informado, o preço do catálogo não é usado nem muda o número', () => {
    const comPreco = read(EVENTS, [haiku({ input: 999, output: 999, cacheRead: 999, cacheWrite: 999 })]);
    expect(comPreco.reader.report().consumption!.costUsd).toBeCloseTo(0.06478465, 8);
    expect(comPreco.reader.report().consumption!.costEstimated).toBe(false);
  });

  it('a medição é completa: o evento final foi lido', () => {
    expect(read(EVENTS).reader.report().measure).toBe('full');
  });

  it('o inventário é o que foi USADO: Read duas vezes, Bash uma e o subagente Explore uma', () => {
    const { reader } = read(EVENTS);
    expect([...reader.report().inventory].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { kind: 'tool', name: 'Bash', calls: 1 },
      { kind: 'agent', name: 'Explore', calls: 1 },
      { kind: 'tool', name: 'Read', calls: 2 },
    ]);
  });

  it('o inventário não sai de `system/init`, que lista o que estava DISPONÍVEL', () => {
    const { reader } = read(EVENTS);
    const nomes = reader.report().inventory.map((i) => i.name);
    // o `init` do fixture oferece Glob, Grep, Edit, Write, WebFetch, a skill `no-ai-slop` e os
    // subagentes Plan e general-purpose; nada disso foi usado e nada disso pode aparecer
    for (const naoUsado of ['Glob', 'Grep', 'Edit', 'Write', 'WebFetch', 'no-ai-slop', 'Plan', 'general-purpose'])
      expect(nomes).not.toContain(naoUsado);
  });

  it('o `Bash` que o subagente rodou entra no inventário, como o consumo dele entra no total', () => {
    // a chamada vem no mesmo fluxo, marcada com `parent_tool_use_id`
    expect(read(EVENTS).reader.report().inventory).toContainEqual({ kind: 'tool', name: 'Bash', calls: 1 });
  });

  it('a chamada do subagente conta uma vez, como subagente, e não também como ferramenta', () => {
    const { reader } = read(EVENTS);
    expect(reader.report().inventory.filter((i) => i.name === 'Agent')).toEqual([]);
  });

  it('a resposta é o texto do ÚLTIMO `result`, não do primeiro', () => {
    const { reader } = read(EVENTS);
    // o primeiro `result` dizia só que o subagente havia sido lançado
    expect(reader.report().answer).toContain('Aqui estão os três resultados');
    expect(reader.report().answer).not.toContain('está listando os arquivos');
  });

  it('nenhuma linha mostrada à pessoa é um objeto JSON', () => {
    const { shown } = read(EVENTS);
    expect(shown.length).toBeGreaterThan(0);
    for (const line of shown) expect(line).not.toContain('{"type"');
    expect(shown.filter((l) => l.trimStart().startsWith('{'))).toEqual([]);
  });

  it('as linhas legíveis dizem o que aconteceu: sessão, chamadas, subagente e o desfecho', () => {
    const { shown } = read(EVENTS);
    const texto = shown.join('\n');
    expect(shown[0]).toBe('Sessão 11111111 · claude-haiku-4-5-20251001 · CLI 2.1.278');
    expect(texto).toContain('Read(a.txt)');
    expect(texto).toContain('Agent(Explore)');
    expect(texto).toContain('Subagente Explore iniciado: Listar arquivos markdown');
    expect(texto).toContain('Subagente Explore concluído');
    expect(texto).toContain('Pronto');
  });

  it('o `init` que aparece duas vezes na mesma sessão só se apresenta uma', () => {
    const { shown } = read(EVENTS);
    expect(shown.filter((l) => l.startsWith('Sessão '))).toHaveLength(1);
  });

  it('o raciocínio e os contadores de raciocínio não viram linha', () => {
    const { shown } = read(EVENTS);
    expect(shown.some((l) => l.includes('thinking'))).toBe(false);
  });
});

describe('inventário: os nomes que o painel vai ler', () => {
  const event = (name: string, input: Record<string, unknown>): string =>
    JSON.stringify({
      type: 'assistant',
      session_id: 's',
      message: { id: `m-${name}`, model: 'claude-haiku-4-5', content: [{ type: 'tool_use', id: `t-${name}`, name, input }] },
    });

  it('`Task` e `Agent` são o mesmo subagente: trocar o nome da ferramenta não apaga o inventário', () => {
    const task = read([event('Task', { subagent_type: 'Explore' })]).reader.report().inventory;
    const agent = read([event('Agent', { subagent_type: 'Explore' })]).reader.report().inventory;
    expect(task).toEqual([{ kind: 'agent', name: 'Explore', calls: 1 }]);
    expect(agent).toEqual(task);
  });

  it('a ferramenta MCP guarda servidor e ferramenta separados pelo primeiro `__` do nome', () => {
    const { reader } = read([event('mcp__faz-ai__add_comment', {})]);
    expect(reader.report().inventory).toEqual([{ kind: 'mcp_tool', name: 'faz-ai/add_comment', calls: 1 }]);
  });

  it('o nome do servidor MCP com `_` fica inteiro: o corte é no primeiro `__`, não no primeiro `_`', () => {
    const { reader } = read([event('mcp__claude_ai_Gmail__reply', {})]);
    expect(reader.report().inventory).toEqual([{ kind: 'mcp_tool', name: 'claude_ai_Gmail/reply', calls: 1 }]);
  });

  it('a skill entra pelo nome dela, não pelo nome da ferramenta `Skill`', () => {
    const { reader } = read([event('Skill', { skill: 'no-ai-slop' })]);
    expect(reader.report().inventory).toEqual([{ kind: 'skill', name: 'no-ai-slop', calls: 1 }]);
  });

  it('subagente sem o tipo ainda conta como ferramenta: a chamada aconteceu e não pode se perder', () => {
    const { reader } = read([event('Agent', {})]);
    expect(reader.report().inventory).toEqual([{ kind: 'tool', name: 'Agent', calls: 1 }]);
  });
});

describe('fluxo que não chegou ao fim', () => {
  /** O fixture sem os eventos `result`: o processo morreu antes de a CLI fechar a conta. */
  const semResultado = EVENTS.filter((l) => (JSON.parse(l) as { type: string }).type !== 'result');

  it('truncado antes do `result`: a medição é parcial e o que foi lido vale', () => {
    const { reader } = read(semResultado);
    const report = reader.report();
    expect(report.measure).toBe('partial');
    // entrada e cache saem certos dos eventos do assistente...
    expect(report.consumption!.inputTokens).toBe(54);
    expect(report.consumption!.cacheReadTokens).toBe(106009);
    expect(report.consumption!.cacheWriteTokens).toBe(28908);
    // ...mas a saída é a contagem corrente do fluxo e fica muito abaixo da real (1.221): é por isso
    // que isto é `partial`, e é por isso que não tem custo
    expect(report.consumption!.outputTokens).toBe(11);
  });

  it('medição parcial não tem custo: um custo parcial seria somável com os completos no painel', () => {
    const { reader } = read(semResultado, [haiku({ input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 })]);
    expect(reader.report().consumption!.costUsd).toBeNull();
    expect(reader.report().consumption!.costEstimated).toBe(false);
  });

  it('truncado antes do `result`: a resposta cai para o texto que o assistente escreveu', () => {
    const { reader } = read(semResultado);
    expect(reader.report().answer).not.toBe('');
    expect(reader.report().answer).toContain('Vou fazer em ordem');
  });

  it('truncado no meio de uma linha não lança: o pedaço quebrado vira texto no canal', () => {
    // o último `result` não chegou e o primeiro veio pela metade, como num processo morto no meio
    const cortado = `${semResultado.join('\n')}\n${EVENTS.at(-2)!.slice(0, 500)}`;
    const splitter = lineSplitter();
    const reader = claudeReader({ catalog: [], model: 'haiku' });
    const shown = [...splitter.push(cortado), ...splitter.flush()].flatMap((l) => reader.push(l, 'stdout'));

    expect(() => reader.report()).not.toThrow();
    expect(reader.report().measure).toBe('partial');
    // a sobra quebrada aparece no canal como texto, cortada, e não é interpretada
    expect(shown.some((l) => l.startsWith('{'))).toBe(true);
  });

  it('uma linha de lixo no meio não invalida as outras', () => {
    const comLixo = [...EVENTS.slice(0, 10), 'isto não é JSON nenhum', ...EVENTS.slice(10)];
    const { reader, shown } = read(comLixo);
    expect(shown).toContain('isto não é JSON nenhum');
    expect(reader.report().measure).toBe('full');
    expect(reader.report().consumption!.outputTokens).toBe(1221);
  });

  it('sem nada legível, a execução fica não medida — e não medida com zeros', () => {
    const { reader } = read(['', '   ']);
    const report = reader.report();
    expect(report.measure).toBe('none');
    expect(report.consumption).toBeNull();
    expect(report.inventory).toEqual([]);
    expect(reader.sawEvent).toBe(false);
  });

  it('um evento válido faz `sawEvent`, que é o que impede a retentativa de cobrar duas vezes', () => {
    const { reader } = read([EVENTS[0]!]);
    expect(reader.sawEvent).toBe(true);
  });
});

describe('stderr e custo estimado', () => {
  it('a linha de stderr aparece no canal mas não passa pelo interpretador', () => {
    const reader = claudeReader({ catalog: [], model: 'haiku' });
    expect(reader.push('aviso: a pasta de cache não existe', 'stderr')).toEqual(['aviso: a pasta de cache não existe']);
    expect(reader.sawEvent).toBe(false);
    expect(reader.report().measure).toBe('none');
  });

  it('sem custo informado, o preço do catálogo estima e o número vai marcado como estimado', () => {
    const semCusto = EVENTS.map((l) => (l.includes('"total_cost_usd"') ? l.replace(/"total_cost_usd":[^,]+,/, '') : l));
    const { reader } = read(semCusto, [haiku({ input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 })]);
    const c = reader.report().consumption!;
    const esperado = (54 * 1 + 1221 * 5 + 106009 * 0.1 + 28908 * 1.25) / 1e6;
    expect(c.costUsd).toBeCloseTo(esperado, 10);
    expect(c.costEstimated).toBe(true);
  });

  it('sem custo informado e sem preço no catálogo, não há custo — e nunca custo zero', () => {
    const semCusto = EVENTS.map((l) => (l.includes('"total_cost_usd"') ? l.replace(/"total_cost_usd":[^,]+,/, '') : l));
    const { reader } = read(semCusto, [haiku()]);
    const c = reader.report().consumption!;
    expect(c.costUsd).toBeNull();
    expect(c.costEstimated).toBe(false);
    // os tokens continuam gravados: a ferramenta mediu token e não mediu dinheiro
    expect(c.outputTokens).toBe(1221);
  });
});
