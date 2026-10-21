import { z } from 'zod';
import { RULE_FILES, type AiTool, type InstallScope } from '../../../shared/harness';
import { SELECTABLE_KINDS, toolItemsOf, selectionKey, type HarnessUsage, type SelectableKind } from '../../../shared/harnessSelection';
import { flowSkillMarkdown } from '../../flowSkill';
import type { MessageRouter } from '../../panel/messageRouter';
import { harnessOverview } from '../format';
import type { DefineTool } from './registry';

const ruleArg = z.enum(RULE_FILES.map((r) => r.name) as [string, ...string[]]).describe('Arquivo de regras na raiz do projeto');
const skillArg = z.string().describe('Nome da skill (nome da pasta), ex.: "revisar-spec"');
const agentArg = z.string().describe('Nome do agente (nome do arquivo, sem a extensão), ex.: "revisor-de-spec"');

const harness = (router: MessageRouter) => harnessOverview(router.snapshot());
const listArg = (what: string) => z.array(z.string()).optional().describe(what);

/** O agente guardado no board com esse nome, se houver: é nele que as ferramentas de agente agem. */
const boardAgent = (router: MessageRouter, name: string) =>
  router.snapshot().harness.library?.artifacts.find((x) => x.kind === 'agent' && x.name === name && !x.missing);

/** Agente do board pelo nome; lança com a lista dos existentes. */
const agent = (router: MessageRouter, name: string) => {
  const found = boardAgent(router, name);
  if (!found) {
    const all = (router.snapshot().harness.library?.artifacts ?? []).filter((x) => x.kind === 'agent' && !x.missing);
    throw new Error(`Agente "${name}" não encontrado no board. Existentes: ${all.map((x) => `"${x.name}"`).join(', ') || 'nenhum'}.`);
  }
  return found;
};

/** Harness do board: ferramenta de IA, regras, skills e agentes guardados no banco. */
export function registerHarnessTools(tool: DefineTool): void {
  // ---------- regras e skills ----------

  tool(
    'get_harness',
    'O banco de artefatos do board: a ferramenta em uso, o agente padrão e, com o modo (`usage`), as rules, skills, agentes e servidores MCP enviados ao board em Configurações → Harness. `cliLoads` diz o que a CLI da ferramenta carrega por conta própria e se o contexto vazio está imposto: lista vazia não prova isolamento.',
    {},
    (_a, router) => harnessOverview(router.snapshot()),
    true,
  );

  tool(
    'set_harness_selection',
    'Envia rules, skills, agentes e servidores MCP ao board, muda o modo deles ou os tira do board. "always" (Sempre): entra em toda execução; "contextual" (Pelo card): disponível para indicar no card (campos Rules, Skills e MCPs) ou escolher como agente; "off" (Desligado): fica no board sem entrar em nada (é como as regras entram, para revisão); null: tira do board. Identifique cada item por `kind` e `name`, como get_harness o mostra.',
    {
      items: z
        .array(
          // estrito: um `location` (a identidade antiga, por caminho) dá erro em vez de ser ignorado
          z
            .object({
              kind: z.enum(SELECTABLE_KINDS as [SelectableKind, ...SelectableKind[]]),
              name: z.string().min(1).describe('Nome da rule, da skill, do agente ou do servidor MCP, como em get_harness'),
            })
            .strict(),
        )
        .min(1),
      usage: z.enum(['always', 'contextual', 'off']).nullable(),
    },
    (a, router) => {
      const s = router.snapshot();
      const items = toolItemsOf(s);
      const resolved = a.items.map((i) => {
        const found = items.find((x) => x.kind === i.kind && x.name === i.name);
        if (!found) throw new Error(`Item ${i.kind} "${i.name}" não encontrado no harness.`);
        return { kind: i.kind, location: selectionKey(found) };
      });
      router.handle({ type: 'harness.selection.set', items: resolved, usage: a.usage as HarnessUsage | null });
      return harness(router);
    },
  );

  tool(
    'set_ai_tool',
    'Define o perfil de CLI padrão: o que executa quando nem o card, nem o agente, nem as regras indicam um modelo. `tool` é o id de um perfil ligado (veja `profiles` em get_models). Perfis são criados e editados só pela pessoa, em Configurações → Ferramentas de IA.',
    { tool: z.string().min(1) },
    (a, router) => {
      const enabled = router
        .snapshot()
        .board.aiProfiles.filter((p) => p.enabled)
        .map((p) => p.id);
      if (!enabled.includes(a.tool)) throw new Error(`Perfil "${a.tool}" não está ligado. Ligados: ${enabled.join(', ')}.`);
      router.handle({ type: 'settings.board.update', patch: { aiTool: a.tool as AiTool } });
      return harness(router);
    },
  );

  tool(
    'read_rule_file',
    'Lê um arquivo de regras guardado no board.',
    { file: ruleArg },
    (a, router) => {
      const copy = toolItemsOf(router.snapshot()).find((i) => i.kind === 'instructions' && i.boardArtifactId && i.name === a.file);
      if (!copy) throw new Error(`${a.file} não está no board.`);
      return router.readHarnessFile(copy.path).content;
    },
    true,
  );

  tool(
    'write_rule_file',
    'Cria ou substitui por inteiro um arquivo de regras guardado no board (nasce desligado; ligue com set_harness_selection).',
    { file: ruleArg, content: z.string() },
    (a, router) => {
      router.handle({ type: 'harness.rule.write', name: a.file, content: a.content });
      return harness(router);
    },
  );

  tool('delete_rule_file', 'Tira um arquivo de regras do board. Não pode ser desfeito pelo board.', { file: ruleArg }, (a, router) => {
    router.handle({ type: 'harness.rule.delete', name: a.file });
    return harness(router);
  });

  tool(
    'get_skill',
    'Lê o SKILL.md completo de uma skill do projeto ou de uma skill do fluxo do board (`faz-ai-fluxo` e as `faz-ai-*` por assunto), que vêm do próprio board, sem arquivo instalado.',
    { skill: skillArg },
    (a, router) => {
      // a skill do fluxo é sempre a do board, mesmo que o projeto tenha uma de mesmo nome
      const flow = flowSkillMarkdown(a.skill);
      if (flow !== undefined) return flow;
      const copy = toolItemsOf(router.snapshot()).find((i) => i.kind === 'skill' && i.boardArtifactId && i.name === a.skill);
      if (!copy) throw new Error(`Skill "${a.skill}" não encontrada no board.`);
      return router.readHarnessFile(copy.path).content;
    },
    true,
  );

  tool(
    'create_skill',
    'Cria uma skill no board. Ela passa a ser uma opção do campo "Skills" dos cards.',
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
    'update_skill',
    'Substitui o SKILL.md inteiro da cópia da skill no board, incluindo o frontmatter (name, description).',
    { skill: skillArg, content: z.string().min(1) },
    (a, router) => {
      const copy = toolItemsOf(router.snapshot()).find((i) => i.kind === 'skill' && i.boardArtifactId && i.name === a.skill);
      if (!copy) throw new Error(`Skill "${a.skill}" não encontrada no board.`);
      router.writeHarnessFile(copy.path, a.content);
      return harness(router);
    },
  );

  tool(
    'delete_skill',
    'Tira uma skill do board, com todos os arquivos dela. Não pode ser desfeito pelo board.',
    { skill: skillArg },
    (a, router) => {
      router.handle({ type: 'harness.skill.delete', name: a.skill });
      return harness(router);
    },
  );

  tool(
    'write_skill_file',
    'Grava um arquivo de apoio na cópia da skill do board: um modelo de classe ou exemplo de código em `references/`, um modelo de arquivo em `assets/` ou um script em `scripts/`. Substitui o arquivo se ele já existir. Para a IA ler o arquivo quando usar a skill, o SKILL.md precisa apontar para ele (use update_skill).',
    {
      skill: skillArg,
      file: z.string().describe('Caminho dentro da pasta da skill, ex.: "references/modelo-de-repositorio.ts"'),
      content: z.string(),
    },
    (a, router) => {
      router.writeSkillFile(a.skill, a.file, a.content);
      return harnessOverview(router.snapshot()).skills.find((i) => i.name === a.skill);
    },
  );

  // ---------- agentes ----------

  tool(
    'get_agent',
    'Lê um agente do board (listado em get_harness): o arquivo da cópia guardada no board, com o frontmatter.',
    { agent: agentArg },
    (a, router) => {
      const copy = toolItemsOf(router.snapshot()).find((i) => i.kind === 'agent' && i.boardArtifactId && i.name === a.agent);
      if (!copy) agent(router, a.agent);
      return router.readHarnessFile(copy!.path).content;
    },
    true,
  );

  tool(
    'create_agent',
    'Cria um agente do board: ele fica guardado no próprio board (não na pasta da ferramenta de IA) e já disponível para os cards ("Pelo card"). As ferramentas, o modelo, as skills e os servidores MCP são o que a sessão recebe; as instruções são o papel dela. Vale para as próximas execuções.',
    {
      name: z.string().describe('Letras minúsculas, números e hífens'),
      description: z.string().min(1).describe('Quando usar este agente, em uma frase; é por ela que o refinar escolhe'),
      content: z.string().describe('Instruções do agente em markdown (sem o frontmatter)'),
      scope: z.enum(['user', 'project']).optional().describe('Aceito por compatibilidade e ignorado: o agente fica no board'),
      model: z.string().optional().describe('Valor do campo Modelo (ex.: "claude:sonnet@medium"); sem ele o agente usa o modelo da sessão'),
      tools: listArg('Ferramentas embutidas liberadas (nomes na convenção da ferramenta); vazio = as da permissão'),
      deniedTools: listArg('Ferramentas retiradas da sessão'),
      skills: listArg('Skills que toda execução com o agente lê (só as marcadas em get_harness)'),
      mcp: listArg('Servidores MCP liberados além do do board'),
      readonly: z
        .boolean()
        .optional()
        .describe('Nas ferramentas que aceitam: o agente não edita arquivos nem roda comandos que mudem estado'),
      background: z.boolean().optional().describe('Nas ferramentas que aceitam: o agente roda em segundo plano'),
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
          ...(a.readonly !== undefined ? { readonly: a.readonly } : {}),
          ...(a.background !== undefined ? { background: a.background } : {}),
        },
      });
      return harness(router);
    },
  );

  tool(
    'update_agent',
    'Altera um agente do board: com `content`, substitui o agente inteiro (frontmatter e instruções, no formato da ferramenta em uso); com os demais campos, reescreve só o que vier, preservando o resto. A mudança fica no board e vale para as próximas execuções; as já iniciadas seguem com a versão delas. O arquivo de origem de um agente copiado não é alterado.',
    {
      agent: agentArg,
      content: z.string().min(1).optional().describe('Arquivo inteiro, com o frontmatter'),
      description: z.string().optional(),
      body: z.string().optional().describe('Instruções (sem o frontmatter)'),
      model: z.string().optional().describe('Valor do campo Modelo; "" tira o modelo fixo'),
      tools: listArg('Ferramentas liberadas'),
      deniedTools: listArg('Ferramentas retiradas'),
      skills: listArg('Skills do agente'),
      mcp: listArg('Servidores MCP além do do board'),
      readonly: z.boolean().optional().describe('Nas ferramentas que aceitam: sem edição de arquivos nem comandos que mudem estado'),
      background: z.boolean().optional().describe('Nas ferramentas que aceitam: roda em segundo plano'),
    },
    (a, router) => {
      const found = { name: agent(router, a.agent).name, scope: 'user' as const };
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
            ...(a.readonly !== undefined ? { readonly: a.readonly } : {}),
            ...(a.background !== undefined ? { background: a.background } : {}),
          },
          body: a.body,
        });
      return harness(router);
    },
  );

  tool(
    'delete_agent',
    'Tira um agente do board; o arquivo de origem de um agente copiado não é apagado. Não pode ser desfeito pelo board.',
    { agent: agentArg },
    (a, router) => {
      router.handle({ type: 'harness.agent.delete', name: agent(router, a.agent).name, scope: 'user' });
      return harness(router);
    },
  );
}
