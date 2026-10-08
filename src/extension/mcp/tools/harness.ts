import { z } from 'zod';
import { ALL_AI_TOOLS, RULE_FILES, type AiTool, type InstallScope } from '../../../shared/harness';
import { SELECTABLE_KINDS, type HarnessUsage, type SelectableKind } from '../../../shared/harnessSelection';
import { FLOW_SKILL } from '../../flowSkill';
import type { MessageRouter } from '../../panel/messageRouter';
import { harnessOverview } from '../format';
import type { DefineTool } from './registry';

const ruleArg = z.enum(RULE_FILES.map((r) => r.name) as [string, ...string[]]).describe('Arquivo de regras na raiz do projeto');
const skillArg = z.string().describe('Nome da skill (nome da pasta), ex.: "revisar-spec"');
const agentArg = z.string().describe('Nome do agente (nome do arquivo, sem a extensão), ex.: "revisor-de-spec"');

const harness = (router: MessageRouter) => harnessOverview(router.snapshot());
const scopeArg = z.enum(['user', 'project']).optional().describe('"user" (pasta do usuário, o padrão) ou "project" (só neste projeto)');
const listArg = (what: string) => z.array(z.string()).optional().describe(what);

/** Skill do projeto pelo nome; lança se não existir. */
const skill = (router: MessageRouter, name: string) => {
  const k = router.snapshot().harness.skills.find((x) => x.name === name);
  if (!k) throw new Error(`Skill "${name}" não encontrada.`);
  return k;
};

/** Agente pelo nome (e escopo, quando informado); lança com a lista dos existentes. */
const agent = (router: MessageRouter, name: string, scope?: InstallScope) => {
  const all = router.snapshot().harness.agents.filter((x) => x.name === name && (!scope || x.scope === scope));
  // com o mesmo nome nos dois escopos, vale o do projeto (como na execução)
  const found = all.find((x) => x.scope === 'project') ?? all[0];
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
    'O harness que as execuções do board usam: a ferramenta em uso, o agente padrão e, com a marcação (`usage`), as rules, skills e agentes marcados em Configurações → Harness. Toda execução parte de contexto vazio: o que não está marcado não existe para ela. Com onlySelected = false, lista tudo que a ferramenta carrega nesta máquina (projeto, pasta do usuário e plugins), marcado ou não.',
    {
      onlySelected: z
        .boolean()
        .optional()
        .describe('Padrão true: só o marcado. false: tudo que a ferramenta carrega, com a marcação de cada item'),
    },
    (a, router) => harnessOverview(router.snapshot(), a.onlySelected ?? true),
    true,
  );

  tool(
    'set_harness_selection',
    'Marca (ou desmarca) rules, skills e agentes para as execuções do board. "always": entra em toda execução; "contextual": disponível para indicar no card (campos Rules e Skills) ou escolher como agente; null: desmarca. Identifique o item por `location`, como get_harness o mostra (relativo ao projeto ou a partir de ~); um agente ou uma skill também pelo nome.',
    {
      items: z
        .array(
          z.object({
            kind: z.enum(SELECTABLE_KINDS as [SelectableKind, ...SelectableKind[]]),
            location: z.string().optional().describe('Caminho como em get_harness'),
            name: z.string().optional().describe('Nome do agente ou da skill, quando não souber o caminho'),
          }),
        )
        .min(1),
      usage: z.enum(['always', 'contextual']).nullable(),
    },
    (a, router) => {
      const s = router.snapshot();
      const items = s.harness.inventory.find((t) => t.tool === s.board.aiTool)?.items ?? [];
      const resolved = a.items.map((i) => {
        const found = items.find((x) => x.kind === i.kind && (i.location ? x.location === i.location : x.name === i.name));
        if (!found) throw new Error(`Item ${i.kind} "${i.location ?? i.name ?? ''}" não encontrado no harness da ferramenta em uso.`);
        return { kind: i.kind, location: found.location };
      });
      router.handle({ type: 'harness.selection.set', items: resolved, usage: a.usage as HarnessUsage | null });
      return harness(router);
    },
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
    'Instala a skill "faz-ai-fluxo", que ensina a conduzir os cards pelo fluxo do board (fases, documentos, revisão, pendências), e a marca como "incluir em todo contexto" neste board. O padrão é o escopo global da ferramenta; "project" instala só neste projeto. Não sobrescreve uma skill de mesmo nome no destino, a menos que replace seja true.',
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
      return harnessOverview(router.snapshot(), false).inventory.find(
        (i) => i.kind === 'skill' && i.scope === 'project' && i.name === a.skill,
      );
    },
  );

  // ---------- agentes ----------

  tool(
    'get_agent',
    'Lê o arquivo completo de um agente do board (listado em get_harness), do projeto ou da pasta do usuário.',
    { agent: agentArg, scope: scopeArg },
    (a, router) => agent(router, a.agent, a.scope as InstallScope | undefined).content,
    true,
  );

  tool(
    'create_agent',
    'Cria um agente do board: um arquivo de agente da ferramenta de IA em uso, na pasta de agentes global (padrão) ou do projeto, e o marca como disponível para os cards. O frontmatter guarda o que a sessão recebe; o corpo é o papel dela.',
    {
      name: z.string().describe('Letras minúsculas, números e hífens'),
      description: z.string().min(1).describe('Quando usar este agente, em uma frase; é por ela que o refinar escolhe'),
      content: z.string().describe('Instruções do agente em markdown (sem o frontmatter)'),
      scope: scopeArg,
      model: z.string().optional().describe('Valor do campo Modelo (ex.: "claude:sonnet@medium"); sem ele o agente usa o modelo da sessão'),
      tools: listArg('Ferramentas embutidas liberadas (nomes do Claude Code); vazio = as da permissão'),
      deniedTools: listArg('Ferramentas retiradas da sessão'),
      skills: listArg('Skills que toda execução com o agente lê (só as marcadas em get_harness)'),
      mcp: listArg('Servidores MCP liberados além do do board'),
    },
    (a, router) => {
      router.handle({
        type: 'harness.agent.create',
        scope: a.scope as InstallScope | undefined,
        input: {
          name: a.name,
          description: a.description,
          body: a.content,
          model: a.model ?? '',
          tools: a.tools ?? [],
          deniedTools: a.deniedTools ?? [],
          skills: a.skills ?? [],
          mcp: a.mcp ?? [],
        },
      });
      return harness(router);
    },
  );

  tool(
    'update_agent',
    'Altera um agente do board: com `content`, substitui o arquivo inteiro (com o frontmatter); com os demais campos, reescreve só o que vier, preservando o resto.',
    {
      agent: agentArg,
      scope: scopeArg,
      content: z.string().min(1).optional().describe('Arquivo inteiro, com o frontmatter'),
      description: z.string().optional(),
      body: z.string().optional().describe('Instruções (sem o frontmatter)'),
      model: z.string().optional().describe('Valor do campo Modelo; "" tira o modelo fixo'),
      tools: listArg('Ferramentas liberadas'),
      deniedTools: listArg('Ferramentas retiradas'),
      skills: listArg('Skills do agente'),
      mcp: listArg('Servidores MCP além do do board'),
    },
    (a, router) => {
      const found = agent(router, a.agent, a.scope as InstallScope | undefined);
      if (a.content) router.handle({ type: 'harness.agent.write', name: found.name, scope: found.scope, content: a.content });
      else
        router.handle({
          type: 'harness.agent.update',
          name: found.name,
          scope: found.scope,
          patch: {
            ...(a.description !== undefined ? { description: a.description } : {}),
            ...(a.model !== undefined ? { model: a.model } : {}),
            ...(a.tools ? { tools: a.tools } : {}),
            ...(a.deniedTools ? { deniedTools: a.deniedTools } : {}),
            ...(a.skills ? { skills: a.skills } : {}),
            ...(a.mcp ? { mcp: a.mcp } : {}),
          },
          body: a.body,
        });
      return harness(router);
    },
  );

  tool(
    'delete_agent',
    'Apaga o arquivo de um agente. Não pode ser desfeito pelo board.',
    { agent: agentArg, scope: scopeArg },
    (a, router) => {
      const found = agent(router, a.agent, a.scope as InstallScope | undefined);
      router.handle({ type: 'harness.agent.delete', name: found.name, scope: found.scope });
      return harness(router);
    },
  );
}
