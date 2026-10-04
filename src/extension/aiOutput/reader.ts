import type { RunReport } from '../../shared/log';
import type { ModelOption } from '../../shared/models';
import { textReader } from './text';

/** Formato que a CLI vai produzir; é ele que escolhe o leitor. */
export type OutputFormat = 'text' | 'claude-stream-json' | 'codex-json' | 'stream-json';

/** De qual canal do processo a linha veio. O `stderr` é texto de gente e nunca é interpretado. */
export type OutputStream = 'stdout' | 'stderr';

/** O que o leitor precisa para resolver o custo quando a ferramenta não informa. */
export interface ReaderDeps {
  /** catálogo de modelos da ferramenta em uso (já filtrado por quem chama) */
  catalog: ModelOption[];
  /** o modelo que o board pediu nesta execução, quando pediu; é o nome a usar quando o fluxo não diz qual foi */
  model: string | null;
}

export interface OutputReader {
  /** As linhas legíveis desta linha de saída. Lista vazia = evento que não vira linha nenhuma. */
  push(line: string, stream: OutputStream): string[];
  /** O acumulado da execução, lido uma vez no fim. */
  report(): RunReport;
  /** Se o leitor já entendeu pelo menos um evento válido deste formato. */
  readonly sawEvent: boolean;
}

/**
 * O leitor do formato. Nesta entrega todo formato cai no leitor de texto: os leitores de
 * `claude-stream-json` entram no passo 4 desta história e os de `codex-json`/`stream-json` no
 * passo 5. `deps` ainda não é usado aqui — passa a ser quando esses leitores existirem, para
 * resolver o custo quando a ferramenta não informa o modelo.
 */
export function readerFor(_format: OutputFormat, _deps: ReaderDeps): OutputReader {
  return textReader();
}
