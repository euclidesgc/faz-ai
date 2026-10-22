// Adaptador do Claude Code para o "Exportar para a ferramenta" (#623).
// Formato conferido na documentação oficial em 2026-10-16 (code.claude.com/docs/en/sub-agents, /skills, /memory):
// regras em `.claude/rules/*.md`, skills em `.claude/skills/<nome>/`, agentes em `.claude/agents/<nome>.md`.
import type { FormatLoss } from '../../shared/toolExport';
import {
  agentMetaOf,
  commonLosses,
  flagLosses,
  modelLosses,
  modelParts,
  renderAgents,
  renderRuleFiles,
  renderSkills,
  ruleHeaderLoss,
  stripFrontmatter,
  toolListLosses,
  yamlList,
} from './common';
import type { ToolAdapter } from './types';

export const claudeAdapter: ToolAdapter = {
  tool: 'claude',
  root: '.claude',
  supports: () => true,
  skillDir: (name) => `.claude/skills/${name}`,
  render(kind, sources) {
    if (kind === 'skill') return renderSkills('.claude', sources);
    // regra sem frontmatter nova: carregada em toda conversa; da mesma ferramenta vai como está
    if (kind === 'rule')
      return renderRuleFiles('.claude/rules', '.md', sources, (s) =>
        s.artifact.originTool === 'claude' ? s.body : stripFrontmatter(s.body).text,
      );
    return renderAgents('.claude', sources, (s, meta) => {
      const out: string[] = [];
      const { native } = meta.tools;
      const sameTools = native.tool === 'claude';
      if (sameTools && native.allow.length) out.push(`tools: ${native.allow.join(', ')}`);
      if (sameTools && native.deny.length) out.push(`disallowedTools: ${native.deny.join(', ')}`);
      const m = modelParts(meta.model);
      if (m.tool === 'claude' && m.id) out.push(`model: ${m.id}`);
      if (m.tool === 'claude' && m.effort) out.push(`effort: ${m.effort}`);
      if (meta.mcpServers.length) out.push(`mcpServers: ${yamlList(meta.mcpServers)}`);
      if (meta.skills.length) out.push(`skills: ${yamlList(meta.skills)}`);
      return out;
    });
  },
  losses(s) {
    const a = s.artifact;
    const out: FormatLoss[] = commonLosses(s);
    if (a.kind === 'rule') return [...out, { code: 'rule-load', effect: 'mapped' }, ...ruleHeaderLoss(s, 'claude')];
    if (a.kind !== 'agent') return out;
    const meta = agentMetaOf(s);
    return [
      ...out,
      ...toolListLosses(meta, 'claude', true),
      ...(meta.mcpServers.length ? [{ code: 'mcpServers' as const, effect: 'configure' as const, value: meta.mcpServers.join(', ') }] : []),
      ...modelLosses(meta, 'claude', true, true),
      ...flagLosses(meta),
    ];
  },
};
