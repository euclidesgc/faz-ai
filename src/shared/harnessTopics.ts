// A organização da tela do Harness: duas abas (os artefatos do board, e o contexto e modelo) e, nos artefatos,
// uma aba por assunto. Lógica pura, para a tela e os testes.
import type { ArtifactKind, BoardArtifact } from './artifacts';
import type { HarnessUsage } from './harnessSelection';

/** Abas de primeiro nível do Harness: os artefatos do board, ou o plano de contexto e a sugestão de modelo. */
export type HarnessTab = 'artifacts' | 'context';

/** O assunto de uma aba de artefatos. */
export type HarnessTopic = 'rules' | 'skill' | 'agent' | 'mcp';

export interface TopicInfo {
  id: HarnessTopic;
  /** o rótulo da aba, em português (traduzido onde é usado) */
  label: string;
  /** o tipo de artefato do board que o assunto lista */
  kind: ArtifactKind;
}

/** Os assuntos, na ordem das abas. */
export const HARNESS_TOPICS: TopicInfo[] = [
  { id: 'rules', label: 'Regras', kind: 'rule' },
  { id: 'skill', label: 'Skills', kind: 'skill' },
  { id: 'agent', label: 'Agentes', kind: 'agent' },
  { id: 'mcp', label: 'Servidores MCP', kind: 'mcp' },
];

/** Counts board artifacts of one kind in each usage mode. */
export function usageCounts(artifacts: readonly BoardArtifact[], kind: ArtifactKind): Record<HarnessUsage, number> {
  const counts: Record<HarnessUsage, number> = { always: 0, contextual: 0, off: 0 };
  for (const artifact of artifacts) if (artifact.kind === kind) counts[artifact.usage]++;
  return counts;
}

const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** A busca da tela: parte do nome ou da descrição, sem diferenciar maiúsculas nem acentos. Busca vazia casa tudo. */
export function matchesQuery(query: string, ...texts: (string | undefined)[]): boolean {
  const q = plain(query.trim());
  return q === '' || texts.some((x) => !!x && plain(x).includes(q));
}

/**
 * A aba que o valor guardado representa: qualquer valor antigo (uma ferramenta, `library`, `project` e o `tool` de
 * "Ferramenta e execução", que virou a seção Automação) cai nos artefatos, a aba principal.
 */
export const resolveHarnessTab = (value: string | null | undefined): HarnessTab => (value === 'context' ? 'context' : 'artifacts');
