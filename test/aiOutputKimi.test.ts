// O `stream-json` do Kimi Code. O primeiro bloco roda contra uma SAÍDA REAL da CLI 2.1.1
// (test/fixtures/kimi-stream-json.jsonl, com o conteúdo das ferramentas encurtado): uma execução que
// lê o board pelo MCP, lista arquivos e move um card. Os casos de borda abaixo dela montam eventos
// com os mesmos campos.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kimiReader } from '../src/extension/aiOutput/kimi';

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

describe('stream-json do Kimi Code', () => {
  it('reconhece o formato já na linha de versão', () => {
    const { reader } = read([meta('system.version', { version: '2.1.1' })]);
    expect(reader.sawEvent).toBe(true);
    expect(reader.report().measure).toBe('none');
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
});
