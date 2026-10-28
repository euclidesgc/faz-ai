// A lista da biblioteca de artefatos (Configurações › Harness): contagens, filtros, árvore de pastas de skill e a
// compatibilidade entre as tools de uma skill e as do agente do card. Só funções puras.
import type { ArtifactKind, BoardArtifact } from './artifacts';
import { missingTools, type NeutralTool } from './artifactTools';
import { matchesQuery } from './harnessTopics';
import { profileOf } from './execution';
import type { BoardState, Card } from './model';
import { SKILLS_FIELD } from './boardFields';
import { valueOf } from './selectors';

export type StatusFilter = 'all' | 'active' | 'inactive';

/** Quantos artefatos do tipo estão ativos, e quantos há no total (o "X/Y" da aba). */
export function activeCounts(
  artifacts: readonly Pick<BoardArtifact, 'kind' | 'usage'>[],
  kind: ArtifactKind,
): { active: number; total: number } {
  const own = artifacts.filter((a) => a.kind === kind);
  return { active: own.filter((a) => a.usage !== 'off').length, total: own.length };
}

/** A pasta está na selecionada ou numa subpasta dela; sem seleção (`null`) vale tudo. */
export const inFolder = (folder: string | undefined, selected: string | null): boolean =>
  selected === null || (folder ?? '') === selected || (folder ?? '').startsWith(`${selected}/`);

/** O filtro de uma aba: busca (nome, descrição e, na skill, a pasta), ativas/inativas e, na skill, a pasta selecionada. */
export function filterArtifacts<T extends Pick<BoardArtifact, 'kind' | 'name' | 'description' | 'usage' | 'folder'>>(
  items: readonly T[],
  opts: { query: string; status: StatusFilter; folder?: string | null },
): T[] {
  return items.filter(
    (a) =>
      (opts.status === 'all' || (opts.status === 'active') === (a.usage !== 'off')) &&
      (a.kind !== 'skill' || inFolder(a.folder, opts.folder ?? null)) &&
      matchesQuery(opts.query, a.name, a.description, a.kind === 'skill' ? a.folder : undefined),
  );
}

const live = (c: Card): boolean => c.deletedAt === null && c.archivedAt === null;

/** Os cards (fora do arquivo e da lixeira) que usam o artefato: a skill no campo Skills, o agente no campo do card. */
export function linkedCards(state: BoardState, a: Pick<BoardArtifact, 'kind' | 'name'>): Card[] {
  if (a.kind === 'agent') return state.cards.filter((c) => live(c) && c.execProfile === a.name);
  if (a.kind !== 'skill') return [];
  const field = state.fieldDefs.find((f) => f.kind === 'multiselect' && f.name.trim().toLowerCase() === SKILLS_FIELD.toLowerCase());
  if (!field) return [];
  return state.cards.filter((c) => {
    const v = live(c) ? valueOf(state, c.id, field.id) : null;
    return Array.isArray(v) && v.includes(a.name);
  });
}

export interface FolderNode {
  path: string;
  /** o último segmento */
  name: string;
  /** skills da pasta e das subpastas */
  count: number;
  children: FolderNode[];
}

/** A árvore de pastas: as informadas, os níveis de cima delas e as que alguma skill usa; a contagem inclui as subpastas. */
export function folderTree(folders: readonly string[], skills: readonly Pick<BoardArtifact, 'folder'>[]): FolderNode[] {
  const paths = new Set<string>();
  for (const f of [...folders, ...skills.map((s) => s.folder ?? '')]) {
    const parts = f.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('/'));
  }
  const build = (parent: string): FolderNode[] =>
    [...paths]
      .filter((p) => (parent === '' ? !p.includes('/') : p.startsWith(`${parent}/`) && !p.slice(parent.length + 1).includes('/')))
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({
        path,
        name: path.slice(path.lastIndexOf('/') + 1),
        count: skills.filter((s) => inFolder(s.folder, path)).length,
        children: build(path),
      }));
  return build('');
}

export interface ToolGap {
  skill: string;
  agent: string;
  missing: NeutralTool[];
}

/**
 * As skills do card que pedem tools que o agente dele não concede. O agente é o que vale para o card (o do card, o da
 * coluna ou o padrão do board). Sem agente do board, ou sem tools gravadas nele (estado antigo), não há o que comparar.
 */
export function toolGaps(state: BoardState, card: Card): ToolGap[] {
  const profile = profileOf(state, card);
  const artifacts = state.harness.library?.artifacts ?? [];
  const agent = profile && profile.scope === 'board' ? artifacts.find((a) => a.kind === 'agent' && a.name === profile.name) : undefined;
  if (!agent?.tools) return [];
  const gaps: ToolGap[] = [];
  for (const skill of artifacts) {
    if (skill.kind !== 'skill' || !skill.tools?.length || !linkedCards(state, skill).some((c) => c.id === card.id)) continue;
    const missing = missingTools(agent.tools, skill.tools);
    if (missing.length) gaps.push({ skill: skill.name, agent: agent.name, missing });
  }
  return gaps;
}
