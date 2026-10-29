// Ações de execução que políticas, runner, chat e telas compartilham.
export const CONTEXT_ACTIONS = [
  'work',
  'refine',
  'summary',
  'conflict',
  'chat',
  'harness-agent',
  'harness-rule',
  'harness-skill',
  'harness-suggest',
] as const;
export type ContextAction = (typeof CONTEXT_ACTIONS)[number];
export const CONTEXT_ACTION_LABELS: Record<ContextAction, string> = {
  work: 'Trabalho',
  refine: 'Refino',
  summary: 'Resumo',
  conflict: 'Resolução de conflitos',
  chat: 'Conversa do board',
  'harness-agent': 'Assistente de agentes',
  'harness-rule': 'Assistente de rules',
  'harness-skill': 'Assistente de skills',
  'harness-suggest': 'Sugestões do Harness',
};
