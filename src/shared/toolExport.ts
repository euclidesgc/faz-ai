// "Exportar para a ferramenta" (#623): tipos da prévia e do resultado e as regras puras de seleção.
// Sem `fs` e sem `vscode`: a tela e o host usam os mesmos tipos.
import type { AiTool } from './harness';
import type { HarnessUsage } from './harnessSelection';

export type ExportTarget = 'project' | 'user';
export type ExportKind = 'rule' | 'skill' | 'agent';

/** o que o formato não expressa (perde), expressa de outro jeito (mapeado) ou só nomeia (configurar) */
export type LossCode =
  | 'tools'
  | 'allowed-tools'
  | 'board-tools'
  | 'mcpServers'
  | 'skills'
  | 'model'
  | 'effort'
  | 'readonly'
  | 'background'
  | 'default'
  | 'usage'
  | 'rule-load'
  | 'rules-merged'
  | 'rule-header'
  | 'skipped-files';
export interface FormatLoss {
  code: LossCode;
  effect: 'lost' | 'mapped' | 'configure';
  value?: string;
}

/** por que um arquivo ou artefato não será gravado */
export type RefuseReason =
  | 'missing' // origem ausente na cópia para o board
  | 'unsupported' // o formato não tem esse artefato nesse destino (Cursor: regra do usuário)
  | 'unsafe-name' // nome que não serve de nome de arquivo ou de pasta
  | 'unsafe-path' // arquivo de apoio com caminho que sai da pasta da skill
  | 'outside-root' // o caminho real sai da pasta da ferramenta (link no meio do caminho)
  | 'symlink' // o destino é um link simbólico
  | 'not-file' // o destino é uma pasta
  | 'duplicate'; // outro artefato do lote grava o mesmo arquivo

export interface ExportFile {
  /** absoluto */
  path: string;
  exists: boolean;
  refused?: RefuseReason;
  shared?: boolean;
}

export interface ExportItem {
  id: string;
  kind: ExportKind;
  name: string;
  description: string;
  usage: HarnessUsage;
  /** a skill do fluxo: vem desmarcada, com aviso */
  flowSkill: boolean;
  /** o artefato não pode ser marcado (origem ausente, sem formato nesse destino) */
  blocked?: RefuseReason;
  files: ExportFile[];
  losses: FormatLoss[];
  /** arquivos na pasta da skill no destino que o board não tem: ficam */
  extras: string[];
}

export interface ExportPlan {
  tool: AiTool;
  target: ExportTarget;
  /** a pasta da ferramenta em cada destino; projeto = null sem pasta de projeto */
  roots: { project: string | null; user: string };
  items: ExportItem[];
  /** servidores MCP do board, que não são exportados */
  mcpCount: number;
}

export type ExportOutcome = 'written' | 'replaced' | 'skipped' | 'refused' | 'failed';
export interface ExportResult {
  tool: AiTool;
  target: ExportTarget;
  files: { item: string; path: string; outcome: ExportOutcome; reason?: RefuseReason; error?: string }[];
}

/** "Sempre" e "Pelo card" marcados; a skill do fluxo, os desligados e os bloqueados, não: a cópia é opcional e só do que a pessoa quer levar. */
export function defaultSelection(items: readonly ExportItem[]): Set<string> {
  return new Set(items.filter((i) => i.usage !== 'off' && !i.blocked && !i.flowSkill).map((i) => i.id));
}

/**
 * O que acontece com o item. A decisão é por item, nunca por arquivo: uma skill pulada pela metade
 * misturaria arquivos novos na pasta da pessoa.
 */
export function itemOutcome(item: ExportItem, replace: boolean): 'write' | 'replace' | 'skip' | 'refused' {
  if (item.blocked || item.files.some((f) => f.refused)) return 'refused';
  if (item.files.some((f) => f.exists)) return replace ? 'replace' : 'skip';
  return 'write';
}
