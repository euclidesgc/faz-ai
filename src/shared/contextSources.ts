import { executionCardSelectionsOf, type ExecManifest, type ExecProfile } from './execution';
import type { HarnessItem } from './harness';
import { selectedItems, toolItemsOf } from './harnessSelection';
import type { BoardState, Card } from './model';

export type ContextOrigin = 'board' | 'always' | 'agent' | 'card' | 'phase' | 'story' | 'story-phase' | 'default' | 'delegate';

export interface ContextFile {
  id: string;
  name: string;
  item?: HarnessItem;
  origins: ContextOrigin[];
}

/** A cópia do board mantém a identidade mesmo se mudar de pasta; no legado vale o caminho. */
export const contextFileId = (kind: 'rule' | 'skill', item: HarnessItem | undefined, name: string): string =>
  `${kind}:${item?.boardArtifactId ?? (item?.path || item?.location || name)}`;

/** Mesma preferência do contexto legado: skill do projeto antes da global ou de plugin. */
export function contextSkillOf(s: BoardState, name: string): HarnessItem | undefined {
  const items = toolItemsOf(s).filter((i) => i.kind === 'skill' && i.name === name);
  return items.find((i) => i.scope === 'project') ?? items[0];
}

/** Arquivos efetivos, sem ler o disco, com todas as origens e uma linha por identidade. */
export function contextFilesOf(
  s: BoardState,
  m: ExecManifest,
  profile?: ExecProfile,
  card?: Card,
): { rules: ContextFile[]; skills: ContextFile[] } {
  const items = toolItemsOf(s);
  const collect = (kind: 'rule' | 'skill', names: string[]): ContextFile[] => {
    const rows = new Map<string, ContextFile>();
    const add = (name: string, item: HarnessItem | undefined, origins: ContextOrigin[]) => {
      const id = contextFileId(kind, item, name);
      const row = rows.get(id) ?? { id, name, item, origins: [] };
      row.origins = [...new Set([...row.origins, ...origins])];
      rows.set(id, row);
    };
    const harnessKind = kind === 'rule' ? 'instructions' : 'skill';
    for (const item of selectedItems(s, harnessKind, 'always')) add(kind === 'rule' ? item.location : item.name, item, ['always']);
    const selected = executionCardSelectionsOf(s, card ?? null);
    const explicit = kind === 'rule' ? selected.rules : selected.skills;
    for (const name of names) {
      const item = kind === 'rule' ? items.find((i) => i.kind === harnessKind && i.location === name) : contextSkillOf(s, name);
      const origins: ContextOrigin[] = [];
      if (kind === 'skill' && profile?.skills.includes(name)) origins.push('agent');
      if (explicit.includes(name)) origins.push('card');
      add(name, item, origins);
    }
    return [...rows.values()];
  };
  return { rules: collect('rule', m.rules), skills: collect('skill', m.skills) };
}

/** A precedência legada, incluindo a herança da história nas tarefas. */
export function contextAgentOrigin(s: BoardState, c: Card, profile: ExecProfile | undefined): ContextOrigin[] {
  if (!profile) return [];
  if (c.execProfile === profile.id) return ['card'];
  if (s.columns.find((col) => col.id === c.columnId)?.execProfile === profile.id) return ['phase'];
  const story = c.parentId ? s.cards.find((p) => p.id === c.parentId) : undefined;
  if (story?.execProfile === profile.id) return ['story'];
  if (story && s.columns.find((col) => col.id === story.columnId)?.execProfile === profile.id) return ['story-phase'];
  return ['default'];
}
