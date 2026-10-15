import { describe, expect, it } from 'vitest';
import {
  AGENT_FORMAT,
  AGENT_TOOLS,
  AGENT_TOOLS_ALWAYS_REMOVED,
  agentToolGroup,
  agentToolNames,
  extraToolNames,
  mcpToolPattern,
} from '../src/shared/agentTools';
import { BOARD_TOOLS, TOOL_PRESETS } from '../src/shared/execution';
import { AGENT_SUGGESTIONS } from '../src/shared/agentSuggestions';

describe('ferramentas de agente por ferramenta de IA', () => {
  it('os nomes do Claude Code são únicos e cada grupo tem a descrição de cada ferramenta', () => {
    const names = agentToolNames('claude');
    expect(new Set(names).size).toBe(names.length);
    for (const g of AGENT_TOOLS.claude) {
      expect(g.label && g.hint).toBeTruthy();
      expect(g.tools.length).toBeGreaterThan(0);
      for (const x of g.tools) expect(x.hint).toBeTruthy();
    }
  });

  it('as ferramentas que a doc remove de todo subagente e as que não existem mais não são oferecidas', () => {
    const names = agentToolNames('claude');
    for (const gone of [...AGENT_TOOLS_ALWAYS_REMOVED, 'MultiEdit', 'BashOutput', 'KillShell', 'SlashCommand', 'TaskOutput'])
      expect(names).not.toContain(gone);
    // o servidor do board entra sempre por BOARD_TOOLS e a interface nunca o mostra
    expect(names).not.toContain(BOARD_TOOLS);
    expect(names.some((n) => n.startsWith('mcp__'))).toBe(false);
  });

  it('o Cursor não tem lista de ferramentas: só somente leitura e segundo plano', () => {
    expect(AGENT_TOOLS.cursor).toEqual([]);
    expect(AGENT_FORMAT.cursor).toEqual({ tools: false, skills: false, mcp: false, readonly: true, background: true });
    expect(AGENT_FORMAT.claude).toEqual({ tools: true, skills: true, mcp: true, readonly: false, background: false });
  });

  it('os grupos que ampliam o escopo são edição, comandos, rede e outros agentes; a leitura não', () => {
    const widens = Object.fromEntries(AGENT_TOOLS.claude.map((g) => [g.id, g.widens]));
    expect(widens).toMatchObject({ read: false, edit: true, run: true, net: true, agents: true, other: false });
    expect(agentToolGroup('claude', 'Bash')?.widens).toBe(true);
    expect(agentToolGroup('claude', 'Grep')?.widens).toBe(false);
    expect(agentToolGroup('claude', 'mcp__github__*')).toBeUndefined();
  });

  it('o que o arquivo tem e a lista não conhece vira extra; o padrão de servidor MCP é mcp__nome__*', () => {
    expect(extraToolNames('claude', ['Read', 'mcp__github__*', 'Bash(git diff *)'])).toEqual(['mcp__github__*', 'Bash(git diff *)']);
    expect(mcpToolPattern('github')).toBe('mcp__github__*');
  });

  it('os conjuntos prontos e as sugestões só usam ferramentas da lista', () => {
    const names = new Set(agentToolNames('claude'));
    for (const p of TOOL_PRESETS) for (const x of p.tools) expect(names.has(x)).toBe(true);
    for (const s of AGENT_SUGGESTIONS) for (const x of s.tools) expect(names.has(x)).toBe(true);
  });
});
