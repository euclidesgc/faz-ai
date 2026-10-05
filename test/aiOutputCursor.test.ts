// O `stream-json` do Cursor. O primeiro bloco roda contra a SAÍDA REAL de duas execuções de
// `cursor-agent` 2026.10.01 (test/fixtures/cursor-stream-json*.jsonl, com os caminhos locais
// trocados): uma no nível "só o board", que chama o `get_board` e não consegue criar um arquivo, e uma
// que lê o projeto. Os casos de borda abaixo dela montam eventos com os mesmos campos.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { streamReader } from '../src/extension/aiOutput/stream';
import type { ReaderDeps } from '../src/extension/aiOutput/reader';
import type { ModelOption } from '../src/shared/models';

const SESSION = '8c1d1c7e-0000-4000-8000-000000000001';

const init = (model: string) =>
  JSON.stringify({
    type: 'system',
    subtype: 'init',
    apiKeySource: 'login',
    cwd: '/projeto',
    session_id: SESSION,
    model,
    permissionMode: 'default',
  });

/** As duas linhas que a CLI escreve por chamada de ferramenta. */
const call = (id: string, toolCall: Record<string, unknown>) => [
  JSON.stringify({
    type: 'tool_call',
    subtype: 'started',
    call_id: id,
    tool_call: toolCall,
    model_call_id: 'm1',
    session_id: SESSION,
    timestamp_ms: 1,
  }),
  JSON.stringify({
    type: 'tool_call',
    subtype: 'completed',
    call_id: id,
    tool_call: toolCall,
    model_call_id: 'm1',
    session_id: SESSION,
    timestamp_ms: 2,
  }),
];

const mcp = (server: string, tool: string) => ({
  mcpToolCall: { args: { name: `${server}-${tool}`, args: {}, toolCallId: 'x', providerIdentifier: server, toolName: tool } },
});

const result = (usage?: Record<string, number>) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    duration_ms: 10,
    duration_api_ms: 10,
    is_error: false,
    result: 'Card #3 movido para Em andamento.',
    session_id: SESSION,
    request_id: 'r1',
    ...(usage ? { usage } : {}),
  });

const composer: ModelOption = {
  id: 'cursor:composer-2.5',
  tool: 'cursor',
  model: 'composer-2.5',
  label: 'Composer 2.5',
  efforts: [],
  defaultEffort: null,
  price: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1 },
};

function read(lines: string[], deps: Partial<ReaderDeps> = {}) {
  const reader = streamReader({ catalog: [], model: null, ...deps });
  const shown = lines.flatMap((l) => reader.push(l, 'stdout'));
  return { reader, shown };
}

const fixture = (name: string) =>
  fs
    .readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
    .split('\n')
    .filter(Boolean);

describe('stream-json do Cursor, contra a saída real', () => {
  it('nível "só o board": a chamada MCP com o servidor, cada chamada contada uma vez, e o consumo', () => {
    const { reader, shown } = read(fixture('cursor-stream-json.jsonl'));
    const report = reader.report();
    expect(report.measure).toBe('full');
    expect(report.consumption).toMatchObject({ inputTokens: 36800, outputTokens: 928, cacheReadTokens: 90880, cacheWriteTokens: 0 });
    expect(report.inventory).toContainEqual({ kind: 'mcp_tool', name: 'faz-ai/get_board', calls: 1 });
    expect(report.inventory).toContainEqual({ kind: 'tool', name: 'read', calls: 1 });
    // nenhuma ferramenta de escrita: o nível não as entrega à sessão
    expect(report.inventory.map((i) => i.name)).not.toContain('edit');
    expect(report.answer).toContain('9 colunas');
    expect(shown).toContain('faz-ai/get_board');
  });

  it('o objeto `tool_call` traz outras chaves junto da ferramenta: vale a que termina em ToolCall', () => {
    const report = read(fixture('cursor-stream-json-read.jsonl')).reader.report();
    expect(report.inventory).toEqual([
      { kind: 'tool', name: 'glob', calls: 1 },
      { kind: 'tool', name: 'read', calls: 1 },
    ]);
    expect(report.consumption).toMatchObject({ inputTokens: 21061, outputTokens: 170, cacheReadTokens: 20224 });
  });
});

describe('stream-json do Cursor', () => {
  it('conta cada chamada uma vez, com o nome da ferramenta e o servidor MCP', () => {
    const { reader, shown } = read([
      init('Composer 2.5'),
      ...call('1', { readToolCall: { args: { path: 'soma.ts' } } }),
      ...call('2', mcp('faz-ai', 'move_card')),
      ...call('3', mcp('faz-ai', 'move_card')),
      ...call('4', { shellToolCall: { args: { command: 'npm test' } } }),
      result(),
    ]);
    expect(reader.report().inventory).toEqual([
      { kind: 'tool', name: 'read', calls: 1 },
      { kind: 'mcp_tool', name: 'faz-ai/move_card', calls: 2 },
      { kind: 'tool', name: 'shell', calls: 1 },
    ]);
    expect(shown).toContain('faz-ai/move_card');
  });

  it('lê o consumo em camelCase: não grava zero quando a ferramenta informou', () => {
    const { reader } = read([
      init('Composer 2.5'),
      result({ inputTokens: 1200, outputTokens: 340, cacheReadTokens: 5000, cacheWriteTokens: 80 }),
    ]);
    expect(reader.report()).toMatchObject({
      measure: 'full',
      consumption: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 5000, cacheWriteTokens: 80, sessionId: SESSION },
    });
  });

  it('um bloco de uso sem nenhum campo conhecido não vira consumo zero', () => {
    const { reader } = read([result({ tokens: 10 })]);
    expect(reader.report().consumption).toBeNull();
  });

  it('estima o custo pelo modelo que rodou (o nome de exibição do init), mesmo com o board pedindo `auto`', () => {
    const { reader } = read(
      [init('Composer 2.5'), result({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })],
      {
        catalog: [composer],
        model: 'auto',
      },
    );
    expect(reader.report().consumption).toMatchObject({ costUsd: 1, costEstimated: true });
  });
});
