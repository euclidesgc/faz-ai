// A organização da tela do Harness: uma aba por ferramenta; nela, a origem dos artefatos (Board, Projeto, Global,
// Importados) escolhida antes; e, na origem, uma aba por assunto. Lógica pura, para a tela e os testes.
import { AI_TOOLS, type AiTool, type HarnessItem } from './harness';
import { HARNESS_CATALOG, HARNESS_NOTES, groupOf, type HarnessGroup } from './harnessCatalog';
import { missingSelections, selectedItems, type SelectableKind } from './harnessSelection';
import type { BoardState } from './model';

/** Os assuntos de uma ferramenta, na ordem das abas. */
export type HarnessTopic = 'rules' | 'skill' | 'agent' | 'mcp' | 'command' | 'hook' | 'other';

/** O que a aba de um assunto resume no título: quantos artefatos estão no board e quantas regras esperam revisão. */
export function topicBadge(
  s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>,
  topic: TopicInfo,
): { board: number; pending: number } {
  if (!topic.kind) return { board: 0, pending: 0 };
  const board = selectedItems(s, topic.kind).length + missingSelections(s).filter((x) => x.kind === topic.kind).length;
  const pending = topic.kind === 'instructions' ? selectedItems(s, 'instructions', 'off').length : 0;
  return { board, pending };
}

export interface TopicInfo {
  id: HarnessTopic;
  /** o rótulo da aba, em português (traduzido onde é usado) */
  label: string;
  /** os grupos do catálogo que moram nesta aba, na ordem em que aparecem */
  groups: HarnessGroup[];
  /** o tipo de artefato que o board marca neste assunto; sem ele, o assunto não tem a origem Board */
  kind?: SelectableKind;
}

export const HARNESS_TOPICS: TopicInfo[] = [
  { id: 'rules', label: 'Regras', groups: ['main', 'topic'], kind: 'instructions' },
  { id: 'skill', label: 'Skills', groups: ['skill'], kind: 'skill' },
  { id: 'agent', label: 'Sub-agentes', groups: ['agent'], kind: 'agent' },
  { id: 'mcp', label: 'MCPs', groups: ['mcp'], kind: 'mcp' },
  { id: 'command', label: 'Comandos', groups: ['command'] },
  { id: 'hook', label: 'Hooks', groups: ['hook'] },
  { id: 'other', label: 'Demais', groups: ['memory', 'settings', 'style', 'plugin', 'managed'] },
];

/** Onde o artefato está: no banco do board ou numa das três fontes do catálogo. */
export type HarnessOrigin = 'board' | 'project' | 'user' | 'imported';

/**
 * As origens que a aba de uma ferramenta oferece, na ordem do seletor: Board só na ferramenta do projeto (a marcação
 * vale só para ela); Importados só com pasta importada.
 */
export function originsOf(projectTool: boolean, hasImports: boolean): HarnessOrigin[] {
  return [...(projectTool ? (['board'] as const) : []), 'project', 'user', ...(hasImports ? (['imported'] as const) : [])];
}

/** Quantos artefatos do assunto existem nesta fonte do catálogo: o número que a aba do assunto mostra fora do Board. */
export function topicCount(tool: AiTool, items: HarnessItem[], topic: TopicInfo, origin: Exclude<HarnessOrigin, 'board'>): number {
  const groups = groupsFor(topic, origin);
  return items.filter((i) => catalogOriginOf(tool, i) === origin && groups.includes(groupOf(tool, i))).length;
}

/** Os assuntos que fazem sentido para a ferramenta: têm fonte no catálogo, item no inventário ou nota. */
export function topicsOf(tool: AiTool, items: HarnessItem[]): TopicInfo[] {
  const inCatalog = new Set<HarnessGroup>(
    HARNESS_CATALOG[tool].map((src, source) => groupOf(tool, { scope: src.scope, kind: src.kind, source })),
  );
  for (const i of items) inCatalog.add(groupOf(tool, i));
  for (const n of HARNESS_NOTES[tool]) inCatalog.add(n.group);
  // os plugins são sempre oferecidos: a ferramenta os instala por comando, mesmo sem nenhum à vista
  inCatalog.add('plugin');
  return HARNESS_TOPICS.filter((topic) => topic.groups.some((g) => inCatalog.has(g)));
}

/**
 * Em qual fonte do catálogo o item aparece. A memória automática do Claude Code fica na pasta do usuário,
 * mas é deste projeto: vai em Projeto. Plugins e a política da organização ficam em Global.
 */
export function catalogOriginOf(tool: AiTool, item: Pick<HarnessItem, 'scope' | 'kind' | 'source'>): Exclude<HarnessOrigin, 'board'> {
  if (item.scope === 'imported') return 'imported';
  if (groupOf(tool, item) === 'memory') return 'project';
  return item.scope === 'project' ? 'project' : 'user';
}

/** Os grupos que cada fonte mostra: plugins e organização só existem no global; a memória, só no projeto. */
export function groupsFor(topic: TopicInfo, origin: Exclude<HarnessOrigin, 'board'>): HarnessGroup[] {
  const skip: HarnessGroup[] =
    origin === 'project' ? ['plugin', 'managed'] : origin === 'user' ? ['memory'] : ['plugin', 'managed', 'memory'];
  return topic.groups.filter((g) => !skip.includes(g));
}

const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** A busca da tela: parte do nome ou da descrição, sem diferenciar maiúsculas nem acentos. Busca vazia casa tudo. */
export function matchesQuery(query: string, ...texts: (string | undefined)[]): boolean {
  const q = plain(query.trim());
  return q === '' || texts.some((x) => !!x && plain(x).includes(q));
}

/** Abas de primeiro nível: a ferramenta e execução, ou uma ferramenta de IA. */
export type HarnessTab = 'tool' | 'library' | AiTool;

/**
 * A aba que o valor guardado ou pedido representa. Valores antigos (`project`, `user`) e desconhecidos caem
 * na ferramenta do projeto, que é onde o que eles mostravam mora agora.
 */
export function resolveHarnessTab(value: string | null | undefined, projectTool: AiTool): HarnessTab {
  if (value === 'tool' || value === 'library') return value;
  return AI_TOOLS.some((x) => x.id === value) ? (value as AiTool) : projectTool;
}

/** As ferramentas na ordem das abas: a do projeto primeiro. */
export const toolsInOrder = (projectTool: AiTool): AiTool[] => [
  projectTool,
  ...AI_TOOLS.map((x) => x.id).filter((id) => id !== projectTool),
];

/**
 * O que a linha de comando da ferramenta deixa o board controlar: `cli` desliga os artefatos por conta
 * própria (o board garante o "tudo desligado"); `person` não desliga, e a pessoa precisa desligar nas
 * configurações da ferramenta ou remover do projeto o que não quer no contexto. Ler a documentação oficial
 * da CLI antes de classificar uma ferramenta nova.
 */
// o Kimi Code não tem flag para desligar artefatos: como no Cursor, a pessoa desliga nas configurações dele
export const TOOL_REGIME: Record<AiTool, 'cli' | 'person'> = { claude: 'cli', cursor: 'person', kimi: 'person' };
