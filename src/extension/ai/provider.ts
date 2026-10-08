// O contrato de um provider: tudo o que o board sabe de UMA ferramenta de IA para chamá-la sem interface e
// ler o que ela devolveu. Há exatamente um por ferramenta (`providers/`), e o gateway só fala com a
// ferramenta por ele — por isso não existe um caminho de chamada sem leitor de consumo, nem um leitor
// sem comando que o produza.
//
// Claude Code e Cursor são as duas ferramentas que o board suporta, e as duas são medidas.
import type { AiTool } from '../../shared/harness';
import type { RunnerPermission } from '../../shared/runner';
import type { ExecInput } from '../execution';
import type { OutputFormat, OutputReader, ReaderDeps } from '../aiOutput/reader';

/** Comando que roda a CLI de uma ferramenta de IA sem interface, para um prompt, até terminar. */
export interface HeadlessCommand {
  command: string;
  args: string[];
  /** prompt enviado pela entrada padrão, quando a CLI aceita (evita problemas de aspas no argumento) */
  stdin?: string;
  env?: Record<string, string>;
  /** arquivos temporários da execução (nome → conteúdo), referidos nos argumentos por `tmpArg` */
  tempFiles?: Record<string, string>;
  /** o que este comando vai escrever na saída, e portanto qual leitor a interpreta */
  format: OutputFormat;
  /**
   * Servidor do board a garantir num arquivo de configuração do projeto antes de rodar, para a
   * ferramenta que não recebe servidores MCP pela linha de comando (o Cursor só lê `.cursor/mcp.json`).
   */
  projectMcp?: { file: string; entry: { command: string; args: string[]; env?: Record<string, string> } };
}

export interface HeadlessInput {
  prompt: string;
  permission: RunnerPermission;
  /** pastas fora da pasta do projeto em que a IA também trabalha (as worktrees das histórias) */
  addDirs?: string[];
  /** o que o agente do card pede: subagente, servidores MCP, ferramentas, modelo, sessão limpa */
  exec?: ExecInput;
  /** como iniciar o servidor MCP do board; quando a ferramenta aceita, vai na linha de comando e dispensa o registro no projeto */
  boardServer?: { command: string; args: string[]; env?: Record<string, string> };
  /**
   * Pedir a saída estruturada da ferramenta, para medir consumo e inventário. Quem não a aceitar
   * ignora e devolve `format: 'text'`. Não há tabela
   * de "a partir da versão X": quem decide é a tentativa, e a recusa de argumento foi verificada
   * saindo na hora, com `stdout` vazio e zero token gasto.
   */
  structured?: boolean;
}

/** Arquivo temporário que o executor cria antes de rodar e apaga ao terminar; nos argumentos entra como `{tmp:<nome>}`. */
export const tmpArg = (name: string) => `{tmp:${name}}`;

/** O que o board consegue medir de uma ferramenta: o custo que a CLI informa, ou só os tokens. */
export type AiMeasure = 'cost' | 'tokens';

export interface AiProvider {
  readonly tool: AiTool;
  readonly measure: AiMeasure;
  /** O comando da CLI para este pedido. */
  command(input: HeadlessInput): HeadlessCommand;
  /** O leitor da saída no formato que `command` anunciou; `text` não tem consumo a ler. */
  reader(format: OutputFormat, deps: ReaderDeps): OutputReader;
}
