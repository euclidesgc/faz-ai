// Marcação do harness: o que as execuções do board podem usar, por projeto. Tudo o mais é invisível para elas.
import type { HarnessItem, HarnessKind } from './harness';
import type { BoardState } from './model';

/**
 * Como um item marcado entra nas execuções do board: `always` vai em todo pedido (fase, refinar, chat);
 * `contextual` só quando o card o indica (campos Skills e Rules, e o agente) ou quando o "Refinar com IA"
 * decide que ele cabe no card. Um agente marcado é "disponível": o card, a fase ou o padrão o escolhem.
 */
export type HarnessUsage = 'always' | 'contextual';

/** Tipos de item que o board marca: rules (arquivos de instruções), skills e agentes. */
export type SelectableKind = 'instructions' | 'skill' | 'agent';

export const SELECTABLE_KINDS: SelectableKind[] = ['instructions', 'skill', 'agent'];

export const isSelectableKind = (kind: HarnessKind): kind is SelectableKind => (SELECTABLE_KINDS as HarnessKind[]).includes(kind);

export interface HarnessSelection {
  kind: SelectableKind;
  /** como o inventário o mostra: relativo ao projeto, ou a partir de `~` (é a identidade do item entre varreduras) */
  location: string;
  usage: HarnessUsage;
}

export const HARNESS_USAGES: { id: HarnessUsage; label: string; hint: string }[] = [
  {
    id: 'always',
    label: 'Incluir em todo contexto',
    hint: 'Entra em toda execução do board (trabalhar a fase, refinar, chat), pelo caminho do arquivo.',
  },
  {
    id: 'contextual',
    label: 'Usar quando fizer sentido',
    hint: 'Fica disponível para o card: a pessoa marca no card, ou o "Refinar com IA" marca quando o pedido pede.',
  },
];

/** Itens do inventário da ferramenta em uso. */
export const toolItemsOf = (s: Pick<BoardState, 'board' | 'harness'>): HarnessItem[] =>
  s.harness.inventory.find((t) => t.tool === s.board.aiTool)?.items ?? [];

/** A marcação de um item do inventário, ou null quando ele não está marcado. */
export const usageOf = (selection: readonly HarnessSelection[], item: Pick<HarnessItem, 'kind' | 'location'>): HarnessUsage | null =>
  selection.find((x) => x.kind === item.kind && x.location === item.location)?.usage ?? null;

/**
 * Itens marcados da ferramenta em uso, com o arquivo presente no disco (uma marcação cujo arquivo sumiu
 * não vale nada). Com `usage`, só os marcados daquele jeito. Na ordem do inventário: projeto, global, plugins.
 */
export function selectedItems(
  s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>,
  kind: SelectableKind,
  usage?: HarnessUsage,
): HarnessItem[] {
  const seen = new Set<string>();
  return toolItemsOf(s).filter((i) => {
    if (i.kind !== kind || seen.has(i.location)) return false;
    const u = usageOf(s.harnessSelection, i);
    if (!u || (usage && u !== usage)) return false;
    seen.add(i.location);
    return true;
  });
}

/** Marcações sem arquivo no disco, para a tela mostrar como "não encontrada" e deixar desmarcar. */
export function missingSelections(s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>): HarnessSelection[] {
  const items = toolItemsOf(s);
  return s.harnessSelection.filter((x) => !items.some((i) => i.kind === x.kind && i.location === x.location));
}

/** Nomes das skills marcadas de um jeito (sem repetir): são as opções do campo Skills e o que o Refinar pode indicar. */
export const selectedSkillNames = (s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>, usage?: HarnessUsage): string[] => [
  ...new Set(selectedItems(s, 'skill', usage).map((i) => i.name)),
];

/** Locations das rules marcadas de um jeito: são as opções do campo Rules. */
export const selectedRuleLocations = (s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>, usage?: HarnessUsage): string[] =>
  selectedItems(s, 'instructions', usage).map((i) => i.location);
