// A organização da tela do Harness: uma aba por ferramenta; nela, a origem dos artefatos (Board, Projeto, Global,
// Importados) escolhida antes; e, na origem, uma aba por assunto. Lógica pura, para a tela e os testes.
import { AI_BASES, type AiTool } from './harness';
import type { SelectableKind } from './harnessSelection';

/** Os assuntos de uma ferramenta, na ordem das abas. */
export type HarnessTopic = 'rules' | 'skill' | 'agent' | 'mcp' | 'command' | 'hook' | 'other';

export interface TopicInfo {
  id: HarnessTopic;
  /** o rótulo da aba, em português (traduzido onde é usado) */
  label: string;
  /** o tipo de artefato que o board marca neste assunto; sem ele, o assunto não tem a origem Board */
  kind?: SelectableKind;
}

export const HARNESS_TOPICS: TopicInfo[] = [
  { id: 'rules', label: 'Regras', kind: 'instructions' },
  { id: 'skill', label: 'Skills', kind: 'skill' },
  { id: 'agent', label: 'Sub-agentes', kind: 'agent' },
  { id: 'mcp', label: 'MCPs', kind: 'mcp' },
  { id: 'command', label: 'Comandos' },
  { id: 'hook', label: 'Hooks' },
  { id: 'other', label: 'Demais' },
];

/** Onde o artefato está: no banco do board ou numa das fontes de importação. */
export type HarnessOrigin = 'board' | 'project' | 'user' | 'imported';

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
  return AI_BASES.some((x) => x.id === value) ? (value as AiTool) : projectTool;
}

/**
 * O que a linha de comando da ferramenta deixa o board controlar: `cli` desliga os artefatos por conta
 * própria (o board garante o "tudo desligado"); `person` não desliga, e a pessoa precisa desligar nas
 * configurações da ferramenta ou remover do projeto o que não quer no contexto. Ler a documentação oficial
 * da CLI antes de classificar uma ferramenta nova.
 */
