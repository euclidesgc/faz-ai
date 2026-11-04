// Provider do Claude Code: o único que o board mede por inteiro. Os tokens (entrada, saída, leitura e
// criação de cache, por modelo, subagente incluído) e o custo em dólar vêm do `stream-json` da própria
// CLI — o custo é o `total_cost_usd` que ela informa, nunca um cálculo do board. A saída é lida por
// `aiOutput/claude.ts`, conferida contra uma execução real.
import type { RunnerPermission } from '../../../shared/runner';
import { claudeReader } from '../../aiOutput/claude';
import { textReader } from '../../aiOutput/text';
import { BUILTIN_ISOLATION } from '../../../shared/aiProfiles';
import { BOARD_SERVER, SUBAGENT_TOOLS, boardOnlyMcpConfig } from '../../execution';
import { tmpArg, type AiProvider } from '../provider';

const SERVER = BOARD_SERVER;
const MCP_CONFIG = 'mcp.json';
const AGENTS_FILE = 'agents.json';

export const claudeProvider: AiProvider = {
  tool: 'claude',
  measure: 'cost',
  // `claude -p ... --resume <session_id>` (docs "Run Claude Code programmatically › Continue conversations", 2026-10-30)
  resumable: true,
  // A sessão da História (docs "Subagents" e "Run Claude Code programmatically", relidas em 2026-11-03, CLI 2.1.316):
  // a principal retoma por `--resume` (a CLI acha a sessão pelo id em qualquer pasta); a filha vai no mesmo
  // `--agents` da principal, com `tools`, `disallowedTools`, `model`, `effort` e `mcpServers` próprios, e só a
  // principal pode lançá-la (`Agent(<nome>)` nas ferramentas dela, que vale para o agente de `--agent`). A saída
  // `stream-json` traz a chamada de `Agent` (`subagent_type`), as mensagens da filha com `parent_tool_use_id` e o
  // `resolvedModel` no resultado da chamada: é isso que o leitor transforma em eventos de filha.
  storySessions: { transport: 'cli', childModel: 'own', mcpEvidence: 'startup' },
  command: ({ prompt, permission, addDirs = [], exec, boardServer, structured, resume, storySession, storyChild }) => {
    // sem pasta confiada, o `-p` ignora as permissões do projeto: elas vão todas na linha de comando
    const modes: Record<RunnerPermission, string[]> = {
      // dontAsk nega tudo o que não está liberado: só o board e a leitura do projeto
      board: ['--permission-mode', 'dontAsk', '--allowedTools', `mcp__${SERVER}__*`, 'Read', 'Glob', 'Grep'],
      // a leitura liberada vale também fora do projeto: as skills obrigatórias do card ficam em ~/.claude
      edits: ['--permission-mode', 'acceptEdits', '--allowedTools', `mcp__${SERVER}__*`, 'Read', 'Glob', 'Grep'],
      full: ['--permission-mode', 'bypassPermissions'],
    };
    // `--verbose` é obrigatório junto do `stream-json`: sem ele a CLI recusa o argumento e nada roda
    // No contrato v1, até o nível full continua limitado pelo conjunto exato admitido.
    const strict = exec?.toolSet === 'explicit';
    const permissions = strict
      ? ['--permission-mode', 'dontAsk', '--allowedTools', [...exec.tools, ...(exec.mcpTools ?? [])].join(',')]
      : modes[permission];
    // a retomada logo depois do `-p`; permissões, isolamento, MCP, agente e modelo valem de novo a cada execução
    // a sessão da História e o reparo do bloco final retomam do mesmo jeito; os dois juntos seriam a mesma sessão
    const resumed = resume?.sessionId ?? storySession?.sessionId;
    const args = [
      '-p',
      ...(resumed ? ['--resume', resumed] : []),
      ...(structured ? ['--output-format', 'stream-json', '--verbose'] : []),
      ...permissions,
    ];
    // os servidores liberados no agente também rodam sem pedir aprovação
    // o Claude Code troca por `_` o que não for letra, número, `_` ou `-` no nome do servidor
    if (!strict && exec?.mcpAllowed.length && permission !== 'full')
      args.push(...exec.mcpAllowed.map((n) => `mcp__${n.replace(/[^A-Za-z0-9_-]/g, '_')}__*`));
    args.push(...addDirs.flatMap((d) => ['--add-dir', d]));
    if (exec?.model) args.push('--model', exec.model.name, ...(exec.model.effort ? ['--effort', exec.model.effort] : []));
    // o agente vai inline e é o da sessão: não depende de nenhuma pasta de agentes (verificado na CLI 2.1.278)
    // só o agente da própria execução: as sub-tarefas são execuções separadas do board, não subagentes
    const tempFiles: Record<string, string> = {};
    if (exec?.agentDefinition) {
      const { name, ...def } = exec.agentDefinition;
      const agents: Record<string, unknown> = { [name]: def };
      if (storyChild) {
        if (storyChild.name === name) throw new Error('A filha nativa não pode ter o nome do agente principal.');
        agents[storyChild.name] = storyChild.definition;
      }
      // com a filha, a definição vai por arquivo (aceito em `-p` desde a 2.1.281): o pedido da filha não cabe na
      // linha de comando que o cmd.exe corta
      if (storyChild) {
        tempFiles[AGENTS_FILE] = JSON.stringify(agents);
        args.push('--agents', tmpArg(AGENTS_FILE), '--agent', name);
      } else args.push('--agents', JSON.stringify(agents), '--agent', name);
    } else if (storyChild) throw new Error('A filha nativa exige a definição inline do agente principal.');
    else if (exec?.agent) args.push('--agent', exec.agent);
    if (exec && (strict || exec.tools.length)) args.push('--tools', exec.tools.join(','));
    // a delegação nativa fica negada em toda execução do board (docs do Claude Code: `Agent`, antes `Task`), menos na
    // execução que lança a filha autorizada: aí só os subagentes embutidos ficam de fora (`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`)
    if (exec) {
      const denied = new Set([...exec.deniedTools, ...(storyChild ? [] : SUBAGENT_TOOLS)]);
      if (denied.size) args.push('--disallowedTools', ...denied);
    }
    // isolamento (BUILTIN_ISOLATION.claude, lido na doc 2026-10-16/2.1.296): só o servidor do board e os liberados pelo agente (`--strict-mcp-config` deixa de
    // fora os do usuário e do projeto; a execução não depende de "Conectar ao board" nem da aprovação do
    // .mcp.json, que o modo -p não tem como pedir), nenhuma fonte de configuração (`--setting-sources ""`:
    // sem CLAUDE.md, skills, agentes, hooks e plugins do usuário nem do projeto, verificado na CLI 2.1.278)
    // e nenhuma skill invocável; o que o board marcou vai no pedido, pelo caminho do arquivo
    const mcpConfig = exec?.mcpConfig ?? (boardServer ? boardOnlyMcpConfig(boardServer) : null);
    if (mcpConfig) {
      args.push('--strict-mcp-config', '--mcp-config', tmpArg(MCP_CONFIG));
      tempFiles[MCP_CONFIG] = mcpConfig;
    }
    // `--strict-mcp-config` só vale junto de `--mcp-config` (acima); o resto vem do isolamento do perfil pronto
    args.push(...BUILTIN_ISOLATION.claude.args.filter((a) => a !== '--strict-mcp-config'));
    const env = {
      // --setting-sources vazio não impede memória de --add-dir quando esta variável é herdada.
      ...(strict ? { CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '0' } : {}),
      // com a filha autorizada, os subagentes embutidos (Explore, Plan, general-purpose) saem da sessão
      ...(storyChild ? { CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: '1' } : {}),
    };
    return {
      command: 'claude',
      args,
      stdin: prompt,
      format: structured ? 'claude-stream-json' : 'text',
      ...(Object.keys(env).length ? { env } : {}),
      ...(Object.keys(tempFiles).length ? { tempFiles } : {}),
    };
  },
  reader: (format, deps) => (format === 'claude-stream-json' ? claudeReader(deps) : textReader()),
};
