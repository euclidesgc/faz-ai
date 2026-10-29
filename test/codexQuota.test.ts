import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codexSessionsDir, lastTokenCount, newestRollout, readCodexQuota, toReading } from '../src/extension/ai/acp/codexQuota';
import { acpAgent } from '../src/extension/ai/acp/agents';
import { spawnAcp } from '../src/extension/ai/acp/run';
import { FakeAgent } from './fakes/acpAgent';

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'codex-rollout-token-count.jsonl'), 'utf8');
let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-codexq-'));
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

function rollout(content: string, base = path.join(home, '.codex'), name = 'rollout-2026-10-29T10-00-00-abc.jsonl') {
  const dir = path.join(base, 'sessions', '2026', '10', '29');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}
const read = (env: NodeJS.ProcessEnv = {}, since = 0) => readCodexQuota({ env, homeDir: home, since, now: () => 123 });

describe('readCodexQuota', () => {
  it('lê o último token_count das duas janelas', () => {
    rollout(FIXTURE);
    const q = read();
    expect(q).toEqual({
      primary: { usedPercent: 20, windowMinutes: 300, resetsAt: 1790001000 },
      secondary: { usedPercent: 42.5, windowMinutes: 10080, resetsAt: 1790501000 },
      readAt: 123,
    });
    expect(toReading(q!.primary!).utilization).toBeCloseTo(0.2);
  });

  it('respeita CODEX_HOME', () => {
    const other = path.join(home, 'outro');
    rollout(FIXTURE, other);
    expect(codexSessionsDir({ CODEX_HOME: other }, home)).toBe(path.join(other, 'sessions'));
    expect(read({ CODEX_HOME: other })?.primary?.usedPercent).toBe(20);
    expect(read()).toBeNull();
  });

  it('ausente, vazio, inválido ou sem rate_limits dão null', () => {
    expect(read()).toBeNull();
    const f = rollout('');
    expect(read()).toBeNull();
    fs.writeFileSync(f, 'não é json\n{"type":"event_msg","payload":{"type":"token_count","rate_limits":null}}\n');
    expect(read()).toBeNull();
    fs.writeFileSync(f, '{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":150}}}}\n');
    expect(read()).toBeNull();
  });

  it('arquivo grande (>1 MB) lê só o fim e acha o último evento', () => {
    const filler = JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'x'.repeat(1000) } });
    rollout(FIXTURE.split('\n')[1] + '\n' + (filler + '\n').repeat(1500) + FIXTURE.split('\n')[3] + '\n');
    expect(read()?.primary?.usedPercent).toBe(20);
  });

  it('só o começo tem token_count (fora dos últimos 256 KB): null', () => {
    const filler = JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'x'.repeat(1000) } });
    rollout(FIXTURE.split('\n')[1] + '\n' + (filler + '\n').repeat(1500));
    expect(read()).toBeNull();
  });

  it('rollout anterior ao início da execução é ignorado', () => {
    const f = rollout(FIXTURE);
    const old = new Date(Date.now() - 3_600_000);
    fs.utimesSync(f, old, old);
    expect(read({}, Date.now() - 1000)).toBeNull();
    expect(newestRollout(codexSessionsDir({}, home), 0)).toBe(f);
  });

  it('lastTokenCount pula linhas inválidas', () => {
    expect(lastTokenCount('{\n' + FIXTURE + '{parcial')).toMatchObject({ primary: { used_percent: 20 } });
  });
});

describe('gancho do spawnAcp', () => {
  it('chama readQuota com o início da execução e põe o resultado no relatório', async () => {
    const quota = { primary: { usedPercent: 7, windowMinutes: 300, resetsAt: null }, secondary: null, readAt: 1 };
    const calls: { since: number; homeDir: string }[] = [];
    const base = acpAgent('gemini')!;
    const spec = { ...base, readQuota: (ctx: { since: number; homeDir: string }) => (calls.push(ctx), quota) };
    const agent = new FakeAgent();
    const before = Date.now();
    const measured = spawnAcp(spec as never, { prompt: 'x', permission: 'board' } as never, home, {
      spawn: agent.spawn,
      log: () => {},
      graceMs: 10,
      homeDir: home,
    });
    const report = measured.report() as { quota?: unknown };
    expect(report.quota).toEqual(quota);
    expect(calls[0]!.since).toBeGreaterThanOrEqual(before);
    expect(calls[0]!.homeDir).toBe(home);
    measured.proc.kill();
  });

  it('só o Codex declara readQuota', () => {
    expect(acpAgent('codex-acp')!.readQuota).toBeTypeOf('function');
    expect(acpAgent('gemini')!.readQuota).toBeUndefined();
  });
});
