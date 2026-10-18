// Artefatos do board (#615): regras, skills, agentes e servidores MCP guardados pelo próprio board, num
// formato neutro. Só tipos e funções puras: sem banco, sem `vscode`.
import { AGENT_TOOLS } from './agentTools';
import type { Agent, AiTool, HarnessItem } from './harness';
import type { ExecProfile } from './execution';
import type { HarnessSelection, HarnessUsage, SelectableKind } from './harnessSelection';

/** Tipos de artefato do board, no vocabulário do board (não no de uma ferramenta). */
export type ArtifactKind = 'rule' | 'skill' | 'agent' | 'mcp';
export const kindOfSelectable = (k: SelectableKind): ArtifactKind => (k === 'instructions' ? 'rule' : k);
export const selectableOfKind = (k: ArtifactKind): SelectableKind => (k === 'rule' ? 'instructions' : k);

/** Categorias de ferramenta do board (os grupos de AGENT_TOOLS): leitura, edição, comandos, rede, outros agentes. */
export type ToolCategory = 'read' | 'edit' | 'run' | 'net' | 'agents';
const TOOL_CATEGORIES: readonly string[] = ['read', 'edit', 'run', 'net', 'agents'];

export interface AgentMeta {
  skills: string[];
  mcpServers: string[];
  /** valor do campo Modelo (`<id>@<esforço>`); '' = o do card ou da sessão */
  model: string;
  tools: {
    categories: ToolCategory[];
    /** a lista como veio da origem: é ela que a execução usa nesta entrega */
    native: { tool: AiTool | ''; allow: string[]; deny: string[] };
  };
  seed?: boolean;
  /** só Cursor: preservados para a entrega 4 */
  readonly?: boolean;
  background?: boolean;
}

/** Um artefato como o estado do board o mostra: sem conteúdo de regra/skill e sem segredo de MCP. */
export interface BoardArtifact {
  id: string;
  kind: ArtifactKind;
  /** skill, agente, MCP: o nome; regra: o caminho de origem como o campo Rules o guarda (ex.: "CLAUDE.md") */
  name: string;
  description: string;
  usage: HarnessUsage;
  /** de onde foi copiado (a location do inventário, `arquivo#nome` no MCP); '' = criado no board */
  origin: string;
  originTool: AiTool | '';
  /** origem ausente ou ilegível na hora da cópia: está no board, mas não entra em execução */
  missing: boolean;
  /** arquivos que ficaram de fora pelos limites, com o motivo */
  skipped: { path: string; reason: 'size' | 'count' | 'total' | 'read' }[];
  /** caminhos relativos dos arquivos de apoio (skill) */
  files: string[];
  /** só no agente: as instruções (vão para a sessão e para os subagentes) */
  body: string;
  agent?: AgentMeta;
  /** só no MCP: o resumo (comando ou endereço); a definição fica no host */
  mcpSummary?: string;
  /** só na skill: gerada pela extensão (skill do fluxo), regravada a cada abertura */
  generated?: boolean;
  /** caminho da cópia de leitura (SKILL.md, arquivo da regra, arquivo do agente); '' no MCP. Preenchido pelo host */
  path: string;
  /** Tamanho do arquivo principal da cópia, para a estimativa de contexto. */
  size?: number;
  createdAt: number;
  updatedAt: number;
}

/** O que se grava: o artefato inteiro, com o conteúdo e os arquivos. */
export interface ArtifactDraft {
  kind: ArtifactKind;
  name: string;
  description: string;
  /** regra: o arquivo; skill: o SKILL.md inteiro; agente: as instruções; mcp: '' */
  body: string;
  meta: AgentMeta | { server: Record<string, unknown> } | { generated: true } | Record<string, never>;
  origin: string;
  originTool: AiTool | '';
  missing: boolean;
  skipped: BoardArtifact['skipped'];
  files: { path: string; content: string; encoding: 'utf8' | 'base64'; size: number }[];
}

export const ARTIFACT_LIMITS = { fileBytes: 512 * 1024, files: 100, totalBytes: 5 * 1024 * 1024 } as const;

/** A identidade do artefato na marcação e nos campos: a origem; o criado no board, `board:<nome>`. */
export const artifactLocation = (a: Pick<BoardArtifact, 'origin' | 'name'>): string => a.origin || `board:${a.name}`;

export const selectionOf = (a: Pick<BoardArtifact, 'kind' | 'origin' | 'name' | 'usage'>): HarnessSelection => ({
  kind: selectableOfKind(a.kind),
  location: artifactLocation(a),
  usage: a.usage,
});

const LAYOUT: Record<ArtifactKind, HarnessItem['layout']> = { rule: 'file', skill: 'skills', agent: 'file', mcp: 'entry' };

/** O artefato no formato de item do inventário, para os helpers de seleção e o contexto do pedido. */
export function itemOfArtifact(a: BoardArtifact): HarnessItem {
  return {
    boardArtifactId: a.id,
    ...(a.size === undefined ? {} : { size: a.size }),
    kind: selectableOfKind(a.kind),
    scope: 'project',
    name: a.name,
    description: a.kind === 'mcp' ? a.description.trim() || a.mcpSummary || '' : a.description,
    path: a.path,
    location: artifactLocation(a),
    layout: LAYOUT[a.kind],
    ...(a.kind === 'skill' ? { files: a.files } : {}),
  };
}

/** O agente no formato `Agent` (para o editor atual e para `profileOfArtifact`). */
export function agentOfArtifact(a: BoardArtifact, tool?: AiTool): Agent {
  const m = a.agent;
  const foreign = !!tool && m?.tools.native.tool !== tool;
  const translate = (categories: ToolCategory[]) =>
    tool ? AGENT_TOOLS[tool].filter((g) => categories.includes(g.id as ToolCategory)).flatMap((g) => g.tools.map((t) => t.name)) : [];
  return {
    name: a.name,
    description: a.description,
    model: '',
    modelValue: foreign && !m?.model.startsWith(`${tool}:`) ? '' : (m?.model ?? ''),
    scope: 'project',
    path: a.path,
    location: artifactLocation(a),
    content: a.body,
    body:
      m?.tools.native.tool === '' && m.tools.categories.length
        ? `${a.body}\n\nEscopo permitido deste agente: ${m.tools.categories.join(', ')}. Respeite apenas estas categorias (read: ler; edit: editar; run: executar comandos; net: rede; agents: delegar).`
        : a.body,
    tools: foreign ? translate(m?.readonly ? ['read'] : (m?.tools.categories ?? [])) : (m?.tools.native.allow ?? []),
    deniedTools: foreign
      ? translate(m?.readonly ? ['edit', 'run'] : toolCategories(m?.tools.native.tool ?? '', m?.tools.native.deny ?? []))
      : (m?.tools.native.deny ?? []),
    skills: m?.skills ?? [],
    mcp: m?.mcpServers ?? [],
    seed: m?.seed ?? false,
    readonly: m?.readonly ?? false,
    background: m?.background ?? false,
  };
}

/** O agente no formato de perfil de execução (escopo `board`, `path` = cópia de leitura). */
export function profileOfArtifact(a: BoardArtifact, isDefault: boolean): ExecProfile {
  const g = agentOfArtifact(a);
  return {
    id: g.name,
    name: g.name,
    purpose: g.description,
    instructions: g.body,
    skills: g.skills,
    mcpServers: g.mcp,
    tools: g.tools,
    deniedTools: g.deniedTools,
    model: g.modelValue,
    isDefault,
    scope: 'board',
    path: a.path,
  };
}

/** Grupos de AGENT_TOOLS[tool] que contêm alguma ferramenta da lista (na ordem dos grupos). */
export function toolCategories(tool: AiTool | '', tools: string[]): ToolCategory[] {
  if (!tool) return [];
  return AGENT_TOOLS[tool]
    .filter((g) => TOOL_CATEGORIES.includes(g.id) && g.tools.some((t) => tools.includes(t.name)))
    .map((g) => g.id as ToolCategory);
}

/** Caminho relativo seguro: sem `..`, sem absoluto, sem `\0`, sem `\`; usado na cópia, no import e na cópia de leitura. */
export function isSafeRelPath(p: string): boolean {
  if (!p || p.startsWith('/') || /^[A-Za-z]:/.test(p) || /[\\\0]/.test(p)) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** Formulário neutro: o host valida os campos antes de persistir. */
export interface LibraryArtifactInput {
  id?: string;
  kind: ArtifactKind;
  name: string;
  description: string;
  body: string;
  agent?: AgentMeta;
  server?: Record<string, unknown>;
}
export interface LibraryImportResult {
  imported: number;
  skipped: { key: string; kind: ArtifactKind; name: string }[];
}
export interface LibraryImportPreview {
  directory: string;
  items: { key: string; kind: ArtifactKind; name: string; description: string; origin?: string }[];
}

/** Atualiza a identificação da skill sem perder as demais opções YAML ou o corpo. */
export function skillDocument(content: string, name: string, description: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  const rest: string[] = [];
  let skip = false;
  for (const line of (match?.[1] ?? '').split(/\r?\n/)) {
    if (/^(name|description):/.test(line)) skip = true;
    else if (/^\S/.test(line)) skip = false;
    if (!skip && line) rest.push(line);
  }
  return `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}${rest.length ? '\n' + rest.join('\n') : ''}\n---\n${match ? content.slice(match[0].length) : '\n' + content}`;
}
