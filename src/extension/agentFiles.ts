import type { Agent, AgentSpec } from '../shared/harness';
import type { AgentInput } from '../shared/messages';
import { frontmatterOf, frontmatterValue } from './frontmatter';

/**
 * Arquivo de agente da ferramenta, lido e escrito pelo board. No markdown (Claude Code, Cursor, Kimi,
 * Copilot) as chaves `description`, `tools`, `disallowedTools`, `model` e `skills` são as que a própria
 * ferramenta entende; o board guarda o que é só dele em chaves `faz-ai-*`, planas, que as ferramentas
 * ignoram: `faz-ai-model` (o valor do campo Modelo, com esforço), `faz-ai-mcp` (servidores além do do
 * board) e `faz-ai-seed` (criado de fábrica). No TOML do Codex as mesmas chaves vão como `faz_ai_*`,
 * e as instruções em `developer_instructions`.
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

const tomlString = (text: string, key: string): string =>
  new RegExp(`^${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm').exec(text)?.[1]?.replace(/\\(.)/g, '$1') ?? '';

const tomlBlock = (text: string, key: string): string =>
  new RegExp(`^${key}\\s*=\\s*"""\\r?\\n([\\s\\S]*?)\\r?\\n"""`, 'm').exec(text)?.[1] ?? '';

const tomlBool = (text: string, key: string): boolean => new RegExp(`^${key}\\s*=\\s*true\\s*$`, 'm').test(text);

/** O `model` nativo que vai no frontmatter: o id do modelo, sem a ferramenta nem o esforço (`claude:sonnet@medium` → `sonnet`). */
export const nativeModelOf = (modelValue: string): string => modelValue.replace(/@.*$/, '').replace(/^[^:]+:/, '');

/** Lê um arquivo de agente nos dois formatos. `scope`, `path` e `location` vêm de quem o encontrou. */
export function parseAgentFile(
  spec: AgentSpec,
  found: { name: string; scope: 'project' | 'user'; path: string; location: string },
  content: string,
): Agent {
  if (spec.format === 'toml') {
    return {
      ...found,
      content,
      description: tomlString(content, 'description'),
      model: spec.modelField ? tomlString(content, spec.modelField) : '',
      modelValue: tomlString(content, 'faz_ai_model'),
      body: tomlBlock(content, 'developer_instructions').trim(),
      tools: list(tomlString(content, 'faz_ai_tools')),
      deniedTools: list(tomlString(content, 'faz_ai_denied_tools')),
      skills: list(tomlString(content, 'faz_ai_skills')),
      mcp: list(tomlString(content, 'faz_ai_mcp')),
      seed: tomlBool(content, 'faz_ai_seed'),
    };
  }
  const fm = frontmatterOf(content);
  const body = fm ? content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : content;
  return {
    ...found,
    content,
    description: frontmatterValue(fm, 'description') ?? '',
    model: (spec.modelField && frontmatterValue(fm, spec.modelField)) || '',
    modelValue: frontmatterValue(fm, 'faz-ai-model') ?? '',
    body: body.trim(),
    tools: frontmatterList(fm, 'tools'),
    deniedTools: frontmatterList(fm, 'disallowedTools'),
    skills: frontmatterList(fm, 'skills'),
    mcp: frontmatterList(fm, 'faz-ai-mcp'),
    seed: frontmatterValue(fm, 'faz-ai-seed') === 'true',
  };
}

/** Escreve o arquivo de um agente no formato da ferramenta, com tudo o que o board sabe dele. */
export function renderAgentFile(spec: AgentSpec, input: AgentInput, seed = false): string {
  const oneLine = input.description.replace(/\r?\n/g, ' ').trim();
  const native = spec.modelField && input.model.trim() ? nativeModelOf(input.model.trim()) : '';
  const body = input.body.trim();
  if (spec.format === 'toml') {
    // strings JSON são strings básicas válidas em TOML
    const lines = [
      `name = ${JSON.stringify(input.name)}`,
      `description = ${JSON.stringify(oneLine)}`,
      ...(native ? [`${spec.modelField} = ${JSON.stringify(native)}`] : []),
      ...(input.model.trim() ? [`faz_ai_model = ${JSON.stringify(input.model.trim())}`] : []),
      ...(input.tools.length ? [`faz_ai_tools = ${JSON.stringify(input.tools.join(', '))}`] : []),
      ...(input.deniedTools.length ? [`faz_ai_denied_tools = ${JSON.stringify(input.deniedTools.join(', '))}`] : []),
      ...(input.skills.length ? [`faz_ai_skills = ${JSON.stringify(input.skills.join(', '))}`] : []),
      ...(input.mcp.length ? [`faz_ai_mcp = ${JSON.stringify(input.mcp.join(', '))}`] : []),
      ...(seed ? ['faz_ai_seed = true'] : []),
    ];
    return `${lines.join('\n')}\ndeveloper_instructions = """\n${body.replace(/"""/g, "'''")}\n"""\n`;
  }
  const lines = [
    `name: ${input.name}`,
    `description: ${oneLine}`,
    ...(input.tools.length ? [`tools: ${input.tools.join(', ')}`] : []),
    ...(input.deniedTools.length ? [`disallowedTools: ${input.deniedTools.join(', ')}`] : []),
    ...(native ? [`${spec.modelField}: ${native}`] : []),
    ...(input.skills.length ? [`skills: ${input.skills.join(', ')}`] : []),
    ...(input.model.trim() ? [`faz-ai-model: ${input.model.trim()}`] : []),
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
