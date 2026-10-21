import { z } from 'zod';
import { RULE_NAME_PATTERN } from '../../../shared/artifactImport';
import { skillDocument } from '../../../shared/artifacts';
import { ALL_AI_BASES, type AiTool } from '../../../shared/harness';
import { SELECTABLE_KINDS, toolItemsOf, selectionKey, type HarnessUsage, type SelectableKind } from '../../../shared/harnessSelection';
import { FLOW_SKILL } from '../../flowSkill';
import type { MessageRouter } from '../../panel/messageRouter';
import { harnessOverview } from '../format';
import type { DefineTool } from './registry';

const ruleArg = z
  .string()
  .describe('Nome da regra no board, em texto livre: letras minúsculas, números e hífens, com .md opcional (ex.: "convencoes")');
const skillArg = z.string().describe('Nome da skill (nome da pasta), ex.: "revisar-spec"');
const agentArg = z.string().describe('Nome do agente (nome do arquivo, sem a extensão), ex.: "revisor-de-spec"');

const harness = (router: MessageRouter) => harnessOverview(router.snapshot());
const agentScopeArg = z.enum(['user', 'project']).optional().describe('Aceito por compatibilidade e ignorado: o agente fica no board');
const listArg = (what: string) => z.array(z.string()).optional().describe(what);

type BoardKind = 'rule' | 'skill' | 'agent';
const KIND_LABEL: Record<BoardKind, string> = { rule: 'Regra', skill: 'Skill', agent: 'Agente' };

/** O item do board (a cópia guardada no banco) com esse nome; lança se não existir. */
const boardItem = (router: MessageRouter, kind: BoardKind, name: string) => {
  const item = toolItemsOf(router.snapshot()).find(
    (i) => i.boardArtifactId && i.kind === (kind === 'rule' ? 'instructions' : kind) && i.name === name,
  );
  if (!item) throw new Error(`${KIND_LABEL[kind]} "${name}" não está no board.`);
  return item;
};

/** O texto de uma regra ou skill do board, da cópia de leitura (numa execução gerenciada, a do snapshot dela). */
const readBoard = (router: MessageRouter, kind: 'rule' | 'skill', name: string): string =>
  router.readHarnessFile(boardItem(router, kind, name).path).content;

/** O modo de uma regra, skill ou agente do board: a resposta de quem pede para desligar, ligar ou tirar. */
const setUsage = (router: MessageRouter, kind: BoardKind, name: string, usage: HarnessUsage | null) => {
  const item = boardItem(router, kind, name);
  router.handle({ type: 'harness.selection.set', items: [{ kind: item.kind as SelectableKind, location: selectionKey(item) }], usage });
};

/** Harness do projeto: ferramenta de IA, arquivos de regras, skills e agentes. */
export function registerHarnessTools(tool: DefineTool): void {
  // ---------- regras e skills ----------

  tool(
    'get_harness',
    'O banco de artefatos do board: a ferramenta em uso, o agente padrão e, com o modo (`usage`), as rules, skills, agentes e servidores MCP que estão no board (Configurações → Harness). Toda execução parte de contexto vazio: o que não está no board não existe para ela. Com onlySelected = false, lista o que dá para importar: o que a ferramenta em uso carrega nesta máquina (projeto, pasta do usuário, plugins e pastas importadas) e ainda não está no board, com a `key` para set_harness_selection.',
    {
      onlySelected: z
        .boolean()
        .optional()
        .describe(
          'Padrão true: o que está no board. false: o que dá para importar (a ferramenta em uso, fora do board), com a `key` de cada item',
        ),
    },
    (a, router) => harnessOverview(router.snapshot(), a.onlySelected ?? true),
    true,
  );

  tool(
    'set_harness_selection',
    'Importa rules, skills, agentes e servidores MCP da ferramenta em uso para o board, muda o modo dos que já estão nele ou os tira do board (o agente padrão e a skill do fluxo não saem). "always" (Sempre): entra em toda execução; "contextual" (Pelo card): disponível para indicar no card (campos Rules, Skills e MCPs) ou escolher como agente; "off" (Desligado): fica no board sem entrar em nada (é como as regras entram, para revisão); null: tira do board. Identifique o item por `location`, como get_harness (com onlySelected = false) o mostra; um agente, uma skill ou um servidor MCP também pelo nome.',
    {
      items: z
        .array(
          z.object({
            kind: z.enum(SELECTABLE_KINDS as [SelectableKind, ...SelectableKind[]]),
            location: z.string().optional().describe('A `key` como em get_harness (o caminho; num servidor MCP, `arquivo#nome`)'),
            name: z.string().optional().describe('Nome do agente, da skill ou do servidor MCP, quando não souber a chave'),
          }),
        )
        .min(1),
      usage: z.enum(['always', 'contextual', 'off']).nullable(),
    },
    (a, router) => {
      const s = router.snapshot();
      const items = [...toolItemsOf(s), ...s.harness.inventory.flatMap((t) => t.items)];
      const resolved = a.items.map((i) => {
        // `location` é a `key` do get_harness (num servidor MCP, arquivo mais `#nome`); o caminho sem o nome também vale
        const found = items.find(
          (x) => x.kind === i.kind && (i.location ? selectionKey(x) === i.location || x.location === i.location : x.name === i.name),
        );
        if (!found) throw new Error(`Item ${i.kind} "${i.location ?? i.name ?? ''}" não encontrado no board nem na ferramenta em uso.`);
        return { kind: i.kind, location: selectionKey(found) };
      });
      router.handle({ type: 'harness.selection.set', items: resolved, usage: a.usage as HarnessUsage | null });
      return harness(router);
    },
  );

  tool(
    'set_ai_tool',
    'Define a ferramenta de IA com que o projeto trabalha (uma por vez). Isso troca os modelos, as regras de esforço e o que dá para importar (get_harness com onlySelected = false); o que já está no board não muda.',
    { tool: z.enum(ALL_AI_BASES as [string, ...string[]]) },
    (a, router) => {
      router.handle({ type: 'settings.board.update', patch: { aiTool: a.tool as AiTool } });
      return harness(router);
    },
  );

  tool('read_rule_file', 'Lê uma regra do board pelo nome.', { file: ruleArg }, (a, router) => readBoard(router, 'rule', a.file), true);

  tool(
    'write_rule_file',
    'Cria ou substitui por inteiro uma regra do board. Uma regra nova nasce em "Desligado" (fica no board para a pessoa revisar e ligar em Configurações → Harness); uma que já existe troca o texto e mantém o modo. Nada é gravado no projeto nem na pasta da ferramenta.',
    { file: ruleArg.regex(RULE_NAME_PATTERN, 'Nome de regra inválido'), content: z.string() },
    (a, router) => {
      router.handle({ type: 'harness.artifact.save', kind: 'rule', name: a.file, body: a.content, via: 'ai' });
      return harness(router);
    },
  );

  tool('delete_rule_file', 'Tira uma regra do board. Não pode ser desfeito pelo board.', { file: ruleArg }, (a, router) => {
    setUsage(router, 'rule', a.file, null);
    return harness(router);
  });

  tool(
    'get_skill',
    'Lê o SKILL.md completo da skill do board.',
    { skill: skillArg },
    (a, router) => readBoard(router, 'skill', a.skill),
    true,
  );

  tool(
    'create_skill',
    'Cria uma skill no board, direto no banco (nada vai para a pasta da ferramenta de IA). Ela nasce em "Pelo card" e passa a ser uma opção do campo "Skills" dos cards.',
    {
      name: z.string().describe('Letras minúsculas, números e hífens'),
      description: z.string().min(1).describe('Quando a skill deve ser usada; é por ela que a IA decide invocá-la'),
      content: z.string().describe('Instruções da skill em markdown (sem o frontmatter)'),
    },
    (a, router) => {
      if (router.snapshot().harness.library?.artifacts.some((x) => x.kind === 'skill' && x.name === a.name))
        throw new Error(`Já existe uma skill "${a.name}" no board. Use update_skill para alterá-la.`);
      router.handle({
        type: 'harness.artifact.save',
        kind: 'skill',
        name: a.name,
        body: skillDocument(`\n${a.content}`, a.name, a.description),
        via: 'ai',
      });
      return harness(router);
    },
  );

  tool(
    'install_flow_skill',
    'Instala a skill "faz-ai-fluxo", que ensina a conduzir os cards pelo fluxo do board (fases, documentos, pendências), junto com as skills por assunto (faz-ai-harness-do-card, faz-ai-workspace-e-pr, faz-ai-implementacao-rodadas, faz-ai-revisao-e-homologacao, faz-ai-modo-autonomo), e marca a principal como "incluir em todo contexto" neste board. Sempre no global da ferramenta (~/.claude/skills, ~/.cursor/skills, ~/.kimi-code/skills), para todos os projetos: nada entra na pasta do projeto. Não sobrescreve uma skill de mesmo nome no destino, a menos que replace seja true.',
    {
      tool: z.enum(ALL_AI_BASES).optional().describe('Ferramenta de IA; padrão: a do projeto'),
      replace: z.boolean().optional().describe('Troca a skill de mesmo nome que já esteja no destino'),
    },
    (a, router) => {
      const tool = a.tool ?? router.snapshot().board.aiTool;
      const found = () =>
        router
          .snapshot()
          .harness.inventory.find((t) => t.tool === tool)
          ?.items.find((i) => i.kind === 'skill' && i.scope === 'user' && i.name === FLOW_SKILL.name);
      const had = !!found();
      router.handle({ type: 'harness.flowSkill.install', tool, replace: a.replace });
      return {
        installed: !had || !!a.replace,
        note:
          had && !a.replace
            ? 'A skill já existia no destino e foi mantida como está; marcada em todo contexto.'
            : had
              ? 'Skill substituída.'
              : 'Skill criada.',
        skill: found()?.path,
      };
    },
  );

  tool(
    'update_skill',
    'Substitui o SKILL.md inteiro da skill do board, incluindo o frontmatter (name, description). Os arquivos de apoio e o modo ficam como estão.',
    { skill: skillArg, content: z.string().min(1) },
    (a, router) => {
      boardItem(router, 'skill', a.skill);
      router.handle({ type: 'harness.artifact.save', kind: 'skill', name: a.skill, body: a.content, via: 'ai' });
      return harness(router);
    },
  );

  tool(
    'set_skill_enabled',
    'Atalho do modo de uma skill do board. enabled = false leva a "Desligado" (continua no board, sem entrar em nada). enabled = true leva a "Pelo card" se ela estava desligada; se já estava ligada ("Sempre" ou "Pelo card"), não muda nada.',
    { skill: skillArg, enabled: z.boolean() },
    (a, router) => {
      const current = router.snapshot().harness.library?.artifacts.find((x) => x.kind === 'skill' && x.name === a.skill);
      if (!current) throw new Error(`Skill "${a.skill}" não está no board.`);
      if (!a.enabled) setUsage(router, 'skill', a.skill, 'off');
      else if (current.usage === 'off') setUsage(router, 'skill', a.skill, 'contextual');
      return harness(router);
    },
  );

  tool(
    'delete_skill',
    'Tira uma skill do board, com todos os arquivos de apoio. Não pode ser desfeito pelo board. A skill do fluxo não sai: só o modo dela muda.',
    { skill: skillArg },
    (a, router) => {
      setUsage(router, 'skill', a.skill, null);
      return harness(router);
    },
  );

  tool(
    'write_skill_file',
    'Grava um arquivo de apoio na skill do board: um modelo de classe ou exemplo de código em `references/`, um modelo de arquivo em `assets/` ou um script em `scripts/`. Substitui o arquivo se ele já existir; vale o limite de 512 KB por arquivo, 100 arquivos e 5 MB por skill. Para a IA ler o arquivo quando usar a skill, o SKILL.md precisa apontar para ele (use update_skill).',
    {
      skill: z.string().describe('Nome da skill do board'),
      file: z.string().describe('Caminho dentro da pasta da skill, ex.: "references/modelo-de-repositorio.ts"'),
      content: z.string(),
    },
    (a, router) => {
      boardItem(router, 'skill', a.skill);
      router.handle({ type: 'harness.skillFile.write', skill: a.skill, file: a.file, content: a.content });
      return harnessOverview(router.snapshot()).inventory.find((i) => i.kind === 'skill' && i.name === a.skill);
    },
  );

  // ---------- agentes ----------

  tool(
    'get_agent',
    'Lê um agente do board (listado em get_harness): o arquivo da cópia guardada no board, com o frontmatter.',
    { agent: agentArg },
    (a, router) => router.readHarnessFile(boardItem(router, 'agent', a.agent).path).content,
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
      tools: listArg('Ferramentas embutidas liberadas (nomes do Claude Code); vazio = as da permissão'),
      deniedTools: listArg('Ferramentas retiradas da sessão'),
      skills: listArg('Skills que toda execução com o agente lê (só as marcadas em get_harness)'),
      mcp: listArg('Servidores MCP liberados além do do board'),
      readonly: z
        .boolean()
        .optional()
        .describe('Só no Cursor: o agente não edita arquivos nem roda comandos que mudem estado (`readonly: true`)'),
      background: z.boolean().optional().describe('Só no Cursor: o agente roda em segundo plano (`is_background: true`)'),
    },
    (a, router) => {
      router.handle({
        type: 'harness.agent.create',
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
      scope: agentScopeArg,
      content: z.string().min(1).optional().describe('Arquivo inteiro, com o frontmatter'),
      description: z.string().optional(),
      body: z.string().optional().describe('Instruções (sem o frontmatter)'),
      model: z.string().optional().describe('Valor do campo Modelo; "" tira o modelo fixo'),
      tools: listArg('Ferramentas liberadas'),
      deniedTools: listArg('Ferramentas retiradas'),
      skills: listArg('Skills do agente'),
      mcp: listArg('Servidores MCP além do do board'),
      readonly: z.boolean().optional().describe('Só no Cursor: sem edição de arquivos nem comandos que mudem estado'),
      background: z.boolean().optional().describe('Só no Cursor: roda em segundo plano'),
    },
    (a, router) => {
      boardItem(router, 'agent', a.agent);
      if (a.content) router.handle({ type: 'harness.agent.write', name: a.agent, scope: 'user', content: a.content });
      else
        router.handle({
          type: 'harness.agent.update',
          name: a.agent,
          scope: 'user',
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
    'Tira um agente do board; o arquivo de origem de um agente copiado não é apagado. Não pode ser desfeito pelo board. O agente padrão não sai: escolha outro antes.',
    { agent: agentArg, scope: agentScopeArg },
    (a, router) => {
      boardItem(router, 'agent', a.agent);
      router.handle({ type: 'harness.agent.delete', name: a.agent, scope: 'user' });
      return harness(router);
    },
  );
}
