import { z } from 'zod';
import { catalogTool, isAcpProfile, type AiProfile } from '../../../shared/aiProfiles';
import { TYPE_CONDITION, modelId, resolveModelInput, type ModelRule } from '../../../shared/models';
import { newId } from '../../db/ids';
import type { MessageRouter } from '../../panel/messageRouter';
import { pricingOf, type CostBucket, type ModelPricing } from '../../../shared/cost';
import { findField, modelsOverview } from '../format';
import type { DefineTool } from './registry';

const toolArg = z.string().min(1).describe('Id de um perfil de CLI do board (veja profiles em get_models)');
const priceArg = z.number().min(0).nullable().optional().describe('US$ por milhão de tokens; null limpa o bucket, ausente mantém');
const models = (router: MessageRouter) => modelsOverview(router.snapshot());
const profileOf = (router: MessageRouter, id?: string): AiProfile => {
  const selected = id ?? router.snapshot().board.aiTool;
  const profile = router.snapshot().board.aiProfiles.find((p) => p.id === selected);
  if (!profile) throw new Error(`Perfil "${selected}" não encontrado.`);
  return profile;
};

/** Aplica o pedido ao preço gravado: número grava o bucket, null o limpa, ausente o mantém. */
function mergePricing(current: ModelPricing | null, change: Partial<Record<CostBucket, number | null | undefined>>): ModelPricing | null {
  const out: ModelPricing = { ...current };
  for (const [bucket, value] of Object.entries(change) as [CostBucket, number | null | undefined][]) {
    if (value === null) delete out[bucket];
    else if (value !== undefined) out[bucket] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** Modelos de LLM: catálogo e regras de sugestão de modelo. */
export function registerModelTools(tool: DefineTool): void {
  tool(
    'get_models',
    'Catálogo de modelos de LLM e perfis de CLI do board, com os níveis de esforço e as regras de sugestão. `value` usa `<perfil>:<modelo>@<esforço>` e o prefixo escolhe o perfil de CLI que executa o card; quando nada indica um modelo (card, agente ou regra), vale o perfil padrão, no modelo padrão dele (`default` no catálogo, escolhido pela pessoa na tela de Modelos). Todo perfil ligado roda cards, ao mesmo tempo que os outros: `runsWith` em cada modelo do catálogo diz o perfil que o executa (null: nenhum ligado o roda) e `ready` em cada perfil diz se ele roda agora. Uma cópia usa o catálogo do perfil pronto de origem e um personalizado aceita modelo livre. `pricing` (quando houver) é o preço em US$ por milhão de tokens (`input`, `output`, `cacheRead`, `cacheWrite`) que a pessoa cadastrou: serve para estimar o custo das execuções sem custo informado pela CLI e vale da próxima execução em diante; bucket ausente = sem preço. ' +
      'O campo "Esforço da atividade" do card é o tamanho da tarefa, não o esforço do modelo: as regras sugerem o modelo a partir dele.',
    {},
    (_a, router) => models(router),
    true,
  );

  tool(
    'get_execution_policies',
    'Consulta as políticas de execução e troca de alvo do board (regra vencedora, destinos, limites e revisão). Só leitura: criar, alterar, revisar ou ativar política é ação da pessoa nas Configurações do board, e a IA não aprova a própria política. Não traz comandos, credenciais nem segredos.',
    {},
    (_a, router) => {
      const { snapshot } = router.executionPolicyLibrary();
      return {
        policies: snapshot.records.map((r) => ({ ...r.policy, revision: r.revision, review: r.review })),
        note: 'Alterações só pela interface do board.',
      };
    },
    true,
  );

  tool(
    'detect_models',
    'Relê os modelos do perfil de CLI e os junta ao catálogo. Uma cópia usa o catálogo do pronto de origem; um perfil ACP abre uma sessão com o agente e lê os modelos que ele anuncia; um perfil personalizado de CLI própria tem catálogo cadastrado à mão.',
    { tool: toolArg.optional().describe('Por padrão, o perfil padrão do board') },
    async (a, router) => {
      const profile = profileOf(router, a.tool);
      if (profile.kind === 'custom' && !isAcpProfile(profile)) throw new Error('Perfil personalizado: catálogo cadastrado à mão.');
      await router.readAcpModels(profile.id);
      router.handle({ type: 'settings.models.detect', tool: catalogTool(profile) });
      return models(router);
    },
  );

  tool(
    'upsert_model',
    'Cria ou atualiza um modelo no catálogo. Use para registrar os modelos e níveis de esforço que você (a ferramenta de IA em uso) realmente tem disponíveis. `model` é o id que a CLI da ferramenta lista (ex.: "claude-opus-5-5") e o modelo fica no board como `<ferramenta>:<model>`; as variantes rápidas (`-fast`), quando a ferramenta as tem, são modelos à parte, com id próprio. Preço em US$ por milhão de tokens (`price_input`, `price_output`, `price_cache_read`, `price_cache_write`, >= 0): ausente mantém o valor gravado, `null` limpa o bucket.',
    {
      tool: toolArg,
      model: z.string().min(1).describe('Identificador usado pela ferramenta para escolher o modelo, ex.: "opus", "k3", "gpt-6.1-sol"'),
      label: z.string().optional().describe('Nome para exibição; por padrão, o identificador'),
      efforts: z
        .array(z.string())
        .optional()
        .describe('Níveis de esforço/raciocínio aceitos, do menor para o maior; vazio se o modelo não tem esse ajuste'),
      default_effort: z.string().optional(),
      price_input: priceArg,
      price_output: priceArg,
      price_cache_read: priceArg,
      price_cache_write: priceArg,
    },
    (a, router) => {
      const catalog = [...router.snapshot().board.modelCatalog];
      const profile = profileOf(router, a.tool);
      const catalogId = catalogTool(profile);
      const id = modelId(catalogId, a.model);
      const efforts = a.efforts ?? [];
      if (a.default_effort && !efforts.includes(a.default_effort)) throw new Error('default_effort precisa ser um dos efforts.');
      const at = catalog.findIndex((o) => o.id === id);
      const pricing = mergePricing(pricingOf(catalog[at]), {
        input: a.price_input,
        output: a.price_output,
        cacheRead: a.price_cache_read,
        cacheWrite: a.price_cache_write,
      });
      const entry = {
        id,
        tool: catalogId,
        model: a.model,
        label: a.label ?? a.model,
        efforts,
        defaultEffort: a.default_effort ?? null,
        // atualizar o modelo não tira dele a escolha de padrão da pessoa
        ...(catalog[at]?.default ? { default: true as const } : {}),
        ...(pricing ? { pricing } : {}),
      };
      if (at >= 0) catalog[at] = entry;
      else catalog.push(entry);
      router.handle({ type: 'settings.models.set', catalog });
      return models(router);
    },
  );

  tool(
    'delete_model',
    'Remove um modelo do catálogo.',
    { model: z.string().describe('`value` do modelo no catálogo, ex.: "claude:opus"') },
    (a, router) => {
      const catalog = router.snapshot().board.modelCatalog;
      if (!catalog.some((o) => o.id === a.model)) throw new Error(`Modelo "${a.model}" não está no catálogo.`);
      router.handle({ type: 'settings.models.set', catalog: catalog.filter((o) => o.id !== a.model) });
      return models(router);
    },
  );

  tool(
    'set_model_rules',
    'Substitui a lista de regras de sugestão de modelo. Em cada regra, `when` é uma lista de alternativas (OU); cada alternativa é uma lista de condições que precisam valer juntas (E). A primeira regra ligada que casa vence. O modelo é sempre uma sugestão: a pessoa pode escolher outro no card a qualquer momento.',
    {
      rules: z.array(
        z.object({
          name: z.string().optional(),
          when: z
            .array(
              z
                .array(
                  z.object({
                    field: z.string().describe('Nome do campo (ex.: "Esforço", "Tags") ou "Tipo" para o tipo do card'),
                    value: z.string().describe('Valor comparado, ex.: "Alto", "backend", "Bug"'),
                    not: z.boolean().optional().describe('true = a condição vale quando o campo NÃO tem esse valor'),
                  }),
                )
                .min(1),
            )
            .min(1)
            .describe('Ex.: [[{Esforço=Alto},{Tags=backend}], [{Tipo=Bug}]] significa (Esforço=Alto E Tags=backend) OU Tipo=Bug'),
          model: z.string().describe('Modelo e esforço, ex.: "claude:opus@high" ou "Opus 5.5 high"'),
          enabled: z.boolean().optional(),
        }),
      ),
    },
    (a, router) => {
      const s = router.snapshot();
      const fieldId = (name: string) =>
        ['tipo', 'type', TYPE_CONDITION].includes(name.trim().toLowerCase()) ? TYPE_CONDITION : findField(s, name).id;
      const rules: ModelRule[] = a.rules.map((r) => ({
        id: newId(),
        name: r.name ?? '',
        enabled: r.enabled !== false,
        groups: r.when.map((g) =>
          g.map((c) => ({ fieldId: fieldId(c.field), op: c.not ? ('isNot' as const) : ('is' as const), value: c.value })),
        ),
        model: resolveModelInput(s.board.modelCatalog, r.model, s.board.aiProfiles),
      }));
      router.handle({ type: 'settings.modelRules.set', rules });
      return models(router);
    },
  );

  tool(
    'suggest_model_rules',
    'Recria as regras "Esforço da tarefa → modelo" (Baixo, Médio, Alto) com um modelo leve, um intermediário e um forte do perfil indicado.',
    { tool: toolArg.optional().describe('Por padrão, o perfil padrão do board') },
    (a, router) => {
      const profile = profileOf(router, a.tool);
      if (profile.kind === 'custom') throw new Error('Perfil personalizado: cadastre os modelos e regras à mão.');
      router.handle({ type: 'settings.modelRules.suggest', tool: catalogTool(profile) });
      return models(router);
    },
  );
}
