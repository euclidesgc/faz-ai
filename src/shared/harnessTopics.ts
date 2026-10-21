// A organização da tela do Harness: duas abas (a ferramenta e execução, e os artefatos do board) e, nos artefatos,
// uma aba por assunto. Lógica pura, para a tela e os testes.
import type { ArtifactKind, BoardArtifact } from './artifacts';
import type { HarnessUsage } from './harnessSelection';

/** Abas de primeiro nível do Harness: a ferramenta e a execução, ou os artefatos do board. */
export type HarnessTab = 'tool' | 'artifacts';

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

/** A aba que o valor guardado representa: qualquer valor antigo (uma ferramenta, `library`, `project`) cai em `tool`. */
export const resolveHarnessTab = (value: string | null | undefined): HarnessTab => (value === 'artifacts' ? 'artifacts' : 'tool');
