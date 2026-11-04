// O `stream-json` do Kimi Code. Os dois primeiros blocos rodam contra SAÍDAS REAIS da CLI: a 2.1.1
// (test/fixtures/kimi-stream-json.jsonl, com o conteúdo das ferramentas encurtado), uma execução que lê
// o board pelo MCP, lista arquivos e move um card; e a 2.3.0 (test/fixtures/kimi-stream-json-2.3.0.jsonl,
// gravada em 2026-10-31), uma execução que diz "hello", lista a pasta com `Bash`, escreve um plano e sai
// do modo plano, com o `session.resume_hint` no fim. O formato não mudou entre as duas. Os casos de borda
// abaixo montam eventos com os mesmos campos; a cota esgotada é o texto real que a CLI escreveu no
// `stderr` em 2026-10-20 (`provider.api_error: 429`).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kimiReader } from '../src/extension/aiOutput/kimi';
import type { KimiSessionUsage } from '../src/extension/aiOutput/kimiSession';

/** O texto real do `stderr` da CLI com a cota esgotada (as 28 execuções perdidas de 20/10/2026). */
const QUOTA_429 =
  "error: failed to run prompt: provider.api_error: 429 You've reached your 5-hour usage limit. Your quota will reset when the current 5-hour window ends. To continue now, purchase extra usage or upgrade your plan: https://www.kimi.com/membership/subscription?tab=quota";
/** O id de sessão da fixture 2.3.0 e os tokens que o registro dela traz (ver test/kimiSession.test.ts). */
const SESSION = 'session_0002-0000-4000-8000-000000000002';
const USAGE: KimiSessionUsage = {
  tokens: { inputTokens: 36225, outputTokens: 611, cacheReadTokens: 104704, cacheWriteTokens: 0 },
  requests: 4,
};

const meta = (type: string, extra: Record<string, unknown> = {}) => JSON.stringify({ role: 'meta', type, ...extra });
const assistant = (content: string | null, calls: string[] = []) =>
  JSON.stringify({
    role: 'assistant',
    ...(content ? { content } : {}),
    ...(calls.length
      ? { tool_calls: calls.map((name, i) => ({ type: 'function', id: `tool_${i}`, function: { name, arguments: '{}' } })) }
      : {}),
  });
const tool = (id: string, content: string) => JSON.stringify({ role: 'tool', tool_call_id: id, content });

function read(lines: string[]) {
  const reader = kimiReader();
  const shown = lines.flatMap((l) => reader.push(l, 'stdout'));
  return { reader, shown };
}

const fixture = (name: string) =>
  fs
    .readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
    .split('\n')
    .filter(Boolean);

describe('stream-json do Kimi Code, contra a saída real', () => {
  it('as chamadas com o servidor do board contadas uma vez, e a resposta é a última fala do assistente', () => {
    const { reader, shown } = read(fixture('kimi-stream-json.jsonl'));
    const report = reader.report();
    // a CLI 2.1.1 não informa consumo: com inventário, a medição é parcial
    expect(report.measure).toBe('partial');
    expect(report.consumption).toBeNull();
    expect(report.inventory).toEqual([
      { kind: 'mcp_tool', name: 'faz-ai/get_board', calls: 1 },
      { kind: 'tool', name: 'Glob', calls: 1 },
      { kind: 'mcp_tool', name: 'faz-ai/move_card', calls: 1 },
    ]);
    expect(report.answer).toContain('Card #3 movido');
    expect(shown).toContain('faz-ai/get_board');
  });
});

describe('stream-json do Kimi Code 2.3.0, contra a saída real', () => {
  it('o mesmo formato da 2.1.1: inventário, resposta final e o id da sessão do `resume_hint`', () => {
    const asked: string[] = [];
    const reader = kimiReader({
      sessionUsage: (id) => {
        asked.push(id);
        return USAGE;
      },
    });
    const shown = fixture('kimi-stream-json-2.3.0.jsonl').flatMap((l) => reader.push(l, 'stdout'));
    const report = reader.report();
    expect(reader.sawEvent).toBe(true);
    expect(report.inventory).toEqual([
      { kind: 'tool', name: 'Bash', calls: 1 },
      { kind: 'tool', name: 'Write', calls: 1 },
      { kind: 'tool', name: 'ExitPlanMode', calls: 1 },
    ]);
    expect(report.answer).toMatch(/^hello from kimi/);
    expect(shown[0]).toBe('hello from kimi');
    // os tokens vêm do registro da sessão, achado pelo id do `resume_hint`; o custo fica para o catálogo
    expect(asked).toEqual([SESSION]);
    expect(report.measure).toBe('full');
    expect(report.consumption).toEqual({ ...USAGE.tokens, turns: 4, sessionId: SESSION, costUsd: null });
    expect(report.usageLimitReached).toBe(false);
  });

  it('sem o registro da sessão (ou sem home), a execução fica medida só pelo inventário, sem estimar', () => {
    const noFile = kimiReader({ sessionUsage: () => null });
    fixture('kimi-stream-json-2.3.0.jsonl').forEach((l) => noFile.push(l, 'stdout'));
    expect(noFile.report()).toMatchObject({ measure: 'partial', consumption: null });
    const noHome = kimiReader();
    fixture('kimi-stream-json-2.3.0.jsonl').forEach((l) => noHome.push(l, 'stdout'));
    expect(noHome.report()).toMatchObject({ measure: 'partial', consumption: null });
  });

  it('o registro da sessão não é lido antes do `resume_hint` (a CLI ainda não fechou a sessão)', () => {
    const asked: string[] = [];
    const reader = kimiReader({
      sessionUsage: (id) => {
        asked.push(id);
        return USAGE;
      },
    });
    reader.push(meta('system.version', { version: '2.3.0' }), 'stdout');
    reader.push(assistant('oi', ['Read']), 'stdout');
    expect(reader.report()).toMatchObject({ measure: 'partial', consumption: null });
    expect(asked).toEqual([]);
  });

  it('a leitura do registro que lança nunca derruba o relatório: fica medido só pelo inventário', () => {
    const reader = kimiReader({
      sessionUsage: () => {
        throw new Error('disco');
      },
    });
    fixture('kimi-stream-json-2.3.0.jsonl').forEach((l) => reader.push(l, 'stdout'));
    expect(reader.report()).toMatchObject({ measure: 'partial', consumption: null });
  });
});

describe('a cota esgotada do Kimi Code, como a CLI a escreve no stderr', () => {
  it('`provider.api_error: 429 ... usage limit` (CLI 2.1.x–2.3.0) liga usageLimitReached e não é transitório', () => {
    const reader = kimiReader();
    reader.push(meta('system.version', { version: '2.1.1' }), 'stdout');
    const shown = reader.push(QUOTA_429, 'stderr');
    // o stderr volta cortado para o canal, nunca interpretado
    expect(shown).toHaveLength(1);
    expect(reader.report()).toMatchObject({ usageLimitReached: true, measure: 'none' });
    expect(reader.report().transientFailure).toBeUndefined();
  });

  it('a mesma cota depois de trabalho feito mantém o inventário e marca o limite', () => {
    const reader = kimiReader();
    reader.push(assistant(null, ['mcp__faz-ai__start_work']), 'stdout');
    reader.push(QUOTA_429, 'stderr');
    expect(reader.report()).toMatchObject({
      usageLimitReached: true,
      measure: 'partial',
      inventory: [{ kind: 'mcp_tool', name: 'faz-ai/start_work', calls: 1 }],
    });
  });

  it('um erro do provedor sem o texto de limite de uso não é cota: 5xx é falha passageira', () => {
    const reader = kimiReader();
    reader.push('error: failed to run prompt: provider.api_error: 503 service unavailable', 'stderr');
    expect(reader.report()).toMatchObject({ usageLimitReached: false, transientFailure: true });
    const other = kimiReader();
    other.push('error: failed to run prompt: provider.api_error: 429 too many requests', 'stderr');
    expect(other.report().usageLimitReached).toBe(false);
  });
});

describe('stream-json do Kimi Code', () => {
  it('reconhece o formato já na linha de versão', () => {
    const { reader } = read([meta('system.version', { version: '2.1.1' })]);
    expect(reader.sawEvent).toBe(true);
    expect(reader.report().measure).toBe('none');
  });

  it('a skill lida pelo get_skill e pelo SKILL.md conta como skill; os argumentos vêm em texto JSON', () => {
    const calls = [
      { type: 'function', id: 't0', function: { name: 'mcp__faz-ai__get_skill', arguments: '{"skill":"faz-ai-fluxo"}' } },
      { type: 'function', id: 't1', function: { name: 'read_file', arguments: '{"path":"/x/skills/minha-skill/SKILL.md"}' } },
      { type: 'function', id: 't2', function: { name: 'read_file', arguments: 'não é json' } },
    ];
    const { reader } = read([JSON.stringify({ role: 'assistant', tool_calls: calls })]);
    expect([...reader.report().inventory].sort((a, b) => `${a.kind}${a.name}`.localeCompare(`${b.kind}${b.name}`))).toEqual([
      { kind: 'mcp_tool', name: 'faz-ai/get_skill', calls: 1 },
      { kind: 'skill', name: 'faz-ai-fluxo', calls: 1 },
      { kind: 'skill', name: 'minha-skill', calls: 1 },
      { kind: 'tool', name: 'read_file', calls: 2 },
    ]);
  });

  it('o resultado de uma ferramenta não vira linha do canal nem chamada nova', () => {
    const { reader, shown } = read([assistant(null, ['Bash']), tool('tool_0', 'muita saída'), assistant('pronto')]);
    expect(shown).toEqual(['Bash', 'pronto']);
    expect(reader.report().inventory).toEqual([{ kind: 'tool', name: 'Bash', calls: 1 }]);
  });

  it('uma linha que não é JSON vai para o canal como texto e a leitura segue', () => {
    const { reader, shown } = read([meta('system.version'), 'nixpacks: building…', assistant('fim')]);
    expect(reader.sawEvent).toBe(true);
    expect(shown).toContain('nixpacks: building…');
    expect(reader.report().answer).toBe('fim');
  });

  it('o stderr é texto de gente, nunca interpretado como evento', () => {
    const reader = kimiReader();
    expect(reader.push('{"role":"assistant","content":"não é evento"}', 'stderr')).toHaveLength(1);
    expect(reader.sawEvent).toBe(false);
  });

  it('marca usageLimitReached quando o stderr traz o erro de cota da 2.1.1 (auth_error 403, usage limit)', () => {
    const reader = kimiReader();
    reader.push(
      "error: failed to run prompt: provider.auth_error: 403 You've reached your 5-hour usage limit. Your quota will reset when the current 5-hour window ends.",
      'stderr',
    );
    expect(reader.report().usageLimitReached).toBe(true);
  });

  it('não marca o limite em erro de autenticação sem cota', () => {
    const reader = kimiReader();
    reader.push('error: provider.auth_error: 401 invalid token', 'stderr');
    expect(reader.report().usageLimitReached).toBe(false);
  });
});

describe('kimiReader: transientFailure', () => {
  it('erro de rede no stderr liga o sinal', () => {
    const reader = kimiReader();
    reader.push('httpx.ConnectError: socket hang up', 'stderr');
    expect(reader.report().transientFailure).toBe(true);
  });

  it('a fala do assistente citando "overloaded" não liga o sinal', () => {
    const reader = kimiReader();
    reader.push(assistant('A API estava overloaded ontem, mas agora funciona.'), 'stdout');
    expect(reader.report().transientFailure).toBeUndefined();
  });

  it('o limite de uso não vira transitório', () => {
    const reader = kimiReader();
    reader.push("provider.auth_error: 403 You've reached your 5-hour usage limit. rate limit", 'stderr');
    const r = reader.report();
    expect(r.usageLimitReached).toBe(true);
    expect(r.transientFailure).toBeUndefined();
  });
});

describe('a sessão da História retomada: o consumo é só o desta execução', () => {
  it('desconta do registro da sessão o que já estava gravado antes de retomar', () => {
    const before = { tokens: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 1000, cacheWriteTokens: 0 }, requests: 3 };
    const after = { tokens: { inputTokens: 160, outputTokens: 25, cacheReadTokens: 1500, cacheWriteTokens: 0 }, requests: 5 };
    let calls = 0;
    const reader = kimiReader({
      resumedSessionId: 'session_0002-0000-4000-8000-000000000002',
      sessionUsage: () => (calls++ === 0 ? before : after),
    });
    for (const line of fixture('kimi-stream-json-2.3.0.jsonl')) reader.push(line, 'stdout');
    expect(reader.report().consumption).toMatchObject({ inputTokens: 60, outputTokens: 15, cacheReadTokens: 500, turns: 2 });
  });
});
