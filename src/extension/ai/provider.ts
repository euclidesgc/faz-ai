// O contrato de um provider: tudo o que o board sabe de UMA ferramenta de IA para chamá-la sem interface e
// ler o que ela devolveu. Há exatamente um por ferramenta (`providers/`), e o gateway só fala com a
// ferramenta por ele — por isso não existe um caminho de chamada sem leitor de consumo, nem um leitor
// sem comando que o produza.
//
// Claude Code e Cursor são as duas ferramentas que o board suporta, e as duas são medidas.
import type { AiTool } from '../../shared/harness';
import type { RunnerPermission } from '../../shared/runner';
import type { AgentDefinition, ExecInput } from '../execution';
import type { SessionCumulative } from '../../shared/log';
import type { OutputFormat, OutputReader, ReaderDeps } from '../aiOutput/reader';

/** Comando que roda a CLI de uma ferramenta de IA sem interface, para um prompt, até terminar. */
export interface HeadlessCommand {
  command: string;
  /** Personalizado não procura aliases/bundles nem recorre a shell implícito. */
  lookup?: { onlyPath: boolean };
  noShell?: boolean;
  args: string[];
  /** prompt enviado pela entrada padrão, quando a CLI aceita (evita problemas de aspas no argumento) */
  stdin?: string;
  env?: Record<string, string>;
  /** arquivos temporários da execução (nome → conteúdo), referidos nos argumentos por `tmpArg` */
  tempFiles?: Record<string, string>;
  /**
   * Uma pasta temporária da execução, com arquivos em subpastas (caminho relativo → conteúdo), entregue à
   * ferramenta pela variável `env`: a home isolada do Gemini CLI (`GEMINI_CLI_HOME`, com o
   * `.gemini/settings.json` do board). O transporte a cria antes de rodar, põe o caminho na variável e a
   * apaga ao terminar, junto dos `tempFiles`; a admissão confere o conteúdo gravado, como o dos `tempFiles`.
   */
  tempHome?: { env: string; files: Record<string, string> };
  /**
   * O nome da variável em que o host entrega a chave de API da ferramenta, lida do cofre (`GEMINI_API_KEY`).
   * O comando só declara o nome: o valor nunca está nos argumentos, no `env` nem nos arquivos temporários.
   */
  apiKeyEnv?: string;
  /**
   * O valor da chave, posto pelo driver só na hora do `spawn` (depois de o comando ser montado e conferido
   * pela admissão) e aplicado por cima do ambiente do processo em `apiKeyEnv`. Nunca entra no vínculo nem no log.
   */
  apiKey?: string;
  /** o que este comando vai escrever na saída, e portanto qual leitor a interpreta */
  format: OutputFormat;
  /**
   * Servidor do board a garantir num arquivo de configuração do projeto antes de rodar, para a
   * ferramenta que não recebe servidores MCP pela linha de comando (o Cursor só lê
   * `.cursor/mcp.json`, o Kimi Code só lê `.kimi-code/mcp.json`). `stdioType` diz se a entrada leva
   * o campo `type: "stdio"` (o Kimi Code documenta a dele sem o campo).
   */
  projectMcp?: { file: string; entry: { command: string; args: string[]; env?: Record<string, string> }; stdioType?: boolean };
  /**
   * Arquivos que a ferramenta só lê da pasta do projeto (caminho relativo → conteúdo), criados antes de rodar e
   * apagados ao terminar: a filha da sessão da História no Kimi Code (`.kimi-code/agents/<nome>.md`, que a CLI
   * descobre pela raiz do `.git`). Um arquivo que já exista impede a execução, em vez de ser sobrescrito.
   */
  projectFiles?: Record<string, string>;
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
  /** Assistência de rascunho: sem necessidade de ferramentas de alteração. */
  draftOnly?: boolean;
  /**
   * Retoma a sessão da CLI (o reparo do bloco final): o prompt é só o pedido novo e a conversa anterior vem
   * da sessão. Só vale para um provider `resumable`; a retomada pede o mesmo cwd da execução original, e todo
   * o resto do comando (isolamento, MCP, agente, modelo) é reaplicado.
   */
  resume?: { sessionId: string };
  /**
   * Sessão persistente da História; distinta de `resume`, que só repara a saída final de uma tentativa. `consumedBefore`
   * é o acumulado que a sessão já informou nas execuções anteriores (`RunReport.sessionCumulative`): o leitor o desconta.
   */
  storySession?: { sessionId: string; consumedBefore?: SessionCumulative };
  /** Negocia a extensão ACP instável de sessões filhas, somente no modo de coordenação da História. */
  acpSubagents?: boolean;
  /**
   * A filha nativa desta execução, na CLI que define subagentes por parâmetro (Claude Code, `--agents`): a
   * definição vai junto da do agente principal (`exec.agentDefinition`), e só a principal pode lançá-la
   * (`Agent(<nome>)` nas ferramentas dela). Sem isto, toda execução nega a delegação.
   */
  storyChild?: { name: string; definition: StoryChildDefinition };
}

/** A definição da filha nativa, no formato do `--agents` do Claude Code (os campos além do agente do board). */
export interface StoryChildDefinition extends Omit<AgentDefinition, 'name'> {
  /** servidores MCP da sessão que a filha enxerga, pelo nome (ela compartilha a conexão da principal) */
  mcpServers?: string[];
  /** nível de esforço do modelo da filha, no nome que a ferramenta aceita */
  effort?: string;
}

/** Configuração efetiva lida da sessão filha nativa após seu turno; ausência não comprova o modelo. */
export interface AcpChildConfiguration {
  parentSessionId: string;
  sessionId: string;
  model: string | null;
  effort: string | null;
}

/**
 * Evento de filha nativa: do ACP estável, da extensão legada observada no codex-acp 2.2.2, ou da saída
 * estruturada de uma CLI (Claude Code: a chamada da ferramenta `Agent` e o resultado dela, `parent_tool_use_id`).
 * `parentSessionId` é a sessão nativa da principal; `sessionId` identifica a filha dentro dela (no ACP, a sessão
 * filha; na CLI, o id da chamada que a lançou).
 */
export type AcpSubagentEvent =
  | {
      source: 'cli';
      kind: 'spawned';
      parentSessionId: string;
      sessionId: string;
      /** o tipo de subagente pedido (`subagent_type`), que o board compara com a filha autorizada */
      name?: string;
      task?: string;
    }
  | {
      source: 'cli';
      kind: 'state';
      parentSessionId: string;
      sessionId: string;
      state: 'running' | 'completed' | 'failed';
    }
  | {
      source: 'acp-v1-unstable';
      kind: 'update';
      parentSessionId: string;
      sessionId: string;
      title?: string | null;
      description?: string | null;
      capabilities?: Record<string, unknown> | null;
      state?: Record<string, unknown> | null;
      _meta?: Record<string, unknown> | null;
    }
  | {
      source: 'codex-acp-2.2.2';
      kind: 'spawned';
      parentSessionId: string;
      sessionId: string;
      name?: string;
      task?: string;
      capabilities?: Record<string, unknown>;
    }
  | {
      source: 'codex-acp-2.2.2';
      kind: 'state';
      parentSessionId: string;
      sessionId: string;
      state: string;
    };

/** O estado dos MCPs exigidos antes de iniciar uma delegação filha ACP. */
export interface AcpMcpReadiness {
  parentSessionId: string;
  requiredServers: string[];
  connectedServers: string[];
  failedServers: string[];
  reason: string | null;
}

/** Arquivo temporário que o executor cria antes de rodar e apaga ao terminar; nos argumentos entra como `{tmp:<nome>}`. */
export const tmpArg = (name: string) => `{tmp:${name}}`;

/** O que o board consegue medir de uma ferramenta: o custo que a CLI informa, ou só os tokens. */
export type AiMeasure = 'cost' | 'tokens' | 'none';

export interface AiProvider {
  readonly tool: AiTool;
  readonly measure: AiMeasure;
  /**
   * A CLI retoma uma sessão anterior em modo headless (`HeadlessInput.resume`), confirmado na documentação
   * oficial. Ausente = sem retomada: quem pede o reparo na mesma sessão cai no comportamento sem reparo.
   */
  readonly resumable?: boolean;
  /**
   * A CLI sustenta a sessão persistente da História: retoma a principal (`storySession`), recebe a filha nativa
   * por parâmetro (`storyChild`) e o leitor dela emite os eventos de sessão, MCP e filha (`ReaderDeps.onEvent`).
   * Ausente = só o modo tradicional (uma execução por card).
   */
  readonly storySessions?: {
    transport: 'cli';
    /**
     * `own`: a filha roda no modelo que a definição dela pede (Claude Code, `model` do subagente). `inherited`: a
     * filha roda no modelo da sessão (Kimi Code) e o board recusa, antes de delegar, a sub-tarefa que pede outro.
     */
    childModel: 'own' | 'inherited';
    /**
     * `startup`: a CLI informa na largada quais servidores MCP conectou (Claude Code, `system/init`). `board-file`:
     * a CLI não informa; a evidência é o arquivo de configuração que o próprio board gravou por empréstimo (Kimi
     * Code). A prontidão da delegação é registrada com essa diferença.
     */
    mcpEvidence: 'startup' | 'board-file';
  };
  /** O comando da CLI para este pedido. */
  command(input: HeadlessInput): HeadlessCommand;
  /** O leitor da saída no formato que `command` anunciou; `text` não tem consumo a ler. */
  reader(format: OutputFormat, deps: ReaderDeps): OutputReader;
}
