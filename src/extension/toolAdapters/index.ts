// Registro dos adaptadores do "Exportar para a ferramenta" (#623).
import type { AiTool } from '../../shared/harness';
import { claudeAdapter } from './claude';
import { cursorAdapter } from './cursor';
import { kimiAdapter } from './kimi';
import type { ToolAdapter } from './types';

/** `AiTool` é um texto livre (qualquer CLI): só as três com formato conhecido exportam. */
export const TOOL_ADAPTERS: Partial<Record<AiTool, ToolAdapter>> = { claude: claudeAdapter, cursor: cursorAdapter, kimi: kimiAdapter };
export const adapterFor = (tool: AiTool): ToolAdapter | undefined => TOOL_ADAPTERS[tool];
