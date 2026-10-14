// Lógica pura do assistente "Criar agente com ajuda": o que sugerir a partir da diretriz (ferramentas, nome,
// modelo) e o rascunho das instruções. A tela só mostra e deixa a pessoa ajustar; nada daqui grava.
import { agentToolGroup } from './agentTools';
import type { AiTool } from './harness';
import { modelValue, type ModelOption } from './models';
import { words } from './skillCatalog';

const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Alguma palavra do texto começa com um dos radicais (`revis` pega revisa, revisar, revisor). */
const hasStem = (text: string, stems: string[]): boolean => {
  const ws = plain(text).split(/[^a-z0-9]+/);
  return ws.some((w) => stems.some((s) => w.startsWith(s)));
};

/** O texto diz que o agente não altera nada: "sem alterar", "somente leitura", "nunca edita". */
const READS_ONLY =
  /\b(sem (alterar|editar|modificar|escrever|mudar)|somente leitura|apenas leitura|so le|so leitura|nunca (altera|edita|modifica|escreve)|nao (altera|edita|modifica|escreve))\b/;

/** Os passos do assistente, na ordem; o nome em português é a chave da tradução. */
export const AGENT_WIZARD_STEPS = [
  'Para que serve',
  'Ferramentas',
  'Servidores MCP',
  'Skills de apoio',
  'Modelo e esforço',
  'Instruções',
  'Resumo',
];

/** Por que cada ferramenta entra na sugestão; a tela traduz. */
export const TOOL_REASONS = {
  Read: 'lê os arquivos do projeto',
  Grep: 'busca texto nos arquivos',
  Glob: 'encontra arquivos pelo nome',
  Edit: 'altera trechos dos arquivos',
  Write: 'cria arquivos novos',
  BashEdit: 'roda comandos do projeto (testes, formatação)',
  BashRun: 'roda os comandos que a tarefa pede',
  BashGit: 'lê o diff com git (instrua o agente a usar só comandos de leitura)',
  WebFetch: 'lê páginas da internet',
  WebSearch: 'pesquisa na web',
} as const;

export interface ToolSuggestion {
  tool: string;
  /** por que ela entra, numa frase */
  reason: string;
}

/**
 * O conjunto mínimo de ferramentas para o que a diretriz descreve. Sempre a leitura (Read, Grep, Glob); o resto
 * só quando a diretriz pede: editar e implementar trazem Edit, Write e Bash; testar e rodar, Bash; pesquisar na
 * web, WebFetch e WebSearch. Nunca sugere Agent: lançar outros agentes amplia o escopo e é decisão da pessoa.
 */
export function suggestAgentTools(directive: string): ToolSuggestion[] {
  const text = plain(directive);
  const out: ToolSuggestion[] = [
    { tool: 'Read', reason: TOOL_REASONS.Read },
    { tool: 'Grep', reason: TOOL_REASONS.Grep },
    { tool: 'Glob', reason: TOOL_REASONS.Glob },
  ];
  const add = (tool: string, reason: string) => {
    if (!out.some((x) => x.tool === tool)) out.push({ tool, reason });
  };
  const readOnly = READS_ONLY.test(text);
  const writes =
    !readOnly &&
    hasStem(text, ['edit', 'implement', 'corrig', 'escrev', 'refator', 'alter', 'atualiz', 'cria', 'gerar', 'migr', 'adicion', 'remov']);
  if (writes) {
    add('Edit', TOOL_REASONS.Edit);
    add('Write', TOOL_REASONS.Write);
    add('Bash', TOOL_REASONS.BashEdit);
  }
  if (hasStem(text, ['test', 'rodar', 'rode', 'execut', 'compil', 'build', 'lint', 'migr', 'script'])) add('Bash', TOOL_REASONS.BashRun);
  // revisar o diff de uma branch precisa do git, e só para ler
  if (/\b(diff|git|commit|branch)\b/.test(text)) add('Bash', TOOL_REASONS.BashGit);
  if (hasStem(text, ['pesquis', 'web', 'internet', 'site', 'busca'])) {
    add('WebFetch', TOOL_REASONS.WebFetch);
    add('WebSearch', TOOL_REASONS.WebSearch);
  }
  return out;
}

/** O nome do arquivo de um agente a partir da frase que o descreve: as primeiras palavras que dizem algo. */
export function nameFromText(text: string, count = 4): string {
  return words(text).slice(0, count).join('-').replace(/-+/g, '-').slice(0, 48).replace(/-$/, '');
}

/** Tamanho aproximado de um modelo pelo nome: os de leitura rápida primeiro, os de raciocínio pesado por último. */
function tier(o: ModelOption): number {
  const name = plain(`${o.model} ${o.label}`);
  if (/haiku|mini|nano|flash|lite|small|fast|luna/.test(name)) return 0;
  if (/opus|fable|sol\b|max|ultra|pro\b|large/.test(name)) return 2;
  return 1;
}

/** Que tipo de trabalho a diretriz descreve, para escolher o modelo: ler e revisar, ou planejar e implementar. */
export function workKind(directive: string): 'light' | 'heavy' {
  return hasStem(plain(directive), ['planej', 'arquitet', 'projet', 'desenh', 'decid', 'implement', 'refator', 'migr', 'escrev', 'corrig'])
    ? 'heavy'
    : 'light';
}

/** Por que o modelo sugerido; a tela traduz. */
export const MODEL_REASONS = {
  light: 'Ler e revisar não pede muito raciocínio: o menor modelo do catálogo com esforço baixo sai mais barato e rápido.',
  heavy: 'Planejar, projetar ou implementar pede mais raciocínio: um modelo maior dá menos retrabalho.',
} as const;

export interface ModelSuggestion {
  /** valor do campo Modelo (`<id>@<esforço>`) */
  value: string;
  reason: string;
}

/**
 * O modelo sugerido: leitura e revisão ficam com o menor do catálogo da ferramenta e esforço baixo; planejamento,
 * arquitetura e implementação, com um maior. O tamanho vem do nome do modelo; sem pista, vale a ordem do catálogo.
 */
export function suggestAgentModel(kind: 'light' | 'heavy', catalog: readonly ModelOption[], tool: AiTool): ModelSuggestion | null {
  const own = catalog.filter((o) => o.tool === tool);
  if (!own.length) return null;
  const sorted = [...own].sort((a, b) => tier(a) - tier(b));
  const pick = kind === 'light' ? sorted[0]! : sorted[sorted.length - 1]!;
  const effort =
    kind === 'light'
      ? (pick.efforts.find((e) => e === 'low') ?? pick.efforts[0] ?? null)
      : (pick.efforts.find((e) => e === 'medium') ?? pick.defaultEffort);
  return {
    value: modelValue(pick.id, effort),
    reason: MODEL_REASONS[kind],
  };
}

/** O que a pessoa respondeu até o passo das instruções. */
export interface InstructionAnswers {
  directive: string;
  tools: string[];
  readonly: boolean;
  skills: string[];
  mcp: string[];
  /** padrões e comandos do projeto que o agente deve seguir, um por linha */
  standards: string;
  /** o que o agente nunca faz, um por linha */
  never: string;
}

const lines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean);

const sentence = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');

/** O rascunho das instruções do agente, a partir das respostas: como trabalha, padrões e o que nunca faz. A pessoa edita. */
export function draftAgentInstructions(tool: AiTool, a: InstructionAnswers): string {
  const edits = a.tools.some((t) => agentToolGroup(tool, t)?.id === 'edit');
  const runs = a.tools.includes('Bash') || a.tools.includes('PowerShell');
  const how = [
    `Faça só isto: ${sentence(a.directive)}.`,
    'Leia os arquivos que a tarefa cita antes de agir; não explore o projeto inteiro.',
    ...(edits ? ['Altere o mínimo necessário e siga o estilo dos arquivos vizinhos.'] : []),
    ...(runs ? ['Rode comandos só quando a tarefa pedir e diga o que rodou.'] : []),
    ...(a.skills.length ? [`Siga as skills ${a.skills.join(', ')} quando o assunto delas aparecer.`] : []),
    ...(a.mcp.length ? [`Use os servidores MCP ${a.mcp.join(', ')} só no que a tarefa pede.`] : []),
    'Termine com um resumo curto do que encontrou ou fez.',
  ];
  const never = [
    ...(!edits || a.readonly ? ['Nunca altere nem crie arquivos.'] : []),
    ...(runs ? ['Nunca rode comandos que mudem o estado do repositório (commit, push, reset, rebase).'] : []),
    'Nunca faça trabalho fora do que foi pedido; se algo parecer necessário, diga em vez de fazer.',
    ...lines(a.never),
  ];
  const parts = [
    '## Como trabalha',
    ...how.map((x) => `- ${x}`),
    ...(lines(a.standards).length ? ['', '## Padrões do projeto', ...lines(a.standards).map((x) => `- ${x}`)] : []),
    '',
    '## O que nunca faz',
    ...never.map((x) => `- ${x}`),
  ];
  return parts.join('\n');
}
