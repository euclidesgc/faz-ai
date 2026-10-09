// Provider do Cursor: o board mede os tokens (entrada, saída, leitura e criação de cache), que o
// `stream-json` da CLI traz no evento `result` (conferido contra a CLI 2026.10.01). A CLI não informa
// custo em dólar e o board não o calcula: a execução fica com tokens e sem custo.
import type { RunnerPermission } from '../../../shared/runner';
import { cursorReader } from '../../aiOutput/cursor';
import { textReader } from '../../aiOutput/text';
import type { AiProvider } from '../provider';

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

/**
 * O id que o Cursor aceita em `--model`. O nível é parte do id (`cursor-agent models` lista uma
 * variante por nível: `claude-opus-5-5-high`) e, na versão rápida, vem antes do `-fast`
 * (`claude-opus-5-5-high-fast`).
 */
export function cursorModelId(name: string, effort: string | null): string {
  if (!effort) return name;
  return name.endsWith('-fast') ? `${name.slice(0, -'-fast'.length)}-${effort}-fast` : `${name}-${effort}`;
}

export const cursorProvider: AiProvider = {
  tool: 'cursor',
  measure: 'tokens',
  command: ({ prompt, permission, addDirs = [], exec, boardServer, structured }) => {
    // `--force` aprova sem perguntar o que a sessão pode usar; nos níveis menores, `--allowed-tools`
    // tira da sessão todo o resto (o modelo nem vê as outras ferramentas)
    const modes: Record<RunnerPermission, string[]> = {
      board: ['--allowed-tools', CURSOR_TOOLS.board.join(',')],
      edits: ['--allowed-tools', [...CURSOR_TOOLS.board, ...CURSOR_TOOLS.edits].join(',')],
      full: [],
    };
    const model = exec?.model && cursorModelId(exec.model.name, exec.model.effort);
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
      ],
      // o pedido vai pela entrada padrão (o `-p` sem texto a lê): na linha de comando, no Windows, o
      // `.cmd` da CLI passaria pelo cmd.exe, que corta a linha em 8191 caracteres e achata as quebras
      stdin: prompt,
      format: structured ? 'cursor-stream-json' : 'text',
      // o Cursor não recebe servidores pela linha de comando: o do board vai para o .cursor/mcp.json
      ...(boardServer ? { projectMcp: { file: '.cursor/mcp.json', entry: boardServer } } : {}),
    };
  },
  reader: (format) => (format === 'cursor-stream-json' ? cursorReader() : textReader()),
};
