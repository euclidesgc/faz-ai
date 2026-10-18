import type { AiBase } from '../../../shared/aiProfiles';
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

/** Nesta etapa só os três providers prontos podem executar; perfil desconhecido nunca vira Claude. */
export const providerFor = (tool: AiTool): AiProvider => {
  if (!isAiBase(tool)) throw new Error('Perfil de CLI ainda não disponível para execução.');
  return PROVIDERS[tool];
};
