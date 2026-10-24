// As ferramentas locais do modo API (épica "ferramenta por modo", história 11): no modo API não há agente da
// ferramenta, então quem lê, escreve e roda comandos no computador é o próprio board, e só o que a decisão
// do card admite. Esta é a parte pura: o nome da função que o modelo vê, o nome no vocabulário do card
// (Read/Glob/Grep/Write/Edit/Bash, o mesmo do Claude Code, que é o que o card, a admissão e a conferência
// usam) e a categoria do nível de permissão. Quem executa é `src/extension/ai/apiTools.ts`.
import { AGENT_TOOLS, AGENT_TOOLS_ALWAYS_REMOVED, GEMINI_TOOL_EQUIVALENTS, type ToolGroup } from './agentTools';
import type { RunnerPermission } from './runner';

/** As ferramentas de delegação que toda execução do board nega (`Agent`, `Task`…): nomes reconhecidos. */
const SUBAGENT_NAMES = ['Agent', 'Task', 'SendMessage', 'ListAgents'];

/** Uma ferramenta local do modo API. */
export interface ApiLocalTool {
  /** o nome da função declarada ao modelo */
  fn: 'read_file' | 'glob' | 'grep' | 'write_file' | 'edit_file' | 'run_command';
  /** o nome no vocabulário do card: o que `tools`/`deniedTools` e o inventário da conferência usam */
  card: 'Read' | 'Glob' | 'Grep' | 'Write' | 'Edit' | 'Bash';
  /** a categoria do nível: `read` em board, `edit` a partir de edits, `run` só em full */
  category: 'read' | 'edit' | 'run';
}

export const API_LOCAL_TOOLS: readonly ApiLocalTool[] = [
  { fn: 'read_file', card: 'Read', category: 'read' },
  { fn: 'glob', card: 'Glob', category: 'read' },
  { fn: 'grep', card: 'Grep', category: 'read' },
  { fn: 'write_file', card: 'Write', category: 'edit' },
  { fn: 'edit_file', card: 'Edit', category: 'edit' },
  { fn: 'run_command', card: 'Bash', category: 'run' },
];

/** As categorias que cada nível libera: o mesmo recorte do Claude Code na linha de comando e do `boardAllows` do ACP. */
export const API_LEVEL_CATEGORIES: Record<RunnerPermission, readonly ApiLocalTool['category'][]> = {
  board: ['read'],
  edits: ['read', 'edit'],
  full: ['read', 'edit', 'run'],
};

/**
 * A tabela que a admissão lê no modo API (no lugar da tabela de ferramentas embutidas da CLI): as ferramentas
 * locais por categoria, com os nomes do card. É ela que faz a decisão listar `Read`, `Write`, `Bash`… pelo
 * nível, e é dessa lista (menos as negadas) que o laço declara as funções ao modelo.
 */
export const API_TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'read',
    label: 'Leitura',
    hint: 'Lê e busca nas pastas do card.',
    widens: false,
    tools: [
      { name: 'Read', hint: 'Lê arquivos.' },
      { name: 'Glob', hint: 'Encontra arquivos pelo nome ou padrão.' },
      { name: 'Grep', hint: 'Busca texto dentro dos arquivos.' },
    ],
  },
  {
    id: 'edit',
    label: 'Edição de arquivos',
    hint: 'Muda arquivos das pastas do card.',
    widens: true,
    tools: [
      { name: 'Write', hint: 'Cria ou sobrescreve um arquivo.' },
      { name: 'Edit', hint: 'Altera trechos de um arquivo.' },
    ],
  },
  {
    id: 'run',
    label: 'Comandos',
    hint: 'Roda comandos no seu computador.',
    widens: true,
    tools: [{ name: 'Bash', hint: 'Roda um comando, sem shell, na pasta do card.' }],
  },
];

type Card = ApiLocalTool['card'];
const READ_GROUP: Card[] = ['Read', 'Glob', 'Grep'];
const EDIT_GROUP: Card[] = ['Write', 'Edit'];
const RUN_GROUP: Card[] = ['Bash'];

/**
 * O que cada nome negado tira das ferramentas locais, com a semântica de grupo do Claude Code (as regras de
 * `Read` valem para `Glob` e `Grep`; as de `Edit` valem para toda ferramenta que edita arquivo,
 * code.claude.com/docs/en/settings, "Permission rules"), e na dúvida o grupo inteiro: negar `Write` também
 * nega `Edit`, porque as duas reescrevem o conteúdo de um arquivo. Os nomes vêm do vocabulário do card (o do
 * Claude Code), do Gemini CLI (`AGENT_TOOLS.gemini`, mais `search_file_content`, o nome anterior do
 * `grep_search`) e das próprias funções locais. As chaves são minúsculas: a comparação não diferencia.
 */
const DENY_GROUPS: Record<string, Card[]> = {
  // vocabulário do card (Claude Code)
  read: READ_GROUP,
  glob: ['Glob'],
  grep: ['Grep'],
  write: EDIT_GROUP,
  edit: EDIT_GROUP,
  multiedit: EDIT_GROUP,
  notebookedit: EDIT_GROUP,
  // nomes anteriores do Claude Code: listar a pasta e ler o notebook
  ls: ['Glob'],
  notebookread: READ_GROUP,
  bash: RUN_GROUP,
  powershell: RUN_GROUP,
  monitor: RUN_GROUP,
  // Gemini CLI
  read_file: READ_GROUP,
  read_many_files: READ_GROUP,
  list_directory: ['Glob'],
  grep_search: ['Grep'],
  search_file_content: ['Grep'],
  replace: EDIT_GROUP,
  write_file: EDIT_GROUP,
  run_shell_command: RUN_GROUP,
  // as funções locais do modo API
  edit_file: EDIT_GROUP,
  run_command: RUN_GROUP,
};

/**
 * Os nomes de ferramenta que o board reconhece numa negada do card, na grafia de cada ferramenta: as tabelas de
 * agente de cada ferramenta (o `FetchURL` do Kimi, os nomes do Gemini), os que o Gemini CLI registra sozinho, a
 * delegação e os nomes do Claude Code fora da tabela. O modo API os lê sem diferenciar maiúsculas
 * (`deniedLocal`); o ACP, na grafia exata (`isCardToolName`), porque lá a negada é comparada com equivalentes.
 */
export const KNOWN_TOOL_NAMES: readonly string[] = [
  ...Object.values(AGENT_TOOLS).flatMap((groups) => groups.flatMap((g) => g.tools.map((t) => t.name))),
  // os que o Gemini CLI registra sozinho (história 8: `save_memory`, o tópico, o modo de plano…)
  ...Object.keys(GEMINI_TOOL_EQUIVALENTS),
  ...SUBAGENT_NAMES,
  // as que a tabela de agentes deixa de fora de propósito (o Claude Code sempre as tira de um subagente)
  ...AGENT_TOOLS_ALWAYS_REMOVED,
  // outros nomes do Claude Code que um card nega sem tirar nada daqui: o acompanhamento e o fim de um
  // comando em segundo plano (o comando em si é `Bash`), o modo de plano, a pergunta e os comandos
  // (code.claude.com/docs/en/tools-reference e nomes anteriores)
  'KillShell',
  'KillBash',
  'BashOutput',
  'SlashCommand',
  'TodoRead',
  // os nomes do Claude Code que `DENY_GROUPS` traz em minúsculas (anteriores ou fora da tabela)
  'MultiEdit',
  'LS',
  'NotebookRead',
];

/** Um nome MCP numa negada: `mcp__servidor`, `mcp__servidor__ferramenta` ou `mcp__servidor__prefixo*`, com ponto no servidor. */
export const MCP_DENY_ENTRY = /^mcp__[a-z0-9_.-]+(__[a-z0-9_.*-]+)?$/i;

/** Os nomes que o board reconhece e que não tiram nada das ferramentas locais (rede, delegação, skills…). */
const KNOWN_ELSEWHERE = new Set(KNOWN_TOOL_NAMES.map((n) => n.toLowerCase()));

/**
 * As ferramentas locais que uma entrada de `deniedTools` do card tira. Vale o nome (sem diferenciar
 * maiúsculas) ou uma regra com argumento (`Bash(git push *)`), que nega a ferramenta inteira: o board não
 * casa argumentos com a precisão da CLI, e na dúvida vale o mais restrito. Uma ferramenta MCP
 * (`mcp__servidor__ferramenta`) ou um nome conhecido de outro grupo não tira nada daqui. `null` = o nome não
 * é reconhecido: a admissão do modo API recusa a execução, em vez de adivinhar o que ele queria negar.
 */
export function deniedLocal(entry: string): Card[] | null {
  const name = entry
    .trim()
    .replace(/\(.*\)$/s, '')
    .trim()
    .toLowerCase();
  if (!name) return null;
  if (Object.hasOwn(DENY_GROUPS, name)) return DENY_GROUPS[name]!;
  // `mcp__servidor` (o servidor inteiro) ou `mcp__servidor__ferramenta`, com ponto no servidor (`claude.ai`)
  if (MCP_DENY_ENTRY.test(name) || KNOWN_ELSEWHERE.has(name)) return [];
  return null;
}

/** Se uma entrada de `deniedTools` nega a ferramenta local `card`. O nome não reconhecido nega todas (fechar na dúvida). */
export const deniesTool = (entry: string, card: string): boolean => {
  const denied = deniedLocal(entry);
  return denied === null || denied.includes(card as Card);
};

/**
 * As ferramentas locais que uma execução admitida declara ao modelo: as da categoria do nível, que a decisão
 * listou (`tools`, quando a lista é explícita) e que o card não nega (`deniedTools`). Pura: a mesma pergunta
 * vale na declaração e de novo em cada chamada.
 */
export function apiLocalTools(
  permission: RunnerPermission,
  exec: { tools?: readonly string[]; toolSet?: 'explicit'; deniedTools?: readonly string[] } | undefined,
): ApiLocalTool[] {
  const level = API_LEVEL_CATEGORIES[permission] ?? [];
  return API_LOCAL_TOOLS.filter(
    (t) =>
      level.includes(t.category) &&
      // a lista explícita da admissão é a fronteira: [] é nenhuma ferramenta local
      (exec?.toolSet !== 'explicit' || (exec.tools ?? []).includes(t.card)) &&
      !(exec?.deniedTools ?? []).some((entry) => deniesTool(entry, t.card)),
  );
}
