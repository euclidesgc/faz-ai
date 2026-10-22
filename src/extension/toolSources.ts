import type { AiTool } from '../shared/harness';
import type { SelectableKind } from '../shared/harnessSelection';
import { mcpServerNames, type SourceDirs } from './artifactSource';
import { TOOL_ADAPTERS } from './toolAdapters';
import type { ToolAdapter } from './toolAdapters/types';

/** Um artefato achado numa pasta de ferramenta, pronto para `readSource`. */
export interface ToolSource {
  tool: AiTool;
  kind: SelectableKind;
  location: string;
  scope: 'project' | 'user';
}

/** Os adaptadores de uma ferramenta, ou todos quando ela não é dada. */
export function adaptersOf(tool?: AiTool): ToolAdapter[] {
  const all = Object.values(TOOL_ADAPTERS).filter((a): a is ToolAdapter => !!a);
  return tool ? all.filter((a) => a.tool === tool) : all;
}

/**
 * O que a ferramenta tem na pasta `base` (do projeto ou do usuário), lido pelo adaptador de formato
 * (#851): regras, skills, agentes e um item por servidor MCP dos arquivos de configuração dela. Só lê:
 * não varre nem grava nada nas pastas das ferramentas.
 */
export function listToolSources(adapter: ToolAdapter, target: 'project' | 'user', base: string, dirs: SourceDirs): ToolSource[] {
  if (!base) return [];
  const out: ToolSource[] = adapter
    .list(target, base)
    .map((l) => ({ tool: adapter.tool, kind: l.kind, location: l.location, scope: l.scope }));
  for (const file of adapter.mcpFiles(target, base))
    for (const name of mcpServerNames(file, dirs))
      out.push({ tool: adapter.tool, kind: 'mcp', location: `${file}#${name}`, scope: target });
  return out;
}
