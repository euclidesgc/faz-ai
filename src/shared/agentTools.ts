import { baseValue } from './harness';
import type { AiBase } from './aiProfiles';
import type { AiTool } from './harness';

/** Uma ferramenta embutida que dá para marcar num agente. */
export interface AgentToolInfo {
  /** o nome como a ferramenta de IA o escreve no arquivo do agente */
  name: string;
  hint: string;
}

/** Ferramentas do mesmo escopo, para a tela agrupar e avisar quando uma escolha amplia o que o agente pode fazer. */
export interface ToolGroup {
  id: string;
  label: string;
  hint: string;
  /** marcar uma ferramenta deste grupo amplia o escopo do agente (edita, roda comandos, usa a rede, lança agentes) */
  widens: boolean;
  tools: AgentToolInfo[];
}

/**
 * As ferramentas embutidas que fazem sentido marcar num agente do board, por ferramenta de IA. Conforme a
 * documentação oficial lida em 2026-10-14 (code.claude.com/docs/en/sub-agents e /tools-reference); a
 * classificação por escopo é nossa. O Cursor não tem lista de ferramentas por subagente (herda tudo do pai):
 * o arquivo dele só aceita `readonly` e `is_background` (cursor.com/docs/context/subagents).
 * O servidor do board entra sempre por `BOARD_TOOLS` e nunca aparece aqui.
 */
export const AGENT_TOOLS: Record<AiBase, ToolGroup[]> = {
  claude: [
    {
      id: 'read',
      label: 'Leitura',
      hint: 'Lê e busca no projeto; não muda nada.',
      widens: false,
      tools: [
        { name: 'Read', hint: 'Lê arquivos.' },
        { name: 'Glob', hint: 'Encontra arquivos pelo nome ou padrão.' },
        { name: 'Grep', hint: 'Busca texto dentro dos arquivos.' },
        { name: 'LSP', hint: 'Consulta definições e referências de código.' },
        { name: 'ListMcpResourcesTool', hint: 'Lista os recursos que os servidores MCP oferecem.' },
        { name: 'ReadMcpResourceTool', hint: 'Lê um recurso de um servidor MCP.' },
        { name: 'ToolSearch', hint: 'Procura ferramentas disponíveis.' },
      ],
    },
    {
      id: 'edit',
      label: 'Edição de arquivos',
      hint: 'Muda arquivos do projeto.',
      widens: true,
      tools: [
        { name: 'Edit', hint: 'Altera trechos de um arquivo.' },
        { name: 'Write', hint: 'Cria ou sobrescreve um arquivo.' },
        { name: 'NotebookEdit', hint: 'Edita células de um notebook Jupyter.' },
      ],
    },
    {
      id: 'run',
      label: 'Comandos',
      hint: 'Roda comandos no seu computador.',
      widens: true,
      tools: [
        { name: 'Bash', hint: 'Roda comandos no terminal.' },
        { name: 'PowerShell', hint: 'Roda comandos no PowerShell.' },
        { name: 'Monitor', hint: 'Acompanha um processo em segundo plano; pode abrir conexões de rede.' },
      ],
    },
    {
      id: 'net',
      label: 'Rede',
      hint: 'Acessa a internet.',
      widens: true,
      tools: [
        { name: 'WebFetch', hint: 'Baixa e lê uma página.' },
        { name: 'WebSearch', hint: 'Pesquisa na web.' },
      ],
    },
    {
      id: 'agents',
      label: 'Outros agentes',
      hint: 'Lança ou conversa com outros agentes.',
      widens: true,
      tools: [
        { name: 'Agent', hint: 'Lança outro agente para uma parte do trabalho.' },
        { name: 'SendMessage', hint: 'Manda uma mensagem a outro agente.' },
        { name: 'ListAgents', hint: 'Lista os agentes em execução.' },
      ],
    },
    {
      id: 'other',
      label: 'Outras',
      hint: 'Organização do trabalho; não ampliam o que o agente alcança.',
      widens: false,
      tools: [
        { name: 'Skill', hint: 'Invoca skills; sem ela o agente não invoca nenhuma.' },
        { name: 'TaskCreate', hint: 'Cria uma tarefa na lista da sessão.' },
        { name: 'TaskGet', hint: 'Lê uma tarefa da lista.' },
        { name: 'TaskList', hint: 'Lista as tarefas da sessão.' },
        { name: 'TaskUpdate', hint: 'Atualiza uma tarefa da lista.' },
        { name: 'TodoWrite', hint: 'Mantém a lista de afazeres da sessão.' },
        { name: 'EnterWorktree', hint: 'Entra numa worktree do git.' },
        { name: 'ExitWorktree', hint: 'Sai da worktree.' },
        { name: 'CronCreate', hint: 'Agenda uma tarefa recorrente.' },
        { name: 'CronDelete', hint: 'Remove uma tarefa agendada.' },
        { name: 'CronList', hint: 'Lista as tarefas agendadas.' },
      ],
    },
  ],
  cursor: [],
  // a CLI 2.1.1 do Kimi Code não documenta uma lista completa de ferramentas embutidas para o subagente:
  // aqui vai só a rede (FetchURL, documentação 2.1.1); os globs `mcp__<servidor>__*` o board grava sozinho
  kimi: [
    {
      id: 'net',
      label: 'Rede',
      hint: 'Acessa a internet.',
      widens: true,
      tools: [
        { name: 'FetchURL', hint: 'Baixa e lê uma página.' },
        { name: 'WebSearch', hint: 'Pesquisa na web.' },
      ],
    },
  ],
};

/** O que o arquivo de agente de cada ferramenta aceita; o resto da tela some quando a ferramenta não aceita. */
export const AGENT_FORMAT: Record<AiBase, { tools: boolean; skills: boolean; mcp: boolean; readonly: boolean; background: boolean }> = {
  claude: { tools: true, skills: true, mcp: true, readonly: false, background: false },
  cursor: { tools: false, skills: false, mcp: false, readonly: true, background: true },
  kimi: { tools: true, skills: false, mcp: false, readonly: false, background: false },
};

/**
 * A doc diz que o Claude Code sempre tira estas ferramentas de um subagente; oferecê-las não faria nada. Ficam
 * fora da lista (e de qualquer sugestão), e o teste vigia.
 */
export const AGENT_TOOLS_ALWAYS_REMOVED = [
  'AskUserQuestion',
  'EndConversation',
  'EnterPlanMode',
  'ExitPlanMode',
  'ScheduleWakeup',
  'WaitForMcpServers',
  'Workflow',
];

/** Só os nomes de uma ferramenta, na ordem dos grupos. */
export const agentToolNames = (tool: AiTool): string[] => (baseValue(AGENT_TOOLS, tool) ?? []).flatMap((g) => g.tools.map((x) => x.name));

/** O grupo de uma ferramenta embutida, ou undefined quando o nome não é da lista (ex.: `mcp__github__*`, `Bash(git push *)`). */
export const agentToolGroup = (tool: AiTool, name: string): ToolGroup | undefined =>
  (baseValue(AGENT_TOOLS, tool) ?? []).find((g) => g.tools.some((x) => x.name === name));

/** `mcp__<servidor>__*`: todas as ferramentas de um servidor MCP, no nome que o Claude Code usa. */
export const mcpToolPattern = (server: string): string => `mcp__${server}__*`;

/** Os nomes de um arquivo de agente que a lista de ferramentas não conhece (servidores MCP, `Bash(git diff *)`…). */
export const extraToolNames = (tool: AiTool, names: readonly string[]): string[] => {
  const known = new Set(agentToolNames(tool));
  return names.filter((n) => !known.has(n));
};
