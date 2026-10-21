import type { Agent, AgentSpec } from '../shared/harness';
import type { AgentInput } from '../shared/messages';
import { BOARD_TOOLS, withBoardTools } from '../shared/execution';
import { frontmatterOf } from './frontmatter';
import { frontmatterList, isCursor, parseAgentFile } from './artifactSource';

export { parseAgentFile };

/**
 * Arquivo de agente da ferramenta, lido e escrito pelo board: markdown com frontmatter YAML (Claude
 * Code e Cursor). As chaves `description`, `tools`, `disallowedTools`, `model` e `skills` são as que a
 * própria ferramenta entende; o board guarda o que é só dele em chaves `faz-ai-*`, planas, que as
 * ferramentas ignoram: `faz-ai-model` (o valor do campo Modelo, com esforço), `faz-ai-mcp` (servidores
 * além do do board) e `faz-ai-seed` (criado de fábrica). O Cursor guarda `readonly` e `is_background`
 * (cursor.com/docs/context/subagents, lida em 2026-10-14); ele não tem lista de ferramentas, skills nem MCP por
 * subagente, e essas chaves só são lidas e gravadas na pasta dele.
 */

/**
 * A pasta de agentes é de uma ferramenta que lê `mcp__<servidor>__*` na lista de ferramentas (o
 * Claude Code; o Kimi Code, que aceita os mesmos globs no frontmatter — documentação da CLI 2.1.1).
 * No arquivo, a lista vai sempre com as do servidor do board (uma lista fechada deixaria o board de
 * fora quando o agente roda na conversa da ferramenta); na leitura ela sai, e a pessoa só vê e edita
 * o resto.
 */
const readsBoardTools = (spec: AgentSpec): boolean => spec.dir.startsWith('.claude/') || spec.dir.startsWith('.kimi-code/');

/** O `model` nativo que vai no frontmatter: o id do modelo, sem a ferramenta nem o esforço (`claude:sonnet@medium` → `sonnet`). */
/** O Kimi Code ignora `model:` e `skills:` no arquivo de agente e lê `subagents` (documentação da CLI 2.1.1). */
const isKimi = (spec: AgentSpec): boolean => spec.dir.startsWith('.kimi-code/');

export const nativeModelOf = (modelValue: string): string => modelValue.replace(/@.*$/, '').replace(/^[^:]+:/, '');

/** O arquivo de agente tem lista de ferramentas sem as do servidor do board: foi gravado antes desta regra. */
export const lacksBoardTools = (spec: AgentSpec, a: Agent): boolean =>
  readsBoardTools(spec) && a.tools.length > 0 && !frontmatterList(frontmatterOf(a.content), 'tools').includes(BOARD_TOOLS);

/**
 * Escreve o arquivo de um agente com tudo o que o board sabe dele. Os textos livres vão entre aspas
 * (uma string JSON é YAML válido): a ferramenta lê o arquivo com um parser de YAML, e uma descrição
 * com `:` sem aspas o derruba.
 */
export function renderAgentFile(spec: AgentSpec, input: AgentInput, seed = false): string {
  const oneLine = input.description.replace(/\r?\n/g, ' ').trim();
  const tools = readsBoardTools(spec) ? withBoardTools(input.tools) : input.tools;
  const native = input.model.trim() && !isKimi(spec) ? nativeModelOf(input.model.trim()) : '';
  const body = input.body.trim();
  const lines = [
    `name: ${JSON.stringify(input.name)}`,
    `description: ${JSON.stringify(oneLine)}`,
    ...(tools.length ? [`tools: ${tools.join(', ')}`] : []),
    ...(input.deniedTools.length ? [`disallowedTools: ${input.deniedTools.join(', ')}`] : []),
    ...(native ? [`model: ${native}`] : []),
    ...(isCursor(spec) && input.readonly ? ['readonly: true'] : []),
    ...(isCursor(spec) && input.background ? ['is_background: true'] : []),
    ...(isKimi(spec) && tools.includes('Agent') ? ['subagents: "*"'] : []),
    ...(input.skills.length && !isKimi(spec) ? [`skills: ${input.skills.join(', ')}`] : []),
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
  ...(a.readonly ? { readonly: true } : {}),
  ...(a.background ? { background: true } : {}),
});
