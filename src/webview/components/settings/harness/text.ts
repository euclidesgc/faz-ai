import { AI_TOOLS, type AiTool } from '../../../../shared/harness';
import { t } from '../../../i18n';

/** Aviso de toda gravação na pasta do usuário. */
export const GLOBAL_WARNING = 'O arquivo fica na sua pasta de usuário e vale para todos os seus projetos.';

/** Acrescenta o aviso global à mensagem quando o destino é a pasta do usuário. */
export const withGlobalWarning = (message: string, scope: string): string =>
  scope === 'user' ? `${message}\n\n${t(GLOBAL_WARNING)}` : message;

export const toolLabel = (id: AiTool): string => AI_TOOLS.find((t) => t.id === id)!.label;
