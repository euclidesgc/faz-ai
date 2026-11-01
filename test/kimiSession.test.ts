// Os tokens de uma execução do Kimi Code, lidos do registro da sessão que a CLI 2.3.0 grava em
// `<home>/sessions/<projeto>/<session_id>/agents/<agente>/wire.jsonl`. A fixture
// test/fixtures/kimi-session-wire.jsonl é o `wire.jsonl` REAL da execução de test/fixtures/kimi-stream-json-2.3.0.jsonl
// (só com os eventos que o leitor olha e o esqueleto da sessão; o prompt do sistema encurtado): quatro pedidos ao
// modelo, somados aqui.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { kimiHomeOf, kimiSessionDir, readKimiSessionUsage, sumWireUsage } from '../src/extension/aiOutput/kimiSession';

const WIRE = fs.readFileSync(path.join(__dirname, 'fixtures', 'kimi-session-wire.jsonl'), 'utf8');
const SESSION = 'session_0002-0000-4000-8000-000000000002';

/** Os quatro `usage.record` da fixture, somados à mão. */
const TOTAL = {
  inputTokens: 34574 + 379 + 692 + 580,
  outputTokens: 212 + 246 + 95 + 58,
  cacheReadTokens: 0 + 34560 + 34816 + 35328,
  cacheWriteTokens: 0,
};

let home: string | undefined;
afterEach(() => {
  if (home) fs.rmSync(home, { recursive: true, force: true });
  home = undefined;
});

/** Uma home falsa com a sessão gravada como a CLI grava (`.kimi-code/sessions/wd_<projeto>/<id>/agents/main/wire.jsonl`). */
function homeWith(sessionId: string, agents: Record<string, string> = { main: WIRE }): string {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-kimi-home-'));
  for (const [agent, wire] of Object.entries(agents)) {
    const dir = path.join(home, '.kimi-code', 'sessions', 'wd_projeto_0000000000ab', sessionId, 'agents', agent);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'wire.jsonl'), wire);
  }
  return home;
}

describe('registro da sessão do Kimi Code, contra o wire.jsonl real', () => {
  it('soma os quatro pedidos ao modelo: entrada, saída e leitura de cache', () => {
    const usage = readKimiSessionUsage(SESSION, { homeDir: homeWith(SESSION), env: {} });
    expect(usage).toEqual({ tokens: TOTAL, requests: 4 });
  });

  it('os subagentes entram na soma (um `wire.jsonl` por agente)', () => {
    const sub = JSON.stringify({
      type: 'usage.record',
      agentId: 'sub-1',
      model: 'kimi-code/k3',
      usage: { inputOther: 1000, output: 10, inputCacheRead: 0, inputCacheCreation: 5 },
      usageScope: 'turn',
      time: 1,
    });
    const usage = readKimiSessionUsage(SESSION, { homeDir: homeWith(SESSION, { main: WIRE, 'sub-1': sub }), env: {} });
    expect(usage).toEqual({
      tokens: { ...TOTAL, inputTokens: TOTAL.inputTokens + 1000, outputTokens: TOTAL.outputTokens + 10, cacheWriteTokens: 5 },
      requests: 5,
    });
  });
});

describe('registro da sessão do Kimi Code: o que não vira número', () => {
  it('sessão que não está na home: null (a execução fica medida só pelo inventário)', () => {
    expect(readKimiSessionUsage('session_0003-0000-4000-8000-000000000003', { homeDir: homeWith(SESSION), env: {} })).toBeNull();
  });

  it('home sem a pasta de sessões: null, sem lançar', () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-kimi-home-'));
    expect(readKimiSessionUsage(SESSION, { homeDir: home, env: {} })).toBeNull();
  });

  it('um id que não é o formato da CLI nunca vira caminho', () => {
    expect(kimiSessionDir(path.join(homeWith(SESSION), '.kimi-code'), '../../etc')).toBeNull();
    expect(kimiSessionDir(path.join(home!, '.kimi-code'), 'session_x/../..')).toBeNull();
  });

  it('sessão sem nenhum `usage.record`: null, não zero (zero medido e não medido são coisas diferentes)', () => {
    const only = WIRE.split('\n')
      .filter((l) => l && !l.includes('usage.record'))
      .join('\n');
    expect(readKimiSessionUsage(SESSION, { homeDir: homeWith(SESSION, { main: only }), env: {} })).toBeNull();
  });

  it('linha parcial (a CLI ainda escrevendo) e número inválido são pulados', () => {
    const into = { tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, requests: 0 };
    sumWireUsage(
      [
        '{"type":"usage.record","usage":{"inputOther":10,"output":"x","inputCacheRead":-3,"inputCacheCreation":2.9}}',
        '{"type":"usage.record","usage":{"inputOther":5,"out',
        '{"type":"other","usage":{"inputOther":99}}',
      ].join('\n'),
      into,
    );
    expect(into).toEqual({ tokens: { inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 2 }, requests: 1 });
  });

  it('`KIMI_CODE_HOME` vence a home da pessoa, como no registro do servidor MCP', () => {
    expect(kimiHomeOf('/home/pessoa', { KIMI_CODE_HOME: '/outra' })).toBe('/outra');
    expect(kimiHomeOf('/home/pessoa', {})).toBe(path.join('/home/pessoa', '.kimi-code'));
  });
});
