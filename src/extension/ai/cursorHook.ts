// Decisão do hook global do Cursor: pura, sem dependências e sem rede. Sem manifesto, libera tudo
// (o Cursor da pessoa não muda); com manifesto, nega o que o card não permite, com o motivo.
import type { CursorManifest } from './cursorManifest';

export type HookVerdict = { permission: 'allow' } | { permission: 'deny'; user_message: string; agent_message: string };

const ALLOW: HookVerdict = { permission: 'allow' };

function deny(reason: string): HookVerdict {
  const msg = `Faz AI: ${reason}`;
  return { permission: 'deny', user_message: msg, agent_message: msg };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** `tool_input` chega como objeto ou como JSON em texto, conforme a versão da CLI. */
function toolInput(v: unknown): Record<string, unknown> {
  if (isObj(v)) return v;
  if (typeof v === 'string') {
    try {
      const p: unknown = JSON.parse(v);
      return isObj(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** O nome da skill de um caminho `…/skills/<nome>/SKILL.md`, se for um. */
export function skillOfPath(file: string): string | undefined {
  const m = /(?:^|[\\/])skills(?:-[^\\/]+)?[\\/]([^\\/]+)[\\/]SKILL\.md$/i.exec(file);
  return m?.[1];
}

/** Nunca lança: entrada inválida, manifesto ausente ou erro → liberar. */
export function decide(input: unknown, manifest: CursorManifest | null): HookVerdict {
  try {
    if (!manifest || !isObj(input)) return ALLOW;
    const event = str(input.hook_event_name);
    const allowedServers = list(manifest.mcpServers);
    const allowedAgents = list(manifest.subagents);
    const allowedTools = list(manifest.tools);

    if (event === 'beforeMCPExecution') {
      const server = str(input.mcp_server_name) ?? str(input.server);
      if (!server || !allowedServers.includes(server)) {
        return deny(`o servidor MCP "${server ?? '(sem nome)'}" não está entre os permitidos pelo card.`);
      }
      return ALLOW;
    }
    if (event === 'subagentStart') {
      const sub = str(input.subagent_type) ?? str(input.subagent_name);
      if (!sub || !allowedAgents.includes(sub)) return deny(`o subagente "${sub ?? '(sem nome)'}" não está entre os permitidos pelo card.`);
      return ALLOW;
    }
    if (event === 'preToolUse') {
      const tool = str(input.tool_name);
      // chamadas MCP também passam por aqui (`MCP:<ferramenta>`); o servidor é conferido no beforeMCPExecution
      if (tool && /^mcp[:_]/i.test(tool)) return ALLOW;
      // `tools` vazio: o card não restringe as ferramentas (só as negadas e o Task valem)
      if (tool && list(manifest.deniedTools).includes(tool)) return deny(`a ferramenta "${tool}" está negada pelo card.`);
      if (!tool || (allowedTools.length && !allowedTools.includes(tool)))
        return deny(`a ferramenta "${tool ?? '(sem nome)'}" não está entre as permitidas pelo card.`);
      if (tool === 'Task') {
        const sub = str(toolInput(input.tool_input).subagent_type);
        if (!sub || !allowedAgents.includes(sub))
          return deny(`o subagente "${sub ?? '(sem nome)'}" não está entre os permitidos pelo card.`);
      }
      return ALLOW;
    }
    if (event === 'beforeReadFile') {
      const file = str(input.file_path);
      // o snapshot do pedido (skills "Sempre" e as do card) fica em run-artifacts e já foi filtrado pelo board
      if (file && /[\\/]run-artifacts[\\/]/.test(file)) return ALLOW;
      const skill = file ? skillOfPath(file) : undefined;
      if (skill && !list(manifest.skills).includes(skill)) return deny(`a skill "${skill}" não foi escolhida no card.`);
      return ALLOW;
    }
    return ALLOW;
  } catch {
    return ALLOW;
  }
}
