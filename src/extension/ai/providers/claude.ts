// Provider do Claude Code: o único que o board mede por inteiro. Os tokens (entrada, saída, leitura e
// criação de cache, por modelo, subagente incluído) e o custo em dólar vêm do `stream-json` da própria
// CLI — o custo é o `total_cost_usd` que ela informa, nunca um cálculo do board. A saída é lida por
// `aiOutput/claude.ts`, conferida contra uma execução real.
import type { RunnerPermission } from '../../../shared/runner';
import { claudeReader } from '../../aiOutput/claude';
import { textReader } from '../../aiOutput/text';
import { BOARD_SERVER, boardOnlyMcpConfig } from '../../execution';
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
    if (exec?.mcpAllowed.length && permission !== 'full')
      args.push(...exec.mcpAllowed.map((n) => `mcp__${n.replace(/[^A-Za-z0-9_-]/g, '_')}__*`));
    args.push(...addDirs.flatMap((d) => ['--add-dir', d]));
    if (exec?.model) args.push('--model', exec.model.name, ...(exec.model.effort ? ['--effort', exec.model.effort] : []));
    // o agente vai inline e é o da sessão: não depende de nenhuma pasta de agentes (verificado na CLI 2.1.278)
    // os outros agentes do board vão junto, como subagentes da sessão da história
    if (exec?.agentDefinition) {
      const agents = Object.fromEntries([exec.agentDefinition, ...exec.delegates].map(({ name, ...def }) => [name, def]));
      args.push('--agents', JSON.stringify(agents), '--agent', exec.agentDefinition.name);
    } else if (exec?.agent) args.push('--agent', exec.agent);
    if (exec?.tools.length) args.push('--tools', exec.tools.join(','));
    if (exec?.deniedTools.length) args.push('--disallowedTools', ...exec.deniedTools);
    // contexto vazio: só o servidor do board e os liberados pelo agente (`--strict-mcp-config` deixa de
    // fora os do usuário e do projeto; a execução não depende de "Conectar ao board" nem da aprovação do
    // .mcp.json, que o modo -p não tem como pedir), nenhuma fonte de configuração (`--setting-sources ""`:
    // sem CLAUDE.md, skills, agentes, hooks e plugins do usuário nem do projeto, verificado na CLI 2.1.278)
    // e nenhuma skill invocável; o que o board marcou vai no pedido, pelo caminho do arquivo
    const mcpConfig = exec?.mcpConfig ?? (boardServer ? boardOnlyMcpConfig(boardServer) : null);
    if (mcpConfig) args.push('--strict-mcp-config', '--mcp-config', tmpArg(MCP_CONFIG));
    args.push('--setting-sources', '', '--disable-slash-commands');
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
