/**
 * Limite de consumo por execução: leitura de cache, em tokens. Passou disso, o runner avisa na conversa do
 * card e o painel de métricas conta a execução entre as "acima do limite". Só avisa: nada interrompe a execução.
 */
export const RUN_CACHE_READ_LIMIT = 10_000_000;

/** `true` só acima do limite (exatamente o limite não passa); sem medida (`null`/`undefined`, como no Cursor) é `false`. */
export function exceedsRunLimit(cacheReadTokens: number | null | undefined): boolean {
  return typeof cacheReadTokens === 'number' && cacheReadTokens > RUN_CACHE_READ_LIMIT;
}
