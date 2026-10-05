import { z } from 'zod';
import { ALL_AI_TOOLS, RULE_FILES, type AiTool } from '../../../shared/harness';
import { FLOW_SKILL } from '../../flowSkill';
import type { MessageRouter } from '../../panel/messageRouter';
import { harnessOverview } from '../format';
import type { DefineTool } from './registry';

const ruleArg = z.enum(RULE_FILES.map((r) => r.name) as [string, ...string[]]).describe('Arquivo de regras na raiz do projeto');
const skillArg = z.string().describe('Nome da skill (nome da pasta), ex.: "revisar-spec"');
const agentArg = z.string().describe('Nome do agente (nome do arquivo, sem a extensão), ex.: "revisor-de-spec"');

const harness = (router: MessageRouter) => harnessOverview(router.snapshot());

/** Skill do projeto pelo nome; lança se não existir. */
const skill = (router: MessageRouter, name: string) => {
  const k = router.snapshot().harness.skills.find((x) => x.name === name);
  if (!k) throw new Error(`Skill "${name}" não encontrada.`);
  return k;
};

/** Agente do projeto pelo nome; lança com a lista dos existentes. */
const agent = (router: MessageRouter, name: string) => {
  const found = router.snapshot().harness.agents.find((x) => x.name === name);
  if (!found)
    throw new Error(
      `Agente "${name}" não encontrado. Existentes: ${
        router
          .snapshot()
          .harness.agents.map((x) => `"${x.name}"`)
          .join(', ') || 'nenhum'
      }.`,
    );
  return found;
};

/** Harness do projeto: ferramenta de IA, arquivos de regras, skills e agentes. */
export function registerHarnessTools(tool: DefineTool): void {
  // ---------- regras e skills ----------

  tool(
    'get_harness',
    'Lista o harness de IA do projeto: a ferramenta em uso, os arquivos de regras (CLAUDE.md, AGENTS.md), as skills dela, ligadas e desligadas, e os agentes, com descrição e caminho.',
    {},
    (_a, router) => harness(router),
    true,
  );

  tool(
    'set_ai_tool',
    'Define a ferramenta de IA com que o projeto trabalha (uma por vez). Isso troca a pasta de skills (.claude/skills, .agents/skills, .cursor/skills, .kimi-code/skills ou .github/skills), o arquivo de regras, os modelos e as regras de esforço.',
    { tool: z.enum(ALL_AI_TOOLS as [string, ...string[]]) },
    (a, router) => {
      router.handle({ type: 'settings.board.update', patch: { aiTool: a.tool as AiTool } });
      return harness(router);
    },
  );

  tool(
    'read_rule_file',
    'Lê um arquivo de regras do projeto.',
    { file: ruleArg },
    (a, router) => {
      const r = router.snapshot().harness.rules.find((x) => x.name === a.file);
      if (!r?.exists) throw new Error(`${a.file} não existe neste projeto.`);
      return r.content;
    },
    true,
  );

  tool(
    'write_rule_file',
    'Cria ou substitui por inteiro um arquivo de regras do projeto.',
    { file: ruleArg, content: z.string() },
    (a, router) => {
      router.handle({ type: 'harness.rule.write', name: a.file, content: a.content });
      return harness(router);
    },
  );

  tool('delete_rule_file', 'Apaga um arquivo de regras do projeto. Não pode ser desfeito pelo board.', { file: ruleArg }, (a, router) => {
    router.handle({ type: 'harness.rule.delete', name: a.file });
    return harness(router);
  });

  tool(
    'get_skill',
    'Lê o SKILL.md completo de uma skill do projeto.',
    { skill: skillArg },
    (a, router) => skill(router, a.skill).content,
    true,
  );

  tool(
    'create_skill',
    'Cria uma skill no projeto, na pasta de skills da ferramenta de IA em uso. Ela passa a ser uma opção do campo "Skills" dos cards.',
    {
      name: z.string().describe('Letras minúsculas, números e hífens'),
      description: z.string().min(1).describe('Quando a skill deve ser usada; é por ela que a IA decide invocá-la'),
      content: z.string().describe('Instruções da skill em markdown (sem o frontmatter)'),
    },
    (a, router) => {
      router.handle({ type: 'harness.skill.create', name: a.name, description: a.description, content: a.content });
      return harness(router);
    },
  );

  tool(
    'install_flow_skill',
    'Instala a skill "faz-ai-fluxo", que ensina a conduzir os cards pelo fluxo do board (fases, documentos, revisão, pendências). O padrão é o escopo global da ferramenta (vale em todos os projetos da pessoa); "project" instala só neste projeto. Não sobrescreve uma skill de mesmo nome no destino, a menos que replace seja true.',
    {
      tool: z.enum(ALL_AI_TOOLS).optional().describe('Ferramenta de IA; padrão: a do projeto'),
      scope: z.enum(['user', 'project']).optional().describe('"user" (global, padrão) ou "project" (só neste projeto)'),
      replace: z.boolean().optional().describe('Troca a skill de mesmo nome que já esteja no destino'),
    },
    (a, router) => {
      const tool = a.tool ?? router.snapshot().board.aiTool;
      const scope = a.scope ?? 'user';
      const found = () =>
        router
          .snapshot()
          .harness.inventory.find((t) => t.tool === tool)
          ?.items.find((i) => i.kind === 'skill' && i.scope === scope && i.name === FLOW_SKILL.name);
      const had = !!found();
      router.handle({ type: 'harness.flowSkill.install', tool, scope, replace: a.replace });
      return {
        installed: !had || !!a.replace,
        note: had && !a.replace ? 'A skill já existia no destino e foi mantida como está.' : had ? 'Skill substituída.' : 'Skill criada.',
        skill: found()?.path,
      };
    },
  );

  tool(
    'update_skill',
    'Substitui o SKILL.md inteiro de uma skill, incluindo o frontmatter (name, description).',
    { skill: skillArg, content: z.string().min(1) },
    (a, router) => {
      skill(router, a.skill);
      router.handle({ type: 'harness.skill.write', name: a.skill, content: a.content });
      return harness(router);
    },
  );

  tool(
    'set_skill_enabled',
    'Liga ou desliga uma skill. Desligada, ela sai da pasta que as ferramentas de IA leem (economiza contexto) mas o conteúdo é preservado.',
    { skill: skillArg, enabled: z.boolean() },
    (a, router) => {
      skill(router, a.skill);
      router.handle({ type: 'harness.skill.setEnabled', name: a.skill, enabled: a.enabled });
      return harness(router);
    },
  );

  tool(
    'delete_skill',
    'Apaga uma skill do projeto, com todos os arquivos da pasta. Não pode ser desfeito pelo board.',
    { skill: skillArg },
    (a, router) => {
      skill(router, a.skill);
      router.handle({ type: 'harness.skill.delete', name: a.skill });
      return harness(router);
    },
  );

  tool(
    'write_skill_file',
    'Grava um arquivo de apoio numa skill do projeto: um modelo de classe ou exemplo de código em `references/`, um modelo de arquivo em `assets/` ou um script em `scripts/`. Substitui o arquivo se ele já existir. Para a IA ler o arquivo quando usar a skill, o SKILL.md precisa apontar para ele (use update_skill).',
    {
      skill: z.string().describe('Nome da skill do projeto'),
      file: z.string().describe('Caminho dentro da pasta da skill, ex.: "references/modelo-de-repositorio.ts"'),
      content: z.string(),
    },
    (a, router) => {
      router.writeSkillFile(a.skill, a.file, a.content);
      return harnessOverview(router.snapshot()).inventory.find((i) => i.kind === 'skill' && i.scope === 'project' && i.name === a.skill);
    },
  );

  // ---------- agentes ----------

  tool(
    'get_agent',
    'Lê o arquivo completo de um agente (subagente) do projeto, listado em get_harness.',
    { agent: agentArg },
    (a, router) => agent(router, a.agent).content,
    true,
  );

  tool(
    'create_agent',
    'Cria um agente (subagente) no projeto, na pasta de agentes da ferramenta de IA em uso. A ferramenta delega trabalho a ele pela descrição.',
    {
      name: z.string().describe('Letras minúsculas, números e hífens'),
      description: z.string().min(1).describe('Quando delegar a este agente; é por ela que a IA decide usá-lo'),
      content: z.string().describe('Instruções do agente em markdown (sem o frontmatter)'),
      model: z
        .string()
        .optional()
        .describe('Modelo fixado no agente, no formato que a ferramenta aceita no frontmatter; sem ele o agente usa o modelo da sessão'),
    },
    (a, router) => {
      router.handle({ type: 'harness.agent.create', name: a.name, description: a.description, content: a.content, model: a.model });
      return harness(router);
    },
  );

  tool(
    'update_agent',
    'Substitui o arquivo inteiro de um agente, incluindo o frontmatter.',
    { agent: agentArg, content: z.string().min(1) },
    (a, router) => {
      agent(router, a.agent);
      router.handle({ type: 'harness.agent.write', name: a.agent, content: a.content });
      return harness(router);
    },
  );

  tool('delete_agent', 'Apaga um agente do projeto. Não pode ser desfeito pelo board.', { agent: agentArg }, (a, router) => {
    agent(router, a.agent);
    router.handle({ type: 'harness.agent.delete', name: a.agent });
    return harness(router);
  });
}
