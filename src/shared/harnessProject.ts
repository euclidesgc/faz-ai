// Nome da skill do fluxo e normalização de nomes de skills e agentes, sem React.
import type { baseInfo } from './harness';

/** O que o board sabe de uma ferramenta de IA (um item de AI_BASES). */
export type AiToolInfo = ReturnType<typeof baseInfo>;

/** Nome da skill que ensina a IA a conduzir os cards pelo fluxo do board. */
export const FLOW_SKILL_NAME = 'faz-ai-fluxo';

/** Normaliza o nome digitado de uma skill ou agente: minúsculas, sem acentos (`padrão` → `padrao`), e o que não é letra, número ou hífen vira hífen. */
export const toItemName = (raw: string): string =>
  raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
