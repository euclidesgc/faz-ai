// O `stream-json` do Gemini CLI. As fixtures são SAÍDAS REAIS da CLI 0.65.0, gravadas com o comando exato que
// o provider monta (`gemini -p "" --output-format stream-json ...`, com a home isolada do board), contra uma API
// local do Gemini (`GOOGLE_GEMINI_BASE_URL`) e uma chave fictícia: o roteiro das respostas do modelo é do teste,
// o formato de cada linha é o da CLI. Os caminhos da máquina foram trocados por `/projeto-da-gravacao`.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { geminiMcpName, geminiReader } from '../src/extension/aiOutput/gemini';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8').split('\n');
function read(name: string, servers: string[] = ['faz-ai']) {
  const reader = geminiReader({ model: null, mcpServers: servers });
  const lines = fixture(name).flatMap((line) => reader.push(line, 'stdout'));
  return { reader, lines, report: reader.report() };
}

describe('leitor do stream-json do Gemini CLI 0.65.0 (saída real)', () => {
  it('execução admitida: tokens do result.stats, o inventário do que rodou e a resposta final', () => {
    const { reader, lines, report } = read('gemini-stream-json.jsonl');
    expect(reader.sawEvent).toBe(true);
    expect(report.measure).toBe('full');
    // 8700 de entrada, 5000 do cache: 3700 frescos; 80 de saída e 40 de raciocínio (o resto do total)
    expect(report.consumption).toEqual({
      inputTokens: 3700,
      outputTokens: 120,
      cacheReadTokens: 5000,
      cacheWriteTokens: 0,
      turns: null,
      sessionId: '6dbe87dc-ff8b-475e-94c5-a0886a0ad1f2',
      costUsd: null,
    });
    // o shell que a CLI recusou (fora do `tools.core`) não rodou: não entra no inventário
    expect(report.inventory).toEqual([
      { kind: 'tool', name: 'read_file', calls: 1 },
      { kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 1 },
    ]);
    expect(report.answer).toBe('Li o card #12.\nO README descreve o projeto.');
    expect(report.usageLimitReached).toBe(false);
    // o canal mostra linhas inteiras, a recusa da CLI e o fim
    expect(lines).toContain('Vou ler o card e o README.');
    expect(lines).toContain('run_shell_command: recusada pela CLI (tool_not_registered)');
    expect(lines).toContain('Li o card #12.');
    expect(lines.at(-1)).toBe('Pronto');
  });

  it('o shell que rodou entra no inventário; os tokens somam os modelos do roteador', () => {
    const { report } = read('gemini-stream-json-shell.jsonl');
    expect(report.inventory).toEqual([{ kind: 'tool', name: 'run_shell_command', calls: 1 }]);
    // o roteador (`gemini-3.5-flash-lite`) aparece com zero; o modelo que respondeu, com o consumo
    expect(report.consumption).toMatchObject({ inputTokens: 1850, outputTokens: 15, cacheReadTokens: 0 });
    expect(report.answer).toBe('Rodei o comando.');
  });

  it('cota diária esgotada: o result de erro liga o limite de uso', () => {
    const { lines, report } = read('gemini-stream-json-quota.jsonl');
    expect(report.usageLimitReached).toBe(true);
    // a cota diária renova à meia-noite do Pacífico (história 12): a pausa do perfil vai até lá
    expect(report.usageLimitHint).toEqual({ resetsAt: null, text: null, dailyResetZone: 'America/Los_Angeles' });
    expect(lines.at(-1)).toMatch(/^Terminou com erro: \[API Error: You have exhausted your daily quota/);
    // os zeros do result de erro são o que a CLI informa: nada foi gasto
    expect(report.consumption).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it('a chave recusada não é limite de uso; a linha leva a mensagem que o login vencido procura', () => {
    const { lines, report } = read('gemini-stream-json-auth.jsonl');
    expect(report.usageLimitReached).toBe(false);
    expect(lines.at(-1)).toMatch(/API key not valid/);
  });
});

describe('leitor do Gemini: casos de borda', () => {
  const ev = (o: Record<string, unknown>) => JSON.stringify(o);
  it('uma chamada anunciada sem resultado (a CLI caiu no meio) conta: pode ter rodado', () => {
    const reader = geminiReader();
    reader.push(ev({ type: 'tool_use', tool_name: 'write_file', tool_id: 'w1', parameters: {} }), 'stdout');
    expect(reader.report()).toMatchObject({ measure: 'partial', inventory: [{ kind: 'tool', name: 'write_file', calls: 1 }] });
  });
  it('a falha ao executar (arquivo inexistente) é uso; a recusa da política, não', () => {
    const reader = geminiReader();
    reader.push(ev({ type: 'tool_use', tool_name: 'read_file', tool_id: 'r1' }), 'stdout');
    reader.push(ev({ type: 'tool_result', tool_id: 'r1', status: 'error', error: { type: 'file_not_found' } }), 'stdout');
    reader.push(ev({ type: 'tool_use', tool_name: 'replace', tool_id: 'e1' }), 'stdout');
    reader.push(ev({ type: 'tool_result', tool_id: 'e1', status: 'error', error: { type: 'policy_violation' } }), 'stdout');
    expect(reader.report().inventory).toEqual([{ kind: 'tool', name: 'read_file', calls: 1 }]);
  });
  it('aviso de cota no evento error liga o limite; stderr e linha que não é JSON passam como texto', () => {
    const reader = geminiReader();
    expect(reader.push(ev({ type: 'error', severity: 'error', message: 'RESOURCE_EXHAUSTED: try later' }), 'stdout')).toEqual([
      'Aviso do Gemini: RESOURCE_EXHAUSTED: try later',
    ]);
    expect(reader.push('não é json', 'stdout')).toEqual(['não é json']);
    expect(reader.push('{"type":"result"}', 'stderr')).toEqual(['{"type":"result"}']);
    expect(reader.report().usageLimitReached).toBe(true);
  });
  it('o 429 por minuto no stderr traz a espera da API; o texto do assistente que fala de cota não liga o limite', () => {
    const reader = geminiReader();
    reader.push(ev({ type: 'message', role: 'assistant', content: 'O README explica a quota exceeded do projeto.\n' }), 'stdout');
    expect(reader.report().usageLimitReached).toBe(false);
    reader.push('Attempt 3 failed: You exceeded your current quota. Quota exceeded for metric x. Please retry in 41s.', 'stderr');
    expect(reader.report()).toMatchObject({ usageLimitReached: true, usageLimitHint: { retryAfterMs: 41_000 } });
  });
  it('sem nada lido: não medido', () => {
    expect(geminiReader().report()).toMatchObject({ measure: 'none', consumption: null, inventory: [] });
  });
  it('mcp_<servidor>_<operação>: o servidor conhecido mais longo vence o primeiro `_`', () => {
    expect(geminiMcpName('mcp_faz-ai_get_card', ['faz-ai'])).toBe('faz-ai/get_card');
    expect(geminiMcpName('mcp_meu_srv_listar', ['meu', 'meu_srv'])).toBe('meu_srv/listar');
    expect(geminiMcpName('mcp_meu_srv_listar')).toBe('meu/srv_listar');
    expect(geminiMcpName('read_file')).toBeNull();
  });
});
