import { z } from 'zod';
import type { BoardState } from '../../../shared/model';
import { coerceFieldValue, findField, findType, findWorkflow } from '../format';
import { colorArg, fieldsArg, workflowArg } from './args';
import { overview } from './helpers';
import type { DefineTool } from './registry';

const kindArg = z.enum(['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url']);
const displayArg = z.enum(['badge', 'chip', 'inline', 'hidden']).describe('Como o campo aparece no card');
const appliesArg = z.array(z.string()).nullable().describe('Nomes dos tipos de card em que o campo aparece; null = todos');

/** Nomes de tipos → ids; undefined = não mexer, null = todos os tipos. */
const typeIds = (s: BoardState, names: string[] | null | undefined) =>
  names === undefined ? undefined : names === null ? null : names.map((n) => findType(s, n).id);

/** Tipos de card e campos personalizados. */
export function registerTypeAndFieldTools(tool: DefineTool): void {
  tool(
    'create_card_type',
    'Cria um tipo de card.',
    { name: z.string().min(1), workflow: workflowArg, color: colorArg.optional() },
    (a, router) => {
      router.handle({
        type: 'settings.type.create',
        name: a.name,
        color: a.color ?? '#6b7280',
        defaultWorkflowId: findWorkflow(router.snapshot(), a.workflow).id,
      });
      return overview(router);
    },
  );

  tool(
    'update_card_type',
    'Renomeia um tipo de card, muda a sua cor ou define os valores padrão de campos (ex.: Modelo e Skills) aplicados a cada card novo desse tipo.',
    {
      type: z.string(),
      name: z.string().min(1).optional(),
      color: colorArg.optional(),
      default_fields: fieldsArg
        .optional()
        .describe(
          'Padrões por nome do campo, ex.: {"Modelo": "claude:sonnet@medium", "Skills": ["revisar-spec"]}. Substitui todos os padrões do tipo; {} limpa.',
        ),
    },
    (a, router) => {
      const s = router.snapshot();
      const defaults = a.default_fields
        ? Object.fromEntries(
            Object.entries(a.default_fields).map(([name, value]) => {
              const f = findField(s, name);
              return [f.id, coerceFieldValue(f, value, s.board.modelCatalog)];
            }),
          )
        : undefined;
      router.handle({ type: 'settings.type.update', typeId: findType(s, a.type).id, patch: { name: a.name, color: a.color, defaults } });
      return overview(router);
    },
  );

  tool('delete_card_type', 'Exclui um tipo de card que não esteja em uso.', { type: z.string() }, (a, router) => {
    router.handle({ type: 'settings.type.delete', typeId: findType(router.snapshot(), a.type).id });
    return overview(router);
  });

  tool(
    'create_field',
    'Cria um campo personalizado para os cards.',
    {
      name: z.string().min(1),
      kind: kindArg,
      options: z.array(z.string()).optional().describe('Opções, para select e multiselect'),
      applies_to_types: appliesArg.optional(),
      display: displayArg.optional(),
    },
    (a, router) => {
      const s = router.snapshot();
      router.handle({
        type: 'settings.field.create',
        name: a.name,
        kind: a.kind,
        options: a.options ?? [],
        appliesToTypes: typeIds(s, a.applies_to_types) ?? null,
        display: a.display ?? 'inline',
      });
      return overview(router);
    },
  );

  tool(
    'update_field',
    'Altera nome, opções, tipos de card ou exibição de um campo personalizado.',
    {
      field: z.string(),
      name: z.string().min(1).optional(),
      options: z.array(z.string()).optional(),
      applies_to_types: appliesArg.optional(),
      display: displayArg.optional(),
    },
    (a, router) => {
      const s = router.snapshot();
      router.handle({
        type: 'settings.field.update',
        fieldId: findField(s, a.field).id,
        patch: { name: a.name, options: a.options, appliesToTypes: typeIds(s, a.applies_to_types), display: a.display },
      });
      return overview(router);
    },
  );

  tool('delete_field', 'Exclui um campo personalizado e os valores dele em todos os cards.', { field: z.string() }, (a, router) => {
    router.handle({ type: 'settings.field.delete', fieldId: findField(router.snapshot(), a.field).id });
    return overview(router);
  });
}
