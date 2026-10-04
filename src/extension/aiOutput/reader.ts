import type { RunReport } from '../../shared/log';
import type { ModelOption } from '../../shared/models';
import { claudeReader } from './claude';
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
 * O leitor do formato. Um leitor por formato, e não um genérico: Claude, Codex e os `stream-json`
 * de Cursor/Kimi não têm nem o mesmo nome de evento nem a mesma noção de turno, e um leitor "que
 * entende todos" é um leitor que erra em silêncio quando uma delas muda — que é o risco principal
 * desta entrega. Os leitores de `codex-json` e `stream-json` entram no passo 5 desta história.
 */
export function readerFor(format: OutputFormat, deps: ReaderDeps): OutputReader {
  switch (format) {
    case 'claude-stream-json':
      return claudeReader(deps);
    default:
      return textReader();
  }
}
