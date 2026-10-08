import type { RunReport } from '../../shared/log';

/** Formato que a CLI vai produzir; é ele que escolhe o leitor, dentro do provider da ferramenta. */
export type OutputFormat = 'text' | 'claude-stream-json' | 'cursor-stream-json';

/** De qual canal do processo a linha veio. O `stderr` é texto de gente e nunca é interpretado. */
export type OutputStream = 'stdout' | 'stderr';

/** O que o leitor precisa saber da execução. */
export interface ReaderDeps {
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
