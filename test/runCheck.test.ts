import { describe, expect, it } from 'vitest';
import { checkRun, type RunCheckManifest } from '../src/shared/runCheck';
import type { InventoryItem, RunReport } from '../src/shared/log';
import { AGENT_TOOLS, GEMINI_TOOL_EQUIVALENTS, geminiToolsFor } from '../src/shared/agentTools';

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

describe('checkRun com inventário do Gemini pela CLI (nomes do Gemini, história 8)', () => {
  const check = (inventory: InventoryItem[], m = manifest()) => checkRun(run(inventory), m, 'faz-ai', 'gemini');
  it('a tabela do Gemini só vale para o inventário dele: o glob do Cursor segue conferido como nome do card', () => {
    const card = manifest({ tools: ['Read', 'Grep', 'Glob'], deniedTools: [] });
    const glob: InventoryItem[] = [{ kind: 'tool', name: 'glob', calls: 1 }];
    // no Gemini, `glob` é o `Glob` do card
    expect(checkRun(run(glob), card, 'faz-ai', 'gemini')).toEqual({ status: 'ok' });
    // no Cursor (sem vocabulário), o mesmo nome continua sendo conferido como está, como antes desta história
    expect(checkRun(run(glob), card, 'faz-ai')).toEqual({ status: 'deviation', deviations: [{ kind: 'tool', name: 'glob', calls: 1 }] });
    // e os kinds do ACP valem para todo inventário, como antes
    expect(checkRun(run([{ kind: 'tool', name: 'read', calls: 1 }]), card, 'faz-ai', 'gemini')).toEqual({ status: 'ok' });
  });
  it('os nomes do Gemini são lidos no vocabulário do card: dentro das tools, sem desvio; fora, ou negados, com desvio', () => {
    const card = manifest({ tools: ['Read', 'Grep', 'Glob'], deniedTools: ['Bash'] });
    expect(
      check(
        [
          { kind: 'tool', name: 'read_file', calls: 2 },
          { kind: 'tool', name: 'grep_search', calls: 1 },
          { kind: 'tool', name: 'list_directory', calls: 1 },
          { kind: 'tool', name: 'update_topic', calls: 1 },
          { kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 1 },
        ],
        card,
      ),
    ).toEqual({ status: 'ok' });
    expect(check([{ kind: 'tool', name: 'run_shell_command', calls: 1 }], card)).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'tool', name: 'run_shell_command', calls: 1 }],
    });
    expect(check([{ kind: 'tool', name: 'write_file', calls: 1 }], card)).toMatchObject({ status: 'deviation' });
    // sem lista de tools no card, só o negado é desvio
    expect(check([{ kind: 'tool', name: 'replace', calls: 1 }], manifest({ tools: [], deniedTools: ['Bash'] }))).toEqual({ status: 'ok' });
    expect(check([{ kind: 'tool', name: 'run_shell_command', calls: 1 }], manifest({ tools: [], deniedTools: ['Bash'] }))).toMatchObject({
      status: 'deviation',
    });
  });
  it('os três vocabulários não colidem: nenhum nome do Gemini é kind ACP nem nome do card', () => {
    const acp = ['think', 'switch_mode', 'other', 'read', 'search', 'edit', 'delete', 'move', 'execute', 'fetch'];
    for (const name of Object.keys(GEMINI_TOOL_EQUIVALENTS)) {
      expect(acp).not.toContain(name);
      // minúsculos: nenhum nome do card (capitalizado) cai aqui
      expect(name).toMatch(/^[a-z_]+$/);
    }
    // e toda ferramenta da tabela do Gemini tem equivalente (a conferência não cai no caminho do nome do card)
    for (const name of AGENT_TOOLS.gemini.flatMap((g) => g.tools.map((t) => t.name))) expect(GEMINI_TOOL_EQUIVALENTS).toHaveProperty(name);
    expect(geminiToolsFor(['Read', 'Bash'])).toEqual(['read_file', 'read_many_files', 'list_directory', 'run_shell_command']);
  });
});

describe('checkRun com inventário ACP (kind do protocolo)', () => {
  const condutor = manifest({ tools: ['Read', 'Grep', 'Glob', 'Agent', 'Bash'], deniedTools: [] });
  it('think e other com as tools do condutor não são desvio', () => {
    expect(
      check(
        [
          { kind: 'tool', name: 'think', calls: 3 },
          { kind: 'tool', name: 'other', calls: 2 },
          { kind: 'tool', name: 'switch_mode', calls: 1 },
        ],
        condutor,
      ),
    ).toEqual({ status: 'ok' });
  });
  it('read, search e execute dentro das tools do card não são desvio', () => {
    expect(
      check(
        [
          { kind: 'tool', name: 'read', calls: 1 },
          { kind: 'tool', name: 'search', calls: 1 },
          { kind: 'tool', name: 'execute', calls: 1 },
        ],
        condutor,
      ),
    ).toEqual({ status: 'ok' });
  });
  it('execute com Bash fora de tools é desvio', () => {
    expect(check([{ kind: 'tool', name: 'execute', calls: 2 }], manifest({ tools: ['Read'], deniedTools: [] }))).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'tool', name: 'execute', calls: 2 }],
    });
  });
  it('edit com Edit em deniedTools é desvio', () => {
    expect(check([{ kind: 'tool', name: 'edit', calls: 1 }], manifest({ tools: [], deniedTools: ['Edit'] }))).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'tool', name: 'edit', calls: 1 }],
    });
  });
  it('edit passa se qualquer equivalente está em tools e nenhum negado; delete aceita Bash', () => {
    expect(check([{ kind: 'tool', name: 'edit', calls: 1 }], manifest({ tools: ['Write'], deniedTools: [] }))).toEqual({ status: 'ok' });
    expect(check([{ kind: 'tool', name: 'delete', calls: 1 }], manifest({ tools: ['Bash'], deniedTools: [] }))).toEqual({ status: 'ok' });
  });
  it('o inventário do Claude continua igual: nomes do card contra tools e deniedTools', () => {
    expect(check([{ kind: 'tool', name: 'Bash', calls: 1 }], manifest({ tools: ['Read'], deniedTools: [] }))).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'tool', name: 'Bash', calls: 1 }],
    });
    expect(check([{ kind: 'tool', name: 'Agent', calls: 1 }], manifest({ tools: [] }))).toEqual({
      status: 'deviation',
      deviations: [{ kind: 'tool', name: 'Agent', calls: 1 }],
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
