import { describe, expect, it } from 'vitest';
import { decide, skillOfPath } from '../src/extension/ai/cursorHook';
import type { CursorManifest } from '../src/extension/ai/cursorManifest';

const m: CursorManifest = {
  runId: 'r',
  mcpServers: ['faz-ai'],
  subagents: ['backend-node'],
  tools: ['Read', 'Task'],
  skills: ['boa'],
  createdAt: 'x',
};
const denied = (v: ReturnType<typeof decide>) => v.permission === 'deny';

describe('decide', () => {
  it('sem manifesto ou entrada inválida libera', () => {
    expect(decide({ hook_event_name: 'beforeMCPExecution', mcp_server_name: 'x' }, null).permission).toBe('allow');
    expect(decide('lixo', m).permission).toBe('allow');
    expect(decide(null, m).permission).toBe('allow');
    expect(decide({ hook_event_name: 'outro' }, m).permission).toBe('allow');
  });
  it('MCP: ausente ou fora da lista é negado, com motivo', () => {
    expect(decide({ hook_event_name: 'beforeMCPExecution', mcp_server_name: 'faz-ai' }, m).permission).toBe('allow');
    const v = decide({ hook_event_name: 'beforeMCPExecution', mcp_server_name: 'outro' }, m);
    expect(denied(v) && v.agent_message).toContain('outro');
    expect(denied(decide({ hook_event_name: 'beforeMCPExecution' }, m))).toBe(true);
  });
  it('subagente fora da lista é negado em subagentStart e no Task', () => {
    expect(denied(decide({ hook_event_name: 'subagentStart', subagent_type: 'x' }, m))).toBe(true);
    expect(decide({ hook_event_name: 'subagentStart', subagent_type: 'backend-node' }, m).permission).toBe('allow');
    expect(denied(decide({ hook_event_name: 'preToolUse', tool_name: 'Task', tool_input: { subagent_type: 'x' } }, m))).toBe(true);
    expect(denied(decide({ hook_event_name: 'preToolUse', tool_name: 'Task', tool_input: '{"subagent_type":"x"}' }, m))).toBe(true);
    expect(denied(decide({ hook_event_name: 'preToolUse', tool_name: 'Task' }, m))).toBe(true);
    expect(decide({ hook_event_name: 'preToolUse', tool_name: 'Task', tool_input: { subagent_type: 'backend-node' } }, m).permission).toBe(
      'allow',
    );
  });
  it('ferramenta fora da lista é negada', () => {
    expect(decide({ hook_event_name: 'preToolUse', tool_name: 'Read' }, m).permission).toBe('allow');
    expect(denied(decide({ hook_event_name: 'preToolUse', tool_name: 'Shell' }, m))).toBe(true);
  });
  it('SKILL.md de skill não escolhida é negado', () => {
    expect(skillOfPath('/h/.cursor/skills/boa/SKILL.md')).toBe('boa');
    expect(decide({ hook_event_name: 'beforeReadFile', file_path: '/h/.cursor/skills/boa/SKILL.md' }, m).permission).toBe('allow');
    expect(denied(decide({ hook_event_name: 'beforeReadFile', file_path: '/h/.cursor/skills/ruim/SKILL.md' }, m))).toBe(true);
    expect(decide({ hook_event_name: 'beforeReadFile', file_path: '/p/src/a.ts' }, m).permission).toBe('allow');
  });
  it('sem lista de ferramentas o card não restringe; as negadas e o subagente do Task seguem valendo', () => {
    const open: CursorManifest = { ...m, tools: [], deniedTools: ['Shell'] };
    expect(decide({ hook_event_name: 'preToolUse', tool_name: 'Read' }, open).permission).toBe('allow');
    expect(denied(decide({ hook_event_name: 'preToolUse', tool_name: 'Shell' }, open))).toBe(true);
    expect(denied(decide({ hook_event_name: 'preToolUse', tool_name: 'Task', tool_input: { subagent_type: 'x' } }, open))).toBe(true);
  });
  it('chamada MCP no preToolUse não confere `tools` (o servidor é conferido no beforeMCPExecution)', () => {
    const restrito: CursorManifest = { ...m, tools: ['Read', 'Grep', 'Task', 'Shell'], deniedTools: ['Write'] };
    expect(decide({ hook_event_name: 'preToolUse', tool_name: 'MCP:get_card' }, restrito).permission).toBe('allow');
    expect(decide({ hook_event_name: 'beforeMCPExecution', mcp_server_name: 'faz-ai' }, restrito).permission).toBe('allow');
    expect(denied(decide({ hook_event_name: 'preToolUse', tool_name: 'Delete' }, restrito))).toBe(true);
  });
  it('skill do snapshot em run-artifacts é liberada, mesmo fora de `skills`', () => {
    const f = '/dados/run-artifacts/x/y/skills/sempre/SKILL.md';
    expect(decide({ hook_event_name: 'beforeReadFile', file_path: f }, m).permission).toBe('allow');
  });
});
