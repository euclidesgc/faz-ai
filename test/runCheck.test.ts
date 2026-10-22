import { describe, expect, it } from 'vitest';
import { checkRun, type RunCheckManifest } from '../src/shared/runCheck';
import type { InventoryItem, RunReport } from '../src/shared/log';

const manifest = (over: Partial<RunCheckManifest> = {}): RunCheckManifest => ({
  skills: ['revisar'],
  mcpServers: ['code-review-graph'],
  tools: [],
  deniedTools: ['Agent'],
  agent: 'backend-node',
  ...over,
});
const run = (inventory: InventoryItem[], measure: RunReport['measure'] = 'full') => ({ measure, inventory });
const check = (inventory: InventoryItem[], m = manifest(), measure: RunReport['measure'] = 'full') =>
  checkRun(run(inventory, measure), m, 'faz-ai');

describe('checkRun', () => {
  it('measure none é não medida', () => {
    expect(check([], manifest(), 'none')).toEqual({ status: 'unchecked', reason: 'not_measured' });
  });
  it('inventário vazio é não conferida, nunca ok', () => {
    expect(check([])).toEqual({ status: 'unchecked', reason: 'no_inventory' });
    expect(check([], manifest(), 'partial')).toEqual({ status: 'unchecked', reason: 'no_inventory' });
  });
  it('servidor liberado e servidor do board não são desvio', () => {
    expect(
      check([
        { kind: 'mcp_tool', name: 'mcp__code-review-graph__query', calls: 2 },
        { kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 1 },
      ]),
    ).toEqual({ status: 'ok' });
  });
  it('servidor fora do card é desvio, somando as chamadas', () => {
    expect(
      check([
        { kind: 'mcp_tool', name: 'mcp__github__a', calls: 2 },
        { kind: 'mcp_tool', name: 'github/b', calls: 1 },
      ]),
    ).toEqual({ status: 'deviation', deviations: [{ kind: 'mcp_server', name: 'github', calls: 3 }] });
  });
  it('ferramenta MCP sem servidor é desvio com o nome literal', () => {
    expect(check([{ kind: 'mcp_tool', name: 'solta', calls: 1 }])).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'mcp_server', name: 'solta', calls: 1 }],
    });
  });
  it('subagente do manifesto passa; outro é desvio', () => {
    expect(check([{ kind: 'agent', name: 'backend-node', calls: 1 }])).toEqual({ status: 'ok' });
    expect(check([{ kind: 'agent', name: 'Explore', calls: 1 }])).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'agent', name: 'Explore', calls: 1 }],
    });
    expect(check([{ kind: 'agent', name: 'x', calls: 1 }], manifest({ agent: '' })).status).toBe('deviation');
  });
  it('skill do card e skill do fluxo passam; outra é desvio', () => {
    expect(
      check([
        { kind: 'skill', name: 'revisar', calls: 1 },
        { kind: 'skill', name: 'faz-ai-fluxo', calls: 1 },
      ]),
    ).toEqual({ status: 'ok' });
    expect(check([{ kind: 'skill', name: 'outra', calls: 1 }])).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'skill', name: 'outra', calls: 1 }],
    });
  });
  it('ferramenta negada é desvio; lista vazia não restringe', () => {
    expect(check([{ kind: 'tool', name: 'Agent', calls: 1 }]).status).toBe('deviation');
    expect(check([{ kind: 'tool', name: 'Bash', calls: 5 }])).toEqual({ status: 'ok' });
  });
  it('com tools preenchido, ferramenta fora da lista é desvio', () => {
    const m = manifest({ tools: ['Read'] });
    expect(check([{ kind: 'tool', name: 'Read', calls: 1 }], m)).toEqual({ status: 'ok' });
    expect(check([{ kind: 'tool', name: 'Bash', calls: 1 }], m)).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'tool', name: 'Bash', calls: 1 }],
    });
  });
});

import { runCheckLine, runCheckNotice, type RunCheck } from '../src/shared/runCheck';

describe('runCheckLine e runCheckNotice', () => {
  it('só o desvio gera aviso na conversa', () => {
    const dev = {
      status: 'deviation',
      deviations: [
        { kind: 'mcp_server', name: 'x', calls: 1 },
        { kind: 'agent', name: 'y', calls: 2 },
      ],
    } satisfies RunCheck;
    expect(runCheckNotice(dev)).toContain('servidor MCP x; subagente y');
    expect(runCheckNotice({ status: 'ok' })).toBeNull();
    expect(runCheckNotice({ status: 'unchecked', reason: 'no_inventory' })).toBeNull();
  });
  it('o registro mostra os três estados', () => {
    expect(runCheckLine({ status: 'ok' })).toContain('sem desvio');
    expect(runCheckLine({ status: 'unchecked', reason: 'no_inventory' })).toContain('não conferida');
    expect(runCheckLine({ status: 'deviation', deviations: [{ kind: 'skill', name: 's', calls: 1 }] })).toContain('com desvio (1)');
  });
});
