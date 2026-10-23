// As ferramentas locais do modo API (épica "ferramenta por modo", história 11): no modo API não há agente da
// ferramenta, então quem lê, escreve e roda comandos no computador é o próprio board, e só o que a decisão
// do card admite. Esta é a parte pura: o nome da função que o modelo vê, o nome no vocabulário do card
// (Read/Glob/Grep/Write/Edit/Bash, o mesmo do Claude Code, que é o que o card, a admissão e a conferência
// usam) e a categoria do nível de permissão. Quem executa é `src/extension/ai/apiTools.ts`.
import type { ToolGroup } from './agentTools';
import type { RunnerPermission } from './runner';

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

/**
 * Se uma entrada de `deniedTools` do card nega a ferramenta: o nome exato (`Bash`) ou uma regra com argumento
 * (`Bash(git push *)`). O board não sabe casar a regra com os argumentos com a precisão da CLI, então ela
 * nega a ferramenta inteira: na dúvida, o mais restrito.
 */
export const deniesTool = (entry: string, card: string): boolean => entry === card || entry.startsWith(`${card}(`);

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
