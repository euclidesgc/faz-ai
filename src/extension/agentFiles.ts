import type { Agent, AgentSpec } from '../shared/harness';
import type { AgentInput } from '../shared/messages';
import { BOARD_TOOLS, withBoardTools } from '../shared/execution';
import { frontmatterOf, frontmatterValue } from './frontmatter';

/**
 * Arquivo de agente da ferramenta, lido e escrito pelo board: markdown com frontmatter YAML (Claude
 * Code e Cursor). As chaves `description`, `tools`, `disallowedTools`, `model` e `skills` são as que a
 * própria ferramenta entende; o board guarda o que é só dele em chaves `faz-ai-*`, planas, que as
 * ferramentas ignoram: `faz-ai-model` (o valor do campo Modelo, com esforço), `faz-ai-mcp` (servidores
 * além do do board) e `faz-ai-seed` (criado de fábrica).
 */

const list = (raw: string | undefined): string[] =>
  (raw ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((x) => x.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);

/** Valor de uma chave do frontmatter que pode ser uma lista em linha (`a, b`, `[a, b]`) ou em bloco (`- a`). */
function frontmatterList(fm: string, key: string): string[] {
  const inline = frontmatterValue(fm, key);
  if (inline) return list(inline);
  const lines = fm.split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^${key}:\\s*$`).test(l));
  if (at < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    const m = /^\s+-\s*(.+?)\s*$/.exec(l);
    if (!m) break;
    out.push(m[1]!.replace(/^["']|["']$/g, ''));
  }
  return out;
}

/**
 * A pasta de agentes é a do Claude Code: só ele lê `mcp__<servidor>__*` na lista de ferramentas. No
 * arquivo, a lista vai sempre com as do servidor do board (uma lista fechada deixaria o board de fora
 * quando o agente roda no chat do editor); na leitura ela sai, e a pessoa só vê e edita o resto.
 */
const readsBoardTools = (spec: AgentSpec): boolean => spec.dir.startsWith('.claude/');

/** O `model` nativo que vai no frontmatter: o id do modelo, sem a ferramenta nem o esforço (`claude:sonnet@medium` → `sonnet`). */
export const nativeModelOf = (modelValue: string): string => modelValue.replace(/@.*$/, '').replace(/^[^:]+:/, '');

/** O arquivo de agente tem lista de ferramentas sem as do servidor do board: foi gravado antes desta regra. */
export const lacksBoardTools = (spec: AgentSpec, a: Agent): boolean =>
  readsBoardTools(spec) && a.tools.length > 0 && !frontmatterList(frontmatterOf(a.content), 'tools').includes(BOARD_TOOLS);

/** Lê um arquivo de agente. `scope`, `path` e `location` vêm de quem o encontrou. */
export function parseAgentFile(
  _spec: AgentSpec,
  found: { name: string; scope: 'project' | 'user'; path: string; location: string },
  content: string,
): Agent {
  const fm = frontmatterOf(content);
  const body = fm ? content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : content;
  return {
    ...found,
    content,
    description: frontmatterValue(fm, 'description') ?? '',
    model: frontmatterValue(fm, 'model') ?? '',
    modelValue: frontmatterValue(fm, 'faz-ai-model') ?? '',
    body: body.trim(),
    tools: frontmatterList(fm, 'tools').filter((t) => t !== BOARD_TOOLS),
    deniedTools: frontmatterList(fm, 'disallowedTools'),
    skills: frontmatterList(fm, 'skills'),
    mcp: frontmatterList(fm, 'faz-ai-mcp'),
    seed: frontmatterValue(fm, 'faz-ai-seed') === 'true',
  };
}

/**
 * Escreve o arquivo de um agente com tudo o que o board sabe dele. Os textos livres vão entre aspas
 * (uma string JSON é YAML válido): a ferramenta lê o arquivo com um parser de YAML, e uma descrição
 * com `:` sem aspas o derruba.
 */
export function renderAgentFile(spec: AgentSpec, input: AgentInput, seed = false): string {
  const oneLine = input.description.replace(/\r?\n/g, ' ').trim();
  const tools = readsBoardTools(spec) ? withBoardTools(input.tools) : input.tools;
  const native = input.model.trim() ? nativeModelOf(input.model.trim()) : '';
  const body = input.body.trim();
  const lines = [
    `name: ${JSON.stringify(input.name)}`,
    `description: ${JSON.stringify(oneLine)}`,
    ...(tools.length ? [`tools: ${tools.join(', ')}`] : []),
    ...(input.deniedTools.length ? [`disallowedTools: ${input.deniedTools.join(', ')}`] : []),
    ...(native ? [`model: ${native}`] : []),
    ...(input.skills.length ? [`skills: ${input.skills.join(', ')}`] : []),
    ...(input.model.trim() ? [`faz-ai-model: ${JSON.stringify(input.model.trim())}`] : []),
    ...(input.mcp.length ? [`faz-ai-mcp: ${input.mcp.join(', ')}`] : []),
    ...(seed ? ['faz-ai-seed: true'] : []),
  ];
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

/** O que o board sabe de um agente lido, no formato de entrada (para editar e regravar). */
export const agentInputOf = (a: Agent): AgentInput => ({
  name: a.name,
  description: a.description,
  body: a.body,
  model: a.modelValue,
  tools: a.tools,
  deniedTools: a.deniedTools,
  skills: a.skills,
  mcp: a.mcp,
});
