import { z } from 'zod';
import { activeProfile, catalogTool, type AiProfile } from '../../../shared/aiProfiles';
import { TYPE_CONDITION, modelId, resolveModelInput, type ModelRule } from '../../../shared/models';
import { newId } from '../../db/ids';
import type { MessageRouter } from '../../panel/messageRouter';
import { findField, modelsOverview } from '../format';
import type { DefineTool } from './registry';

const toolArg = z.string().min(1).describe('Id de um perfil de CLI do board (veja profiles em get_models)');
const models = (router: MessageRouter) => modelsOverview(router.snapshot());
const profileOf = (router: MessageRouter, id?: string): AiProfile => {
  const selected = id ?? router.snapshot().board.aiTool;
  const profile = router.snapshot().board.aiProfiles.find((p) => p.id === selected);
  if (!profile) throw new Error(`Perfil "${selected}" não encontrado.`);
  return profile;
};

/** Modelos de LLM: catálogo e regras de sugestão de modelo. */
export function registerModelTools(tool: DefineTool): void {
  tool(
    'get_models',
    'Catálogo de modelos de LLM e perfis de CLI do board, com os níveis de esforço e as regras de sugestão. `value` usa `<perfil>:<modelo>@<esforço>` e o prefixo escolhe o perfil de CLI que executa o card; quando nada indica um modelo (card, agente ou regra), vale o perfil padrão. Uma cópia usa o catálogo do perfil pronto de origem e um personalizado aceita modelo livre. O board não guarda preço: o custo de uma execução é o que o executor informa. ' +
      'O campo "Esforço da atividade" do card é o tamanho da tarefa, não o esforço do modelo: as regras sugerem o modelo a partir dele.',
    {},
    (_a, router) => models(router),
    true,
  );

  tool(
    'detect_models',
    'Relê os modelos do perfil de CLI e os junta ao catálogo. Uma cópia usa o catálogo do pronto de origem; um perfil personalizado tem catálogo cadastrado à mão.',
    { tool: toolArg.optional().describe('Por padrão, a ferramenta em uso no projeto') },
    (a, router) => {
      const profile = profileOf(router, a.tool);
      if (profile.kind === 'custom') throw new Error('Perfil personalizado: catálogo cadastrado à mão.');
      router.handle({ type: 'settings.models.detect', tool: catalogTool(profile) });
      return models(router);
    },
  );

  tool(
    'upsert_model',
    'Cria ou atualiza um modelo no catálogo. Use para registrar os modelos e níveis de esforço que você (a ferramenta de IA em uso) realmente tem disponíveis. `model` é o id que a CLI da ferramenta lista (ex.: "claude-opus-5-5") e o modelo fica no board como `<ferramenta>:<model>`; as variantes rápidas (`-fast`), quando a ferramenta as tem, são modelos à parte, com id próprio.',
    {
      tool: toolArg,
      model: z.string().min(1).describe('Identificador usado pela ferramenta para escolher o modelo, ex.: "opus", "k3", "gpt-6.1-sol"'),
      label: z.string().optional().describe('Nome para exibição; por padrão, o identificador'),
      efforts: z
        .array(z.string())
        .optional()
        .describe('Níveis de esforço/raciocínio aceitos, do menor para o maior; vazio se o modelo não tem esse ajuste'),
      default_effort: z.string().optional(),
    },
    (a, router) => {
      const catalog = [...router.snapshot().board.modelCatalog];
      const profile = profileOf(router, a.tool);
      const catalogId = catalogTool(profile);
      const id = modelId(catalogId, a.model);
      const efforts = a.efforts ?? [];
      if (a.default_effort && !efforts.includes(a.default_effort)) throw new Error('default_effort precisa ser um dos efforts.');
      const at = catalog.findIndex((o) => o.id === id);
      const entry = {
        id,
        tool: catalogId,
        model: a.model,
        label: a.label ?? a.model,
        efforts,
        defaultEffort: a.default_effort ?? null,
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
          fallback: z
            .string()
            .optional()
            .describe('Modelo e esforço de reserva, usado quando o principal esgota o limite; omitido = sem reserva'),
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
        model: resolveModelInput(s.board.modelCatalog, r.model, activeProfile(s.board)),
        fallback: r.fallback ? resolveModelInput(s.board.modelCatalog, r.fallback, activeProfile(s.board)) : null,
      }));
      router.handle({ type: 'settings.modelRules.set', rules });
      return models(router);
    },
  );

  tool(
    'suggest_model_rules',
    'Recria as regras "Esforço da tarefa → modelo" (Baixo, Médio, Alto) com um modelo leve, um intermediário e um forte do perfil indicado.',
    { tool: toolArg.optional().describe('Por padrão, a ferramenta em uso no projeto') },
    (a, router) => {
      const profile = profileOf(router, a.tool);
      if (profile.kind === 'custom') throw new Error('Perfil personalizado: cadastre os modelos e regras à mão.');
      router.handle({ type: 'settings.modelRules.suggest', tool: catalogTool(profile) });
      return models(router);
    },
  );
}
