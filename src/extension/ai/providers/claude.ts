// Provider do Claude Code: o único que o board mede por inteiro. Os tokens (entrada, saída, leitura e
// criação de cache, por modelo, subagente incluído) e o custo em dólar vêm do `stream-json` da própria
// CLI — o custo é o `total_cost_usd` que ela informa, nunca um cálculo do board. A saída é lida por
// `aiOutput/claude.ts`, conferida contra uma execução real.
import type { RunnerPermission } from '../../../shared/runner';
import { claudeReader } from '../../aiOutput/claude';
import { textReader } from '../../aiOutput/text';
import { BOARD_SERVER } from '../../execution';
import { tmpArg, type AiProvider } from '../provider';

const SERVER = BOARD_SERVER;
const MCP_CONFIG = 'mcp.json';

export const claudeProvider: AiProvider = {
  tool: 'claude',
  measure: 'cost',
  command: ({ prompt, permission, addDirs = [], exec, boardServer, structured }) => {
    // sem pasta confiada, o `-p` ignora as permissões do projeto: elas vão todas na linha de comando
    const modes: Record<RunnerPermission, string[]> = {
      // dontAsk nega tudo o que não está liberado: só o board e a leitura do projeto
      board: ['--permission-mode', 'dontAsk', '--allowedTools', `mcp__${SERVER}__*`, 'Read', 'Glob', 'Grep'],
      // a leitura liberada vale também fora do projeto: as skills obrigatórias do card ficam em ~/.claude
      edits: ['--permission-mode', 'acceptEdits', '--allowedTools', `mcp__${SERVER}__*`, 'Read', 'Glob', 'Grep'],
      full: ['--permission-mode', 'bypassPermissions'],
    };
    // `--verbose` é obrigatório junto do `stream-json`: sem ele a CLI recusa o argumento e nada roda
    const args = ['-p', ...(structured ? ['--output-format', 'stream-json', '--verbose'] : []), ...modes[permission]];
    // os servidores liberados no agente também rodam sem pedir aprovação
    // o Claude Code troca por `_` o que não for letra, número, `_` ou `-` no nome do servidor
    if (exec?.mcpAllowed && permission !== 'full') args.push(...exec.mcpAllowed.map((n) => `mcp__${n.replace(/[^A-Za-z0-9_-]/g, '_')}__*`));
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
  reader: (format, deps) => (format === 'claude-stream-json' ? claudeReader(deps) : textReader()),
};
