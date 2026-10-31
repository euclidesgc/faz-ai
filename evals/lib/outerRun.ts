/**
 * Quando o eval roda dentro de uma execução de card (a IA chama `npm run eval`), o ambiente já traz o kit de
 * hooks dos trailers daquela execução: o par `GIT_CONFIG_*` que aponta `core.hooksPath` para a pasta dela e
 * as `FAZ_AI_TRAILER_*`. O board temporário do eval cria o próprio kit por cima, e com dois kits os hooks de
 * repasse se chamam em laço: `git init`, `add`, `switch` e `commit` travam no repositório da história.
 *
 * Tira do ambiente o par da execução de fora e as variáveis dela, sem tocar nos pares `GIT_CONFIG_*` da pessoa.
 * Só age quando o par do board é o último (`GIT_CONFIG_COUNT` = `FAZ_AI_GIT_CONFIG_COUNT` + 1), como
 * `commitTrailers.ts` o monta. Devolve true quando mexeu.
 */
export function dropOuterRunGitConfig(env: Record<string, string | undefined>): boolean {
  const raw = env.FAZ_AI_GIT_CONFIG_COUNT;
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return false;
  const prev = Number(raw.trim());
  if (env.GIT_CONFIG_COUNT?.trim() !== String(prev + 1) || env[`GIT_CONFIG_KEY_${prev}`] !== 'core.hooksPath') return false;
  delete env[`GIT_CONFIG_KEY_${prev}`];
  delete env[`GIT_CONFIG_VALUE_${prev}`];
  if (prev === 0) delete env.GIT_CONFIG_COUNT;
  else env.GIT_CONFIG_COUNT = String(prev);
  for (const name of ['FAZ_AI_GIT_CONFIG_COUNT', 'FAZ_AI_TRAILER_CARD', 'FAZ_AI_TRAILER_PHASE', 'FAZ_AI_TRAILER_RUN']) delete env[name];
  return true;
}
