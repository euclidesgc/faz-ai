import type { RunReport } from '../../shared/log';
import type { AcpChildConfiguration, AcpSubagentEvent } from '../ai/provider';

/**
 * O que o leitor avisa durante a execução, além das linhas do canal: a sessão nativa aberta, o estado dos
 * servidores MCP na largada, cada filha nativa e a configuração efetiva dela. Só o leitor da CLI que sustenta a
 * sessão da História emite isto; o transporte os entrega ao runner na ordem em que a saída os traz.
 */
export type ReaderEvent =
  | {
      kind: 'mcp-servers';
      sessionId: string;
      /** `connected` é a CLI confirmando; `configured-by-board` é só o arquivo que o board gravou (sem confirmação da CLI) */
      servers: { name: string; status: string }[];
    }
  | { kind: 'session-opened'; sessionId: string }
  | { kind: 'subagent'; event: AcpSubagentEvent }
  | { kind: 'child-configuration'; configuration: AcpChildConfiguration };

/** Formato que a CLI vai produzir; é ele que escolhe o leitor, dentro do provider da ferramenta. */
export type OutputFormat = 'text' | 'claude-stream-json' | 'cursor-stream-json' | 'kimi-stream-json' | 'gemini-stream-json';

/** De qual canal do processo a linha veio. O `stderr` é texto de gente e nunca é interpretado. */
export type OutputStream = 'stdout' | 'stderr';

/** O que o leitor precisa saber da execução. */
export interface ReaderDeps {
  /** o modelo que o board pediu nesta execução, quando pediu; é o nome a usar quando o fluxo não diz qual foi */
  model: string | null;
  /**
   * os servidores MCP da execução, para a ferramenta que junta servidor e operação num nome só sem separador
   * próprio (o Gemini CLI: `mcp_<servidor>_<operação>`, e o nome do servidor pode ter `_`)
   */
  mcpServers?: readonly string[];
  /**
   * a home da pessoa, para o leitor que completa o consumo pelo que a CLI gravou em disco (o Kimi Code lê os tokens
   * do registro da sessão, pelo `session_id` do stream); ausente = sem essa leitura
   */
  homeDir?: string;
  /** recebe os eventos de sessão, MCP e filha conforme a saída os traz; ausente = o leitor só lê */
  onEvent?: (event: ReaderEvent) => void;
  /**
   * a sessão nativa que esta execução retoma, para o leitor cuja saída não repete o id na largada (o Kimi Code só
   * o escreve no fim, no `session.resume_hint`): é com ele que a sessão aberta e os MCPs são avisados
   */
  resumedSessionId?: string;
}

export interface OutputReader {
  /** As linhas legíveis desta linha de saída. Lista vazia = evento que não vira linha nenhuma. */
  push(line: string, stream: OutputStream): string[];
  /** O acumulado da execução, lido uma vez no fim. */
  report(): RunReport;
  /** Se o leitor já entendeu pelo menos um evento válido deste formato. */
  readonly sawEvent: boolean;
}
