import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { claudeHarness, observationDigest, type Observation } from './claudeHarness';

let harness: Awaited<ReturnType<typeof claudeHarness>>;
beforeAll(async () => {
  harness = await claudeHarness();
});
afterAll(async () => {
  await harness?.close();
});

function verifyTransport(observation: Observation) {
  expect(observation.end.attempts).toBe(1);
  expect(observation.end.format).toBe('claude-stream-json');
  expect(observation.end.process?.identity?.birth).toBeTypeOf('string');
  expect(observation.end.process?.terminationConfirmed).toBe(true);
  expect(observation.privateTempFiles).toBe(true);
  expect(observation.tempFiles.length).toBe(1);
  for (const file of observation.tempFiles) {
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.dirname(file))).toBe(false);
  }
  expect(observation.persisted.outcome).toBe(observation.end.outcome);
  expect(observation.persisted.measure).toBe(observation.end.report.measure);
  expect(observation.persisted.ended_at).toBeTypeOf('number');
}

describe('contrato do provider com Claude Code real e API controlada', () => {
  it('observa o controle positivo e verifica fontes, MCP, permissões e delegação na CLI real', async () => {
    const control = await harness.run({ control: true });
    expect(control.timedOut).toBe(false);
    expect(control.code).toBe(0);
    expect(control.requests.length, control.stderr).toBeGreaterThan(0);
    verifyTransport(control);
    const controlText = JSON.stringify(control.requests);
    const detectable = Object.entries(harness.canaries)
      .filter(([, marker]) => controlText.includes(marker))
      .map(([scope]) => scope);
    console.log(JSON.stringify({ control: detectable, hook: fs.existsSync(harness.marker), mcp: control.mcpConnections }));
    expect(detectable).toEqual(Object.keys(harness.canaries));
    expect(control.mcpConnections).toContain('forbidden');
    expect(fs.existsSync(harness.marker)).toBe(true);
    const strict = await harness.run({
      attempts: [
        { name: 'Read', input: { file_path: path.join(harness.project, 'allowed.txt') } },
        { name: 'Bash', input: { command: 'exit 73' } },
        { name: 'Write', input: { file_path: path.join(harness.project, 'forbidden.txt'), content: 'não escrever' } },
        { name: 'mcp__allowed__allowed', input: {} },
        { name: 'mcp__allowed__forbidden', input: {} },
        { name: 'Agent', input: { description: 'Não delegar', prompt: 'Não delegar', subagent_type: 'general-purpose' } },
      ],
    });
    expect(strict.timedOut).toBe(false);
    expect(strict.code).toBe(0);
    expect(strict.requests.length, strict.stderr).toBeGreaterThan(1);
    verifyTransport(strict);
    const strictText = JSON.stringify(strict.requests);
    for (const [scope, marker] of Object.entries(harness.canaries))
      expect(strictText.includes(marker), `Fonte externa: ${scope}`).toBe(false);
    expect(fs.existsSync(harness.marker)).toBe(false);
    expect(fs.existsSync(path.join(harness.project, 'forbidden.txt'))).toBe(false);
    expect(strict.mcpConnections).not.toContain('forbidden');
    // Cada tentativa proibida deve gerar recusa explícita, além da ausência de efeitos.
    const calls = new Map<string, string>();
    const results = new Map<string, boolean>();
    for (const request of strict.requests)
      for (const message of request.messages ?? []) {
        if (!Array.isArray(message.content)) continue;
        for (const block of message.content) {
          if (block.type === 'tool_use') calls.set(block.id, block.name);
          if (block.type === 'tool_result' && calls.has(block.tool_use_id))
            results.set(calls.get(block.tool_use_id)!, block.is_error === true);
        }
      }
    expect(Object.fromEntries(results)).toEqual({
      Read: false,
      Bash: true,
      Write: true,
      mcp__allowed__allowed: false,
      mcp__allowed__forbidden: true,
      Agent: true,
    });
    expect(strict.mcpCalls).toEqual(['allowed:allowed']);
    expect(strictText.includes('FAZAI_READ_ALLOWED'), 'Leitura permitida executada').toBe(true);
    expect(strictText.includes('FAZAI_MCP_ALLOWED'), 'MCP permitido executado').toBe(true);
    const names = strict.requests[0]!.tools!.map((tool) => tool.name);
    expect(names).toContain('Read');
    for (const forbidden of ['Write', 'Bash', 'Agent', 'Task']) expect(names).not.toContain(forbidden);
    console.log(
      JSON.stringify({
        executor: 'claude',
        identity: harness.identity,
        scope: 'fixture-local-api',
        control: observationDigest(control),
        strict: observationDigest(strict),
        productionAdmission: false,
        managedSettings: 'unavailable',
      }),
    );
  });
  it('a mutação do ambiente reproduz a contaminação da pasta adicional', async () => {
    const leaky = await harness.run({ inheritAdditionalMemory: true });
    expect(leaky.code, leaky.stderr).toBe(0);
    verifyTransport(leaky);
    expect(leaky.requests.length).toBeGreaterThan(0);
    expect(JSON.stringify(leaky.requests).includes(harness.canaries.additional!)).toBe(true);
  });
  it('vazio explícito não herda ferramentas e cada processo começa sem a conversa anterior', async () => {
    const first = await harness.run({ empty: true, prompt: 'FAZAI_CONVERSATION_FIRST' });
    const second = await harness.run({ empty: true, prompt: 'FAZAI_CONVERSATION_SECOND' });
    for (const observation of [first, second]) {
      expect(observation.code, observation.stderr).toBe(0);
      verifyTransport(observation);
      expect(observation.timedOut).toBe(false);
      expect(observation.requests.length).toBeGreaterThan(0);
      expect(observation.requests[0]!.tools ?? []).toEqual([]);
      expect(observation.mcpConnections).toEqual([]);
    }
    expect(JSON.stringify(second.requests).includes('FAZAI_CONVERSATION_FIRST')).toBe(false);
    const session = (o: typeof first) => o.events.find((e) => e.type === 'system' && e.subtype === 'init')?.session_id;
    expect(session(first)).toBeTypeOf('string');
    expect(session(second)).not.toBe(session(first));
  });
  it.each(['cancel', 'crash'] as const)('%s durante a requisição real encerra o grupo, persiste e não repete a CLI', async (interrupt) => {
    const observation = await harness.run({ interrupt });
    verifyTransport(observation);
    expect(observation.requests.length).toBe(1);
    expect(observation.timedOut).toBe(false);
    expect(observation.end.outcome).toBe(interrupt === 'cancel' ? 'stopped' : 'failed');
    expect(observation.end.stopped).toBe(interrupt === 'cancel');
    expect(observation.persisted.measure).toBe('none');
    expect(observation.persisted.input_tokens).toBeNull();
    expect(observation.end.report.consumption).toBeNull();
    expect(observation.mcpCalls).toEqual([]);
  });
  it('falha antes do flush impede a liberação da CLI e limpa o arquivo MCP privado', async () => {
    const observation = await harness.run({ failFlush: true });
    verifyTransport(observation);
    expect(observation.requests).toEqual([]);
    expect(observation.events).toEqual([]);
    expect(observation.mcpConnections).toEqual([]);
    expect(observation.end.outcome).toBe('failed');
    expect(observation.end.error?.message).toContain('registrar a identidade');
    expect(observation.persisted.input_tokens).toBeNull();
  });
  it('o gateway recusa contrato v1 sem evidências e persiste a decisão sem iniciar a CLI', async () => {
    await expect(harness.run({ unverified: true })).rejects.toThrow('capability-not-verified');
    expect(harness.requestCount).toBe(0);
    const rows = await harness.audit();
    expect(rows[0]!.outcome).toBe('unsupported');
    const admission = JSON.parse(String(rows[0]!.admission_json));
    expect(admission.state).toBe('blocked');
    expect(admission.capabilities).toHaveLength(5);
    expect(admission.capabilities.every((capability: { state: string }) => capability.state === 'unknown')).toBe(true);
    expect(admission.reasons).toContainEqual({ code: 'environment-not-verified' });
    expect(fs.existsSync(path.join(harness.root, 'evidence'))).toBe(false);
  });
});
