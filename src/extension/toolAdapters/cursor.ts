// Adaptador do Cursor para o "Exportar para a ferramenta" (#623).
// Formato conferido na documentação oficial em 2026-10-16 (cursor.com/docs/context/rules, /subagents, /skills):
// regras em `.cursor/rules/*.mdc` (só no projeto: as do usuário ficam em Customize → Rules; `.md` é ignorado),
// skills em `.cursor/skills/<nome>/`, agentes em `.cursor/agents/<nome>.md`.
import type { FormatLoss } from '../../shared/toolExport';
import {
  agentMetaOf,
  commonLosses,
  neutralToolLosses,
  modelLosses,
  modelParts,
  renderAgents,
  renderRuleFiles,
  renderSkills,
  ruleHeaderLoss,
  stripFrontmatter,
  toolListLosses,
  listToolFolder,
  mcpLocations,
  withFrontmatter,
  yamlString,
} from './common';
import type { ToolAdapter } from './types';

export const cursorAdapter: ToolAdapter = {
  tool: 'cursor',
  root: '.cursor',
  supports: (kind, target) => !(kind === 'rule' && target === 'user'),
  skillDir: (name) => `.cursor/skills/${name}`,
  list: (target, base) =>
    listToolFolder('.cursor', target, base, target === 'project' ? { ruleDir: '.cursor/rules', ruleExt: '.mdc' } : {}),
  mcpFiles: (target) => mcpLocations(target, ['.cursor/mcp.json'], ['.cursor/mcp.json']),
  render(kind, sources, target) {
    if (!this.supports(kind, target))
      return { files: [], refused: sources.map((s) => ({ id: s.artifact.id, reason: 'unsupported' as const })) };
    if (kind === 'skill') return renderSkills('.cursor', sources);
    if (kind === 'rule')
      return renderRuleFiles('.cursor/rules', '.mdc', sources, (s) => {
        if (s.artifact.originTool === 'cursor') return s.body;
        // "Sempre" aplica em toda conversa; o resto a IA decide pela descrição ("Apply Intelligently")
        const always = s.artifact.usage === 'always';
        return withFrontmatter(
          [`description: ${yamlString(s.artifact.description || s.artifact.name)}`, `alwaysApply: ${always}`],
          stripFrontmatter(s.body).text,
        );
      });
    return renderAgents('.cursor', sources, (s, meta) => {
      const out: string[] = [];
      const m = modelParts(meta.model);
      if (m.tool === 'cursor' && m.id) out.push(`model: ${m.id}`);
      if (meta.readonly) out.push('readonly: true');
      if (meta.background) out.push('is_background: true');
      return out;
    });
  },
  losses(s) {
    const a = s.artifact;
    const out: FormatLoss[] = commonLosses(s);
    if (a.kind === 'rule')
      return [
        ...out,
        { code: 'rule-load', effect: 'mapped', value: a.usage === 'always' ? 'always' : 'intelligent' },
        ...ruleHeaderLoss(s, 'cursor'),
      ];
    if (a.kind === 'skill') return [...out, ...neutralToolLosses(s, 'cursor')];
    if (a.kind !== 'agent') return out;
    const meta = agentMetaOf(s);
    return [
      ...out,
      ...toolListLosses(s, 'cursor', false),
      ...(meta.mcpServers.length ? [{ code: 'mcpServers' as const, effect: 'lost' as const, value: meta.mcpServers.join(', ') }] : []),
      ...(meta.skills.length ? [{ code: 'skills' as const, effect: 'lost' as const, value: meta.skills.join(', ') }] : []),
      ...modelLosses(meta, 'cursor', true, false),
    ];
  },
};
