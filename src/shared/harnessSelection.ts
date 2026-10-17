import { itemOfArtifact, selectableOfKind, artifactLocation } from './artifacts';
// Os artefatos selecionados são cópias do board; as fontes continuam no catálogo das ferramentas.
import type { HarnessItem, HarnessKind } from './harness';
import type { BoardState } from './model';

/**
 * Como um artefato do board entra nas execuções: `always` ("Sempre") vai em todo pedido (fase, refinar,
 * chat); `contextual` ("Pelo card") só quando o card o indica (campos Skills, Rules e MCPs, e o agente)
 * ou quando o planejamento e o "Refinar com IA" decidem que ele cabe no card; `off` ("Desligado") está
 * no board, mas não entra em nada: é como as regras chegam, para a pessoa revisar antes de ativar. Um
 * agente marcado é "disponível": o card, a fase ou o padrão o escolhem.
 */
export type HarnessUsage = 'always' | 'contextual' | 'off';

/** Tipos de artefato que o board marca: rules (arquivos de instruções), skills, agentes e servidores MCP. */
export type SelectableKind = 'instructions' | 'skill' | 'agent' | 'mcp';

export const SELECTABLE_KINDS: SelectableKind[] = ['instructions', 'skill', 'agent', 'mcp'];

export const isSelectableKind = (kind: HarnessKind): kind is SelectableKind => (SELECTABLE_KINDS as HarnessKind[]).includes(kind);

export interface HarnessSelection {
  kind: SelectableKind;
  /**
   * a identidade do artefato entre varreduras: o caminho como o inventário o mostra (relativo ao projeto,
   * a partir de `~`, ou absoluto numa pasta importada); numa entrada de arquivo de configuração (um
   * servidor MCP), o caminho mais `#nome` (ver `selectionKey`)
   */
  location: string;
  usage: HarnessUsage;
}

export const HARNESS_USAGES: { id: HarnessUsage; label: string; hint: string }[] = [
  {
    id: 'always',
    label: 'Sempre',
    hint: 'Entra em toda execução do board (trabalhar a fase, refinar, chat), independente do card.',
  },
  {
    id: 'contextual',
    label: 'Pelo card',
    hint: 'Não entra sozinho: só quando o card o lista, pela escolha do planejamento, do "Refinar com IA" ou sua.',
  },
  {
    id: 'off',
    label: 'Desligado',
    hint: 'Está no board, mas não entra em nenhuma execução até você ativar.',
  },
];

/**
 * Os modos que a tela oferece para cada tipo. "Sempre" só em skills e servidores MCP (o servidor do
 * board precisa estar sempre ligado) e em regras (regra ativa vale como "Sempre"); um agente marcado é
 * só "disponível". "Desligado" é o estado em que as regras entram, para serem revisadas antes.
 */
export function usageOptions(kind: SelectableKind): HarnessUsage[] {
  switch (kind) {
    case 'instructions':
      return ['off', 'contextual', 'always'];
    case 'agent':
      return ['contextual'];
    default:
      return ['contextual', 'always'];
  }
}

/**
 * Como um artefato entra no board ao ser enviado: tudo "Pelo card" (não entra no contexto sozinho), menos
 * as regras, que entram desligadas: escritas para outro contexto, elas podem conflitar com o fluxo e as
 * definições do board, e a pessoa revisa antes de ativar.
 */
export const defaultUsage = (kind: SelectableKind): HarnessUsage => (kind === 'instructions' ? 'off' : 'contextual');

/** A identidade de um item do inventário na marcação: o caminho, e numa entrada de configuração o caminho mais o nome. */
export const selectionKey = (
  item: Pick<HarnessItem, 'location'> & { name?: string; layout?: HarnessItem['layout']; boardArtifactId?: string },
): string => (!item.boardArtifactId && item.layout === 'entry' ? `${item.location}#${item.name ?? ''}` : item.location);

/** Cópias do board primeiro; referências antigas ainda não migradas usam o catálogo da ferramenta. */
export function toolItemsOf(s: Pick<BoardState, 'board' | 'harness'>): HarnessItem[] {
  const sources = s.harness.inventory.find((t) => t.tool === s.board.aiTool)?.items ?? [];
  const artifacts = s.harness.library?.artifacts;
  if (!artifacts) return sources;
  const copied = new Set(artifacts.map((a) => `${selectableOfKind(a.kind)}:${artifactLocation(a)}`));
  return [
    ...artifacts.filter((a) => !a.missing).map(itemOfArtifact),
    ...sources.filter((i) => !copied.has(`${i.kind}:${selectionKey(i)}`)),
  ];
}

/** A marcação de um item do inventário, ou null quando ele não está no board. */
export const usageOf = (
  selection: readonly HarnessSelection[],
  item: Pick<HarnessItem, 'kind' | 'location'> & { name?: string; layout?: HarnessItem['layout']; boardArtifactId?: string },
): HarnessUsage | null => selection.find((x) => x.kind === item.kind && x.location === selectionKey(item))?.usage ?? null;

/**
 * Itens do board da ferramenta em uso, com o arquivo presente no disco (uma marcação cujo arquivo sumiu
 * está ausente e não vale nada). Com `usage`, só os marcados daquele jeito; sem ele, tudo o que está no
 * board, inclusive o desligado. Na ordem do inventário: projeto, global, importados, plugins.
 */
export function selectedItems(
  s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>,
  kind: SelectableKind,
  usage?: HarnessUsage,
): HarnessItem[] {
  const seen = new Set<string>();
  return toolItemsOf(s).filter((i) => {
    const key = selectionKey(i);
    if (i.kind !== kind || seen.has(key)) return false;
    const u = usageOf(s.harnessSelection, i);
    if (!u || (usage && u !== usage)) return false;
    seen.add(key);
    return true;
  });
}

/** Marcações sem arquivo no disco: artefatos ausentes, que a tela mostra como tal e deixa tirar do board. */
export function missingSelections(s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>): HarnessSelection[] {
  const keys = new Set(toolItemsOf(s).map((i) => `${i.kind}|${selectionKey(i)}`));
  return s.harnessSelection.filter((x) => !keys.has(`${x.kind}|${x.location}`));
}

/** Nomes das skills marcadas de um jeito (sem repetir): são as opções do campo Skills e o que o planejamento pode indicar. */
export const selectedSkillNames = (s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>, usage?: HarnessUsage): string[] => [
  ...new Set(selectedItems(s, 'skill', usage).map((i) => i.name)),
];

/** Locations das rules marcadas de um jeito: são as opções do campo Rules. */
export const selectedRuleLocations = (s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>, usage?: HarnessUsage): string[] =>
  selectedItems(s, 'instructions', usage).map((i) => i.location);

/** Nomes dos servidores MCP marcados de um jeito (sem repetir, e sem o do board, que vai sempre): as opções do campo MCPs. */
export const selectedMcpNames = (s: Pick<BoardState, 'board' | 'harness' | 'harnessSelection'>, usage?: HarnessUsage): string[] => [
  ...new Set(
    selectedItems(s, 'mcp', usage)
      .map((i) => i.name)
      .filter((n) => n !== BOARD_MCP_NAME),
  ),
];

/** O nome do servidor MCP do board nas ferramentas: vai em toda execução sem precisar de marcação. */
export const BOARD_MCP_NAME = 'faz-ai';
