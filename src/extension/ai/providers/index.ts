// O registro dos providers: um por ferramenta, e o tipo `Record<AiTool, …>` faz o compilador exigir que
// uma ferramenta nova traga o seu antes de poder ser chamada.
import type { AiTool } from '../../../shared/harness';
import type { AiProvider } from '../provider';
import { claudeProvider } from './claude';
import { cursorProvider } from './cursor';
import { codexProvider, copilotProvider, kimiProvider } from './unmeasured';

const PROVIDERS: Record<AiTool, AiProvider> = {
  claude: claudeProvider,
  cursor: cursorProvider,
  codex: codexProvider,
  copilot: copilotProvider,
  kimi: kimiProvider,
};

export const providerFor = (tool: AiTool): AiProvider => PROVIDERS[tool];
