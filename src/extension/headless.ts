import { aiToolInfo, type AiTool } from '../shared/harness';
import type { RunnerPermission } from '../shared/runner';
import type { OutputFormat } from './aiOutput/reader';
import { BOARD_SERVER, type ExecInput } from './execution';

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
  projectMcp?: { file: string; entry: { command: string; args: string[] } };
}

export interface HeadlessInput {
  prompt: string;
  permission: RunnerPermission;
  /** pastas fora da pasta do projeto em que a IA também trabalha (as worktrees das histórias) */
  addDirs?: string[];
  /** o que o agente do card pede: subagente, servidores MCP, ferramentas, modelo, sessão limpa */
  exec?: ExecInput;
  /** como iniciar o servidor MCP do board; quando a ferramenta aceita, vai na linha de comando e dispensa o registro no projeto */
  boardServer?: { command: string; args: string[] };
  /**
   * Pedir a saída estruturada da ferramenta, para medir consumo e inventário. Quem não tem saída
   * estruturada no modo sem interface (o Copilot) ignora e devolve `format: 'text'`. Não há tabela
   * de "a partir da versão X": quem decide é a tentativa, e a recusa de argumento foi verificada
   * saindo na hora, com `stdout` vazio e zero token gasto.
   */
  structured?: boolean;
}

const SERVER = BOARD_SERVER;

/**
 * Ferramentas do Cursor liberadas em cada nível menor que "sem restrições", pelos nomes do `oneof`
 * de ferramentas da CLI. `--allowed-tools` é uma opção escondida da CLI (fora do `--help`), conferida
 * no código da versão 2026.10.01: ela valida cada nome e recusa a execução se algum não existir,
 * então uma versão que mude os nomes falha com a mensagem da própria CLI, sem rodar com mais
 * permissão do que a pedida. `mcp_tool_call` libera os servidores MCP configurados, não só o do board.
 */
export const CURSOR_TOOLS = {
  board: [
    'read_tool_call',
    'glob_tool_call',
    'grep_tool_call',
    'ls_tool_call',
    'sem_search_tool_call',
    'read_lints_tool_call',
    'read_todos_tool_call',
    'update_todos_tool_call',
    'mcp_tool_call',
    'get_mcp_tools_tool_call',
    'list_mcp_resources_tool_call',
    'read_mcp_resource_tool_call',
  ],
  edits: ['edit_tool_call', 'delete_tool_call', 'apply_agent_diff_tool_call'],
};

/** Arquivo temporário que o executor cria antes de rodar e apaga ao terminar; nos argumentos entra como `{tmp:<nome>}`. */
export const tmpArg = (name: string) => `{tmp:${name}}`;
const MCP_CONFIG = 'mcp.json';

/**
 * Como cada ferramenta roda sem interface, conforme a documentação delas em 2026-10-02:
 * - Claude Code: code.claude.com/docs/en/headless e /permission-modes
 * - Codex: learn.chatgpt.com/docs/non-interactive-mode
 * - GitHub Copilot: docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
 * - Cursor: cursor.com/docs/cli/headless
 * - Kimi Code: moonshotai.github.io/kimi-code/en/reference/kimi-command.html
 *
 * O Kimi não tem, no modo sem interface, um nível de permissão intermediário por linha de comando:
 * só roda "sem restrições". O Cursor tem, por `--allowed-tools` (ver CURSOR_TOOLS).
 *
 * Parâmetros do agente de execução (`exec`), das referências de linha de comando de cada ferramenta:
 * - Claude Code: --agent, --model, --effort, --tools, --disallowedTools, --mcp-config com
 *   --strict-mcp-config, --setting-sources e --disable-slash-commands (code.claude.com/docs/en/cli-reference)
 * - Codex: --model e `-c` para model_reasoning_effort e mcp_servers.<id>.enabled
 * - Copilot: --agent, --model, --effort, --available-tools, --excluded-tools, --disable-mcp-server, --no-custom-instructions
 * - Cursor: --model, com o esforço como sufixo do id (`modelo-high`). Kimi: --model e --agent.
 * O que a ferramenta não aceita por parâmetro segue no prompt, como orientação (ver executionPlan).
 *
 * Saída estruturada (`structured`), de onde saem tokens, custo e inventário:
 * - Claude Code: `--output-format stream-json` EXIGE `--verbose` (verificado na máquina: sem ele a
 *   CLI recusa com "When using --print, --output-format=stream-json requires --verbose"). É o único
 *   formato desta entrega verificado contra saída real.
 * - Codex: `exec --json`.
 * - Cursor: `--output-format stream-json`. A documentação não descreve o bloco de uso, mas o código
 *   da CLI 2026.10.01 o põe no `result` (ver aiOutput/stream.ts).
 * - Kimi: `--output-format stream-json`, pela documentação; a CLI não está instalada nesta máquina,
 *   e a documentação dela não promete bloco de uso.
 * - Copilot: NÃO TEM no modo `-p`. O `--output-format json` que a documentação mostra é do
 *   `copilot workflow run`, outro comando. Por isso o builder dele devolve sempre `format: 'text'`:
 *   a execução acontece e fica registrada sem consumo.
 */
const BUILDERS: Record<AiTool, (input: HeadlessInput) => HeadlessCommand | null> = {
  claude: ({ prompt, permission, addDirs = [], exec, boardServer, structured }) => {
    // sem pasta confiada, o `-p` ignora as permissões do projeto: elas vão todas na linha de comando
    const modes: Record<RunnerPermission, string[]> = {
      // dontAsk nega tudo o que não está liberado: só o board e a leitura do projeto
      board: ['--permission-mode', 'dontAsk', '--allowedTools', `mcp__${SERVER}__*`, 'Read', 'Glob', 'Grep'],
      edits: ['--permission-mode', 'acceptEdits', '--allowedTools', `mcp__${SERVER}__*`],
      full: ['--permission-mode', 'bypassPermissions'],
    };
    // `--verbose` é obrigatório junto do `stream-json`: sem ele a CLI recusa o argumento e nada roda
    const args = ['-p', ...(structured ? ['--output-format', 'stream-json', '--verbose'] : []), ...modes[permission]];
    // os servidores liberados no agente também rodam sem pedir aprovação
    if (exec?.mcpAllowed && permission !== 'full') args.push(...exec.mcpAllowed.map((n) => `mcp__${n}__*`));
    args.push(...addDirs.flatMap((d) => ['--add-dir', d]));
    if (exec?.model) args.push('--model', exec.model.name, ...(exec.model.effort ? ['--effort', exec.model.effort] : []));
    if (exec?.agent) args.push('--agent', exec.agent);
    if (exec?.tools.length) args.push('--tools', exec.tools.join(','));
    if (exec?.deniedTools.length) args.push('--disallowedTools', ...exec.deniedTools);
    // sem agente que restrinja os servidores, o do board vai junto dos já configurados: a execução não
    // depende de "Conectar ao board" nem da aprovação do .mcp.json, que o modo -p não tem como pedir
    const mcpConfig =
      exec?.mcpConfig ?? (boardServer ? JSON.stringify({ mcpServers: { [SERVER]: { type: 'stdio', ...boardServer } } }) : null);
    if (exec?.mcpConfig) args.push('--strict-mcp-config');
    if (mcpConfig) args.push('--mcp-config', tmpArg(MCP_CONFIG));
    // sessão limpa: sem as configurações da pasta do usuário e sem skills ou comandos invocáveis (as do card vão pelo caminho)
    if (exec?.clean) args.push('--setting-sources', 'project,local', '--disable-slash-commands');
    return {
      command: 'claude',
      args,
      stdin: prompt,
      format: structured ? 'claude-stream-json' : 'text',
      ...(mcpConfig ? { tempFiles: { [MCP_CONFIG]: mcpConfig } } : {}),
    };
  },
  codex: ({ prompt, permission, addDirs = [], exec, structured }) => {
    const modes: Record<RunnerPermission, string[]> = {
      board: ['--sandbox', 'read-only'],
      edits: ['--sandbox', 'workspace-write'],
      full: ['--dangerously-bypass-approvals-and-sandbox'],
    };
    // as ferramentas do board não podem ficar esperando aprovação: ninguém acompanha a execução
    const key = (name: string) => (/^[\w-]+$/.test(name) ? name : JSON.stringify(name));
    const profile = [
      ...(exec?.model
        ? ['--model', exec.model.name, ...(exec.model.effort ? ['-c', `model_reasoning_effort="${exec.model.effort}"`] : [])]
        : []),
      ...(exec?.mcpBlocked ?? []).flatMap((n) => ['-c', `mcp_servers.${key(n)}.enabled=false`]),
    ];
    return {
      command: 'codex',
      args: [
        'exec',
        ...(structured ? ['--json'] : []),
        ...modes[permission],
        '--skip-git-repo-check',
        ...addDirs.flatMap((d) => ['--add-dir', d]),
        ...profile,
        '-c',
        `mcp_servers.${SERVER}.default_tools_approval_mode="approve"`,
        '-',
      ],
      stdin: prompt,
      format: structured ? 'codex-json' : 'text',
    };
  },
  copilot: ({ prompt, permission, addDirs = [], exec }) => {
    const modes: Record<RunnerPermission, string[]> = {
      board: [`--allow-tool=${SERVER}`, '--allow-tool=read'],
      edits: [`--allow-tool=${SERVER}`, '--allow-tool=read', '--allow-tool=write'],
      full: ['--allow-all'],
    };
    // no modo -p os servidores MCP do projeto (.mcp.json) só carregam com esta variável
    const profile = [
      ...(exec?.agent ? [`--agent=${exec.agent}`] : []),
      ...(exec?.model ? [`--model=${exec.model.name}`, ...(exec.model.effort ? [`--effort=${exec.model.effort}`] : [])] : []),
      ...(exec?.tools.length ? [`--available-tools=${exec.tools.join(',')}`] : []),
      ...(exec?.deniedTools.length ? [`--excluded-tools=${exec.deniedTools.join(',')}`] : []),
      ...(exec?.mcpBlocked ?? []).map((n) => `--disable-mcp-server=${n}`),
      ...(exec?.clean ? ['--no-custom-instructions'] : []),
    ];
    return {
      command: 'copilot',
      args: ['-p', prompt, ...modes[permission], ...addDirs.map((d) => `--add-dir=${d}`), ...profile, '--no-ask-user'],
      env: { GITHUB_COPILOT_PROMPT_MODE_WORKSPACE_MCP: 'true' },
      // o modo `-p` do Copilot não tem saída estruturada: a execução fica registrada sem consumo
      format: 'text',
    };
  },
  cursor: ({ prompt, permission, addDirs = [], exec, boardServer, structured }) => {
    // `--force` aprova sem perguntar o que a sessão pode usar; nos níveis menores, `--allowed-tools`
    // tira da sessão todo o resto (o modelo nem vê as outras ferramentas)
    const modes: Record<RunnerPermission, string[]> = {
      board: ['--allowed-tools', CURSOR_TOOLS.board.join(',')],
      edits: ['--allowed-tools', [...CURSOR_TOOLS.board, ...CURSOR_TOOLS.edits].join(',')],
      full: [],
    };
    // o esforço é parte do id: `cursor-agent models` lista uma variante por nível (`claude-opus-5-5-high`)
    const model = exec?.model && (exec.model.effort ? `${exec.model.name}-${exec.model.effort}` : exec.model.name);
    return {
      command: 'cursor-agent',
      args: [
        '-p',
        ...(structured ? ['--output-format', 'stream-json'] : []),
        '--force',
        '--approve-mcps',
        '--trust',
        ...modes[permission],
        ...addDirs.flatMap((d) => ['--add-dir', d]),
        ...(model ? ['--model', model] : []),
        prompt,
      ],
      format: structured ? 'stream-json' : 'text',
      // o Cursor não recebe servidores pela linha de comando: o do board vai para o .cursor/mcp.json
      ...(boardServer ? { projectMcp: { file: '.cursor/mcp.json', entry: boardServer } } : {}),
    };
  },
  // no -p o Kimi não pede aprovação de nada e recusa flags de permissão
  kimi: ({ prompt, permission, addDirs = [], exec, structured }) =>
    permission === 'full'
      ? {
          command: 'kimi',
          args: [
            '-p',
            prompt,
            // a documentação do Kimi liga `--output-format` ao `--prompt`; se o `-p` não for a forma
            // curta dele, a CLI recusa o argumento e a execução cai para texto, pelo caminho normal
            ...(structured ? ['--output-format', 'stream-json'] : []),
            ...addDirs.flatMap((d) => ['--add-dir', d]),
            ...(exec?.model ? ['--model', exec.model.name] : []),
            ...(exec?.agent ? ['--agent', exec.agent] : []),
          ],
          format: structured ? 'stream-json' : 'text',
        }
      : null,
};

/** Por que o board não pode executar a ferramenta com esta permissão; null quando pode. */
export function headlessUnsupported(tool: AiTool, permission: RunnerPermission): string | null {
  if (BUILDERS[tool]({ prompt: '', permission })) return null;
  return `O ${aiToolInfo(tool).label}, quando roda em segundo plano, não pede aprovação de nada e não aceita limites por linha de comando. Para chamá-lo pelo board, escolha "Sem restrições" em Configurações → Harness de IA → Execução pela conversa.`;
}

export function headlessCommand(tool: AiTool, input: HeadlessInput): HeadlessCommand | { unsupported: string } {
  return BUILDERS[tool](input) ?? { unsupported: headlessUnsupported(tool, input.permission)! };
}
