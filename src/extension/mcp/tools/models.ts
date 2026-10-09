import { z } from 'zod';
import { ALL_AI_TOOLS, type AiTool } from '../../../shared/harness';
import { TYPE_CONDITION, modelId, resolveModelInput, type ModelRule } from '../../../shared/models';
import { newId } from '../../db/ids';
import type { MessageRouter } from '../../panel/messageRouter';
import { findField, modelsOverview } from '../format';
import type { DefineTool } from './registry';

const toolArg = z.enum(ALL_AI_TOOLS as [string, ...string[]]).describe('Ferramenta de IA: claude ou cursor');
const models = (router: MessageRouter) => modelsOverview(router.snapshot());

/** Modelos de LLM: catálogo e regras de sugestão de modelo. */
export function registerModelTools(tool: DefineTool): void {
  tool(
    'get_models',
    'Catálogo de modelos de LLM do board (por ferramenta, com os níveis de esforço que cada um aceita) e as regras que sugerem um modelo a partir dos campos do card. O `value` de cada modelo é `<ferramenta>:<model>`; no Cursor, `model` é o id de `cursor-agent models`. O board não guarda preço: o custo de uma execução é o que a própria ferramenta informa.',
    {},
    (_a, router) => models(router),
    true,
  );

  tool(
    'detect_models',
    'Relê os modelos de uma ferramenta e os junta ao catálogo. Para o Cursor, a última lista de `cursor-agent models` lida pelo board (com a CLI autenticada); para o Claude Code, usa a lista embutida na extensão.',
    { tool: toolArg.optional().describe('Por padrão, a ferramenta em uso no projeto') },
    (a, router) => {
      router.handle({ type: 'settings.models.detect', tool: (a.tool as AiTool | undefined) ?? router.snapshot().board.aiTool });
      return models(router);
    },
  );

  tool(
    'upsert_model',
    'Cria ou atualiza um modelo no catálogo. Use para registrar os modelos e níveis de esforço que você (a ferramenta de IA em uso) realmente tem disponíveis. No Cursor, `model` é o id que `cursor-agent models` lista (ex.: "claude-opus-5-5") e o modelo fica no board como `cursor:<model>`; as variantes rápidas (`-fast`) são modelos à parte, com id próprio.',
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
      const id = modelId(a.tool as AiTool, a.model);
      const efforts = a.efforts ?? [];
      if (a.default_effort && !efforts.includes(a.default_effort)) throw new Error('default_effort precisa ser um dos efforts.');
      const at = catalog.findIndex((o) => o.id === id);
      const entry = {
        id,
        tool: a.tool as AiTool,
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
        model: resolveModelInput(s.board.modelCatalog, r.model),
        fallback: r.fallback ? resolveModelInput(s.board.modelCatalog, r.fallback) : null,
      }));
      router.handle({ type: 'settings.modelRules.set', rules });
      return models(router);
    },
  );

  tool(
    'suggest_model_rules',
    'Recria as regras "Esforço da tarefa → modelo" (Baixo, Médio, Alto) com um modelo leve, um intermediário e um forte da ferramenta indicada.',
    { tool: toolArg.optional().describe('Por padrão, a ferramenta em uso no projeto') },
    (a, router) => {
      router.handle({ type: 'settings.modelRules.suggest', tool: (a.tool as AiTool | undefined) ?? router.snapshot().board.aiTool });
      return models(router);
    },
  );
}
