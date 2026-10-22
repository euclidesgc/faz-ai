// Adaptador do Kimi Code para o "Exportar para a ferramenta" (#623).
// Formato conferido na documentação oficial em 2026-10-16 (kimi.com/code/docs/en/kimi-code-cli/customization/agents e /skills):
// as regras vão juntas em `.kimi-code/AGENTS.md` (não há pasta de regras), skills em `.kimi-code/skills/<nome>/`,
// agentes em `.kimi-code/agents/<nome>.md`. A pasta do usuário é `~/.kimi-code` (`$KIMI_CODE_HOME` não é seguido).
import type { FormatLoss } from '../../shared/toolExport';
import {
  agentMetaOf,
  commonLosses,
  flagLosses,
  modelLosses,
  renderAgents,
  renderSkills,
  ruleHeaderLoss,
  stripFrontmatter,
  toolListLosses,
  listToolFolder,
  mcpLocations,
} from './common';
import type { ToolAdapter } from './types';

export const kimiAdapter: ToolAdapter = {
  tool: 'kimi',
  root: '.kimi-code',
  supports: () => true,
  skillDir: (name) => `.kimi-code/skills/${name}`,
  list: (target, base) =>
    listToolFolder('.kimi-code', target, base, {
      extraRules: target === 'project' ? ['AGENTS.md', '.kimi-code/AGENTS.md'] : ['.kimi-code/AGENTS.md'],
    }),
  mcpFiles: (target) => mcpLocations(target, ['.kimi-code/mcp.json'], ['.kimi-code/mcp.json']),
  render(kind, sources) {
    if (kind === 'skill') return renderSkills('.kimi-code', sources);
    if (kind === 'rule') {
      if (!sources.length) return { files: [], refused: [] };
      const sorted = [...sources].sort((a, b) => a.artifact.name.localeCompare(b.artifact.name));
      const texts = sorted.map((s) => (s.artifact.originTool === 'kimi' ? s.body : stripFrontmatter(s.body).text).trim());
      return {
        files: [{ rel: '.kimi-code/AGENTS.md', data: Buffer.from(`${texts.join('\n\n')}\n`), from: sorted.map((s) => s.artifact.id) }],
        refused: [],
      };
    }
    return renderAgents('.kimi-code', sources, (s, meta) => {
      const out: string[] = [];
      const { native } = meta.tools;
      if (native.tool === 'kimi' && native.allow.length) out.push(`tools: ${native.allow.join(', ')}`);
      if (native.tool === 'kimi' && native.deny.length) out.push(`disallowedTools: ${native.deny.join(', ')}`);
      return out;
    });
  },
  losses(s) {
    const a = s.artifact;
    const out: FormatLoss[] = commonLosses(s);
    if (a.kind === 'rule')
      return [...out, { code: 'rule-load', effect: 'mapped' }, { code: 'rules-merged', effect: 'mapped' }, ...ruleHeaderLoss(s, 'kimi')];
    if (a.kind !== 'agent') return out;
    const meta = agentMetaOf(s);
    return [
      ...out,
      ...toolListLosses(meta, 'kimi', true),
      ...(meta.mcpServers.length ? [{ code: 'mcpServers' as const, effect: 'lost' as const, value: meta.mcpServers.join(', ') }] : []),
      ...(meta.skills.length ? [{ code: 'skills' as const, effect: 'lost' as const, value: meta.skills.join(', ') }] : []),
      ...modelLosses(meta, 'kimi', false, false),
      ...flagLosses(meta),
    ];
  },
};
