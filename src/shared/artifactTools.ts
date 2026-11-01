// As tools neutras dos artefatos do board (docs/decisoes/biblioteca-de-artefatos-do-board.md): a skill diz o
// que precisa, o agente diz o que concede. O board guarda sempre os ids neutros e traduz por ferramenta na
// exportação e na execução. Só funções puras: a tela e o host usam as mesmas.
import type { AiTool } from './harness';
import type { ToolCategory } from './artifacts';

export type NeutralTool = 'read' | 'search' | 'write' | 'edit' | 'shell' | 'network' | 'mcp' | 'delegate';

export interface NeutralToolInfo {
  id: NeutralTool;
  label: string;
  hint: string;
  /** amplia o que a IA alcança fora do projeto: a tela marca como sensível */
  sensitive: boolean;
  /** só agentes concedem (delegar a outro agente não é algo que uma skill peça) */
  agentOnly: boolean;
}

/** A lista fechada, na ordem da tela. */
export const NEUTRAL_TOOLS: readonly NeutralToolInfo[] = [
  { id: 'read', label: 'Ler arquivos', hint: 'Lê os arquivos do projeto.', sensitive: false, agentOnly: false },
  { id: 'search', label: 'Buscar', hint: 'Encontra arquivos pelo nome e texto dentro deles.', sensitive: false, agentOnly: false },
  { id: 'write', label: 'Criar arquivos', hint: 'Cria ou sobrescreve arquivos.', sensitive: false, agentOnly: false },
  { id: 'edit', label: 'Editar arquivos', hint: 'Altera trechos de arquivos existentes.', sensitive: false, agentOnly: false },
  { id: 'shell', label: 'Terminal', hint: 'Roda comandos no seu computador.', sensitive: true, agentOnly: false },
  { id: 'network', label: 'Rede', hint: 'Baixa páginas e pesquisa na web.', sensitive: true, agentOnly: false },
  {
    id: 'mcp',
    label: 'Servidores MCP',
    hint: 'Usa as ferramentas dos servidores MCP ativos no board.',
    sensitive: false,
    agentOnly: false,
  },
  { id: 'delegate', label: 'Delegar', hint: 'Lança outro agente para uma parte do trabalho.', sensitive: false, agentOnly: true },
];

const IDS: readonly string[] = NEUTRAL_TOOLS.map((x) => x.id);
export const isNeutralTool = (x: unknown): x is NeutralTool => typeof x === 'string' && IDS.includes(x);

/** As tools que o formulário de cada tipo oferece: `delegate` só no agente. */
export const toolsFor = (kind: 'skill' | 'agent'): readonly NeutralToolInfo[] =>
  kind === 'agent' ? NEUTRAL_TOOLS : NEUTRAL_TOOLS.filter((x) => !x.agentOnly);

/** Ids válidos, sem repetir, na ordem da lista; `delegate` sai da skill. */
export function normalizeTools(kind: 'skill' | 'agent', raw: unknown): NeutralTool[] {
  const list = Array.isArray(raw) ? raw : [];
  return toolsFor(kind)
    .map((x) => x.id)
    .filter((id) => list.includes(id));
}

/**
 * Como cada id vira o nome da ferramenta, por ferramenta de IA. Conforme a tabela de `AGENT_TOOLS` (documentação
 * oficial do Claude Code lida em 2026-10-14): a edição é `Edit` (não existe mais `MultiEdit`) e a delegação é
 * `Agent` (o antigo `Task`). `null` = a ferramenta não tem lista de tools por skill ou agente: a exportação omite
 * o campo e avisa. `mcp` vira um glob por servidor MCP ativo.
 */
export const TOOL_EXPORT_MAP: Partial<Record<AiTool, Record<NeutralTool, readonly string[]> | null>> = {
  claude: {
    read: ['Read'],
    search: ['Glob', 'Grep'],
    write: ['Write'],
    edit: ['Edit', 'NotebookEdit'],
    shell: ['Bash'],
    network: ['WebFetch', 'WebSearch'],
    mcp: [],
    delegate: ['Agent'],
  },
  cursor: null,
  kimi: null,
};

/** A ferramenta aceita `allowed-tools`/`tools`? Sem entrada no mapa também não. */
export const supportsToolList = (tool: AiTool): boolean => !!TOOL_EXPORT_MAP[tool];

/** Os nomes da ferramenta para os ids; `null` quando a ferramenta não tem lista. */
export function nativeTools(tool: AiTool, ids: readonly NeutralTool[], mcpServers: readonly string[] = []): string[] | null {
  const map = TOOL_EXPORT_MAP[tool];
  if (!map) return null;
  return [...new Set(ids.flatMap((id) => (id === 'mcp' && tool === 'claude' ? mcpServers.map((s) => `mcp__${s}__*`) : (map[id] ?? []))))];
}

/** O texto do mapeamento sob cada caixa da tela, na ferramenta do projeto (ex.: "Glob, Grep"). */
export function mappingLabel(tool: AiTool, id: NeutralTool, mcpServers: readonly string[] = []): string | null {
  const names = nativeTools(tool, [id], mcpServers);
  if (!names) return null;
  if (id === 'mcp' && !names.length) return 'mcp__<servidor>__*';
  return names.join(', ');
}

/** O inverso, para ler o `allowed-tools`/`tools` de um arquivo importado: o que não casar com nenhum id fica de fora. */
export function neutralFromNative(names: readonly string[]): NeutralTool[] {
  const map = TOOL_EXPORT_MAP.claude!;
  const found = new Set<NeutralTool>();
  for (const n of names) {
    if (n.startsWith('mcp__')) found.add('mcp');
    for (const id of IDS as NeutralTool[]) if (map[id].includes(n) || (id === 'delegate' && n === 'Task')) found.add(id);
  }
  return NEUTRAL_TOOLS.map((x) => x.id).filter((id) => found.has(id));
}

/** As categorias antigas do agente (leitura, edição, comandos, rede, agentes) nos ids neutros. */
export function neutralFromCategories(categories: readonly ToolCategory[], mcpServers: readonly string[] = []): NeutralTool[] {
  const ids = new Set<NeutralTool>();
  for (const c of categories) {
    if (c === 'read') ids.add('read').add('search');
    if (c === 'edit') ids.add('write').add('edit');
    if (c === 'run') ids.add('shell');
    if (c === 'net') ids.add('network');
    if (c === 'agents') ids.add('delegate');
  }
  if (mcpServers.length) ids.add('mcp');
  return NEUTRAL_TOOLS.map((x) => x.id).filter((id) => ids.has(id));
}

/** Os ids nas categorias de `AGENT_TOOLS`, para traduzir nas ferramentas sem mapa próprio (Gemini). */
export function categoriesFromNeutral(ids: readonly NeutralTool[]): ToolCategory[] {
  const out = new Set<ToolCategory>();
  for (const id of ids) {
    if (id === 'read' || id === 'search') out.add('read');
    if (id === 'write' || id === 'edit') out.add('edit');
    if (id === 'shell') out.add('run');
    if (id === 'network') out.add('net');
    if (id === 'delegate') out.add('agents');
  }
  return (['read', 'edit', 'run', 'net', 'agents'] as const).filter((c) => out.has(c));
}

/** As tools que a skill pede e o agente não concede. Vazio = compatível. */
export const missingTools = (agentTools: readonly NeutralTool[], skillTools: readonly NeutralTool[]): NeutralTool[] =>
  skillTools.filter((x) => !agentTools.includes(x));

/**
 * As ferramentas efetivas do card: as do agente que alguma skill vinculada pede. Só informa (a execução recebe as
 * do agente): sem skill, valem todas as do agente.
 */
export function effectiveTools(agentTools: readonly NeutralTool[], skills: readonly (readonly NeutralTool[])[]): NeutralTool[] {
  if (!skills.length) return [...agentTools];
  const asked = new Set(skills.flat());
  return agentTools.filter((x) => asked.has(x));
}

const yamlText = (s: string) => (/^[\w./@-]*$/.test(s) && s !== '' ? s : JSON.stringify(s));
const yamlInline = (xs: readonly string[]) => `[${xs.map(yamlText).join(', ')}]`;

/** O frontmatter próprio do board, que a tela mostra ao vivo (não é o da ferramenta: esse sai na exportação). */
export function boardFrontmatter(a: {
  kind: 'skill' | 'agent';
  name: string;
  description: string;
  version: string;
  tools: readonly NeutralTool[];
  folder?: string;
  skills?: readonly string[];
  model?: string;
}): string {
  const lines = [
    '---',
    `name: ${yamlText(a.name)}`,
    `description: ${yamlText(a.description)}`,
    `version: ${yamlText(a.version)}`,
    `tools: ${yamlInline(a.tools)}`,
  ];
  if (a.kind === 'skill') lines.push(`folder: ${yamlText(a.folder ?? '')}`);
  if (a.kind === 'agent') {
    lines.push(`skills: ${yamlInline(a.skills ?? [])}`);
    lines.push(`model: ${yamlText(a.model || 'inherit')}`);
  }
  lines.push('---');
  return lines.join('\n');
}

/** Lê `allowed-tools` (separado por espaço ou vírgula, ou lista YAML em linha) do frontmatter de um SKILL.md. */
export function allowedToolsOf(skillMd: string): string[] {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd)?.[1] ?? '';
  const line = /^allowed-tools:\s*(.*)$/m.exec(fm)?.[1]?.trim() ?? '';
  return line
    .replace(/^\[|\]$/g, '')
    .split(/[\s,]+/)
    .map((x) => x.replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** Versão semver simples (`1.2.3`), a que o formulário de skill e agente exige. */
export const isSemver = (v: string): boolean => /^\d+\.\d+\.\d+$/.test(v.trim());

/** O caminho de uma pasta de skill: segmentos minúsculos com hífen, separados por `/`; '' = raiz. */
export const isFolderPath = (p: string): boolean => p === '' || /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(p);
