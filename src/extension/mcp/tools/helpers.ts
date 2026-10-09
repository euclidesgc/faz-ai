import type { BoardState, Card } from '../../../shared/model';
import type { MessageRouter } from '../../panel/messageRouter';
import { boardOverview, cardDetail, coerceFieldValue, findColumn, findField } from '../format';
import type { ToolContext } from './registry';

/** posição "no fim da coluna" */
export const END = Number.MAX_SAFE_INTEGER;

/** Detalhe do card como o get_card devolve, lido do snapshot atual. */
export const detail = (router: MessageRouter, cardId: string) => {
  const s = router.snapshot();
  return cardDetail(
    s,
    s.cards.find((c) => c.id === cardId)!,
    (a) => router.store.pathOf(a),
  );
};

/** Grava os campos informados por nome; valida tudo antes de gravar qualquer coisa. */
export const setFields = (router: MessageRouter, s: BoardState, cardId: string, fields: Record<string, unknown> | undefined): void => {
  const values = Object.entries(fields ?? {}).map(([name, value]) => {
    const f = findField(s, name);
    return { fieldId: f.id, value: coerceFieldValue(f, value, s.board.modelCatalog) };
  });
  for (const v of values) router.handle({ type: 'field.setValue', cardId, ...v });
};

/** Só valida os campos (sem gravar), para não deixar um card pela metade. */
export const validateFields = (s: BoardState, fields: Record<string, unknown> | undefined): void => {
  for (const [name, value] of Object.entries(fields ?? {})) coerceFieldValue(findField(s, name), value, s.board.modelCatalog);
};

/** origem das ações desta sessão: a IA, assinando com o nome do cliente */
export const aiOrigin = (ctx: ToolContext) => ({ author: ctx.author(), source: 'ai' as const });

/** Recusa cards da lixeira. */
export const live = (c: Card): Card => {
  if (c.deletedAt !== null) throw new Error(`O card #${c.number} está na lixeira; use restore_card antes.`);
  return c;
};

export const overview = (router: MessageRouter) => boardOverview(router.snapshot());

/** Agente do board pelo nome, sem diferenciar maiúsculas. */
export function findProfile(s: BoardState, name: string) {
  const wanted = name.trim().toLowerCase();
  const profile = s.board.execProfiles.find((p) => p.id.toLowerCase() === wanted || p.name.trim().toLowerCase() === wanted);
  if (!profile)
    throw new Error(`Agente "${name}" não encontrado. Agentes: ${s.board.execProfiles.map((p) => p.name).join(', ') || 'nenhum'}.`);
  return profile;
}

/** Ids das colunas com esse nome (pode haver uma em cada workflow). */
export function findColumnIds(s: BoardState, name: string, workflowId?: string): Set<string> {
  if (workflowId) return new Set([findColumn(s, name, workflowId).id]);
  const ids = s.workflows.flatMap((w) => {
    try {
      return [findColumn(s, name, w.id).id];
    } catch {
      return [];
    }
  });
  if (!ids.length) findColumn(s, name); // lança o erro com a lista de colunas
  return new Set(ids);
}
