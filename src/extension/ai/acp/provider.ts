// O contrato de um provider ACP: o que o board precisa saber de um agente que fala o Agent Client
// Protocol para abrir uma sessão, mandar o pedido do card e responder às permissões. É o par do
// `AiProvider` das CLIs one-shot (`../provider.ts`), com duas diferenças que mudam o desenho:
//
// - não há leitor por ferramenta: o formato da saída é o do protocolo, igual para todo agente ACP
//   (`acp/reader.ts`); o provider só diz o que é específico dele (comando, modos, nome das
//   ferramentas MCP no título);
// - os servidores MCP vão no `session/new`, e não num arquivo do projeto: nada de `.cursor/mcp.json`
//   nem `.kimi-code/mcp.json` escrito na pasta da pessoa.
import type { RunnerPermission } from '../../../shared/runner';
import type { RunningProcess } from '../../runner';
import type { OutputStream } from '../../aiOutput/reader';
import type { AiMeasure, HeadlessInput } from '../provider';

/** Um servidor MCP stdio como o ACP o recebe em `session/new` (o `env` é lista, não mapa). */
export interface AcpMcpServer {
  name: string;
  /** caminho absoluto: o protocolo exige */
  command: string;
  args: string[];
  env: { name: string; value: string }[];
}

/** O processo de um agente ACP: o `stdin` fica aberto a sessão inteira, ao contrário do `-p`. */
export interface AcpProcess extends RunningProcess {
  /** escreve no `stdin` do agente */
  write(text: string): void;
  /** fecha o `stdin`: o agente que segue o protocolo sai sozinho no fim da entrada */
  end(): void;
}

export type AcpSpawnFn = (
  command: { command: string; args: string[]; env?: Record<string, string> },
  cwd: string,
  out: (text: string, stream: OutputStream) => void,
) => AcpProcess;

/** A chamada de ferramenta como o agente a descreve no `session/update` e no pedido de permissão. */
export interface AcpToolCall {
  toolCallId: string;
  title: string | null;
  /** `read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`, `switch_mode`, `other` */
  kind: string | null;
}

export interface AcpProvider {
  /** o id que vira `AiTool` quando o provider sair do protótipo */
  readonly tool: string;
  readonly label: string;
  readonly measure: AiMeasure;
  /** como iniciar o agente em modo ACP */
  command(input: HeadlessInput): { command: string; args: string[]; env?: Record<string, string> };
  /**
   * O modo da sessão (`session/set_mode`) para o nível de permissão, quando o agente tem um que
   * dispense perguntas que o board responderia sim de qualquer jeito. null = fica no modo padrão e
   * o board responde a cada pedido. Só é usado se o agente anunciar o modo em `session/new`.
   */
  modeFor(permission: RunnerPermission): string | null;
  /**
   * `servidor/ferramenta` de uma chamada MCP. O ACP não tem campo estruturado para isso: cada agente
   * põe no título do seu jeito, e é o provider que sabe ler. null = não é MCP (ou não deu para saber).
   */
  mcpToolOf(call: AcpToolCall): { server: string; tool: string } | null;
}
