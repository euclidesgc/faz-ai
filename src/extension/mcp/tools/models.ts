import { z } from 'zod';
import { ALL_AI_TOOLS, type AiTool } from '../../../shared/harness';
import { TYPE_CONDITION, modelId, resolveModelInput, withPrice, type ModelRule } from '../../../shared/models';
import { newId } from '../../db/ids';
import type { MessageRouter } from '../../panel/messageRouter';
import { findField, modelsOverview } from '../format';
import type { DefineTool } from './registry';

const toolArg = z.enum(ALL_AI_TOOLS as [string, ...string[]]).describe('Ferramenta de IA: claude, codex, cursor, kimi ou copilot');
const models = (router: MessageRouter) => modelsOverview(router.snapshot());

/** Modelos de LLM: catálogo e regras de sugestão de modelo. */
export function registerModelTools(tool: DefineTool): void {
  tool(
    'get_models',
    'Catálogo de modelos de LLM do board (por ferramenta, com os níveis de esforço que cada um aceita, o preço, a origem do preço e se o preço é variável) e as regras que sugerem um modelo a partir dos campos do card. O `value` de cada modelo é `<ferramenta>:<model>`; no Cursor, `model` é o id de `cursor-agent models` e `label` é o nome da tabela de preços em https://cursor.com/docs/models-and-pricing. `priceSource` de cada modelo: "builtin" = preço da tabela embutida na extensão, com `priceCheckedAt` (data da conferência) e `priceUrl` (página oficial); "manual" = digitado pela pessoa, nunca sobrescrito; null = sem preço.',
    {},
    (_a, router) => models(router),
    true,
  );

  tool(
    'detect_models',
    'Relê os modelos de uma ferramenta e os junta ao catálogo. Para o Kimi, lê a lista real do config.toml local; para o Cursor, a última lista de `cursor-agent models` lida pelo board (com a CLI autenticada); para as demais, usa a lista embutida na extensão.',
    { tool: toolArg.optional().describe('Por padrão, a ferramenta em uso no projeto') },
    (a, router) => {
      router.handle({ type: 'settings.models.detect', tool: (a.tool as AiTool | undefined) ?? router.snapshot().board.aiTool });
      return models(router);
    },
  );

  tool(
    'upsert_model',
    'Cria ou atualiza um modelo no catálogo. Use para registrar os modelos e níveis de esforço que você (a ferramenta de IA em uso) realmente tem disponíveis. Os quatro preços (dólar por milhão de tokens) são opcionais: o que não vier fica como estava, e o board só estima custo de um modelo com os quatro preenchidos e sem preço variável. Gravar qualquer um dos preços marca o preço do modelo como `manual` (a extensão nunca o sobrescreve); `reset_price` apaga o preço digitado e, se o modelo tem preço embutido, volta a ele. No Cursor, `model` é o id que `cursor-agent models` lista (ex.: "claude-opus-5-5"), `label` é o nome do modelo na tabela de preços da documentação (https://cursor.com/docs/models-and-pricing, colunas input, cache write, cache read e output) e o modelo fica no board como `cursor:<model>`; as variantes rápidas (`-fast`) são modelos à parte, com id e preço próprios. O `auto` do Cursor tem preço variável: não informe preço para ele.',
    {
      tool: toolArg,
      model: z.string().min(1).describe('Identificador usado pela ferramenta para escolher o modelo, ex.: "opus", "k3", "gpt-6.1-sol"'),
      label: z.string().optional().describe('Nome para exibição; por padrão, o identificador'),
      efforts: z
        .array(z.string())
        .optional()
        .describe('Níveis de esforço/raciocínio aceitos, do menor para o maior; vazio se o modelo não tem esse ajuste'),
      default_effort: z.string().optional(),
      price_input: z.number().min(0).optional().describe('Preço da entrada, em US$ por milhão de tokens'),
      price_output: z.number().min(0).optional().describe('Preço da saída, em US$ por milhão de tokens'),
      price_cache_read: z.number().min(0).optional().describe('Preço da leitura de cache, em US$ por milhão de tokens'),
      price_cache_write: z.number().min(0).optional().describe('Preço da criação de cache, em US$ por milhão de tokens'),
      reset_price: z
        .boolean()
        .optional()
        .describe('Apaga o preço digitado; um modelo com preço embutido volta a ele. Não pode vir junto com price_*'),
      variable_price: z
        .boolean()
        .optional()
        .describe(
          'O custo depende do modelo escolhido a cada pedido (o `auto` do Cursor, que já nasce assim): o board não estima o custo dele, mesmo com preço preenchido. Ausente = fica como estava.',
        ),
    },
    (a, router) => {
      const catalog = [...router.snapshot().board.modelCatalog];
      const id = modelId(a.tool as AiTool, a.model);
      const efforts = a.efforts ?? [];
      if (a.default_effort && !efforts.includes(a.default_effort)) throw new Error('default_effort precisa ser um dos efforts.');
      const prices = { input: a.price_input, output: a.price_output, cacheRead: a.price_cache_read, cacheWrite: a.price_cache_write };
      if (a.reset_price && Object.values(prices).some((v) => v !== undefined))
        throw new Error('reset_price não pode vir junto com price_*: ou apaga o preço, ou grava um novo.');
      const at = catalog.findIndex((o) => o.id === id);
      const before = at >= 0 ? catalog[at]! : undefined;
      const entry = withPrice(
        {
          id,
          tool: a.tool as AiTool,
          model: a.model,
          label: a.label ?? a.model,
          efforts,
          defaultEffort: a.default_effort ?? null,
          // o preço, a origem dele e o "preço variável" são do catálogo: chamada que não os menciona não os apaga
          ...(before?.price ? { price: before.price } : {}),
          ...(before?.priceSource !== undefined ? { priceSource: before.priceSource } : {}),
          ...(before?.priceCheckedAt !== undefined ? { priceCheckedAt: before.priceCheckedAt } : {}),
          ...(before?.priceUrl !== undefined ? { priceUrl: before.priceUrl } : {}),
          ...(a.variable_price !== undefined
            ? { variablePrice: a.variable_price }
            : before?.variablePrice !== undefined
              ? { variablePrice: before.variablePrice }
              : {}),
        },
        // apagar os quatro campos: `withPrice` devolve o embutido (quando há) ou o modelo sem preço
        a.reset_price ? { input: null, output: null, cacheRead: null, cacheWrite: null } : prices,
      );
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
        model: resolveModelInput(s.board.modelCatalog, r.model),
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
