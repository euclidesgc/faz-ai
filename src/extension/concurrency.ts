/**
 * Teto fixo das tarefas de manutenção do heartbeat (consultas `gh` e medições `git`, sem IA). Não é o
 * paralelismo do board (`parallel`/`parallelStories`): esse vale para as execuções da IA, que mexem nas
 * worktrees; a manutenção só lê o estado do GitHub e das branches, e tem o próprio limite (#722).
 */
export const MAINTENANCE_LIMIT = 4;

/**
 * Aplica `fn` a cada item com no máximo `limit` chamadas em andamento; o resultado sai na ordem de
 * `items`, não na ordem em que as chamadas terminam. Rejeita só se `fn` rejeitar: quem chama trata as
 * próprias falhas (devolvendo um `Error`, por exemplo) quando uma não pode derrubar as outras. Um
 * `limit` menor que 1 vale 1. Fica fora do `heartbeat.ts` para o `merge.ts` e o `branchSync.ts`
 * usarem sem ciclo de import.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  // cada "trilha" pega o próximo item livre assim que termina o seu; são no máximo `limit` trilhas
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  const lanes = Math.min(Math.max(1, Math.floor(limit) || 1), items.length);
  await Promise.all(Array.from({ length: lanes }, lane));
  return out;
}
