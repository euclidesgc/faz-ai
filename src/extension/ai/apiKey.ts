// A chave de API de um perfil, como o host a entrega ao modo API (épica "ferramenta por modo", história 10).
//
// A chave é da ferramenta, não do perfil nem do board: o Conectar (história 7) a guarda no cofre local por
// ferramenta (`ToolKeys`, `LocalCredentials`, uma chave por máquina), e os três modos do Gemini leem a mesma.
// Este é o ponto único de leitura para o modo API: o gateway a entrega ao driver (`ExecutorContext.apiKey`,
// mascarada em toda linha do log) e a admissão, ao `bindingContext` (do vínculo só sai o digest). A chave
// nunca vai para log, `ai_runs`, tela, exportação nem URL: ao modelo, só no cabeçalho `x-goog-api-key`.
import type { AiProfile } from '../../shared/aiProfiles';
import type { ToolKeys } from '../toolKeys';
import { driverOf } from './drivers';

/**
 * A chave do cofre para o perfil cujo driver entra por chave (o Gemini pelo ACP e pela API); null sem chave
 * ou num driver que não entra por chave. A ferramenta é a do driver do perfil, a mesma em todo modo.
 */
export function profileApiKey(keys: Pick<ToolKeys, 'get'>, profile: AiProfile): string | null {
  const driver = driverOf(profile);
  return driver?.auth.kind === 'api-key' ? keys.get(driver.tool) : null;
}
