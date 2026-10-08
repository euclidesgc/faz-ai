// Regras do harness do projeto (arquivos de regras, skills e agentes da ferramenta em uso), sem React.
import { RULE_FILES, SKILL_NAME_PATTERN, aiToolInfo, type AiTool, type RuleFile, type Skill, type ToolInventory } from './harness';

/** O que o board sabe de uma ferramenta de IA (um item de AI_TOOLS). */
export type AiToolInfo = ReturnType<typeof aiToolInfo>;

/** Nome da skill que ensina a IA a conduzir os cards pelo fluxo do board. */
export const FLOW_SKILL_NAME = 'faz-ai-fluxo';

/** Normaliza o nome digitado de uma skill ou agente: minúsculas, sem acentos (`padrão` → `padrao`), e o que não é letra, número ou hífen vira hífen. */
export const toItemName = (raw: string): string =>
  raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');

/** Nome válido para uma skill ou agente e ainda não usado por nenhum de `taken`. */
export const isFreeName = (name: string, taken: readonly { name: string }[]): boolean =>
  SKILL_NAME_PATTERN.test(name) && !taken.some((t) => t.name === name);

/** Arquivos de regras mostrados: o da ferramenta em uso; com o Claude Code, também o AGENTS.md existente, que pode ser importado. */
export const visibleRules = (rules: readonly RuleFile[], tool: AiToolInfo): RuleFile[] =>
  rules.filter((r) => r.name === tool.rules || (tool.id === 'claude' && r.name === 'AGENTS.md' && r.exists));

/** Ferramentas que leem um arquivo de regras. */
export const ruleReadBy = (name: string): string | undefined => RULE_FILES.find((x) => x.name === name)?.readBy;

/** O CLAUDE.md pode nascer só importando o AGENTS.md: quando ele ainda não existe e o AGENTS.md sim. */
export const canImportAgentsMd = (rule: RuleFile, rules: readonly RuleFile[]): boolean =>
  rule.name === 'CLAUDE.md' && !rule.exists && !!rules.find((r) => r.name === 'AGENTS.md')?.exists;

/** Caminhos dos SKILL.md como o inventário os lista: é por eles que o modo é gravado. Skills fora do inventário ficam de fora. */
export const skillInventoryPaths = (inventory: readonly ToolInventory[], tool: AiTool, skills: readonly Skill[]): string[] => {
  const items = inventory.find((t) => t.tool === tool)?.items ?? [];
  return skills
    .map((k) => items.find((i) => i.kind === 'skill' && i.scope === 'project' && i.location === k.path)?.path)
    .filter((p): p is string => !!p);
};

/** Skills ligadas que a IA pode invocar sozinha. */
export const automaticSkills = (skills: readonly Skill[]): Skill[] => skills.filter((k) => k.enabled && k.mode === 'auto');
