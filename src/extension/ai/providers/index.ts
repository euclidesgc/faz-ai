import { BUILTIN_PROFILES, validateProfile, type AiBase, type AiProfile, isCatalogCopy, isReadyCli } from '../../../shared/aiProfiles';
import { copyOf } from './copy';
import { genericProvider } from './generic';
// O registro dos providers: um por ferramenta, e o tipo `Record<AiBase, …>` faz o compilador exigir que
// uma ferramenta nova traga o seu antes de poder ser chamada.
import { isAiBase, type AiTool } from '../../../shared/harness';
import type { AiProvider } from '../provider';
import { claudeProvider } from './claude';
import { cursorProvider } from './cursor';
import { kimiProvider } from './kimi';

const PROVIDERS: Record<AiBase, AiProvider> = {
  claude: claudeProvider,
  cursor: cursorProvider,
  kimi: kimiProvider,
};

export type AiExecutor = AiTool | AiProfile;
/** Compatibilidade dos chamadores nativos; um ID desconhecido nunca vira outro executor. */
export function executorProfile(executor: AiExecutor): AiProfile {
  if (typeof executor === 'string') {
    const found = BUILTIN_PROFILES.find((p) => p.id === executor);
    if (!found) throw new Error('Perfil de CLI ainda não disponível para execução.');
    return structuredClone(found);
  }
  if (!executor || typeof executor.id !== 'string' || !executor.id) throw new Error('Identidade de perfil inválida.');
  return executor;
}
export function providerFor(executor: AiExecutor): AiProvider {
  const profile = executorProfile(executor);
  if (isReadyCli(profile)) {
    if (!isAiBase(profile.id) || profile.base !== profile.id) throw new Error('Perfil pronto inválido.');
    return PROVIDERS[profile.id];
  }
  // o agente ACP pronto segue o caminho do personalizado: o gateway troca o provider pelo transporte ACP
  const errors = validateProfile(profile);
  if (errors.length) throw new Error(errors.join(' '));
  return isCatalogCopy(profile) && isAiBase(profile.base) ? copyOf(PROVIDERS[profile.base], profile) : genericProvider(profile);
}
